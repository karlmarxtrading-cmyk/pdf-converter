// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { htmlToMarkdown } from '../../../src/core/clipboard';
import { renderBody } from '../../../src/core/render';
import { checkRenderIntegrity } from '../../../src/core/integrity';

const options = { assets: [], allowExternalImages: false, template: 'EDU-01' as const };
const fixture = (name: string) => readFileSync('fixtures/rc5/' + name, 'utf8');
const dom = (html: string) => new DOMParser().parseFromString(html, 'text/html');
const formulas = (root: Document) => [...root.querySelectorAll('.pf-math')].map(el => ({
  tex: el.getAttribute('data-tex'), display: el.classList.contains('pf-math-display'),
}));

describe('RC5 TeX and table acceptance', () => {
  it('retains column boundaries, absolute values, a TeX norm and a conditional probability', async () => {
    const source = fixture('table-norms.md');
    const result = await renderBody(source, options);
    const doc = dom(result.html);
    expect([...doc.querySelectorAll('tr')].map(r => r.cells.length)).toEqual([3, 3, 3, 3]);
    expect(formulas(doc)).toEqual([
      {tex: String.raw`\left|x\right|`, display: false},
      {tex: String.raw`\|v\|_2`, display: false},
      {tex: 'P(A|B)', display: true},
    ]);
    expect([...doc.querySelectorAll('tbody tr')].map(r => r.lastElementChild?.textContent)).toEqual(['0,125', '−7', '35°']);
    expect(checkRenderIntegrity(source, result).ok).toBe(true);
  });

  it('retains dollars inside TeX, currency prose, code, link target and the following formula', async () => {
    const source = ['Harga $5 dan $10. Tulis `$x$` lalu [lihat](https://example.test/$5).',
      String.raw`Nilai \(\text{USD }\$5 + \$2\) dan $z^2$.`].join('\n');
    const result = await renderBody(source, options);
    const doc = dom(result.html);
    expect(formulas(doc)).toEqual([{tex: String.raw`\text{USD }\$5 + \$2`, display: false}, {tex: 'z^2', display: false}]);
    expect(doc.body.textContent).toContain('Harga $5 dan $10.');
    expect(doc.querySelector('code')?.textContent).toBe('$x$');
    expect(doc.querySelector('a')?.getAttribute('href')).toBe('https://example.test/$5');
    expect(checkRenderIntegrity(source, result).ok).toBe(true);
  });

  it('recovers a legacy visual/script pair without dropping a neighboring independent equation', async () => {
    const input = fixture('mixed-mathjax.html');
    const converted = htmlToMarkdown(input);
    if (!converted.ok) throw new Error(converted.message);
    const result = await renderBody(converted.markdown, options);
    const doc = dom(result.html);
    expect(formulas(doc)).toEqual([{tex: 'a+b', display: false}, {tex: 'E=mc^2', display: false}]);
    expect(doc.body.textContent).toContain('séparé');
    expect(doc.body.textContent).not.toContain('DUPLICATE');
    expect(checkRenderIntegrity(converted.markdown, result).ok).toBe(true);
  });
  it('preserves the CommonMark destination and title when they look like delimited TeX', async () => {
    const source = String.raw`[\(z\)](https://example.test/vol\(1\) "see \[2\]") and $y$.`;
    const result = await renderBody(source, options);
    const doc = dom(result.html);
    expect(doc.querySelector('a')?.getAttribute('href')).toBe('https://example.test/vol(1)');
    expect(doc.querySelector('a')?.getAttribute('title')).toBe('see [2]');
    expect(formulas(doc)).toEqual([{tex: 'z', display: false}, {tex: 'y', display: false}]);
    expect(checkRenderIntegrity(source, result).ok).toBe(true);
  });

  it('keeps a currency-bearing KaTeX annotation inline', async () => {
    const tex = String.raw`\text{USD }\$5`;
    const clip = htmlToMarkdown(`<p>A <span class="katex"><math><annotation encoding="application/x-tex">${tex}</annotation></math></span> B</p>`);
    if (!clip.ok) throw Error(clip.message);
    const result = await renderBody(clip.markdown, options);
    const doc = dom(result.html);
    expect(formulas(doc)).toEqual([{tex, display: false}]);
    expect(doc.querySelector('.pf-math')?.previousSibling?.textContent).toBe('A ');
    expect(doc.querySelector('.pf-math')?.nextSibling?.textContent).toBe(' B');
    expect(checkRenderIntegrity(clip.markdown, result).ok).toBe(true);
  });

  it.each([['\\(', '\\)'], ['\\[', '\\]']])('shows the source and missing closer for %s on the correct line', async (opener, closer) => {
    const broken = opener + String.raw`\frac{1}{2}`;
    const source = ['Judul', '', '    ' + broken, '', 'Rumus ' + broken].join('\n');
    const result = await renderBody(source, options);
    const doc = dom(result.html);
    expect(doc.querySelector('pre code')?.textContent).toBe(broken);
    expect(doc.querySelector('p:last-child')?.textContent).toBe('Rumus ' + broken);
    const issues = result.issues.filter(i => i.code === 'MATH_UNTERMINATED');
    expect(issues).toHaveLength(1);
    expect(issues[0]?.line).toBe(5);
    expect(issues[0]?.message).toContain(closer);
    expect(checkRenderIntegrity(source, result).ok).toBe(true);
  });

  it('retains calculus, aligned and cases rows, Unicode, and source order across block types', async () => {
    const source = fixture('calculus.md');
    const result = await renderBody(source, options);
    const doc = dom(result.html);
    expect(formulas(doc)).toEqual([
      {tex: "f'(x)", display: false},
      {tex: String.raw`\lim_{x\to0}\frac{\sin x}{x}=1`, display: false},
      {tex: String.raw`\frac{d}{dx}x^3=3x^2`, display: false},
      {tex: String.raw`\sum_{k=1}^{n}k=\frac{n(n+1)}{2}`, display: false},
      {tex: String.raw`\int_0^1 x^2\,dx=\frac{1}{3}`, display: true},
      {tex: String.raw`\begin{aligned}
a+b&=c\\
c-b&=a
\end{aligned}`, display: true},
      {tex: String.raw`f(x)=\begin{cases}-x & x<0\\x & x\ge0\end{cases}`, display: true},
    ]);
    expect(doc.querySelector('h1 .pf-math')).toBeTruthy();
    expect(doc.querySelector('blockquote .pf-math')).toBeTruthy();
    expect(doc.querySelectorAll('li .pf-math')).toHaveLength(2);
    expect(doc.body.textContent).toContain('Café, é, θ, Ж; 10,05 − 0,01.');
    expect(doc.body.textContent?.trim().endsWith('Penutup 123.')).toBe(true);
    expect(doc.querySelector('.pf-math-error')).toBeNull();
    expect(checkRenderIntegrity(source, result).ok).toBe(true);
  });

});
