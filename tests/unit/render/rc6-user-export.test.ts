// @vitest-environment jsdom
/** RC6-EXPORT: real core/export/print-preparation APIs, exact uploaded source, independent formula oracle.
 * jsdom does not paginate or validate PDF pixels; these tests never claim browser/PDF visual acceptance.
 */
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { checkRenderIntegrity } from '../../../src/core/integrity';
import { preflight } from '../../../src/core/preflight';
import type { CoreIssue } from '../../../src/core/util';
import { exportHtml, REQUIRED_CHECKS } from '../../../src/render/exports';
import { buildPrintPayload } from '../../../src/render/print-payload';
import { nodeFontSource, realDoc } from './helpers';

interface Oracle {
  input_sha256: string; method: string;
  formulas: { index: number; line: number; raw: string; expected: string; display: boolean; changedPayload: boolean }[];
}
const hash = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');
const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html');
const fixturePath = path.resolve('fixtures/rc6/user-trigonometry.md');
const oraclePath = path.resolve('fixtures/rc6/user-trigonometry.expected.json');

function verifyFormulas(output: Document, oracle: Oracle): void {
  const formulas = [...output.querySelectorAll('.pf-math[data-tex]')];
  expect(formulas).toHaveLength(231);
  expect(formulas.map(n => n.getAttribute('data-tex'))).toEqual(oracle.formulas.map(f => f.expected));
  expect(formulas.map(n => !!n.querySelector('.katex-display'))).toEqual(oracle.formulas.map(f => f.display));
  expect(formulas.map(n => n.getAttribute('data-source-tex'))).toEqual(oracle.formulas.map(f => f.raw));
  expect(output.querySelectorAll('.pf-math .katex')).toHaveLength(231);
  expect(output.querySelectorAll('.pf-math-display')).toHaveLength(128);
  expect(output.querySelectorAll('.pf-math-error, .pf-math-src')).toHaveLength(0);
  const prose = output.body.cloneNode(true) as HTMLElement;
  prose.querySelectorAll('.pf-math, code, pre').forEach(n => n.remove());
  expect(prose.textContent).not.toMatch(/\\[()[\]]|\\(?:frac|sin|cos|tan|sqrt|theta|begin|end)\b/);
}

describe('RC6 actual uploaded trigonometry → standalone and print preparation', () => {
  it('exports all 231 formulas with real fonts, original provenance and the review warning intact', async () => {
    const input = await readFile(fixturePath);
    const oracleBytes = await readFile(oraclePath);
    const oracle = JSON.parse(oracleBytes.toString('utf8')) as Oracle;
    expect(hash(input)).toBe(oracle.input_sha256);
    expect(oracle.formulas).toHaveLength(231);
    expect(oracle.formulas.filter(f => f.display)).toHaveLength(128);
    expect(oracle.formulas.filter(f => f.changedPayload)).toHaveLength(17);
    const source = input.toString('utf8');
    const doc = await realDoc(source, 'EDU-01', { title: 'Kumpulan Rumus Trigonometri Lengkap', author: '', cover: false, toc: false });
    const originalSnapshotSource = doc.snapshot.source;
    const integrity = checkRenderIntegrity(source, doc.body);
    expect(integrity.ok).toBe(true);
    const recovery = doc.body.issues.find(i => i.code === 'MATH_COPY_RECOVERED') as CoreIssue | undefined;
    expect(recovery).toMatchObject({ severity: 'warning', detail: { count: 231, bodyAdaptations: 17 } });
    expect(doc.body.issues.filter(i => i.severity === 'error')).toHaveLength(0);
    const report = preflight(doc.snapshot, doc.body, { target: 'html', integrity, external: { font: [] } });
    expect(report.categories.find(c => c.category === 'math')?.status).toBe('review');

    const exported = await exportHtml({ ...doc, profile: 'standalone', fontSource: nodeFontSource, renderMermaid: false });
    expect(exported.issues.filter(i => i.severity === 'error')).toHaveLength(0);
    expect(exported.issues.find(i => i.code === 'MATH_COPY_RECOVERED')).toEqual(recovery);
    expect(exported.verdict.block).toHaveLength(0);
    for (const name of REQUIRED_CHECKS.standalone) expect(exported.manifest.checks.find(c => c.name === name)?.status).toBe('pass');
    expect(exported.manifest.network).toBe('none');
    expect(exported.manifest.scripts).toBe('none');
    expect(exported.manifest.snapshot.rawSourceHash).toBe(oracle.input_sha256);
    expect(exported.manifest.outputHash).toBe(hash(exported.bytes));
    expect(exported.manifest.bytes).toBe(exported.bytes.length);
    const output = parse(exported.html);
    verifyFormulas(output, oracle);
    expect(output.querySelectorAll('script, iframe, object, embed, link[rel="stylesheet"]')).toHaveLength(0);
    expect(output.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content')).toContain("default-src 'none'");
    expect(output.querySelectorAll('[src^="http:"], [src^="https:"], [src^="//"]')).toHaveLength(0);
    const allCss = [...output.querySelectorAll('style')].map(n => n.textContent).join('\n');
    expect(allCss).not.toMatch(/(?:url\(\s*["']?|@import\s+["'])(?:https?:)?\/\//i);
    expect(allCss).toContain('@media print');
    const fontCss = output.querySelector('style[data-pf="fonts"]')?.textContent ?? '';
    expect(exported.manifest.fonts.some(f => f.family.startsWith('KaTeX'))).toBe(true);
    expect(exported.manifest.fonts.length).toBeGreaterThan(1);
    for (const font of exported.manifest.fonts) {
      const file = path.resolve(font.pkg === 'katex' ? 'node_modules/katex/dist/fonts' : `node_modules/${font.pkg}/files`, font.file);
      const bytes = await readFile(file);
      expect(bytes.subarray(0, 4).toString()).toBe('wOF2');
      expect(bytes.length).toBe(font.bytes);
      expect(hash(bytes)).toBe(font.sha256);
      expect(fontCss).toContain('data:font/woff2;base64,' + bytes.toString('base64'));
    }

    const payload = await buildPrintPayload(doc.snapshot, doc.body, { fontSource: nodeFontSource, renderMermaid: false });
    expect(payload.issues.filter(i => i.blocking || i.severity === 'error')).toHaveLength(0);
    expect(payload.issues.find(i => i.code === 'MATH_COPY_RECOVERED')).toEqual(recovery);
    verifyFormulas(parse(payload.bodyInner), oracle);
    expect(payload.fonts.map(f => f.sha256)).toEqual(exported.manifest.fonts.map(f => f.sha256));
    expect(payload.fontCss).toContain('data:font/woff2;base64,');
    expect(payload.snapshot.rawSourceHash).toBe(oracle.input_sha256);
    expect(doc.snapshot.source).toBe(originalSnapshotSource);
    expect(doc.snapshot.source).toBe(source);
    expect(await readFile(fixturePath, 'utf8')).toBe(source);

    if (process.env.PF_EXAMPLE_DIR) {
      const destination = path.resolve(process.env.PF_EXAMPLE_DIR);
      await mkdir(destination, { recursive: true });
      await writeFile(path.join(destination, 'RC6_TRIGONOMETRI_PENGGUNA.html'), exported.bytes);
      await writeFile(path.join(destination, 'RC6_TRIGONOMETRI_PENGGUNA.manifest.json'), JSON.stringify({
        kind: 'Real Node/jsdom core + standalone export + print-payload integration with bundled WOFF2 bytes',
        browserVisualTest: 'NOT_RUN', paginationTest: 'NOT_RUN', nativePdfTest: 'NOT_RUN',
        inputSha256: oracle.input_sha256, oracleSha256: hash(oracleBytes), oracleMethod: oracle.method,
        formulas: 231, inline: 103, display: 128, repairedBodies: 17, formulaPayloadAndModeMismatches: 0,
        sourceUnchanged: true, mathPreflightStatus: 'review', exportStatus: exported.status,
        warning: recovery, print: { formulaCount: 231, rawSourceHash: payload.snapshot.rawSourceHash,
          fontCount: payload.fonts.length, page: payload.page, issues: payload.issues },
        export: exported.manifest,
      }, null, 2) + '\n');
    }
  });

  it('exports new math syntaxes and safe HTML metadata without copying active content into the artifact', async () => {
    const source = [
      '# Format AI', '', '```math', String.raw`\sin^2x+\cos^2x=1`, '```', '',
      'Inline $`' + String.raw`\sqrt{2}` + '`$.', '',
      '<div><span data-latex="x^2">x2</span></div>', '',
      String.raw`<p onclick="alert(1)">Rumus \(a+b\).</p><script>window.__unsafe=1</script>`,
    ].join('\n');
    const doc = await realDoc(source, 'EDU-01', { title: 'Format AI', author: '', cover: false, toc: false });
    const exported = await exportHtml({ ...doc, profile: 'standalone', fontSource: nodeFontSource, renderMermaid: false });
    const output = parse(exported.html);
    expect([...output.querySelectorAll('.pf-math')].map(n => n.getAttribute('data-tex'))).toEqual([
      String.raw`\sin^2x+\cos^2x=1`, String.raw`\sqrt{2}`, 'x^2', 'a+b',
    ]);
    expect(output.querySelectorAll('.pf-math .katex')).toHaveLength(4);
    expect(output.querySelectorAll('script, [onclick], iframe, object')).toHaveLength(0);
    expect(output.body.textContent).not.toContain('window.__unsafe');
    expect(exported.manifest.checks.find(c => c.name === 'no-scripts')?.status).toBe('pass');
    expect(exported.manifest.checks.find(c => c.name === 'no-network-resources')?.status).toBe('pass');
    expect(doc.snapshot.source).toBe(source);
  });
});
