// @vitest-environment jsdom
// PF-R4-01..05: audit RC3 independent regressions, real core → export plus DOM inventory.
import { describe, expect, it } from 'vitest';
import { contentInventory, compareInventory, verifyPageStructure } from '../../../src/render/paginate';
import { exportHtml } from '../../../src/render/exports';
import { buildPrintPayload } from '../../../src/render/print-payload';
import { loadFonts, planFonts } from '../../../src/render/fonts';
import { templateDefaultSettings } from '../../../src/render/templates';
import { nodeFontSource, realDoc } from './helpers';

const div = (h: string) => { const d = document.createElement('div'); d.innerHTML = h; return d; };

describe('PF-R4 render audit regressions', () => {
  it('PF-R4-04 a never-settling font source returns blocking issues at the deadline', async () => {
    const plan = planFonts({ html: '<p>Words</p>', settings: templateDefaultSettings('EDU-01'), mode: 'screen' });
    const result = await loadFonts(plan, () => new Promise(() => {}), { timeoutMs: 20 });
    expect(result.fonts).toHaveLength(0);
    expect(result.issues.length).toBe(plan.faces.length);
    expect(result.issues.every(i => i.blocking && i.code === 'FONT_LOAD_FAILED')).toBe(true);
  });
  it('PF-R4-03 KaTeX style classes select their actual bold/italic faces', () => {
    const plan = planFonts({ html: '<span class="katex"><span class="textbf textit">Bold italic</span><span class="mathboldsf">A</span><span class="mathitsf">B</span><span class="mathboldfrak">C</span></span>', settings: templateDefaultSettings('EDU-01'), mode: 'print' });
    expect(plan.faces.map(f => f.file)).toEqual(expect.arrayContaining(['KaTeX_Main-BoldItalic.woff2', 'KaTeX_SansSerif-Bold.woff2', 'KaTeX_SansSerif-Italic.woff2', 'KaTeX_Fraktur-Bold.woff2']));
  });
  it('PF-R4-05 legitimate fragmented code lines retain spaces and merge by stable identity', () => {
    const expected = div('<pre data-block-id="b" data-pf-code-id="c1"><code><span class="pf-line" data-pf-code-line="0">if ok:</span><span class="pf-line" data-pf-code-line="1">    call()</span></code></pre>');
    const first = div('<pre data-block-id="b" data-pf-code-id="c1"><code><span class="pf-line" data-pf-code-line="0">if ok:</span><span class="pf-line" data-pf-code-line="1">    ca</span></code></pre>');
    const last = div('<pre data-block-id="b" data-pf-code-id="c1"><code><span class="pf-line" data-pf-code-line="1">ll()</span></code></pre>');
    expect(compareInventory(contentInventory([expected]), contentInventory([first, last]))).toEqual([]);
    last.querySelector('.pf-line')!.textContent = ' ll()';
    expect(compareInventory(contentInventory([expected]), contentInventory([first, last])).some(d => d.field === 'codeText')).toBe(true);
  });

  it('PF-R4-01 malformed percent fragment remains a broken-link warning, not a URIError', () => {
    const p = div('<div class="pagedjs_page_content"><p><a href="#%E0%A4%A">Section</a></p></div>');
    p.className = 'pagedjs_page'; p.style.setProperty('--pf-pnum', '"1"');
    document.body.replaceChildren(p);
    expect(verifyPageStructure([p], ['1'])).toEqual([expect.objectContaining({ code: 'INTERNAL_LINK_BROKEN', target: '%E0%A4%A' })]);
  });
  it('PF-R4-02 typography budget covers organization and footer in exported HTML and print payload', async () => {
    const d = await realDoc('Body text only.', 'EDU-01');
    d.snapshot = { ...d.snapshot, brandKit: { id: 'brand', name: 'Brand', orgName: 'Лаборатория', footerText: '中文', accent: '#123456', headingFont: 'inter', updatedAt: '2026-11-21T00:00:00Z' } };
    const html = await exportHtml({ ...d, profile: 'standalone', renderMermaid: false, fontSource: nodeFontSource });
    const print = await buildPrintPayload(d.snapshot, d.body, { renderMermaid: false, fontSource: nodeFontSource });
    expect(html.manifest.fonts.some(f => f.subset === 'cyrillic')).toBe(true);
    expect(print.fonts.some(f => f.subset === 'cyrillic')).toBe(true);
    expect(html.issues.some(i => i.code === 'FONT_GLYPH_NOT_BUNDLED')).toBe(true);
    expect(print.issues.some(i => i.code === 'FONT_GLYPH_NOT_BUNDLED')).toBe(true);
  });
  it('PF-R4-03 text inside a formula still reports unsupported CJK glyphs', async () => {
    const d = await realDoc('Formula: $\\text{中文} = 1$.', 'EDU-01');
    const p = planFonts({ html: d.body.html, settings: templateDefaultSettings('EDU-01'), mode: 'print' });
    expect(p.missing.some(g => g.script === 'CJK')).toBe(true);
  });
  it('PF-R4-04 abort releases an export while a font supplier never settles', async () => {
    const d = await realDoc('Body.', 'EDU-01');
    const c = new AbortController();
    let started!: () => void; const ready = new Promise<void>(r => { started = r; });
    let release!: (b: Uint8Array) => void; const wait = new Promise<Uint8Array>(r => { release = r; });
    const job = exportHtml({ ...d, profile: 'standalone', renderMermaid: false, signal: c.signal, fontSource: () => { started(); return wait; } }).then(() => 'resolved', () => 'rejected');
    await ready; c.abort(new DOMException('Cancel', 'AbortError'));
    const state = await Promise.race([job, new Promise<string>(r => setTimeout(() => r('pending'), 100))]);
    release(new Uint8Array()); await job;
    expect(state).toBe('rejected');
  });
  it('PF-R4-05 code indentation changes are not swallowed by pagination normalization', () => {
    const before = div('<pre data-block-id="code"><code>if ok:\n    call()\n</code></pre>');
    const after = div('<pre data-block-id="code"><code>if ok:\ncall()\n</code></pre>');
    const diffs = compareInventory(contentInventory([before]), contentInventory([after]));
    expect(diffs.length).toBeGreaterThan(0);
  });
  it('PF-R4-05 whitespace inside inline code is significant', () => {
    const before = div('<p data-block-id="p">Command <code>echo "a  b"</code>.</p>');
    const after = div('<p data-block-id="p">Command <code>echo "a b"</code>.</p>');
    expect(compareInventory(contentInventory([before]), contentInventory([after])).length).toBeGreaterThan(0);
  });
});
