// RC4-P01/P02/P03 paired Node microbenchmarks, not browser latency or end-to-end print performance.
// Usage: node tests/bench/core-reading.mjs /absolute/baseline/repository /absolute/results.json
import { build } from 'esbuild';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
const candidate = process.cwd(), baseline = resolve(process.argv[2] || candidate);
const output = resolve(process.argv[3] || 'evidence/core-reading-benchmark.json');
// Put temporary ESM beside installed dependencies so external module resolution is legitimate.
const temp = await mkdtemp(join(candidate, '.core-bench-'));
const sha = s => createHash('sha256').update(s).digest('hex');
const modules = {};
try {
  for (const [name, directory] of [['baseline', baseline], ['candidate', candidate]]) {
    const file = join(temp, `${name}.mjs`);
    await build({ stdin: { contents: `export { renderStage1 } from ${JSON.stringify(join(directory, 'src/core/render.ts'))}; export { compareBlockModels } from ${JSON.stringify(join(directory, 'src/core/integrity.ts'))}; export { scanMath } from ${JSON.stringify(join(directory, 'src/core/math.ts'))};`, resolveDir: directory, loader: 'ts' }, outfile: file, bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent' });
    modules[name] = await import(pathToFileURL(file).href);
  }
  const size = 8000;
  const expected = Array.from({ length: size }, (_, i) => ({ id: `block-${i}`, kind: 'paragraph', line: i + 1, endLine: i + 1, start: i, end: i + 1, text: `${i}`, tokens: [`${i}`], links: [], images: [], fnRefs: [], math: [] }));
  const actual = expected.map(m => ({ ...m, tag: 'p' }));
  const formula = String.raw`\frac{x^2+y^2}{1+\sin^2\theta}`;
  const source = Array.from({ length: 400 }, (_, i) => `${i+1}. Nilai \\(${formula}\\) tepat.\n`).join('\n');
  const priceSource = '$10 untuk buku.\n'.repeat(10000);
  const opts = { assets: [], allowExternalImages: false, template: 'BUS-01' };
  const cases = [
    { name: 'repeated-math-400', inputSha256: sha(source), items: 400, execute: m => m.renderStage1(source, opts), identity: r => JSON.stringify(r.slots.map(s => [s.tex, s.ok, s.html])) },
    { name: 'block-membership-8000', inputSha256: sha(JSON.stringify(expected)), items: size, execute: m => m.compareBlockModels(expected, actual), identity: r => JSON.stringify(r) },
    { name: 'currency-lines-10000', inputSha256: sha(priceSource), items: 10000, execute: m => m.scanMath(priceSource), identity: r => JSON.stringify(r) },
  ];
  const results = [];
  for (const task of cases) {
    const sample = { baseline: [], candidate: [] }, identities = { baseline: new Set(), candidate: new Set() };
    // One warm-up per implementation, then 9 paired runs; AB/BA order alternates.
    for (const name of ['baseline', 'candidate']) await task.execute(modules[name]);
    for (let round = 0; round < 9; round++) {
      for (const name of (round % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate'])) {
        const begin = performance.now(); const result = await task.execute(modules[name]);
        sample[name].push(performance.now() - begin); identities[name].add(sha(task.identity(result)));
      }
    }
    const stats = name => { const sorted = [...sample[name]].sort((a,b)=>a-b); return { samplesMs: sample[name], medianMs: sorted[4], p95Ms: sorted[8], uniqueResultHashes: [...identities[name]] }; };
    const equal = identities.baseline.size === 1 && identities.candidate.size === 1 && [...identities.baseline][0] === [...identities.candidate][0];
    results.push({ case: task.name, inputSha256: task.inputSha256, items: task.items, samples: 9, outputsEqual: equal, baseline: stats('baseline'), candidate: stats('candidate') });
    console.log(JSON.stringify({ case: task.name, outputsEqual: equal, baselineMedian: results.at(-1).baseline.medianMs, candidateMedian: results.at(-1).candidate.medianMs }));
  }
  await writeFile(output, JSON.stringify({ at: new Date().toISOString(), node: process.version, scope: 'paired Node microbenchmark, excludes browser/DOM/network/print; n=9 p95 is sample maximum', results }, null, 2));
  if (results.some(r => !r.outputsEqual)) process.exitCode = 1;
} finally { await rm(temp, { recursive: true, force: true }); }
