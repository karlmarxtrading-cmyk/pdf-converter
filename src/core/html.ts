/** RC4-R01: admit the iterative HTML parser's tree before its recursive HAST conversion.
 * Uses the same parse5 options as rehype-parse; no DOM, network access, script execution or text truncation.
 */
import { parseFragment } from 'parse5';
import { fromParse5 } from 'hast-util-from-parse5';
import { VFile } from 'vfile';
import type { Root } from 'hast';
import type { Limits } from './contracts';
import { LIMITS, checkTreeBudget, type BudgetResult } from './limits';

export function parseHtmlWithinBudget(html: string, limits: Limits = LIMITS): { ok: true; tree: Root } | { ok: false; budget: BudgetResult } {
  const parsed = parseFragment(html, { sourceCodeLocationInfo: true, scriptingEnabled: false });
  const budget = checkTreeBudget(parsed, limits);
  if (budget) return { ok: false, budget };
  return { ok: true, tree: fromParse5(parsed, { file: new VFile(html) }) as Root };
}

/** Only raw/mixed HTML takes this additional admission pass before rehypeRaw preserves source positions. */
export function checkHtmlBudget(html: string, limits: Limits = LIMITS): BudgetResult | null {
  return checkTreeBudget(parseFragment(html, { scriptingEnabled: false }), limits);
}
