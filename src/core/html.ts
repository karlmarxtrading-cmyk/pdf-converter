/** RC4-R01: admit the iterative HTML parser's tree before its recursive HAST conversion.
 * Uses the same parse5 options as rehype-parse; no DOM, network access, script execution or text truncation.
 */
import { parse, parseFragment } from 'parse5';
import { fromParse5 } from 'hast-util-from-parse5';
import { VFile } from 'vfile';
import type { Root } from 'hast';
import type { Limits } from './contracts';
import { LIMITS, checkTreeBudget, type BudgetResult } from './limits';

export function parseHtmlWithinBudget(html: string, limits: Limits = LIMITS, checkClosed = false): { ok: true; tree: Root; closed?: boolean } | { ok: false; budget: BudgetResult } {
  const parsed = parseFragment(html, { sourceCodeLocationInfo: true, scriptingEnabled: false });
  const budget = checkTreeBudget(parsed, limits);
  if (budget) return { ok: false, budget };
  // Only self-contained fragments can acquire a block boundary without changing
  // CommonMark's open HTML containers around other Markdown blocks.
  let closed: boolean | undefined;
  if (checkClosed) {
    const voidTags = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
    let end = 0;
    closed = parsed.childNodes.every(node => {
      const loc = node.sourceCodeLocation;
      if (!loc || (html.slice(end, loc.startOffset).trim() !== '')) return false;
      end = loc.endOffset;
      return !('tagName' in node) || !!node.sourceCodeLocation?.endTag || voidTags.has(node.tagName);
    }) && !html.slice(end).trim();
  }
  return { ok: true, tree: fromParse5(parsed, { file: new VFile(html) }) as Root, closed };
}

/** Only raw/mixed HTML takes this additional admission pass before rehypeRaw preserves source positions. */
export function checkHtmlBudget(html: string, limits: Limits = LIMITS): BudgetResult | null {
  return checkTreeBudget(parseFragment(html, { scriptingEnabled: false }), limits);
}

/** Import the body of a whole HTML file without executing or fetching anything.
 * Even the ignored head participates in the input and tree size limits. */
export function parseHtmlDocumentBody(html: string, limits: Limits): ReturnType<typeof parseHtmlWithinBudget> {
  const parsed = parse(html, { sourceCodeLocationInfo: true, scriptingEnabled: false });
  const budget = checkTreeBudget(parsed, limits);
  if (budget) return { ok: false, budget };
  const element = parsed.childNodes.find(node => 'tagName' in node && node.tagName === 'html');
  const body = element && 'tagName' in element
    ? element.childNodes.find(node => 'tagName' in node && node.tagName === 'body') : undefined;
  const children = body && 'tagName' in body ? body.childNodes : [];
  const tree = fromParse5({ nodeName: '#document-fragment', childNodes: children }, { file: new VFile(html) }) as Root;
  return { ok: true, tree };
}
