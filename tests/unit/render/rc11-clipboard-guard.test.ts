// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { clipboardMathInventory, clipboardMathMatches } from '../../../src/core/clipboard-fidelity';
import { parseHtmlWithinBudget } from '../../../src/core/html';
import { htmlToMarkdown } from '../../../src/core/clipboard';
it('detects lost or altered annotations, missing surrounding spaces, displaced cells and lost prose against the input HTML', () => {
  const raw='<p>Before <span data-tex=" x ">X</span> after</p><table><tr><th>Header</th></tr><tr><td>L <span data-tex="y" data-display="true">Y</span> R</td></tr></table>';
  const parsed=parseHtmlWithinBudget(raw);
  if(!parsed.ok) throw Error(parsed.budget.message);
  const reference=clipboardMathInventory(parsed.tree,new WeakMap());
  const converted=htmlToMarkdown(raw);
  if(!converted.ok) throw Error(converted.message);
  const correct=converted.markdown;
  expect(clipboardMathMatches(reference,correct)).toBe(true);
  for(const damaged of [
    correct.replace(' x ',' z '), correct.replace('Before ','Before'), correct.replace(' after','after'),
    correct.replace('<th>Header</th>','<th></th>'), correct.replace('L ','Lost '), correct.replace(' R',''),
    correct.replace('data-pf-formula="display"','data-pf-formula="inline"'),
    correct.replace('<td>','<td>Extra</td><td>'),
  ]) {
    expect(damaged).not.toBe(correct);
    expect(clipboardMathMatches(reference,damaged)).toBe(false);
  }
});
