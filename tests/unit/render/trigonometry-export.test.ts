// @vitest-environment jsdom
/** PF-RC4-TRIG: real conversion/render/export APIs, real bundled font bytes; not a browser/PDF visual test. */
import { describe, expect, it } from 'vitest';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { htmlToMarkdown } from '../../../src/core/clipboard';
import { checkRenderIntegrity } from '../../../src/core/integrity';
import { exportHtml } from '../../../src/render/exports';
import { buildPrintPayload } from '../../../src/render/print-payload';
import { nodeFontSource, realDoc } from './helpers';

const read = (name: string) => readFile(path.resolve('fixtures/trigonometry', name), 'utf8');
const normal = (value: string) => value.replace(/\s+/g, ' ').trim();

describe('PF-RC4-TRIG screenshots reconstructed as a document', () => {
  for (const route of ['markdown', 'clipboard-html'] as const) {
    it(`${route}: 21 exact formulas survive standalone HTML and print preparation`, async () => {
      const expected = JSON.parse(await read('expected.json')) as { tex: string[]; display: boolean[]; preserveText: string[] };
      const sourceMd = await read('trigonometry.md');
      let source = sourceMd;
      if (route === 'clipboard-html') {
        const converted = htmlToMarkdown(await read('clipboard-literal.html'), { plain: sourceMd });
        if (!converted.ok) throw new Error(converted.message);
        source = converted.markdown;
      }
      const doc = await realDoc(source, 'EDU-01', { title: 'Trigonometri', author: '', cover: false, toc: false });
      expect(checkRenderIntegrity(source, doc.body).ok).toBe(true);
      const exported = await exportHtml({ ...doc, profile: 'standalone', fontSource: nodeFontSource, renderMermaid: false });
      expect(exported.status).toBe('pass');
      const output = new DOMParser().parseFromString(exported.html, 'text/html');
      const formulas = [...output.querySelectorAll('.pf-math[data-tex]')];
      expect(formulas).toHaveLength(21);
      expect(formulas.map(node => normal(node.getAttribute('data-tex')!))).toEqual(expected.tex);
      expect(formulas.map(node => !!node.querySelector('.katex-display'))).toEqual(expected.display);
      expect(output.querySelectorAll('.pf-math-error, script, iframe')).toHaveLength(0);
      for (const text of expected.preserveText) expect(output.body.textContent).toContain(text);
      const prose = output.body.cloneNode(true) as HTMLElement;
      prose.querySelectorAll('.pf-math, code, pre').forEach(node => node.remove());
      expect(prose.textContent).not.toMatch(/\\\(|\\\[|\\frac|\\sin|\\cos/);
      expect(exported.manifest.fonts.some(font => font.family.includes('KaTeX'))).toBe(true);
      const payload = await buildPrintPayload(doc.snapshot, doc.body, { fontSource: nodeFontSource, renderMermaid: false });
      expect(payload.issues.filter(issue => issue.blocking)).toHaveLength(0);
      // Optional reproducible examples use actual export bytes, never substituted report artwork.
      if (process.env.PF_EXAMPLE_DIR) {
        const destination = path.resolve(process.env.PF_EXAMPLE_DIR);
        await mkdir(destination, { recursive: true });
        await writeFile(path.join(destination, `TRIGONOMETRI_${route}.html`), exported.bytes);
        await writeFile(path.join(destination, `TRIGONOMETRI_${route}.manifest.json`), JSON.stringify({ kind: 'Node/jsdom API integration with real WOFF2 fonts', browserVisualTest: 'NOT_RUN', nativePdfTest: 'NOT_RUN', formulas: expected.tex.length, export: exported.manifest }, null, 2));
      }
    });
  }
});
