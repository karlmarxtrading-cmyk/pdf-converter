import type { Element, Root as HRoot, RootContent as HContent } from 'hast';
import { scanMath, type MathSpan } from './math';

/** RC4-M01/02/03: read delimiters across harmless inline wrappers before Markdown escaping.
 * Only the matched formula loses presentation wrappers; every outside fragment keeps its original markup.
 * Code, links, images and block boundaries are never joined into a formula. Link labels are visited separately.
 */
const MATH_TEXT_WRAPPERS = new Set(['span', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'mark', 'small']);
export function recoverHtmlLiteralMath(
  parent: HRoot | Element,
  createFormula: (span: MathSpan, source: string) => HContent,
  isFormula: (node: Element) => boolean = () => false,
): number {
  const textCache = new WeakMap<HContent, string | null>();
  const literal = (n: HContent): string | null => {
    if (textCache.has(n)) return textCache.get(n)!;
    if (n.type === 'text') return n.value;
    if (n.type !== 'element' || isFormula(n)) return null;
    if (n.tagName === 'br') return '\n';
    if (!MATH_TEXT_WRAPPERS.has(n.tagName)) return null;
    const parts = n.children.map(c => literal(c as HContent));
    const value = parts.some(s => s === null) ? null : parts.join('');
    textCache.set(n, value);
    return value;
  };
  const rangeCache = new WeakMap<HContent[], number[]>();
  const slice = (nodes: HContent[], start: number, end: number): HContent[] => {
    const out: HContent[] = [];
    if (start >= end) return out;
    let ends = rangeCache.get(nodes);
    if (!ends) { let total = 0; ends = nodes.map(n => total += literal(n)!.length); rangeCache.set(nodes, ends); }
    let lo = 0, hi = ends.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (ends[mid]! <= start) lo = mid + 1; else hi = mid; }
    let pos = lo ? ends[lo - 1]! : 0;
    for (let k = lo; k < nodes.length && pos < end; k++) {
      const n = nodes[k]!;
      const value = literal(n)!;
      const a = Math.max(0, start - pos), b = Math.min(value.length, end - pos);
      if (a < b) {
        if (a === 0 && b === value.length) out.push(n);
        else if (n.type === 'text') out.push({ ...n, value: value.slice(a, b) });
        else if (n.type === 'element') out.push({ ...n, children: slice(n.children as HContent[], a, b) as Element['children'] });
      }
      pos += value.length;
      if (pos >= end) break;
    }
    return out;
  };
  const out: HContent[] = [];
  const nodes = parent.children as HContent[];
  let count = 0, i = 0;
  while (i < nodes.length) {
    if (literal(nodes[i]!) === null) { out.push(nodes[i++]!); continue; }
    let j = i, value = '';
    while (j < nodes.length) { const t = literal(nodes[j]!); if (t === null) break; value += t; j++; }
    const run = nodes.slice(i, j), spans = scanMath(value).spans;
    if (!spans.length) { out.push(...run); i = j; continue; }
    let pos = 0;
    for (const span of spans) {
      out.push(...slice(run, pos, span.start));
      out.push(createFormula(span, value)); pos = span.end; count++;
    }
    out.push(...slice(run, pos, value.length));
    i = j;
  }
  parent.children = out as typeof parent.children;
  return count;
}
