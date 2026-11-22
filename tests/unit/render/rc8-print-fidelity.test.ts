// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { reconcileCodeLabels } from '../../../src/render/paginate';
import { pdfGlyphRestrictions } from '../../../src/render/pdf-glyphs';
import { buildPrintPayload } from '../../../src/render/print-payload';
import { preparePrint, paginateInFrame } from '../../../src/render/print-client';
import { planFonts } from '../../../src/render/fonts';
import { nodeFontSource, realDoc, snap } from './helpers';

function page(inner: string): HTMLElement {
  const node = document.createElement('section');
  node.innerHTML = inner;
  return node;
}
function pre(extra: string, inner: string, id='c1'): string {
  return `<pre class="pf-lines" data-lang="python" data-pf-code-id="${id}" data-ref="split" ${extra}>${inner}</pre>`;
}
const first = '<span class="pf-line" data-pf-code-line="0">    return 3</span>';
const second = '<span class="pf-line" data-pf-code-line="1"></span>';
describe('RC8 printed code labels and source data', () => {
  it('drops only a matched generated empty box; the first real lines retain their original label and spaces', () => {
    const pages = [page(pre('data-split-to="split"', '')), page(pre('data-split-from="split"',first)), page(pre('data-split-from="split"',second))];
    reconcileCodeLabels(pages);
    expect(pages[0]!.querySelector('pre')).toBeNull();
    expect(pages[1]!.querySelector('[data-pf-first-code]')?.textContent).toBe('    return 3');
    expect(pages[2]!.querySelector('[data-pf-first-code]')).toBeNull();
    expect(pages[2]!.querySelector('[data-pf-code-line="1"]')).toBeTruthy();
  });
  it('retains unmatched fragments and whitespace, which the integrity checker must still see', () => {
    const pages = [page(pre('data-split-to="split"', '')), page(pre('data-split-from="split"',first,'c2')),
      page(pre('data-split-to="split"','  ')), page(pre('data-split-from="other"',second))];
    reconcileCodeLabels(pages);
    expect(pages.every(p=>p.querySelector('pre'))).toBe(true);
    expect(pages[2]!.textContent).toBe('  ');
  });
});
describe('RC8 printed Unicode contract', () => {
  it('embeds monochrome searchable emoji on demand and keeps unsupported private points, including supplementary planes', async () => {
    const source='Judul\n\nUji 😀 🚀 👩‍💻 \uE000 \uF8FF \u{F0123} \u{100020}';
    const d=await realDoc(source,'EDU-01');
    const payload=await buildPrintPayload(d.snapshot,d.body,{fontSource:nodeFontSource,renderMermaid:false});
    expect(payload.fonts.find(f=>f.family==='Noto Emoji')?.subset).toBe('emoji');
    expect(payload.pdfRestrictions).toHaveLength(4);
    expect(payload.pdfRestrictions!.every(i=>i.blocking && i.line===3)).toBe(true);
    for (const cp of ['E000','F8FF','F0123','100020']) expect(payload.pdfRestrictions!.some(i=>i.message.includes('U+'+cp))).toBe(true);
    await expect(preparePrint(payload)).rejects.toMatchObject({failure:{code:'BLOCKING_ISSUES'}});
    await expect(paginateInFrame(payload,{autoPrint:true})).rejects.toMatchObject({failure:{code:'BLOCKING_ISSUES'}});
    expect(document.querySelector('iframe')).toBeNull();
    expect(d.snapshot.source).toBe(source);
  });
  it('detects a private glyph created by a real KaTeX character command even without a fallback CSS class', async () => {
    const d=await realDoc('Rumus: $\\char"E000$ dan $\\text{😀}$.','BUS-01');
    const payload=await buildPrintPayload(d.snapshot,d.body,{fontSource:nodeFontSource,renderMermaid:false});
    expect(payload.pdfRestrictions?.some(i=>i.message.includes('U+E000'))).toBe(true);
    expect(payload.fonts.some(f=>f.family==='Noto Emoji')).toBe(true);
  });
  it('sees decoded HTML entities and excludes internal KaTeX assembly glyphs and invisible HTML attributes', () => {
    const settings=snap('BUS-01').settings;
    const html='<img data-ignored="\uE000"><span class="katex">\uE001</span><p>&#xF8FF;</p>';
    const plan=planFonts({html,settings,mode:'print'});
    expect(pdfGlyphRestrictions(plan.issues,'&#xF8FF;').map(i=>i.id)).toEqual(['private-glyph-U+F8FF']);
    expect(plan.faces.some(f=>f.subset==='emoji')).toBe(false);
  });
});
