// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { htmlToMarkdown } from '../../../src/core/clipboard';
import { clipboardMathInventory, clipboardMathMatches } from '../../../src/core/clipboard-fidelity';
import { parseHtmlWithinBudget } from '../../../src/core/html';
import { checkRenderIntegrity } from '../../../src/core/integrity';
import { sourceRawHtmlSignature, renderedRawHtmlSignature } from '../../../src/core/raw-html-integrity';
import { realDoc, nodeFontSource } from './helpers';
import { buildPrintPayload } from '../../../src/render/print-payload';
import { composeBook } from '../../../src/render/flow-book';
import { exportHtml } from '../../../src/render/exports';

function convert(html: string) {
  const result = htmlToMarkdown(html);
  if (!result.ok) throw Error(result.message);
  return result.markdown;
}
function reference(html: string) {
  const parsed = parseHtmlWithinBudget(html);
  if (!parsed.ok) throw Error(parsed.budget.message);
  return clipboardMathInventory(parsed.tree, new WeakMap());
}
async function published(source: string) {
  const doc = await realDoc(source,'BUS-01',{cover:false,toc:false});
  expect(checkRenderIntegrity(source,doc.body).ok).toBe(true);
  const print = await buildPrintPayload(doc.snapshot,doc.body,{fontSource:nodeFontSource});
  const output = await exportHtml({...doc, profile:'standalone',fontSource:nodeFontSource});
  expect(output.status).toBe('pass');
  return [doc.body.html, output.html!, print.bodyInner, await composeBook(print)]
    .map(html => new DOMParser().parseFromString(html,'text/html'));
}
describe('Clipboard line breaks and table relationships through publication', () => {
  it.each([
    ['padded annotation','<span data-tex=" x ">x</span>',' x '],
    ['backtick annotation','<span data-tex="`x`">x</span>','`x`'],
    ['literal TeX',String.raw`\(x\)`,'x'],
  ])('%s preserves the two breaks and real backslashes', async (_name, input, tex) => {
    const src = String.raw`<p>Path C:\Math<br><em>${input}</em><br>Next\step</p>`;
    const source = convert(src);
    for (const d of await published(source)) {
      const p = d.querySelector('.pf-math')!.closest('p')!;
      const eq = p.querySelector('.pf-math')!;
      expect(eq.getAttribute('data-tex')).toBe(tex);
      expect(eq.classList.contains('pf-math-display')).toBe(false);
      eq.replaceWith('[eq]');
      for (const br of p.querySelectorAll('br')) br.replaceWith('[BR]');
      expect(p.textContent?.replace(/\n/g,'')).toBe(String.raw`Path C:\Math[BR][eq][BR]Next\step`);
    }
  });
  it('keeps a display formula inside its paragraph after final HTML is parsed',async () => {
    const raw='<p>Before <code data-pf-formula="display"> x + 1 </code> after</p>';
    for(const d of await published(raw)) {
      const eq=d.querySelector('.pf-math')!;
      expect(eq.classList.contains('pf-math-display')).toBe(true);
      expect(eq.getAttribute('data-tex')).toBe(' x + 1 ');
      const p=eq.closest('p')!;
      eq.replaceWith('[equation]');
      expect(p.textContent).toBe('Before [equation] after');
    }
  });
  it('retains leading, consecutive and trailing breaks even without a formula',async () => {
    const raw='<p><br>A<br><br>B<br></p>';
    for(const d of await published(convert(raw))) {
      const p=Array.from(d.querySelectorAll('p')).find(el=>el.textContent?.replace(/\s/g,'')==='AB')!;
      expect(Array.from(p.childNodes,n=>n.nodeName==='BR'?'[br]':n.textContent?.trim()).filter(Boolean))
        .toEqual(['[br]','A','[br]','[br]','B','[br]']);
    }
  });
  it('detects deleted/added breaks, punctuation, ordinary text and TeX against original HTML', () => {
    const src='<p>A<br><span data-tex=" x ">x</span><br>B</p>';
    const expected=reference(src), good=convert(src);
    expect(clipboardMathMatches(expected,good)).toBe(true);
    for(const bad of [good.replace('<br>',''),good.replace('A','A\\'),good.replace('B','lost B'),
      good.replace('<br>','<br><br>'),good.replace(' x ',' y ')]) {
      expect(bad).not.toBe(good);
      expect(clipboardMathMatches(expected,bad)).toBe(false);
    }
  });
  it('retains a table with no header as exactly two rows of two TD elements',async () => {
    const raw='<table><tr><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></table>';
    const good=convert(raw);
    for(const d of await published(good)) {
      const table=d.querySelector('table')!;
      expect(Array.from(table.rows,r=>Array.from(r.cells,c=>[c.tagName,c.textContent])))
        .toEqual([[['TD','A'],['TD','B']],[['TD','C'],['TD','D']]]);
    }
    expect(clipboardMathMatches(reference(raw),good.replace('<td>A</td>','<th>A</th>'))).toBe(false);
  });
  it('preserves column groups and row groups used by header scopes',async () => {
    const raw='<table><colgroup span="2"></colgroup><colgroup><col span="2"></colgroup><thead><tr><th scope="colgroup" colspan="2" abbr="AB">Group AB</th><th scope="colgroup" colspan="2">Group CD</th></tr></thead><tbody><tr><th scope="rowgroup">A</th><td>2</td><td>3</td><td>4</td></tr></tbody><tbody><tr><th scope="rowgroup">B</th><td>6</td><td>7</td><td>8</td></tr></tbody></table>';
    const good=convert(raw),expected=reference(raw);
    for(const d of await published(good)){
      const t=d.querySelector('table')!;
      expect(Array.from(t.querySelectorAll('colgroup, col'),el=>[el.localName,el.getAttribute('span')]))
        .toEqual([['colgroup','2'],['colgroup',null],['col','2']]);
      expect(t.tBodies.length).toBe(2);
      expect(t.rows[0]!.cells[0]!.abbr).toBe('AB');
      expect(t.rows[1]!.cells[0]!.scope).toBe('rowgroup');
    }
    expect(clipboardMathMatches(expected,good.replace('colgroup span="2"','colgroup span="1"'))).toBe(false);
    expect(clipboardMathMatches(expected,good.replace('</tbody><tbody>',''))).toBe(false);
  });
  it('checks row, column and multiple header associations, spans, caption and exact cell text',async () => {
    const raw='<table><caption>Sales</caption><thead><tr><th id="type" scope="col">Type</th><th id="amount" scope="col" colspan="2">Amount</th></tr></thead><tbody><tr><th id="north" scope="row" rowspan="2">North</th><td headers="north amount">4</td><td>8</td></tr><tr><td>6</td><td>9</td></tr></tbody></table>';
    const good=convert(raw), expected=reference(raw);
    for(const d of await published(good)) {
      const t=d.querySelector('table')!;
      expect(t.caption!.textContent).toBe('Sales');
      expect(Array.from(t.rows,r=>Array.from(r.cells,c=>c.tagName))).toEqual([['TH','TH'],['TH','TD','TD'],['TD','TD']]);
      const rc=t.rows[1]!.cells[0]!, cc=t.rows[0]!.cells[1]!, td=t.rows[1]!.cells[1]!;
      expect([rc.scope,rc.rowSpan,cc.scope,cc.colSpan]).toEqual(['row',2,'col',2]);
      expect(td.headers.split(/\s+/).map(id=>d.getElementById(id)?.textContent)).toEqual(['North','Amount']);
      const parsedProjection = sourceRawHtmlSignature(good)!.signature;
      expect(renderedRawHtmlSignature(t)).toBe(parsedProjection);
      td.headers=rc.id;
      expect(renderedRawHtmlSignature(t)).not.toBe(parsedProjection);
    }
    for(const changed of [good.replace('scope="row"','scope="col"'),good.replace('north amount','type amount'),
      good.replace('rowspan="2"','rowspan="1"'),good.replace('Sales',''),good.replace('>4<','>5<')]) {
      expect(changed).not.toBe(good); expect(clipboardMathMatches(expected,changed)).toBe(false);
    }
  });
});
