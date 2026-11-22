// @vitest-environment jsdom
/** RC7 synthetic clipboard and residual-TeX fixtures. No provider clipboard is implied. */
import { describe, expect, it } from 'vitest';
import { htmlToMarkdown } from '../../../src/core/clipboard';
import { renderBody } from '../../../src/core/render';
import { preflight } from '../../../src/core/preflight';
import { residualMathIssues } from '../../../src/core/math-diagnostics';

const options = { assets: [], template: 'BUS-01' as const, allowExternalImages: false };
const dom = (html: string) => new DOMParser().parseFromString(html, 'text/html');

describe('RC7-M01 missed formulas across inline semantic boundaries', () => {
  it.each([
    String.raw`<div>Hasil \(x+<a href="#section">y</a>\) akhir.</div>`,
    String.raw`<div>Hasil \[a<sup>2</sup>+b\] akhir.</div>`,
    String.raw`<div>Hasil \fr<em>ac</em>{a}{b} akhir.</div>`,
    '<div>Hasil $x+<a href="#section">y</a>$ akhir.</div>',
  ])('marks preserved residual TeX for review: %s', async source => {
    const result = await renderBody(source, options);
    expect(result.stats.math).toBe(0);
    const report = preflight({ source, assets: [], renderInputHash: 'current' }, result, { target: 'html' });
    expect(result.issues.some(issue => issue.code === 'MATH_UNRENDERED_SOURCE')).toBe(true);
    expect(report.categories.find(category => category.category === 'math')?.status).toBe('review');
    if (source.includes('<a ')) expect(dom(result.html).querySelector('a')?.textContent).toBe('y');
  });

  it.each([
    String.raw`<p>Harga $5 dan <em>$10</em>. Total $15.</p>`,
    String.raw`<p>\(kata <em>biasa saja</em>\) lalu lintas.</p>`,
    String.raw`<p>\(x<code>sample</code>+y\)</p>`,
    String.raw`<p>\fr</p><p>ac{x}{y}</p>`,
    String.raw`<table><tr><td>\(x+</td><td>y\)</td></tr></table>`,
    String.raw`<p><a href="https://example.org/\(x+y\)">Lihat rumus</a></p>`,
    String.raw`<p>\(x+<span class="pf-math"><span class="katex">y</span></span>z\)</p>`,
  ])('keeps separate blocks, literal content and rendered math out of residual runs: %s', source => {
    expect(residualMathIssues(dom(source).body)).toHaveLength(0);
  });
});

async function fromClipboard(input: string) {
  const converted = htmlToMarkdown(input);
  if (!converted.ok) throw Error(converted.message);
  return { converted, doc: dom((await renderBody(converted.markdown, options)).html) };
}

describe('RC7-M02 explicit TeX on mixed clipboard containers', () => {
  const mixed = '<div data-latex="unused"><p>Intro</p><span data-latex="x+1">x1</span><code>literal</code><span data-tex="y+2">y2</span><p>Outro</p></div>';
  it.each(['clipboard', 'raw'])('preserves mixed content and warns about ambiguous enclosing metadata in %s import', async route => {
    const converted = route === 'clipboard' ? htmlToMarkdown(mixed) : null;
    if (converted && !converted.ok) throw Error(converted.message);
    const result = await renderBody(converted?.markdown ?? mixed, options);
    const doc = dom(result.html);
    expect([...doc.querySelectorAll('.pf-math')].map(n => n.getAttribute('data-tex'))).toEqual(['x+1', 'y+2']);
    expect(doc.querySelector('code')?.textContent).toBe('literal');
    expect([...doc.querySelectorAll('p')].map(n => n.textContent).join(' ')).toMatch(/Intro.*Outro/);
    expect((converted?.issues ?? result.issues).some(i => i.scope === 'math' && i.severity === 'warning')).toBe(true);
  });

  it.each([
    [String.raw`<p>Awal \(x+<a href="#b">y</a>\) akhir</p>`, 'a', 'y', String.raw`Awal \(x+y\) akhir`],
    [String.raw`<p>Awal \[a<sup>2</sup>+b\] akhir</p>`, 'sup', '2', String.raw`Awal \[a2+b\] akhir`],
    [String.raw`<p>Awal $x<sub>1</sub>+y$ akhir</p>`, 'sub', '1', 'Awal $x1+y$ akhir'],
  ])('keeps semantic HTML inside delimiter pairs and requests review after clipboard conversion', async (source, selector, label, text) => {
    const { converted, doc } = await fromClipboard(source);
    expect(doc.querySelectorAll('.pf-math')).toHaveLength(0);
    expect(doc.querySelector(selector)?.textContent).toBe(label);
    expect(doc.body.textContent).toBe(text);
    if (selector === 'a') expect(doc.querySelector('a')?.getAttribute('href')).toBe('#b');
    expect((await renderBody(converted.markdown, options)).issues.some(i => i.code === 'MATH_UNRENDERED_SOURCE')).toBe(true);
  });

  it('retains an independent MathJax equation immediately before a different TeX script', async () => {
    const { doc } = await fromClipboard('<p><mjx-container data-tex="x+1">x1</mjx-container><script type="math/tex">y+2</script></p>');
    expect([...doc.querySelectorAll('.pf-math')].map(n => n.getAttribute('data-tex'))).toEqual(['x+1', 'y+2']);
  });

  it('recognizes a MathJax visual with the same source as a single formula', async () => {
    const { doc } = await fromClipboard('<p><mjx-container data-tex="x+1">x1</mjx-container><script type="math/tex">x+1</script></p>');
    expect([...doc.querySelectorAll('.pf-math')].map(n => n.getAttribute('data-tex'))).toEqual(['x+1']);
  });

  it('retains the only available MathML text when a KaTeX copy lacks TeX and a visual branch', async () => {
    const { doc, converted } = await fromClipboard('<p>Awal <span class="katex"><span class="katex-mathml"><math><mrow><mi>x</mi><mo>+</mo><mi>y</mi></mrow></math></span></span> akhir</p>');
    expect(doc.body.textContent).toContain('Awal x+y akhir');
    expect(doc.querySelectorAll('.pf-math')).toHaveLength(0);
    expect(converted.issues.some(i => i.code === 'CLIPBOARD_MATH_NO_TEX')).toBe(true);
  });

  it('keeps only the readable visual branch when both source-free KaTeX representations exist', async () => {
    const { doc } = await fromClipboard('<p><span class="katex"><span class="katex-mathml"><math><mrow><mi>x</mi><mo>+</mo><mi>y</mi></mrow></math></span><span class="katex-html">x+y</span></span></p>');
    expect(doc.body.textContent).toBe('x+y');
  });

  it('retains link and image titles in a structured clipboard table', () => {
    const result = htmlToMarkdown('<table><caption>Gambar &amp; data</caption><tr><td colspan="2"><a href="catatan" title="Buka catatan">Lihat</a><img src="diagram.png" alt="Sumbu x" title="Diagram"></td></tr></table>');
    if (!result.ok) throw Error(result.message);
    const table = dom(result.markdown);
    expect(table.querySelector('a')?.getAttribute('title')).toBe('Buka catatan');
    expect(table.querySelector('img')?.getAttribute('title')).toBe('Diagram');
    expect(table.querySelector('img')?.getAttribute('alt')).toBe('Sumbu x');
    expect(table.querySelector('caption')?.textContent).toBe('Gambar & data');
  });
});
