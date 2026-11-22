// @vitest-environment jsdom
/** RC6-AUD: independently authored regression and hostile-context probes.
 * Synthetic HTML tests are not certification of live provider clipboard formats.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { htmlToMarkdown } from '../../../src/core/clipboard';
import { checkRenderIntegrity } from '../../../src/core/integrity';
import { renderBody } from '../../../src/core/render';

const options = { assets: [], template: 'BUS-01' as const, allowExternalImages: false };
const dom = (html: string) => new DOMParser().parseFromString(html, 'text/html');
const formulas = (doc: Document) => [...doc.querySelectorAll('.pf-math')].map(n => ({
  tex: n.getAttribute('data-tex'), display: n.classList.contains('pf-math-display'),
}));
const annotation = (tex: string) => `<span class="katex"><math><semantics><mi>VISUAL</mi><annotation encoding="application/x-tex">${tex}</annotation></semantics></math></span>`;

describe('RC6-AUD01 escaped inline HTML is parsed only once', () => {
  it.each([
    [String.raw`Before <span>\\(literal\\)</span> after.`, String.raw`Before \(literal\) after.`],
    [String.raw`Before <span>\$x\$</span> after.`, 'Before $x$ after.'],
    [String.raw`Before <strong>\$x\$</strong> after.`, 'Before $x$ after.'],
    [String.raw`Before <em>\\[literal\\]</em> after.`, String.raw`Before \[literal\] after.`],
  ])('preserves an already escaped Markdown literal: %s', async (source, expected) => {
    const result = await renderBody(source, options);
    const doc = dom(result.html);
    expect(formulas(doc)).toEqual([]);
    expect(doc.body.textContent?.trim()).toBe(expected);
    expect(checkRenderIntegrity(source, result).ok).toBe(true);
  });

  it('does not read link destinations as formula source', async () => {
    const source = String.raw`[literal link](https://example.org/path/\\(x+1\\)) and \(y+2\)`;
    const result = await renderBody(source, options);
    const doc = dom(result.html);
    expect(formulas(doc)).toEqual([{ tex: 'y+2', display: false }]);
    expect(doc.querySelector('a')?.textContent).toBe('literal link');
    expect(checkRenderIntegrity(source, result).ok).toBe(true);
  });
});

describe('RC6-AUD02 HTML math roots preserve surrounding content', () => {
  const source = `<div class="math"><p>Intro.</p>${annotation('x+1')}${annotation('y+2')}<p>Outro.</p></div>`;

  it('does not collapse a clipboard group to its first annotation', async () => {
    const converted = htmlToMarkdown(source);
    expect(converted.ok).toBe(true);
    if (!converted.ok) return;
    const result = await renderBody(converted.markdown, options);
    const doc = dom(result.html);
    expect(formulas(doc)).toEqual([{ tex: 'x+1', display: false }, { tex: 'y+2', display: false }]);
    expect(doc.body.textContent).toContain('Intro.');
    expect(doc.body.textContent).toContain('Outro.');
    expect(doc.body.textContent).not.toContain('VISUAL');
    expect(checkRenderIntegrity(converted.markdown, result).ok).toBe(true);
  });

  it('does not collapse a raw HTML group to its first annotation', async () => {
    const result = await renderBody(source, options);
    const doc = dom(result.html);
    expect(formulas(doc)).toEqual([{ tex: 'x+1', display: false }, { tex: 'y+2', display: false }]);
    expect(doc.body.textContent).toContain('Intro.');
    expect(doc.body.textContent).toContain('Outro.');
    expect(doc.body.textContent).not.toContain('VISUAL');
  });

  it('keeps literal code and prose within a generic math-labelled group', async () => {
    const converted = htmlToMarkdown(`<div class="math"><code>literal_code</code><p>Keep prose.</p>${annotation('x')}</div>`);
    expect(converted.ok).toBe(true);
    if (!converted.ok) return;
    const result = await renderBody(converted.markdown, options);
    const doc = dom(result.html);
    expect(formulas(doc)).toEqual([{ tex: 'x', display: false }]);
    expect(doc.querySelector('code')?.textContent).toBe('literal_code');
    expect(doc.body.textContent).toContain('Keep prose.');
  });

  it('renders nested raw formulas once each, in order and with correct modes', async () => {
    const source = String.raw`<div><p>\(x+1\) <strong>\[y+2\]</strong></p><span data-latex="z+3">VISUAL</span><p>\(w+4\)</p></div>`;
    const result = await renderBody(source, options);
    const doc = dom(result.html);
    expect(formulas(doc)).toEqual([
      { tex: 'x+1', display: false }, { tex: 'y+2', display: true },
      { tex: 'z+3', display: false }, { tex: 'w+4', display: false },
    ]);
    expect(doc.querySelectorAll('.pf-math .katex')).toHaveLength(4);
    expect(doc.querySelectorAll('.pf-math .pf-math')).toHaveLength(0);
    expect(doc.body.textContent).not.toContain('VISUAL');
  });

  it('gives explicit source metadata precedence over a stale visual text copy', async () => {
    const source = String.raw`<div>Before <span data-latex="x+1">\(y+2\)</span> after.</div>`;
    const result = await renderBody(source, options);
    const doc = dom(result.html);
    expect(formulas(doc)).toEqual([{ tex: 'x+1', display: false }]);
    expect(doc.body.textContent).toContain('Before ');
    expect(doc.body.textContent).toContain(' after.');
  });
});

describe('RC6-AUD03 literal contexts and security survive recovery', () => {
  it.each(['code', 'pre', 'kbd', 'samp'])('keeps %s descendants literal', async tag => {
    const literal = String.raw`\\(x+1\\) \[y+2\] $z+3$`;
    const source = `<div><${tag}><span class="katex" data-latex="a+b">${literal}</span></${tag}></div>`;
    const result = await renderBody(source, options);
    const doc = dom(result.html);
    expect(formulas(doc)).toEqual([]);
    expect(doc.querySelector(tag)?.textContent).toBe(literal);
  });

  it('preserves fenced examples, math-looking inline code, and currency', async () => {
    const code = String.raw`\\(\theta\_{1}\\) $x$`;
    const source = '```latex\n' + code + '\n```\n\n`' + code + '`\n\nPrice $5 and $10.\n';
    const result = await renderBody(source, options);
    const doc = dom(result.html);
    expect(formulas(doc)).toEqual([]);
    expect([...doc.querySelectorAll('code')].map(n => n.textContent)).toEqual([code, code]);
    expect(doc.body.textContent).toContain('Price $5 and $10.');
    expect(checkRenderIntegrity(source, result).ok).toBe(true);
  });

  it('does not grant trust to forged formula slots or active HTML', async () => {
    const source = String.raw`<div><span class="pf-math" data-slot="fake" data-post="fake">\(x+1\)</span><script>window.bad=1</script><img src="javascript:alert(1)" onerror="alert(2)"><a href="javascript:alert(3)">link</a></div>`;
    const result = await renderBody(source, options);
    const doc = dom(result.html);
    expect(formulas(doc)).toEqual([{ tex: 'x+1', display: false }]);
    expect(doc.querySelector('script, iframe, object, [onerror], [onclick], a[href^="javascript:"], img[src^="javascript:"]')).toBeNull();
    expect(doc.querySelector('[data-slot="fake"], [data-post="fake"]')).toBeNull();
  });

  it('treats TeX metadata containing an unsafe URL as data', async () => {
    const source = String.raw`<div><span data-latex="\href{javascript:alert(1)}{x}">VISUAL</span></div>`;
    const result = await renderBody(source, options);
    const doc = dom(result.html);
    expect(formulas(doc)).toEqual([{ tex: String.raw`\href{javascript:alert(1)}{x}`, display: false }]);
    expect(doc.querySelector('script, iframe, object, [onerror], a[href^="javascript:"]')).toBeNull();
  });
});

describe('RC6-AUD04 provenance and independent integrity mutations', () => {
  it('retains raw payload while separately rendering a disclosed subscript repair', async () => {
    const source = String.raw`Value \\(\theta\_{1}\\).`;
    const result = await renderBody(source, options);
    const doc = dom(result.html);
    const formula = doc.querySelector('.pf-math');
    expect(formula?.getAttribute('data-source-tex')).toBe(String.raw`\theta\_{1}`);
    expect(formula?.getAttribute('data-tex')).toBe(String.raw`\theta_{1}`);
    expect(formula?.getAttribute('data-math-adaptations')).toContain('copied-subscript');
    expect(formula?.querySelector('annotation[encoding="application/x-tex"]')?.textContent).toBe(String.raw`\theta_{1}`);
    expect(checkRenderIntegrity(source, result).ok).toBe(true);
    formula?.setAttribute('data-tex', String.raw`\theta_{2}`);
    expect(checkRenderIntegrity(source, doc).ok).toBe(false);
  });

  it.each([
    String.raw`A: \\(x+1\\); B: \(y+2\).`,
    String.raw`| Formula | Value |
|---|---|
| \\(x+1\\) | 7 |`,
    String.raw`<table><tr><td>\(x+1\)</td><td>7</td></tr></table>`,
    String.raw`<table><tr><td><span data-tex="x+1">VISUAL</span></td><td>7</td></tr></table>`,
  ])('detects a sign mutation in rendered formula metadata: %s', async source => {
    const result = await renderBody(source, options);
    expect(checkRenderIntegrity(source, result).ok).toBe(true);
    const doc = dom(result.html);
    const formula = doc.querySelector('.pf-math');
    expect(formula?.getAttribute('data-tex')).toBe('x+1');
    formula?.setAttribute('data-tex', 'x-1');
    expect(checkRenderIntegrity(source, doc).ok).toBe(false);
  });

  it('accounts for the exact uploaded transport patterns independently of scanMath', async () => {
    const source = readFileSync('fixtures/rc6/user-trigonometry.md', 'utf8');
    const slashRuns = [...source.matchAll(/\\+/g)].map(m => m[0].length);
    expect(slashRuns.filter(n => n === 3)).toHaveLength(46);
    expect(slashRuns.filter(n => n === 4)).toHaveLength(2);
    expect([...source.matchAll(/\\_\{/g)]).toHaveLength(6);
    // This deliberately reads only the exact fixture's complete doubled-delimiter pairs.
    // It does not call the application's parser, source model or repair implementation.
    const matched = [...source.matchAll(/\\\\(\(|\[)([\s\S]*?)\\\\(\)|\])/g)];
    expect(matched).toHaveLength(231);
    expect(matched.filter(m => m[1] === '[')).toHaveLength(128);
    const result = await renderBody(source, options);
    const nodes = [...dom(result.html).querySelectorAll('.pf-math')];
    expect(nodes).toHaveLength(matched.length);
    expect(nodes.map(n => n.getAttribute('data-source-tex'))).toEqual(matched.map(m => m[2]));
    expect(nodes.filter(n => n.getAttribute('data-source-tex') !== n.getAttribute('data-tex'))).toHaveLength(17);
  });
});
