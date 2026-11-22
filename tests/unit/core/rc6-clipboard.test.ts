// @vitest-environment jsdom
/** RC6-CLIP: synthetic export-format fixtures, not live provider compatibility certification. */
import { describe, expect, it } from 'vitest';
import { htmlToMarkdown } from '../../../src/core/clipboard';
import { renderBody } from '../../../src/core/render';
import { checkRenderIntegrity } from '../../../src/core/integrity';

const options = { assets: [], allowExternalImages: false, template: 'EDU-01' as const };
const dom = (html: string) => new DOMParser().parseFromString(html, 'text/html');
const math = (doc: Document) => [...doc.querySelectorAll('.pf-math')].map(el => ({
  tex: el.getAttribute('data-tex'), display: el.classList.contains('pf-math-display'),
}));

async function convert(input: string) {
  const converted = htmlToMarkdown(input);
  if (!converted.ok) throw Error(converted.message);
  const rendered = await renderBody(converted.markdown, options);
  expect(checkRenderIntegrity(converted.markdown, rendered).ok).toBe(true);
  return { converted, rendered, doc: dom(rendered.html) };
}

describe('RC6-CLIP explicit math source recovery', () => {
  it('RC6-CLIP01 reads data-tex/data-latex exactly once, keeping surrounding prose', async () => {
    const { converted, doc } = await convert(String.raw`<p>Awal <span data-tex="x^2+y^2=1"><span>VISUAL-DUPLICATE</span></span> dan <span data-latex="\frac{a}{b}">ANOTHER-DUPLICATE</span> akhir.</p>`);
    expect(math(doc)).toEqual([{ tex: 'x^2+y^2=1', display: false }, { tex: String.raw`\frac{a}{b}`, display: false }]);
    expect(doc.body.textContent).toContain('Awal ');
    expect(doc.body.textContent).toContain(' dan ');
    expect(doc.body.textContent).toContain(' akhir.');
    expect(doc.body.textContent).not.toContain('DUPLICATE');
    expect(converted.changes.find(x => x.kind === 'math-from-source-attribute')?.count).toBe(2);
  });

  it.each([
    ['display="true"', 'MathJax', 'mjx-container'],
    ['data-display="true"', '', 'div'],
    ['data-display-mode="true"', '', 'span'],
    ['data-type="block-math"', '', 'div'],
    ['', 'math-display', 'span'],
    ['', '', 'math-display'],
  ])('RC6-CLIP02 preserves display mode (%s %s %s)', async (attrs, className, tag) => {
    const { doc } = await convert(`<${tag} ${attrs} class="${className}" data-latex="E=mc^2">DUPLICATE</${tag}>`);
    expect(math(doc)).toEqual([{ tex: 'E=mc^2', display: true }]);
    expect(doc.querySelectorAll('.katex-display')).toHaveLength(1);
  });

  it('RC6-CLIP02 reads MathJax annotation display=true and does not duplicate assistive MathML', async () => {
    const { doc } = await convert('<mjx-container class="MathJax" display="true"><mjx-math>DUPLICATE</mjx-math><mjx-assistive-mml><math><semantics><mrow/><annotation encoding="application/x-tex">a+b</annotation></semantics></math></mjx-assistive-mml></mjx-container>');
    expect(math(doc)).toEqual([{ tex: 'a+b', display: true }]);
    expect(doc.body.textContent).not.toContain('DUPLICATE');
  });

  it.each(['application/x-tex', 'text/latex', 'application/x-latex', 'text/x-tex', ' TEXT/X-LATEX ;charset=utf-8'])('RC6-CLIP03 recognizes explicit TeX annotation encoding %s', async encoding => {
    const { doc } = await convert(`<math display="block"><semantics><mrow><mi>DUPLICATE</mi></mrow><annotation encoding="${encoding}">x_{1}+y^{2}</annotation></semantics></math>`);
    expect(math(doc)).toEqual([{ tex: 'x_{1}+y^{2}', display: true }]);
    expect(doc.body.textContent).not.toContain('DUPLICATE');
  });

  it('RC6-CLIP01 strips complete source delimiters from explicit attributes only', async () => {
    const { doc } = await convert(String.raw`<p><span data-latex="\(x^2\)">DUPLICATE</span></p><div data-tex="\[\frac12\]">DUPLICATE</div>`);
    expect(math(doc)).toEqual([{ tex: 'x^2', display: false }, { tex: String.raw`\frac12`, display: true }]);
  });

  it.each(['code', 'kbd', 'samp', 'pre'])('RC6-CLIP04 keeps %s literal even if the element has math metadata', async tag => {
    const { doc } = await convert(`<${tag} class="katex" data-latex="x^2">\\(literal\\)</${tag}>`);
    expect(math(doc)).toEqual([]);
    expect(doc.body.textContent).toContain(String.raw`\(literal\)`);
  });

  it('RC6-CLIP04 does not reinterpret source attributes on active or unrelated elements', async () => {
    const { converted, doc } = await convert('<script data-tex="x^2">window.bad=1</script><iframe data-latex="y^2">bad</iframe><a href="https://example.test/" data-tex="z^2">link text</a><p>Tail</p>');
    expect(math(doc)).toEqual([]);
    expect(doc.querySelector('a')?.textContent).toBe('link text');
    expect(doc.querySelector('script, iframe')).toBeNull();
    expect(converted.markdown).not.toContain('window.bad');
    expect(converted.issues.some(x => x.code === 'SECURITY_ELEMENT_REMOVED')).toBe(true);
  });

  it('RC6-CLIP05 reports a source-free MathJax formula and preserves its text', async () => {
    const { converted, doc } = await convert('<p>Awal <mjx-container class="MathJax"><mjx-math>x2</mjx-math></mjx-container> akhir</p>');
    expect(doc.body.textContent).toContain('Awal x2 akhir');
    expect(converted.issues.some(x => x.code === 'CLIPBOARD_MATH_NO_TEX')).toBe(true);
  });

  it('RC6-CLIP06 preserves copied AI box/text wrappers and code without executing props', async () => {
    const { converted, doc } = await convert(String.raw`<box gap="2" onclick="window.bad=1"><text weight="medium">Identitas inti</text>\[\sin^2x+\cos^2x=1\]<code>\(contoh\)</code><caption>Catatan penutup</caption></box>`);
    expect(math(doc)).toEqual([{ tex: String.raw`\sin^2x+\cos^2x=1`, display: true }]);
    expect(doc.body.textContent).toContain('Identitas inti');
    expect(doc.body.textContent).toContain('Catatan penutup');
    expect(doc.querySelector('code')?.textContent).toBe(String.raw`\(contoh\)`);
    expect(doc.querySelector('[onclick], script')).toBeNull();
    expect(converted.markdown).not.toContain('window.bad');
  });

  it('RC6-CLIP06 keeps separate text components as separate paragraphs', async () => {
    const { doc } = await convert('<box><text>Judul bagian</text><text>Paragraf berikutnya</text></box>');
    expect([...doc.querySelectorAll('p')].map(p => p.textContent)).toEqual(['Judul bagian', 'Paragraf berikutnya']);
  });

  it('RC6-CLIP01 keeps source math in merged tables and ordinary cells', async () => {
    const { converted, doc } = await convert(String.raw`<table><caption>Rumus</caption><tr><th>A</th><th>B</th></tr><tr><td colspan="2"><span data-latex="\left|x\right|">DUPLICATE</span></td></tr></table>`);
    expect(math(doc)).toEqual([{ tex: String.raw`\left|x\right|`, display: false }]);
    expect(doc.querySelector('td')?.getAttribute('colspan')).toBe('2');
    expect(converted.stats).toMatchObject({ math: 1, tables: 1, mergedTables: 1 });
  });

  it('RC6-CLIP07 records inferred copy repairs before a merged table serializes canonical TeX', async () => {
    const { converted, doc } = await convert(String.raw`<table><tr><td colspan="2">\\(\theta\_{1}\\)</td></tr></table>`);
    expect(math(doc)).toEqual([{ tex: String.raw`\theta_{1}`, display: false }]);
    expect(converted.issues.find(i => i.code === 'CLIPBOARD_MATH_RECOVERED')).toMatchObject({
      severity: 'warning', detail: { count: 1, bodyChanges: 1, raw: [String.raw`\theta\_{1}`], rendered: [String.raw`\theta_{1}`] },
    });
  });

  it.each(['math', 'math-display', 'katex-display'])('RC6-CLIP08 preserves prose, code, and every formula inside broad %s wrappers', async className => {
    const equation = (tex: string) => `<span class="katex"><math><semantics><mi>VISUAL</mi><annotation encoding="application/x-tex">${tex}</annotation></semantics></math></span>`;
    const { doc } = await convert(`<div class="${className}"><p>Intro</p>${equation('x+1')}<code>sample</code>${equation('y+2')}<p>Outro</p></div>`);
    expect(math(doc).map(x => x.tex)).toEqual(['x+1', 'y+2']);
    expect(doc.body.textContent).toContain('Intro');
    expect(doc.body.textContent).toContain('Outro');
    expect(doc.querySelector('code')?.textContent).toBe('sample');
  });

  it('RC6-CLIP08 does not collapse a one-formula wrapper with adjacent prose', async () => {
    const { doc } = await convert('<div class="math">Before <span class="katex"><math><annotation encoding="application/x-tex">x+1</annotation></math></span> after.</div>');
    expect(math(doc).map(x => x.tex)).toEqual(['x+1']);
    expect(doc.body.textContent).toContain('Before ');
    expect(doc.body.textContent).toContain(' after.');
  });

  it('RC6-CLIP08 does not discard a rejected mixed MathJax wrapper as a script preview', async () => {
    const { doc } = await convert('<div class="MathJax"><p>Intro</p><math><annotation encoding="application/x-tex">x+1</annotation></math><p>Outro</p></div><script type="math/tex">y+2</script>');
    expect(math(doc).map(x => x.tex)).toEqual(['x+1', 'y+2']);
    expect(doc.body.textContent).toContain('Intro');
    expect(doc.body.textContent).toContain('Outro');
  });

  it('RC6-CLIP09 preserves adjacent inline equations without ambiguous double-dollar joins', async () => {
    const { converted, doc } = await convert('<p><span data-latex="x+1">x1</span><span data-latex="y+2">y2</span></p>');
    expect(math(doc)).toEqual([{ tex: 'x+1', display: false }, { tex: 'y+2', display: false }]);
    expect(converted.markdown.trim()).toBe(String.raw`\(x+1\)\(y+2\)`);
    expect(converted.changes.some(c => c.kind === 'math-adjacent-delimiters')).toBe(true);
  });
});
