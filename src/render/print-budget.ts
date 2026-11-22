import { assertBudget, BudgetError, checkBudget, LIMITS, utf8Length } from '../core/limits';
import type { PrintPayload } from './print-types';

/** A proven partial sum is enough for an early refusal; the displayed count
 * must not imply that excluded bytes were serialized or measured. */
export function assertPrintLowerBound(bytes: number): void {
  if (bytes <= LIMITS.pdfPayloadBytes) return;
  const result = checkBudget('pdfPayload', bytes);
  result.message += ' Penghitungan dihentikan saat batas terlampaui. Nilai ini adalah ukuran minimum.';
  result.messageEn += ' Counting stopped when the limit was exceeded. This is a minimum size.';
  throw new BudgetError(result);
}

/** Size of a compact UTF-8 JSON string, including quotes. Count in bounded
 * chunks so a large quoted body never needs a second escaped copy. */
function quotedBytes(value: string): number {
  if (!/[^\x20-\x21\x23-\x5b\x5d-\x7e]/.test(value)) return value.length + 2;
  let bytes = 2;
  for (let start = 0; start < value.length;) {
    let end = Math.min(start + 32_768, value.length);
    if (end < value.length && /[\uD800-\uDBFF]/.test(value.charAt(end - 1))) end--;
    bytes += utf8Length(JSON.stringify(value.slice(start, end))) - 2;
    start = end;
  }
  return bytes;
}

/** The wire budget is defined by compact UTF-8 JSON of this plain DTO.
 * The actual transport remains structured clone. A cheap, proven upper bound
 * on each string avoids scanning typical font sheets and small documents.
 * If that bound exceeds the quota, count exact bytes, including escapes. */
export function assertPrintPayload(payload: PrintPayload, pendingBase64Bytes = 0): void {
  function check(exact: boolean): number {
    let total = pendingBase64Bytes;
    const string = (s: string) => exact ? quotedBytes(s) : 2 + 6 * s.length;
    function visit(value: unknown): void {
      if (exact) assertPrintLowerBound(total);
      if (typeof value === 'string') {
        if (exact) assertPrintLowerBound(total + 2 + value.length);
        total += string(value);
      } else if (Array.isArray(value)) {
        total += 2 + Math.max(0, value.length - 1);
        for (const item of value) visit(item ?? null);
      } else if (value !== null && typeof value === 'object') {
        total += 2;
        let comma = 0;
        for (const [key, item] of Object.entries(value)) {
          if (item === undefined) continue;
          total += comma + string(key) + 1;
          comma = 1;
          visit(item);
        }
      } else {
        total += JSON.stringify(value).length;
      }
    }
    visit(payload);
    return total;
  }
  if (check(false) > LIMITS.pdfPayloadBytes) assertBudget('pdfPayload', check(true));
}

/** Attribute values (notably repeated embedded images) and text already give
 * a lower bound on native HTML serialization. Reject before asking the DOM
 * to concatenate an oversized transformed tree. */
export async function preflightPrintDom(root: ParentNode & Node, signal?: AbortSignal): Promise<void> {
  const walker = root.ownerDocument!.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let bytes = 0, visited = 0, lastYield = performance.now();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) bytes += node.nodeValue!.length;
    else {
      const el = node as Element;
      bytes += el.localName.length + 2;
      for (const attr of el.attributes) bytes += attr.name.length + 4 + attr.value.length;
    }
    assertPrintLowerBound(bytes);
    if (++visited % 256 === 0 && performance.now() - lastYield > 24) {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      signal?.throwIfAborted();
      lastYield = performance.now();
    }
  }
}
