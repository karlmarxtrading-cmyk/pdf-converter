// Internal child of rc7-paired.mjs. A separate process keeps each revision's heap and caches independent.
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { generateStress } from '../../scripts/generate-stress.mjs';

const repo = process.cwd();
const output = process.argv[2];
const req = createRequire(join(repo, 'package.json'));
const digest = value => createHash('sha256').update(value).digest('hex');
const jsdom = new JSDOM('<!doctype html>', { url: 'https://benchmark.invalid/' });
globalThis.window = jsdom.window;
for (const key of ['document', 'DOMParser', 'HTMLElement', 'Element', 'Node', 'NodeFilter', 'XMLSerializer', 'HTMLImageElement', 'MutationObserver']) {
  globalThis[key] = jsdom.window[key];
}
const sources = {
  'empty-core': '',
  'small-edit': '# Aljabar\n\nNilai $x+1$ bila $x=2$.\n\n| Rumus | Nilai |\n|---|---|\n| $x+1$ | 3 |',
  'trigonometry': await readFile(join(repo, 'fixtures/rc6/user-trigonometry.md'), 'utf8'),
  'long': generateStress(24),
};
const modules = {
  'src/core/projects.ts': 'createProject', 'src/core/hash.ts': 'makeSnapshot',
  'src/core/render.ts': 'finishRender, snapshotRenderOptions', 'src/core/integrity.ts': 'checkRenderIntegrity',
  'src/engine/analyze.ts': 'analyze', 'src/render/exports.ts': 'exportHtml',
  'src/render/document.ts': 'composeDocument, prepareBody', 'src/render/print-payload.ts': 'buildPrintPayload',
  'src/render/templates.ts': 'templateDefaultSettings', 'tests/unit/render/helpers.ts': 'nodeFontSource',
};
const code = Object.entries(modules).map(([file, names]) =>
  'export { ' + names + ' } from ' + JSON.stringify(join(repo, file)) + ';').join('\n');
// Match Vite's ?raw contract with the exact on-disk CSS/notice, even on the historical RC6 source.
await build({
  stdin: { contents: code, resolveDir: repo, loader: 'ts' }, bundle: true, outfile: output,
  format: 'esm', platform: 'node', packages: 'external', logLevel: 'silent',
  plugins: [{ name: 'raw-bytes', setup(b) {
    b.onResolve({ filter: /\?raw$/ }, ({ path, importer }) => {
      const clean = path.slice(0, -4);
      return { path: clean.startsWith('.') ? resolve(dirname(importer), clean) : req.resolve(clean), namespace: 'raw-bytes' };
    });
    b.onLoad({ filter: /.*/, namespace: 'raw-bytes' }, async ({ path }) => ({ contents: await readFile(path, 'utf8'), loader: 'text' }));
  } }],
});
const m = await import(pathToFileURL(output).href);
const oracle = JSON.parse(await readFile(join(repo, 'fixtures/rc6/user-trigonometry.expected.json')));
const fontCache = new Map();
async function fontSource(spec) {
  const key = spec.pkg + '/' + spec.file;
  if (!fontCache.has(key)) fontCache.set(key, await m.nodeFontSource(spec));
  return fontCache.get(key);
}

async function run(task) {
  const source = sources[task];
  const project = m.createProject({ template: 'BUS-01', source, projectId: 'perf-fixture' });
  project.settings = m.templateDefaultSettings('BUS-01', { title: 'Kumpulan Rumus Trigonometri Lengkap', author: '', cover: false, toc: true });
  const times = {};
  const clock = async (name, f) => {
    const start = performance.now(); const result = await f();
    times[name] = performance.now() - start; return result;
  };
  async function refresh() {
    const snapshot = await m.makeSnapshot(project);
    const analysis = await m.analyze({ source: project.source, options: m.snapshotRenderOptions(snapshot) });
    const body = m.finishRender(analysis.stage1, snapshot.assets);
    if (!m.checkRenderIntegrity(project.source, body, { expected: analysis.expected }).ok) throw Error('Integrity failed');
    const prepared = await m.prepareBody(snapshot, body, { mode: 'screen', renderMermaid: false, allowExternalImages: false });
    const page = await m.composeDocument(snapshot, { mode: 'screen', prepared, fontCss: '', adaptive: true });
    return { snapshot, body, phase: analysis.timings, pageLength: page.html.length };
  }
  let doc = await clock('refreshMs', refresh);
  times.parseAndRenderMs = doc.phase.render;
  times.integrityModelMs = doc.phase.integrityModel;
  const info = { inputSha256: digest(source), inputBytes: Buffer.byteLength(source) };
  if (task === 'small-edit') {
    project.source += '\n\nHasilnya 3.'; project.revision++;
    doc = await clock('editedRefreshMs', refresh);
  }
  if (task === 'trigonometry' || task === 'small-edit') {
    const options = { fontSource, renderMermaid: false };
    const result = await clock('htmlExportMs', () => m.exportHtml({ snapshot: doc.snapshot, body: doc.body, profile: 'standalone', ...options }));
    const payload = await clock('printPayloadMs', () => m.buildPrintPayload(doc.snapshot, doc.body, options));
    const dom = new DOMParser().parseFromString(result.html, 'text/html');
    const css = dom.querySelector('style[data-pf="s0"]')?.textContent ?? '';
    if (!css.includes('.katex .vlist') || !css.includes('.katex-mathml') || !result.manifest.fonts.length)
      throw Error('Math CSS or fonts absent');
    if (result.verdict.block.length || payload.issues.some(i => i.severity === 'error' || i.blocking))
      throw Error('Document failed export or print preparation');
    if (task === 'trigonometry') {
      const nodes = [...dom.querySelectorAll('.pf-math[data-tex]')];
      if (nodes.length !== 231 || nodes.some((n, i) =>
        n.getAttribute('data-source-tex') !== oracle.formulas[i].raw || n.getAttribute('data-tex') !== oracle.formulas[i].expected ||
        !!n.querySelector('.katex-display') !== oracle.formulas[i].display)) throw Error('Formula ledger mismatch');
    }
    Object.assign(info, { htmlBytes: result.bytes.length, mathCssSha256: digest(css),
      fonts: result.manifest.fonts.map(f => f.sha256), bodySha256: digest(dom.body.innerHTML),
      printBodySha256: digest(payload.bodyInner), sourceSha256: doc.snapshot.rawSourceHash });
  }
  return { times, info };
}
process.on('message', async ({ id, task }) => {
  try {
    global.gc();
    const before = process.memoryUsage().heapUsed;
    const result = await run(task);
    const usedAfter = process.memoryUsage().heapUsed;
    global.gc();
    result.heap = { before, beforeFinalGc: usedAfter, afterGc: process.memoryUsage().heapUsed, rss: process.memoryUsage().rss };
    process.send({ id, result });
  } catch (e) { process.send({ id, error: String(e.stack) }); }
});
process.send({ ready: true });
