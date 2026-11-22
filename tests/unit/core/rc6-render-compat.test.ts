// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderBody } from '../../../src/core/render';
import { checkRenderIntegrity } from '../../../src/core/integrity';
import { preflight } from '../../../src/core/preflight';
import { readFileSync } from 'node:fs';
import type { CoreIssue } from '../../../src/core/util';

const options = { assets: [], template: 'BUS-01' as const, allowExternalImages: false };
const dom = (html: string) => new DOMParser().parseFromString(html, 'text/html');

describe('RC6 real-input rendering and missed-math diagnostics', () => {
  it('retains the exact user source and discloses all inferred body recoveries', async () => {
    const source = readFileSync('fixtures/rc6/user-trigonometry.md', 'utf8');
    const result = await renderBody(source, options);
    const doc = dom(result.html);
    expect(doc.querySelectorAll('.pf-math .katex')).toHaveLength(231);
    expect(doc.querySelectorAll('.pf-math-display')).toHaveLength(128);
    expect(doc.querySelectorAll('.pf-math-error')).toHaveLength(0);
    expect(doc.querySelectorAll('[data-source-tex]')).toHaveLength(231);
    const info = result.issues.find(i => i.code === 'MATH_COPY_RECOVERED') as CoreIssue | undefined;
    expect(info?.severity).toBe('warning');
    expect(info?.detail?.count).toBe(231);
    expect(info?.detail?.bodyAdaptations).toBe(17);
    expect(result.issues.some(i => i.code === 'MATH_UNRENDERED_SOURCE')).toBe(false);
    expect(checkRenderIntegrity(source, result).ok).toBe(true);
    expect(readFileSync('fixtures/rc6/user-trigonometry.md', 'utf8')).toBe(source);
  });

  it.each([
    String.raw`<div>\[x^2+y^2=1\]</div>`,
    String.raw`<p>Formula \(E=mc^2\) ends.</p>`,
    String.raw`<table><tr><td>\(x^2\)</td></tr></table>`,
    String.raw`<div>Before \[\frac{<em>a</em>}{b}\] after</div>`,
    '<div>\\[<br>x^2<br>\\]</div>',
  ])('renders literal TeX in safe raw HTML: %s', async source => {
    const result = await renderBody(source, options);
    const doc = dom(result.html);
    expect(doc.querySelectorAll('.pf-math .katex')).toHaveLength(1);
    expect(doc.querySelectorAll('.pf-math-error')).toHaveLength(0);
    expect(result.issues.filter(i => i.scope === 'math')).toHaveLength(0);
    expect(checkRenderIntegrity(source, result).ok).toBe(true);
  });

  it('keeps raw HTML code, URLs, and ordinary escaped prose literal', async () => {
    const source = String.raw`<div><code>\(x^2\)</code><pre>\[\frac{a}{b}\]</pre><kbd>\(x\)</kbd><a href="https://example.org/\\(literal\\)">link</a> Harga $5 dan $10.</div>`;
    const result = await renderBody(source, options);
    const doc = dom(result.html);
    expect(doc.querySelectorAll('.pf-math')).toHaveLength(0);
    expect(doc.querySelector('code')?.textContent).toBe(String.raw`\(x^2\)`);
    expect(doc.querySelector('pre')?.textContent).toBe(String.raw`\[\frac{a}{b}\]`);
    expect(result.issues.filter(i => i.scope === 'math')).toHaveLength(0);
  });

  it('reports undelimited TeX and does not call the math category ready', async () => {
    const source = String.raw`Rumus \frac{a}{b} belum dibungkus delimiter.`;
    const result = await renderBody(source, options);
    expect(result.issues.some(i => i.code === 'MATH_UNRENDERED_SOURCE')).toBe(true);
    const report = preflight({ source, assets: [], renderInputHash: 'current' }, result, { target: 'html' });
    expect(report.categories.find(c => c.category === 'math')?.status).toBe('review');
    expect(result.stats.math).toBe(0);
  });

  it('does not disguise an unsupported command as successful math', async () => {
    const result = await renderBody(String.raw`\[\DefinitelyUnsupported{x}\]`, options);
    expect(dom(result.html).querySelectorAll('.pf-math-error')).toHaveLength(1);
    expect(result.issues.some(i => i.code === 'MATH_PARSE_ERROR')).toBe(true);
  });

  it('detects a changed raw HTML table formula and preserves unsafe-HTML defenses', async () => {
    const source = String.raw`<table><tr><td>\(x+1\)</td></tr></table>`;
    const result = await renderBody(source, options);
    expect(checkRenderIntegrity(source, result).issues.filter(i => i.severity === 'error')).toEqual([]);
    expect(checkRenderIntegrity(source, result.html.replace('data-tex="x+1"', 'data-tex="x-1"')).ok).toBe(false);
    const hostile = await renderBody('<div><img src="javascript:alert(1)"><script>alert(1)</script></div>', options);
    expect(dom(hostile.html).querySelector('script, [src^="javascript:"]')).toBeNull();
    expect(hostile.issues.some(i => i.scope === 'security')).toBe(true);
  });

  it.each([
    '<div><span data-latex="x^2">x2</span></div>',
    '<div><mjx-container display="true"><math><semantics><mi>x</mi><annotation encoding="text/latex">x^2</annotation></semantics></math></mjx-container></div>',
    '<table><tr><td><span data-tex="x^2">x2</span></td></tr></table>',
  ])('recovers explicit HTML TeX metadata exactly once: %s', async source => {
    const result = await renderBody(source, options);
    const doc = dom(result.html);
    expect(doc.querySelectorAll('.pf-math .katex')).toHaveLength(1);
    expect(doc.querySelector('.pf-math')?.getAttribute('data-tex')).toBe('x^2');
    expect(checkRenderIntegrity(source, result).ok).toBe(true);
  });
});
