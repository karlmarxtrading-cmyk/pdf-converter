/** Portable Node/jsdom source audit. Not a browser, clipboard-OS, visual or PDF test.
 * Usage: node run-independent-oracle.mjs PROJECT SOURCE ORACLE_JSON OUTPUT_JSON
 * Dependencies are resolved from PROJECT's existing package-lock installation.
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const [projectArg, sourceArg, oracleArg, outputArg] = process.argv.slice(2);
if (!projectArg || !sourceArg || !oracleArg || !outputArg) {
  console.error('Usage: node run-independent-oracle.mjs PROJECT SOURCE ORACLE_JSON OUTPUT_JSON');
  process.exit(2);
}
const project = resolve(projectArg);
const require = createRequire(resolve(project, 'package.json'));
const { build } = require('esbuild');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><body></body>');
Object.assign(globalThis, { window: dom.window, document: dom.window.document,
  DOMParser: dom.window.DOMParser, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node });

const bundled = await build({
  stdin: {
    contents: 'export { renderBody } from "./src/core/render.ts"; export { checkRenderIntegrity } from "./src/core/integrity.ts";',
    resolveDir: project, sourcefile: 'independent-oracle-entry.ts', loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent',
});
const { renderBody, checkRenderIntegrity } = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const source = readFileSync(resolve(sourceArg), 'utf8');
const oracle = JSON.parse(readFileSync(resolve(oracleArg), 'utf8'));
const inputSha256 = createHash('sha256').update(source).digest('hex');
if (inputSha256 !== oracle.input_sha256) throw new Error('Source does not match the independent oracle input hash.');

const result = await renderBody(source, { assets: [], allowExternalImages: false, template: 'BUS-01' });
const doc = new dom.window.DOMParser().parseFromString(result.html, 'text/html');
const nodes = [...doc.querySelectorAll('.pf-math')];
const differences = [];
for (let i = 0; i < Math.max(oracle.formulas.length, nodes.length); i++) {
  const exp = oracle.formulas[i], node = nodes[i];
  if (!exp || !node) { differences.push({ index: i, kind: !exp ? 'unexpected-formula' : 'missing-formula' }); continue; }
  if (node.getAttribute('data-source-tex') !== exp.raw) differences.push({ index: i, line: exp.line, kind: 'raw-provenance' });
  if (node.getAttribute('data-tex') !== exp.expected) differences.push({ index: i, line: exp.line, kind: 'canonical-tex' });
  if (node.querySelector('annotation[encoding="application/x-tex"]')?.textContent?.trim() !== exp.expected.trim()) differences.push({ index: i, line: exp.line, kind: 'katex-annotation' });
  if (node.classList.contains('pf-math-display') !== exp.display) differences.push({ index: i, line: exp.line, kind: 'display-mode' });
}
const sourceIntegrity = checkRenderIntegrity(source, result);
const first = nodes[0];
if (first) first.setAttribute('data-tex', String.raw`\phi`);
const mutationIntegrity = checkRenderIntegrity(source, doc);
const slashRuns = [...source.matchAll(/\\+/g)].map(m => m[0].length);
const output = {
  kind: 'Node/jsdom source audit',
  limits: ['No live browser or operating-system clipboard', 'No visual or PDF verification', 'Does not validate mathematical truth'],
  inputSha256, inputBytes: Buffer.byteLength(source),
  independentCounts: {
    formulas: oracle.formulas.length,
    display: oracle.formulas.filter(f => f.display).length,
    inline: oracle.formulas.filter(f => !f.display).length,
    changedPayloads: oracle.formulas.filter(f => f.changedPayload).length,
    tripleSlashRuns: slashRuns.filter(n => n === 3).length,
    quadrupleSlashRuns: slashRuns.filter(n => n === 4).length,
    escapedBracedSubscripts: [...source.matchAll(/\\_\{/g)].length,
  },
  rendered: nodes.length, katex: doc.querySelectorAll('.pf-math .katex').length,
  parseErrors: doc.querySelectorAll('.pf-math-error').length,
  differenceCount: differences.length, differences,
  mathIssueCodes: result.issues.filter(i => i.scope === 'math').map(i => i.code),
  sourceIntegrity: sourceIntegrity.ok,
  mutationDetected: !mutationIntegrity.ok,
};
output.pass = output.rendered === output.independentCounts.formulas && output.katex === output.rendered &&
  output.parseErrors === 0 && output.differenceCount === 0 && output.sourceIntegrity && output.mutationDetected;
writeFileSync(resolve(outputArg), JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify(output, null, 2));
if (!output.pass) process.exitCode = 1;
