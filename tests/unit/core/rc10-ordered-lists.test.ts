// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { htmlToMarkdown } from '../../../src/core/clipboard';
import { checkRenderIntegrity } from '../../../src/core/integrity';
import { renderBody } from '../../../src/core/render';
import { preservePrintListOrdinals } from '../../../src/render/print-lists';
import { contentInventory, compareInventory } from '../../../src/render/paginate';
import { exportHtml } from '../../../src/render/exports';
import { buildPrintPayload } from '../../../src/render/print-payload';
import { nodeFontSource, realDoc } from '../render/helpers';

const raw = readFileSync('fixtures/rc10/ordered-markers.md','utf8');
const parse = (value: string) => new DOMParser().parseFromString(value,'text/html');
const opts = {assets:[], template:'BUS-01' as const, allowExternalImages:false};

function structure(doc: Document) {
  return Array.from(doc.querySelectorAll('ol,ul,li'), el => ({
    element: el.localName, type:el.getAttribute('type'), start:el.getAttribute('start'),
    reversed:el.hasAttribute('reversed'), value:el.getAttribute('value'),
    parents: [...ancestors(el)].filter(name => ['ol','ul','li'].includes(name)).join('/'),
    text:el.textContent,
  }));
}

function *ancestors(el: Element) {
  for (let parent = el.parentElement; parent; parent = parent.parentElement) yield parent.localName;
}

function convert(html: string) {
  const converted = htmlToMarkdown(html);
  if (!converted.ok) throw Error(converted.message);
  return converted.markdown;
}

describe('RC9-F06 original ordered-list semantics', () => {
  it.each(['raw','clipboard'])('preserves original list types, resets, empty item, nesting and references through %s', async route => {
    const original = parse(raw);
    const source = route === 'raw' ? raw : convert(raw);
    const rendered = await renderBody(source, opts);
    const out = parse(rendered.html);
    expect(structure(out)).toEqual(structure(original));
    expect(out.querySelector('p')?.textContent).toBe(original.querySelector('p')?.textContent);
    expect(checkRenderIntegrity(source,rendered).ok).toBe(true);
  });

  it.each(['1','a','A','i','I'])('compares type=%s and optional numbering controls against the original input', async type => {
    for (const reversed of ['', ' reversed']) for (const start of ['', ' start="-2"']) for (const value of ['', ' value="27"']) {
      const input = '<ol type="'+type+'"'+reversed+start+'><li>X</li><li'+value+'>Y</li></ol>';
      expect(structure(parse(convert(input)))).toEqual(structure(parse(input)));
    }
    const source = '<ol type="'+type+'"><li>One</li></ol>';
    const rendered = await renderBody(source, opts);
    for (const changed of [null, type === 'A' ? 'a' : 'A']) {
      const out = parse(rendered.html);
      if (changed) out.querySelector('ol')!.setAttribute('type',changed);
      else out.querySelector('ol')!.removeAttribute('type');
      expect(checkRenderIntegrity(source,out).ok).toBe(false);
    }
  });

  it('rejects lost or substituted marker type and ordinal after pagination, including in a continuation', () => {
    const root = parse('<ol type="I" reversed><li>Alpha</li><li>Beta</li></ol>').body;
    preservePrintListOrdinals(root);
    const source = contentInventory([root]);
    const first = root.cloneNode(true) as HTMLElement;
    const second = root.cloneNode(true) as HTMLElement;
    first.querySelector('li')!.textContent='Al';
    first.querySelector('li:last-child')!.remove();
    second.querySelector('li')!.textContent='pha';
    second.querySelector('li')!.dataset.ref='one';
    second.querySelector('li')!.dataset.splitFrom='one';
    const check = () => compareInventory(source,contentInventory([first,second])).map(d=>d.field);
    expect(check()).toEqual([]);
    second.querySelector('ol')!.setAttribute('type','A');
    expect(check()).toContain('listMarkers');
    second.querySelector('ol')!.removeAttribute('type');
    expect(check()).toContain('listMarkers');
    second.querySelector('ol')!.setAttribute('type','I');
    second.querySelector('li')!.value=32;
    expect(check()).toContain('listMarkers');
  });

  it('blocks changed or omitted numbering before standalone HTML and print delivery', async () => {
    const doc = await realDoc(raw,'BUS-01',{cover:false,toc:false});
    for (const mutation of ['remove','change']) {
      const out = parse(doc.body.html);
      if (mutation === 'remove') out.querySelector('ol[type="I" s]')!.removeAttribute('type');
      else out.querySelector('ol[type="I" s]')!.setAttribute('type','i');
      const body = {...doc.body,html:out.body.innerHTML};
      const input = {...doc,body,fontSource:nodeFontSource};
      await expect(exportHtml({...input,profile:'standalone'})).rejects.toMatchObject({code:'EXPORT_BLOCKED'});
      await expect(buildPrintPayload(doc.snapshot,body,{fontSource:nodeFontSource})).rejects.toMatchObject({code:'PRINT_BLOCKED'});
    }
  });

  it('preserves supported math within a typed list and keeps the clipboard sanitization policy', async () => {
    const input = '<ol type="A" onclick="invalid"><li><span data-tex="x">x</span><a href="javascript:void(0)">Rujukan</a><script>unwanted</script></li></ol>';
    const result = await renderBody(convert(input), opts);
    const doc = parse(result.html);
    expect(doc.querySelector('ol')?.type).toBe('A');
    expect(doc.querySelector('.pf-math')?.getAttribute('data-tex')).toBe('x');
    expect(doc.querySelector('script,[onclick],[href^="javascript"]')).toBeNull();
    expect(doc.body.textContent).not.toContain('unwanted');
  });
});
