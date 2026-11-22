// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { htmlToMarkdown } from '../../../src/core/clipboard';
import { checkRenderIntegrity } from '../../../src/core/integrity';
import { exportHtml } from '../../../src/render/exports';
import { composeBook } from '../../../src/render/flow-book';
import { contentInventory, compareInventory } from '../../../src/render/paginate';
import { buildPrintPayload } from '../../../src/render/print-payload';
import { preservePrintListOrdinals } from '../../../src/render/print-lists';
import { nodeFontSource, realDoc } from './helpers';

const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html');
const formula = (tex: string, display = false) => ['math', tex, display];
const outputs = async (source: string) => {
  const doc = await realDoc(source, 'BUS-01', {cover:false, toc:false});
  expect(checkRenderIntegrity(source,doc.body).ok).toBe(true);
  const payload = await buildPrintPayload(doc.snapshot,doc.body,{fontSource:nodeFontSource});
  const exported = await exportHtml({...doc, profile:'standalone',fontSource:nodeFontSource});
  return [doc.body.html, exported.html!, payload.bodyInner, await composeBook(payload)].map(value => {
    const document = parse(value);
    document.querySelectorAll('[data-pf-generated]').forEach(el=>el.remove());
    return document.querySelector('article.pf-doc') ?? document.body;
  });
};
function clipboard(html: string, plain?: string) {
  const result = htmlToMarkdown(html, {plain});
  if (!result.ok) throw Error(result.message);
  return result.markdown;
}
function parts(root: Element): unknown[] {
  const output: unknown[] = [];
  const visit = (node: Node) => {
    if (node.nodeType === 3) {
      const text = node.textContent ?? '';
      const last = output.at(-1);
      if (typeof last === 'string') output[output.length-1] = last + text;
      else if (text) output.push(text);
    } else if (node instanceof Element && node.matches('.pf-math[data-tex]')) {
      output.push(formula(node.getAttribute('data-tex')!,node.classList.contains('pf-math-display')));
    } else for (const child of node.childNodes) visit(child);
  };
  visit(root);
  return output;
}
const wrapper = '<span class="katex-display"><span class="katex"><span class="katex-mathml"><math><semantics><mi>E</mi><annotation encoding="application/x-tex">E=mc^2</annotation></semantics></math></span><span class="katex-html" aria-hidden="true"><span>E=mc²</span></span></span></span>';
describe('Original HTML through clipboard, render, standalone HTML and both print paths', () => {
  it.each(['header','body'] as const)('preserves the two original rows, prose and display formula in the %s', async (where) => {
    const annotated = where === 'header' ? '<span data-tex="E=mc^2" data-display="true">E=mc²</span>' : wrapper;
    const cell = 'Before '+annotated+' after';
    const html = '<table><tr><th>'+(where==='header'?cell:'A')+'</th><th>B</th></tr><tr><td>'+(where==='body'?cell:'C')+'</td><td>D</td></tr></table>';
    const plain = where==='header'?'Before E=mc² after\tB\nC\tD':'A\tB\nBefore E=mc² after\tD';
    const rich = ['Before ',formula('E=mc^2',true),' after'];
    for (const root of await outputs(clipboard(html,plain))) {
      const rows = Array.from(root.querySelectorAll('table tr'),row=>Array.from(row.querySelectorAll(':scope > th,:scope > td'),el=>[el.localName,parts(el)]));
      expect(rows).toEqual([[['th',where==='header'?rich:['A']],['th',['B']]],[['td',where==='body'?rich:['C']],['td',['D']]]]);
    }
  });
  it.each([
    ['spaces in data attribute','<span data-tex=" x + 1 ">x+1</span>',' x + 1 '],
    ['spaces in MathML','<math><semantics><mi>x</mi><annotation encoding="application/x-tex"> x + 1 </annotation></semantics></math>',' x + 1 '],
    ['literal backticks','<span data-tex="`x`">x</span>','`x`'],
    ['literal dollar','<span data-tex="x+\\$">x</span>','x+\\$'],
  ])('preserves annotation bytes, mode and surrounding text for %s', async (_name,tag,tex) => {
    const source = clipboard('<p>Before '+tag+' after</p>', 'Before x after');
    for (const root of await outputs(source)) expect(parts(root.querySelector('p')!)).toEqual(['Before ',formula(tex),' after']);
  });
  it('keeps adjacent annotations separate and retains deliberate GitHub and dollar syntax', async () => {
    const source = clipboard('<p>X<span data-tex=" a ">A</span><span data-tex="`b`">B</span>Y</p>');
    for (const root of await outputs(source+'\nPrice \\$5 and $`c+d`$.')) {
      const ps = root.querySelectorAll('p');
      expect(parts(ps[0]!)).toEqual(['X',formula(' a '),formula('`b`'),'Y']);
      expect(parts(ps[1]!)).toEqual(['Price $5 and ',formula('c+d'),'.']);
    }
  });
  it('preserves a valid annotation immediately followed by a digit, with the original prose and code',async()=>{
    const source=clipboard('<p>Read <span data-tex="x">X</span>2 and <code>let a = 2</code>.</p>');
    for(const root of await outputs(source)) expect(parts(root.querySelector('p')!)).toEqual(['Read ',formula('x'),'2 and let a = 2.']);
  });
  it('preserves bullet overrides on ordered items and ordinal overrides on unordered items, including empty book markers',async()=>{
    const html='<ol><li type="circle"></li></ol><ul type="square"><li type="A"></li><li type="bogus"></li><li type="none"></li></ul>';
    const views=await outputs(clipboard(html));
    for(const output of views) expect([...output.querySelectorAll('li')].map(el=>el.getAttribute('type'))).toEqual(['circle','A','bogus','none']);
    expect([...views.at(-1)!.querySelectorAll('li')].map(el=>el.getAttribute('data-pf-book-marker'))).toEqual(['◦','A.','▪','']);
  });
  const list = '<ol reversed start="8"><li>first</li><li type="A" value="3">third<ol type="i"><li type="I">inner</li></ol></li><li>second</li></ol>\n\n<p>Refer to C.</p>';
  it.each(['clipboard','raw'])('retains per-item marker overrides, resets, nesting and reference text through %s', async route => {
    for (const root of await outputs(route==='raw'?list:clipboard(list))) {
      const items=Array.from(root.querySelectorAll('li'),li=>[li.getAttribute('type'),li.getAttribute('value')]);
      expect(items).toEqual([[null,null],['A','3'],['I',null],[null,null]]);
      expect(root.querySelector('p')?.textContent).toBe('Refer to C.');
    }
  });
  it('blocks changing a per-item marker before export and detects marker changes on later pages',async()=>{
    const source=clipboard(list);
    const doc=await realDoc(source,'BUS-01',{cover:false,toc:false});
    const dom=parse(doc.body.html);
    const target=dom.querySelectorAll('li')[1]!;
    expect(target.getAttribute('type')).toBe('A');
    target.removeAttribute('type');
    const body={...doc.body,html:dom.body.innerHTML};
    expect(checkRenderIntegrity(source,body).ok).toBe(false);
    await expect(exportHtml({...doc,body,profile:'standalone',fontSource:nodeFontSource})).rejects.toMatchObject({code:'EXPORT_BLOCKED'});
    await expect(buildPrintPayload(doc.snapshot,body,{fontSource:nodeFontSource})).rejects.toMatchObject({code:'PRINT_BLOCKED'});

    const paged=parse('<ol><li>One</li><li type="I">Two</li></ol>').body;
    preservePrintListOrdinals(paged);
    const original=contentInventory([paged]);
    const first=paged.cloneNode(true) as HTMLElement, second=paged.cloneNode(true) as HTMLElement;
    first.querySelector('li:last-child')!.remove();
    second.querySelector('li')!.remove();
    expect(compareInventory(original,contentInventory([first,second]))).toEqual([]);
    second.querySelector('li')!.setAttribute('type','i');
    expect(compareInventory(original,contentInventory([first,second])).map(diff=>diff.field)).toContain('listMarkers');
  });
});
