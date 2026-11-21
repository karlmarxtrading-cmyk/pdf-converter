// node snapshot.mjs /path/to/extracted/rc4/repository /path/to/rc5 profile|compare output.json
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';
import { resolve } from 'node:path';
import { cpus, platform, arch, availableParallelism } from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const [baseline, candidate, mode, output, scenario] = process.argv.slice(2);
if (!baseline || !candidate || !output || !['profile', 'compare'].includes(mode)) {
  throw new Error('Supply the RC4 and candidate root directories, profile|compare, and output.json');
}
const inputs = ['small', 'history', 'images', 'subview'];
const fingerprint = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
if (!scenario) {
  const results = inputs.map((name) => {
    const run = spawnSync(process.execPath, [fileURLToPath(import.meta.url), baseline, candidate, mode, output, name], { encoding: 'utf8' });
    if (run.status !== 0) throw new Error(run.stderr);
    return JSON.parse(run.stdout);
  });
  const components = ['src/core/hash.ts', 'src/core/contracts.ts', 'src/render/templates.ts'];
  const identity = root => Object.fromEntries(components.map(path => [path, fingerprint(resolve(root, path))]));
  writeFileSync(output, JSON.stringify({
    mode, at: new Date().toISOString(), node: process.version, runtime: process.versions.v8,
    cpu: cpus()[0].model, logicalCpu: availableParallelism(), platform: platform(), arch: arch(),
    warmupPairs: 4, measuredPairs: 40, order: 'alternating AB / BA', cold: 'First invocation of each module in a fresh process per scenario; shared fixture and runtime.',
    baseline: identity(baseline), candidate: mode === 'compare' ? identity(candidate) : null, results,
  }, null, 2) + '\n');
} else {
  // Node 24 strips TS types; production modules use extensionless TS imports for Vite.
  registerHooks({ resolve(specifier, context, next) {
    if (specifier.startsWith('.') && !specifier.match(/\.[a-z]+$/i) && context.parentURL?.endsWith('.ts')) {
      return next(specifier + '.ts', context);
    }
    return next(specifier, context);
  } });
  const load = root => import(pathToFileURL(resolve(root, 'src/core/hash.ts')).href);
  const old = await load(baseline);
  const p = { projectId: 'fixed', revision: 100, source: scenario === 'small' ? 'paragraph\n'.repeat(2000) : 'paragraph \\(x^2\\)\n'.repeat(60000),
    assets: [], inputs: [], history: [], settings: old.defaultSettings('BUS-01') };
  if (scenario !== 'small') p.history = Array.from({ length: 100 }, (_, i) => ({ revision: i, source: 'retained-history-'.repeat(3000), stateJson: JSON.stringify(p.settings) }));
  if (scenario === 'images' || scenario === 'subview') {
    for (let i = 0; i < 10; i++) {
      const buffer = new Uint8Array(1024 * 1024).fill(i + 10);
      p.assets.push({ id: '0'.repeat(64), path: 'image-' + i + '.png', mime: 'image/png',
        bytes: scenario === 'subview' ? buffer.subarray(80000, 80000 + 4096) : buffer, origin: 'upload', width: 4, height: 4 });
    }
  }
  const stats = values => {
    const sorted = values.slice().sort((a, b) => a - b);
    const n = sorted.length;
    return { count: n, medianMs: (sorted[Math.floor((n-1)/2)] + sorted[Math.floor(n/2)]) / 2,
      p95Ms: sorted[Math.ceil(n * .95) - 1], minMs: sorted[0], maxMs: sorted[n - 1], samplesMs: values };
  };
  const result = { scenario, sourceChars: p.source.length, historyChars: p.history.reduce((n, item) => n + item.source.length, 0),
    assetCount: p.assets.length, assetBytes: p.assets.reduce((n, a) => n + a.bytes.length, 0), backingBytes: p.assets.reduce((n, a) => n + a.bytes.buffer.byteLength, 0) };
  const settings = { now: () => '2026-11-21T00:00:00.000Z', rendererVersion:'same-for-both', templateVersion: 'same-for-both' };
  if (mode === 'profile') {
    const records = {};
    for (let i = 0; i < 44; ++i) {
      const time = async (name, action) => {
        const start = performance.now();
        const val = await action();
        (records[name] ??= []);
        if (i >= 4) records[name].push(performance.now() - start);
        return val;
      };
      const f = await time('structuredClone', () => structuredClone({ projectId: p.projectId, revision: p.revision, source: p.source, settings: p.settings, assets: p.assets, inputs:p.inputs }));
      await time('serialAssetDigests', async () => { for (const a of f.assets) await old.sha256Hex(a.bytes); });
      await time('rawSourceHash', () => old.computeRawSourceHash(f.inputs, f.source));
      await time('contentHash', () => old.computeContentSnapshotHash(f.source));
      await time('wholeSnapshotIndependent', () => old.makeSnapshot(p, settings));
    }
    result.timings = Object.fromEntries(Object.entries(records).map(([key, values]) => [key, stats(values)]));
  } else {
    const current = await load(candidate);
    const times = { baseline: [], candidate: [] };
    result.firstMs = {};
    for (let i = 0; i < 44; ++i) {
      const ordered = [['baseline', old], ['candidate', current]];
      if (i % 2) ordered.reverse();
      const snapshots = [];
      for (const [name, mod] of ordered) {
        const t = performance.now();
        const snapshot = await mod.makeSnapshot(p, settings);
        const ms = performance.now() - t;
        if (!i) result.firstMs[name] = ms;
        if (i >= 4) times[name].push(ms);
        snapshots.push([snapshot.rawSourceHash, snapshot.renderInputHash, snapshot.contentSnapshotHash, ...snapshot.assets.map(a => a.id)]);
      }
      assert.deepEqual(snapshots[0], snapshots[1], 'snapshot identity parity');
    }
    result.identicalHashes = true;
    result.timings = Object.fromEntries(Object.entries(times).map(([key, values]) => [key, stats(values)]));
  }
  console.log(JSON.stringify(result));
}
