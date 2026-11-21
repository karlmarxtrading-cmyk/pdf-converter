// Run in the candidate root after npm ci. Arguments: RC4_ROOT OUTPUT.json
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';
import { cpus, availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { generateStress } from '../../../scripts/generate-stress.mjs';

const candidate = process.cwd();
const baseline = resolve(process.argv[2]);
const output = resolve(process.argv[3]);
const diagnostic = process.argv.includes('--diagnostic');
const scratch = await mkdtemp(join(candidate, '.pf-engine-measure-'));
const sha = value => createHash('sha256').update(value).digest('hex');
const formulas = n => [String.raw`\frac{${n}}{17}`, String.raw`\sqrt{${n}+1}`, String.raw`\sin^2 x + \cos^2 x = 1`, 'E=mc^2', String.raw`\lim_{x\to 0}\frac{\sin x}{x}=1`, String.raw`\int_0^1 x^2\,dx=\tfrac{1}{3}`, String.raw`\sum_{k=1}^{${n}} k`, String.raw`\begin{pmatrix}1 & 2 \\ 3 & 4\end{pmatrix}`];
function fixture(n) {
  const expected = [];
  const source = generateStress(n).replace(/END_SECTION_(\d+)/g, (marker, id) => {
    const tex = formulas(Number(id));
    const display = tex.pop();
    expected.push(...tex.map(v => [v, false]), [display, true]);
    return tex.map(v => `\\(${v}\\)`).join(' ') + '\n\n\\[\n' + display + '\n\\]\n\n' + marker;
  });
  return { source, expected };
}

async function compile(repo, label, template) {
  const file = join(scratch, label + '.mjs');
  const bundled = await build({ stdin: { contents: template, loader: 'ts', resolveDir: repo }, outfile: file, platform: 'node', format:'esm', bundle:true, packages:'external', metafile: true, logLevel:'silent' });
  const sourceFiles = Object.keys(bundled.metafile.inputs).filter(k => k !== '<stdin>').map(k => resolve(k)).filter(k => k.startsWith(repo + '/')).sort();
  return { file, moduleInputs: Object.fromEntries(sourceFiles.map(f => [relative(repo,f),sha(readFileSync(f))])), bundleSha256: sha(readFileSync(file)) };
}

function threadFactory(file) {
  return () => {
    const thread = new Worker(pathToFileURL(file));
    const adapter = { postMessage: msg => thread.postMessage(msg), terminate: () => { void thread.terminate(); }, onmessage: null, onerror: null };
    thread.on('message', data => adapter.onmessage?.({ data }));
    thread.on('error', error => adapter.onerror?.(error));
    return adapter;
  };
}
function stats(data) {
  const s = data.slice().sort((a,b) => a-b);
  return { n:s.length, median:(s[Math.floor((s.length-1)/2)]+s[Math.floor(s.length/2)])/2, p95:s[Math.ceil(s.length*.95)-1], min:s[0], max:s.at(-1) };
}
const result = { diagnostic, at:new Date().toISOString(), node:process.version, cpu:cpus()[0].model, logicalCpu:availableParallelism(), moduleInputs:{}, rows:[] };
try {
  const runners = {};
  for (const [name, repo] of [['baseline',baseline],['candidate',candidate]]) {
    const client = await compile(repo,name+'-client', "export { EngineClient } from './src/engine/client.ts';");
    const workerMain = diagnostic
      ? `let start;
         const handle = createHandler(response => {
           if (start && response.type === 'result') {
             const delta = process.threadCpuUsage(start);
             response.result.timings.threadCpu = (delta.user + delta.system) / 1000;
           }
           parentPort.postMessage(response);
         });
         parentPort.on('message', request => {
           if (request.type === 'job') start = process.threadCpuUsage();
           return handle(request);
         });`
      : `const handle = createHandler(response => parentPort.postMessage(response));
         parentPort.on('message', request => handle(request));`;
    const worker = await compile(repo, name + '-worker', `
      import { parentPort } from 'node:worker_threads';
      import { createHandler } from './src/engine/handler.ts';
      import { ENGINE_PROTOCOL } from './src/engine/protocol.ts';
      ${workerMain}
      parentPort.postMessage({ type: 'ready', protocol: ENGINE_PROTOCOL });
    `);
    const { EngineClient } = await import(pathToFileURL(client.file));
    result.moduleInputs[name] = { ...client.moduleInputs,...worker.moduleInputs };
    result[name+'LockSha256'] = sha(readFileSync(join(repo,'package-lock.json')));
    runners[name] = transport => new EngineClient({ factory: transport === 'thread' ? threadFactory(worker.file) : null });
  }
  for (const n of [1,6,30,59]) {
    const { source, expected } = fixture(n);
    const hash = sha(source);
    const input = { source, options:{ template:'BUS-01', allowExternalImages:false, assets:[] } };
    for (const transport of ['thread','fallback']) {
      if (diagnostic && !(n === 6 && transport === 'thread') && !(n === 59 && transport === 'fallback')) continue;
      const reps = n < 30 ? 20 : diagnostic ? 8 : 4;
      const clients = Object.fromEntries(Object.entries(runners).map(([k,v]) => [k,v(transport)]));
      const row = { sections:n, transport, measuredPairs:reps, warmupPairs:1, sourceBytes:Buffer.byteLength(source), sourceSha256:hash, tables:n, tableDataRows:n*8, math:expected.length, images:0, samples:{ baseline:[], candidate:[] }, warmup:{} };
      try {
        let identity;
        for (let i = 0; i <= reps; i++) {
          for (const name of ((i + Number(diagnostic)) % 2 ? ['candidate','baseline'] : ['baseline','candidate'])) {
            const seen = [];
            const cpuStart = diagnostic && transport === 'fallback' ? process.threadCpuUsage() : null;
            const t = performance.now();
            const r = await clients[name].run(input, { docVersion:hash, onProgress: ev => seen.push(ev.phase) });
            const wall = performance.now()-t;
            if (cpuStart) {
              const d = process.threadCpuUsage(cpuStart);
              r.timings.threadCpu = (d.user + d.system) / 1000;
            }
            assert.equal(clients[name].stats.mode, transport === 'thread' ? 'worker' : 'fallback');
            assert.deepEqual(seen,['chars','render','integrity-model','references']);
            assert.equal(r.stage1.stats.tables, n);
            assert.deepEqual(r.stage1.slots.map(s => [s.tex.trim(), s.html.includes('class="katex-display"')]), expected);
            assert.ok(r.stage1.slots.every(s => s.ok));
            const signature = sha(JSON.stringify([r.stage1.toc.map(h=>h.text),r.stage1.slots.map(s=>[s.tex,s.html]),r.stage1.stats,r.expected]));
            if (identity) assert.equal(signature,identity); else identity = signature;
            const sample = { wall, ...r.timings };
            if (i) row.samples[name].push(sample); else row.warmup[name] = sample;
          }
        }
        row.resultSignature = identity;
        row.stats = Object.fromEntries(Object.entries(row.samples).map(([name, list]) => [name,Object.fromEntries(Object.keys(list[0]).map(k=>[k,stats(list.map(s=>s[k]))]))]));
        result.rows.push(row);
        console.log(JSON.stringify({n,transport,baselineMedian:row.stats.baseline.wall.median,candidateMedian:row.stats.candidate.wall.median}));
        writeFileSync(output, JSON.stringify(result,null,2)+'\n');
      } finally {
        for (const c of Object.values(clients)) c.dispose();
      }
    }
  }
} finally {
  await rm(scratch,{recursive:true,force:true});
}
