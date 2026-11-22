// Run from the candidate root. Both source trees must have their locked dependencies installed.
// node tests/bench/rc7-paired.mjs /path/to/RC6 calibrate|compare|repeat [task1,task2]
import { fork } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { platform, arch, availableParallelism } from 'node:os';
import { treeHash } from '../../scripts/fingerprint.mjs';

const root = process.cwd();
const baseline = resolve(process.argv[2]);
const mode = process.argv[3];
if (!['calibrate', 'compare', 'repeat'].includes(mode)) throw Error('Expected calibrate, compare, or repeat');
const calibration = mode === 'calibrate';
const destination = resolve('evidence/rc7-perf');
await mkdir(destination, { recursive: true });
const temp = await mkdtemp(join(root, '.rc7-benchmark-'));
const budget = { medianRatio: 1.05, p95Ratio: 1.10, warmups: 2, shortPairs: 24, heavyPairs: 5 };
const workloads = { 'empty-core': { heavy: false }, 'small-edit': { heavy: false }, 'trigonometry': { heavy: true }, 'long': { heavy: true } };
const selected = process.argv[4]?.split(',') || Object.keys(workloads);
const labels = calibration ? ['rc6'] : ['rc6', 'rc7'];
const roots = { rc6: baseline, rc7: root };
const out = { mode, runtime: { node: process.version, os: platform(), arch: arch(), cpusVisible: availableParallelism() }, at: new Date().toISOString(),
  budget, method: 'Identical local font bytes and raw KaTeX CSS, BUS-01 / A4, one persistent isolated Node process per revision, explicit GC before/after each sample outside timings. Two warmups per task and alternating AB/BA. Times exclude harness and DOM oracle. Preview covers snapshot, analysis, render, integrity, screen composition only. Browser layout/startup, typing debounce, actual downloads, OS print and PDF are excluded. Heap is process-level V8 retained heap after repeated actions and forced GC, not browser memory or a peak. Percentile is nearest-rank; with five heavy pairs p95 equals max.', roots: {}, status: 'NOT_RUN', runs: [], summary: {} };
function stats(xs) {
  const sorted = xs.toSorted((a, b) => a-b);
  const n = sorted.length;
  const q = f => sorted[Math.ceil(n*f) - 1];
  return { n, min: sorted[0], median: (sorted[Math.floor((n-1)/2)] + sorted[Math.floor(n/2)]) / 2, p95: q(0.95), max: sorted.at(-1), iqr: q(.75) - q(.25) };
}
function buildSummary() {
  for (const task of selected) {
    const samples = out.runs.filter(row => row.task === task && row.round >= 0);
    if (!samples.length) continue;
    const row = { summary: {}, equivalence: {}, alerts: [] };
    for (const label of labels) {
      const s = samples.filter(x => x.label === label);
      if (!s.length) continue;
      row.summary[label] = {};
      for (const metric of Object.keys(s[0].times)) row.summary[label][metric] = stats(s.map(x => x.times[metric]));
      row.summary[label].retainedHeapMiB = stats(s.map(x => x.heap.afterGc / 1048576));
      row.equivalence[label] = [...new Set(s.map(x => JSON.stringify(x.info)))].map(s => JSON.parse(s));
    }
    if (!calibration) {
      const b = row.summary.rc6, c = row.summary.rc7;
      row.deltas = {};
      const witness = value => JSON.stringify(value.map(entry => [entry.mathCssSha256, entry.fonts, entry.bodySha256, entry.printBodySha256]));
      row.outputEquivalent = witness(row.equivalence.rc6) === witness(row.equivalence.rc7);
      if (!row.outputEquivalent) row.alerts.push('output-equivalence');
      for (const key of Object.keys(b)) {
        const medianPct = 100*(c[key].median / b[key].median - 1);
        const p95Pct = 100*(c[key].p95 / b[key].p95 - 1);
        row.deltas[key] = { medianPct, p95Pct };
        if (medianPct > 100*(budget.medianRatio-1) || p95Pct > 100*(budget.p95Ratio-1)) row.alerts.push(key);
      }
    }
    out.summary[task] = row;
  }
}
const children = [];
let id = 0;
const save = () => writeFile(join(destination, mode+'.json'), JSON.stringify(out, null, 2)+'\n');
try {
  for (const label of labels) {
    const repo = roots[label];
    const manifestPath = join(repo, 'dist.build-manifest.json');
    out.roots[label] = { pathRole: label, fingerprint: treeHash(['src','public','package.json','package-lock.json'], repo),
      compiledManifestAtRun: existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath)) : null };
    const child = fork(join(root, 'tests/bench/rc7-worker.mjs'), [join(temp, label+'.mjs')], {
      cwd: repo, stdio: ['ignore','inherit','inherit','ipc'], execArgv: ['--expose-gc'] });
    children.push(child);
    await new Promise((ok, fail) => {
      child.once('message', result => result.ready ? ok() : fail(Error('Worker initialization failed')));
      child.once('exit', code => fail(Error('Worker exited during initialization '+code)));
      child.once('error', fail);
    });
  }
  for (const task of selected) {
    if (!workloads[task]) throw Error('Unknown task '+task);
    const reps = calibration ? (workloads[task].heavy ? 3 : 12) : (workloads[task].heavy ? budget.heavyPairs : budget.shortPairs);
    for (let round = -budget.warmups; round < reps; round++) {
      for (const label of (round % 2 ? labels.toReversed() : labels)) {
        const child = children[labels.indexOf(label)];
        const rec = await new Promise((ok, fail) => {
          const failed = code => { child.off('message', received); fail(Error('Worker exited '+code)); };
          const received = msg => { child.off('exit', failed); if (msg.id !== id || msg.error) fail(Error(msg.error || 'Mismatched worker reply')); else ok(msg.result); };
          child.once('exit', failed); child.once('message', received);
          child.send({ id: ++id, task });
        });
        out.runs.push({ task, round, label, ...rec });
        await save();
      }
    }
    console.log('Completed', mode, task, reps);
  }
  buildSummary();
  out.status = calibration ? 'PASS' : Object.values(out.summary).some(x => x.alerts.length) ? 'FAIL' : 'PASS';
} catch (error) {
  out.status = 'FAIL'; out.error = String(error.stack); console.error(out.error);
} finally {
  for (const child of children) child.kill();
  await rm(temp, { recursive: true, force: true });
  await save();
}
if (out.status === 'FAIL') process.exitCode = 1;
