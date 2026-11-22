// @vitest-environment jsdom
/** RC6-TOC01: equations are heading content before slots fill, then one readable TOC label. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderBody, renderStage1 } from '../../../src/core/render';
import { checkRenderIntegrity } from '../../../src/core/integrity';
import { exportHtml } from '../../../src/render/exports';
import { nodeFontSource, realDoc } from '../render/helpers';

const options = { assets: [], allowExternalImages: false, template: 'EDU-01' as const };
const dom = (html: string) => new DOMParser().parseFromString(html, 'text/html');

describe('RC6 heading math and TOC labels', () => {
  it('retains equations in the exact fixture headings without duplicate TeX/accessibility text', async () => {
    const source = readFileSync('fixtures/rc6/user-trigonometry.md', 'utf8');
    const result = await renderBody(source, options);
    expect(result.toc.filter(t => t.text.startsWith('Sudut ') && t.level === 3).map(t => t.text)).toEqual([
      'Sudut negatif', 'Sudut komplemen (90°)', 'Sudut 90°+x', 'Sudut 180°−x',
      'Sudut 180°+x', 'Sudut 270°±x', 'Sudut 360°−x',
    ]);
    expect(result.toc.some(t => t.text.includes('a sin'))).toBe(false);
    expect(result.issues.some(i => i.code === 'HEADING_EMPTY')).toBe(false);
    expect(checkRenderIntegrity(source, result).ok).toBe(true);
  });

  it('keeps existing prose IDs and gives math-only headings meaningful unique targets', async () => {
    const source = [String.raw`# \(x^2\)`, '', String.raw`## \(y_1\)`, '',
      String.raw`## Sudut \(90^\circ+x\)`, '', '[x](#x2) [y](#y1) [sudut](#sudut)'].join('\n');
    const stage = await renderStage1(source, options);
    expect(stage.toc.map(t => t.id)).toEqual(['h-x2', 'h-y1', 'h-sudut']);
    expect(stage.issues.some(i => i.code === 'HEADING_EMPTY')).toBe(false);
    const result = await renderBody(source, options);
    expect(result.toc.map(t => t.text)).toEqual(['x^2', 'y_1', 'Sudut 90°+x']);
    expect(result.toc.map(t => t.id)).toEqual(['h-x2', 'h-y1', 'h-sudut']);
    const output = dom(result.html);
    expect([...output.querySelectorAll('a')].map(a => a.getAttribute('href'))).toEqual(['#h-x2', '#h-y1', '#h-sudut']);
    expect(result.issues.some(i => i.code === 'FRAGMENT_TARGET_MISSING')).toBe(false);
    expect(checkRenderIntegrity(source, result).ok).toBe(true);
  });

  it('linearizes fractions and square roots, preserves code, and falls back safely for complex math', async () => {
    const source = [String.raw`# \(\frac{a+b}{c}\)`, '', String.raw`## \(\sqrt{x+1}\)`, '',
      '## `' + String.raw`\(x^2\)` + '`', '', String.raw`## \(\begin{pmatrix}a&b\\c&d\end{pmatrix}\)`].join('\n');
    const result = await renderBody(source, options);
    expect(result.toc.map(t => t.text)).toEqual(['(a+b)/(c)', '√(x+1)', String.raw`\(x^2\)`, String.raw`\begin{pmatrix}a&b\\c&d\end{pmatrix}`]);
    expect(dom(result.html).querySelector('h2 code')?.textContent).toBe(String.raw`\(x^2\)`);
    expect(checkRenderIntegrity(source, result).ok).toBe(true);
  });

  it('includes safe HTML formula metadata once and excludes active content from the label', async () => {
    const source = '<h1 id="original">Value <span data-latex="x^2">DUPLICATE</span><script>BAD</script></h1>\n\n[link](#original)';
    const result = await renderBody(source, options);
    expect(result.toc[0]?.text).toBe('Value x^2');
    expect(result.toc[0]?.id).toBe('h-value');
    expect(dom(result.html).querySelector('a')?.getAttribute('href')).toBe('#h-value');
    expect(dom(result.html).querySelectorAll('script')).toHaveLength(0);
    expect(result.issues.some(i => i.code === 'HEADING_EMPTY')).toBe(false);
  });

  it('exports working TOC anchors containing formula labels without adding formula duplicates', async () => {
    const source = String.raw`# Identitas \(\sin^2x+\cos^2x=1\)` + '\n\n' + String.raw`## \(x^2\)`;
    const doc = await realDoc(source, 'EDU-01', { title: 'Heading math', author: '', cover: false, toc: true });
    const output = await exportHtml({ ...doc, profile: 'standalone', fontSource: nodeFontSource, renderMermaid: false });
    const html = dom(output.html);
    const links = [...html.querySelectorAll('nav.pf-toc a')];
    expect(links).toHaveLength(2);
    expect(links[0]?.textContent).toContain('sin^2x+cos^2x=1');
    expect(links[1]?.textContent).toContain('x^2');
    for (const link of links) expect(html.getElementById(decodeURIComponent(link.getAttribute('href')!.slice(1)))).not.toBeNull();
    expect(html.querySelectorAll('.pf-math .katex')).toHaveLength(2);
    expect(output.manifest.checks.find(c => c.name === 'internal-anchors')?.status).toBe('pass');
  });
});
