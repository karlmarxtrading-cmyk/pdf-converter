// @vitest-environment jsdom
import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { katexCss } from '../../../src/render/document';
import { exportHtml, staticChecks } from '../../../src/render/exports';
import { nodeFontSource, realDoc } from './helpers';

const mathBody = '<p><span class="pf-math"><span class="katex">x</span></span></p>';
const options = { scriptsAllowed: false, networkAllowed: false };
const styleCheck = (html: string) => staticChecks(html, options).find(c => c.name === 'katex-layout')?.status;

describe('RC7-CSS math layout in final HTML', () => {
  it('includes the complete version-matched package layout, preserving every non-font rule', async () => {
    const packageCss = await readFile('node_modules/katex/dist/katex.min.css', 'utf8');
    const packageMeta = JSON.parse(await readFile('node_modules/katex/package.json', 'utf8')) as {version: string};
    const layout = await katexCss();
    expect(layout).toBe(packageCss.replace(/@font-face\{[^}]*\}/g, ''));
    expect(layout).toContain(`.katex .katex-version:after{content:"${packageMeta.version}"}`);
    expect(styleCheck('<style data-pf="s0">' + layout + '</style>' + mathBody)).toBe('pass');
  });
  it('rejects absent, empty, wrong-version and incomplete formula styling', async () => {
    const css = await katexCss();
    for (const damage of [
      '', '<style data-pf="s0"></style>',
      '<style data-pf="s0">' + css.replace(/(\.katex-version:after\{content:")[^"]+/, '$1wrong') + '</style>',
      '<style data-pf="s0">' + css.replace(/\.katex \.mfrac \.frac-line\{[^}]+\}/, '') + '</style>',
    ]) expect(styleCheck(damage + mathBody)).toBe('fail');
    expect(styleCheck('<p>Literal .katex</p>')).toBe('pass');
  });
  it('requires the stylesheet to be linked in packaged output', async () => {
    const files = new Set(['assets/document.css']);
    const cssFiles = [await katexCss()];
    const validate = (html: string) => staticChecks(html, { ...options, otherFiles: files, cssFiles }).find(c => c.name === 'katex-layout')?.status;
    expect(validate('<link rel="stylesheet" href="assets/document.css">' + mathBody)).toBe('pass');
    expect(validate(mathBody)).toBe('fail');
  });
  it('rejects a truncated WOFF2 with a real header and accepts a subsequent complete fetch', async () => {
    const doc = await realDoc('$x$','BUS-01');
    await expect(exportHtml({ ...doc, profile: 'standalone', fontSource: async spec => (await nodeFontSource(spec)).subarray(0, 48) }))
      .rejects.toMatchObject({ code: 'EXPORT_BLOCKED', failedChecks: expect.arrayContaining([expect.objectContaining({ name: 'fonts-embedded' })]) });
    const { browserFontSource } = await import('../../../src/render/font-assets');
    const { planFonts } = await import('../../../src/render/fonts');
    const spec = planFonts({ html: doc.body.html, settings: doc.snapshot.settings, mode: 'screen' }).faces[0]!;
    const bytes = await nodeFontSource(spec);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(bytes.slice(0, 48) as BodyInit))
      .mockResolvedValueOnce(new Response(bytes as BodyInit));
    vi.stubGlobal('fetch', fetchMock);
    try {
      await expect(browserFontSource(spec)).rejects.toThrow(/WOFF2/);
      expect(await browserFontSource(spec)).toEqual(bytes);
      expect(await browserFontSource(spec)).toEqual(bytes);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('refuses to deliver an export when the stylesheet loader returns empty text', async () => {
    const doc = await realDoc('# Math\n\n$x^2$', 'BUS-01');
    vi.resetModules();
    vi.doMock('katex/dist/katex.min.css?raw', () => ({ default: '' }));
    try {
      const fresh = await import('../../../src/render/exports');
      await expect(fresh.exportHtml({ ...doc, profile: 'standalone', fontSource: nodeFontSource })).rejects.toThrow(/KaTeX layout CSS/);
    } finally {
      vi.doUnmock('katex/dist/katex.min.css?raw');
      vi.resetModules();
    }
    expect((await exportHtml({ ...doc, profile: 'standalone', fontSource: nodeFontSource })).manifest.checks.find(c => c.name === 'katex-layout')?.status).toBe('pass');
  });
});
