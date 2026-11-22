// @vitest-environment jsdom
/** RC6-M01–M04: the exact user attachment, not a shortened/sanitized surrogate. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { scanMath } from '../../../src/core/math';
import { parseMarkdown } from '../../../src/core/markdown';
import { adaptCopiedTex } from '../../../src/core/math-copy';
import { renderBody } from '../../../src/core/render';
import { checkRenderIntegrity } from '../../../src/core/integrity';

const options = { assets: [], allowExternalImages: false, template: 'EDU-01' as const };
const dom = (html: string) => new DOMParser().parseFromString(html, 'text/html');
const fixture = readFileSync('fixtures/rc6/user-trigonometry.md', 'utf8');

describe('RC6 copied Markdown math', () => {
  it('recognizes every exact user formula and keeps source and UTF-16 offsets unchanged', () => {
    const scan = scanMath(fixture);
    expect(scan.spans).toHaveLength(231);
    expect(scan.spans.filter(s => s.display)).toHaveLength(128);
    expect(scan.spans.filter(s => !s.display)).toHaveLength(103);
    expect(scan.parseCopy.length).toBe(fixture.length);
    expect(scan.issues).toEqual([]);
    for (const span of scan.spans) {
      expect(fixture.slice(span.start + span.openerLength!, span.end - span.closerLength!)).toBe(span.tex);
      expect(fixture.slice(0, span.start).split('\n').length).toBe(span.line);
    }
    expect(parseMarkdown(fixture).source).toBe(fixture);
  });

  it('renders all 231 formulas, including table cells and aligned rows, without parse errors', async () => {
    const result = await renderBody(fixture, options);
    const doc = dom(result.html);
    expect(doc.querySelectorAll('.pf-math')).toHaveLength(231);
    expect(doc.querySelectorAll('.pf-math .katex')).toHaveLength(231);
    expect(doc.querySelectorAll('.pf-math-display')).toHaveLength(128);
    expect(doc.querySelectorAll('.pf-math-error')).toHaveLength(0);
    expect(doc.querySelectorAll('table')).toHaveLength(5);
    expect(result.issues.filter(i => i.severity === 'error')).toEqual([]);
    expect(checkRenderIntegrity(fixture, result).ok).toBe(true);
  });

  it('retains the mathematical meaning of subscripts, summation spacing and aligned row heights', () => {
    const spans = scanMath(fixture).spans;
    expect(spans.filter(s => s.renderTex !== undefined)).toHaveLength(17);
    expect(spans.filter(s => s.adaptations?.includes('copied-subscript'))).toHaveLength(4);
    const conversion = spans.find(s => s.tex.includes(String.raw`\theta\_{\text{rad}}=`));
    expect(conversion?.renderTex?.trim()).toBe(String.raw`\theta_{\text{rad}}=\theta_{\text{derajat}}\frac{\pi}{180}`);
    const sum = spans.find(s => s.tex.includes(String.raw`\sum\_{k=0}^{n-1}\sin`));
    expect(sum?.renderTex?.trim()).toBe(String.raw`\boxed{\sum_{k=0}^{n-1}\sin(a+kd)= \frac{\sin\frac{nd}{2}\;\sin\left(a+\frac{(n-1)d}{2}\right)} {\sin\frac d2}}`);
    const quadrants = spans.find(s => s.tex.includes(String.raw`\sin(270^\circ-x)`));
    expect(quadrants?.renderTex?.trim()).toBe(String.raw`\begin{aligned} \sin(270^\circ-x)&=-\cos x\\ \cos(270^\circ-x)&=-\sin x\\ \tan(270^\circ-x)&=\cot x\\[4pt] \sin(270^\circ+x)&=-\cos x\\ \cos(270^\circ+x)&=\sin x\\ \tan(270^\circ+x)&=-\cot x \end{aligned}`);
  });

  it('still rejects a formula changed after rendering', async () => {
    const source = String.raw`Nilai \\(\theta\_{\text{rad}}=1\\).`;
    const result = await renderBody(source, options);
    const doc = dom(result.html);
    doc.querySelector('.pf-math')!.setAttribute('data-tex', String.raw`\theta_{\text{rad}}=2`);
    const changed = checkRenderIntegrity(source, doc.body.innerHTML);
    expect(changed.ok).toBe(false);
    expect(changed.issues.some(i => i.code === 'INTEGRITY_MATH_CHANGED')).toBe(true);
  });

  it('preserves code and literal text while rendering ordinary and copied delimiter variants', async () => {
    const source = [
      String.raw`Standar \(x^2\), salinan \\(\frac{1}{2}\\), angka \\(0\\), dan \\(literal\\).`,
      'Kode: `' + String.raw`\\(x\\)` + '`',
      '', '```latex', String.raw`\\[\sum\_{k=1}^{n}k\\]`, '```', '',
      String.raw`    \\(\theta\\)`, '',
      String.raw`<pre><code>\\(x\\)</code></pre>`,
    ].join('\n');
    const result = await renderBody(source, options);
    const doc = dom(result.html);
    expect([...doc.querySelectorAll('.pf-math')].map(e => e.getAttribute('data-tex'))).toEqual(['x^2', String.raw`\frac{1}{2}`, '0']);
    expect([...doc.querySelectorAll('code')].map(e => e.textContent)).toContain(String.raw`\\[\sum\_{k=1}^{n}k\\]`);
    expect(doc.body.textContent).toContain(String.raw`\(literal\)`);
    expect(checkRenderIntegrity(source, result).ok).toBe(true);
  });

  it('retains proper row breaks and protects literal underscores inside text and URLs', () => {
    const good = String.raw`\begin{aligned}x_1&=1\\x_2&=2\\[3pt]\text{file\_name}&=\texttt{a\_{b}}\end{aligned}`;
    expect(adaptCopiedTex(good)).toEqual({ tex: good, adaptations: [] });
    const source = String.raw`\theta\_{\text{rad}}+\text{file\_name}+\url{https://example.test/a\_{b}}`;
    expect(adaptCopiedTex(source)).toEqual({ tex: String.raw`\theta_{\text{rad}}+\text{file\_name}+\url{https://example.test/a\_{b}}`, adaptations: ['copied-subscript'] });
  });

  it('recognizes compact algebra, conditional probability and intervals but keeps ordinary escaped prose literal', () => {
    const source = String.raw`\\(x-y\\), \\((x+y)/2\\), \\(P(A|B)\\), \\([-1,1]\\), \\(literal-with-dash\\), \\(literal words\\).`;
    expect(scanMath(source).spans.map(s => s.tex)).toEqual(['x-y', '(x+y)/2', 'P(A|B)', '[-1,1]']);
  });

  it('records exact before/after payloads for the copied subscript and spacing adaptations', () => {
    const source = String.raw`\\[\sum\_{k=1}^{n}k\\;x\\]`;
    const scan = scanMath(source);
    expect(scan.spans[0]).toMatchObject({ tex: String.raw`\sum\_{k=1}^{n}k\\;x`, renderTex: String.raw`\sum_{k=1}^{n}k\;x`, adaptations: ['copied-delimiters', 'copied-subscript', 'copied-spacing'] });
    const parsed = parseMarkdown(source);
    expect(parsed.tree.children[0]).toMatchObject({ type: 'math', value: String.raw`\sum_{k=1}^{n}k\;x`, data: {
      pfSourceTex: String.raw`\sum\_{k=1}^{n}k\\;x`, pfMathSourceStart: 0, pfMathSourceEnd: source.length,
    } });
  });

  it('handles copied multiline display math without absorbing following prose', async () => {
    const source = ['Awal.', '', String.raw`\\[`, String.raw`\begin{aligned}`, String.raw`a&=b\\`, String.raw`c&=d`, String.raw`\end{aligned}`, String.raw`\\]`, '', 'Akhir.'].join('\n');
    const result = await renderBody(source, options);
    const doc = dom(result.html);
    expect(doc.querySelectorAll('.pf-math .katex')).toHaveLength(1);
    expect(doc.querySelectorAll('.pf-math-display')).toHaveLength(1);
    expect(doc.body.textContent?.trim().endsWith('Akhir.')).toBe(true);
    expect(checkRenderIntegrity(source, result).ok).toBe(true);
  });

  it('keeps raw table separators, norms, currency and link destinations correctly separated', async () => {
    const source = [
      '| Rumus | Harga |', '| --- | --- |', String.raw`| \\(\left|x\right|+\|v\|_2\\) | $5 |`, '',
      String.raw`[tautan](https://example.test/\\(2\\)) dan $10 serta $20.`,
    ].join('\n');
    const result = await renderBody(source, options);
    const doc = dom(result.html);
    expect([...doc.querySelectorAll('tr')].map(r => r.cells.length)).toEqual([2, 2]);
    expect(doc.querySelectorAll('.pf-math .katex')).toHaveLength(1);
    expect(doc.querySelector('tbody tr td:last-child')?.textContent).toBe('$5');
    expect(checkRenderIntegrity(source, result).ok).toBe(true);
  });

  it('renders explicit math fences and GitHub dollar-backtick syntax while retaining LaTeX code examples', async () => {
    const tex = String.raw`\begin{aligned}a&=b\\c&=d\end{aligned}`;
    const source = ['```math', tex, '```', '', '```latex', tex, '```', '',
      'GitHub $`' + String.raw`\sqrt{3}+\frac{1}{2}` + '`$ selesai.'].join('\n');
    const result = await renderBody(source, options);
    const doc = dom(result.html);
    expect([...doc.querySelectorAll('.pf-math')].map(e => e.getAttribute('data-tex'))).toEqual([tex, String.raw`\sqrt{3}+\frac{1}{2}`]);
    expect(doc.querySelectorAll('.pf-math .katex')).toHaveLength(2);
    expect(doc.querySelector('pre code')?.textContent).toBe(tex);
    expect(doc.querySelectorAll('.pf-math-display')).toHaveLength(1);
    expect(checkRenderIntegrity(source, result).ok).toBe(true);
  });

  it.each([
    String.raw`### **Sudut&#x20;**\(90^\circ+x\)`,
    String.raw`### **Sudut&#x20;**\\(90^\circ+x\\)`,
    String.raw`### *Sudut&#x20;*\\(90^\circ+x\\)`,
  ])('RC6-M05 preserves emphasis next to delimiter punctuation: %s', async source => {
    const result = await renderBody(source, options);
    const doc = dom(result.html);
    const emphasis = doc.querySelector('h3 strong, h3 em');
    expect(emphasis?.textContent).toBe('Sudut ');
    expect(doc.querySelectorAll('h3 .pf-math .katex')).toHaveLength(1);
    expect(doc.querySelector('h3')?.textContent).not.toContain('*');
    expect(checkRenderIntegrity(source, result).ok).toBe(true);
    expect(scanMath(source).parseCopy.length).toBe(source.length);
  });

  it('RC6-M05 keeps literal and entity-encoded sentinel candidates intact', async () => {
    const source = String.raw`⁂ &#x204B; &#8272; &#xE004; **Sudut&#x20;**\\(x\\).`;
    const scan = scanMath(source);
    expect(scan.sentinels?.boundary).not.toBe('⁂');
    expect(scan.sentinels?.boundary).not.toBe('⁋');
    expect(scan.sentinels?.fill).not.toBe('\uE004');
    const result = await renderBody(source, options);
    const doc = dom(result.html);
    expect(doc.querySelector('p')?.textContent).toContain('⁂ ⁋ ⁐ \uE004');
    expect(doc.querySelector('strong')?.textContent).toBe('Sudut ');
    expect(doc.querySelectorAll('.katex')).toHaveLength(1);
  });
});
