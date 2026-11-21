// Measure production startup including worker requests and the preview's fonts on the real server.
// From the project root: node tests/e2e/startup-comparison.mjs path/to/rc4/dist
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir, platform, arch, availableParallelism } from 'node:os';
import { createHash } from 'node:crypto';
import puppeteer from 'puppeteer-core';
import { findChromium } from '../../scripts/browser-path.mjs';
import { startServer } from '../../scripts/serve-dist.mjs';
import { treeHash } from '../../scripts/fingerprint.mjs';

const baselineDir = process.argv[2];
if (!baselineDir) throw Error('Provide the path to the original RC4 dist.');
const output = 'evidence/rc5/browser/startup.json';
mkdirSync('evidence/rc5/browser', { recursive: true });
const labels = ['rc4', 'candidate'];
const dirs = { rc4: resolve(baselineDir), candidate: resolve('dist') };
const budget = { samples: 20, maxMedianRatio: 1.20, maxP95Ratio: 1.25, maxBodyBytesRatio: 1.01 };
const sizes = new Map();
const servers = new Map();
const bases = new Map();
const runs = [];
const sha256 = value => createHash('sha256').update(value).digest('hex');
const percentile = (list, q) => list.slice().sort((a, b) => a - b)[Math.ceil(list.length * q) - 1];
const stats = list => ({
  n: list.length, min: Math.min(...list), median: (percentile(list, 0.5) + percentile(list, (Math.floor(list.length / 2) + 1) / list.length)) / 2,
  p95: percentile(list, 0.95), max: Math.max(...list),
});
const results = { tool: 'tests/e2e/startup-comparison.mjs', budget,
  method: 'Two untimed warmups, alternating AB/BA, same headless browser and viewport. Cold: new isolated context with empty HTTP cache. Warm: normal reload in same context. Startup from /#/workspace (empty editor) until first HTML preview is ready. Record all local requests until 250ms network idle after frame fonts. HTTP server has no compression. Body bytes exclude HTTP headers. Timings are not mobile or Cloudflare production.',
  node: process.version, platform: platform() + '-' + arch(), cores: availableParallelism(), fixtures: {}, runs };

for (const label of labels) {
  // The production identity in the packaged manifest uses paths relative to repository root.
  results.fixtures[label] = { indexSha256: sha256(readFileSync(join(dirs[label], 'index.html'))),
    assetsSha256: treeHash(['.'], dirs[label]).sha256 };
}
let browser;
async function sample(label, rep) {
  const ctx = await browser.createBrowserContext();
  try {
    const page = await ctx.newPage();
    await page.setViewport({ width: 1366, height: 900 });
    const pageErrors = [];
    page.on('pageerror', e => pageErrors.push(e.message));
    await page.evaluateOnNewDocument(() => {
      window.startupLongTasks = [];
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) window.startupLongTasks.push(Math.round(entry.duration));
      }).observe({ type: 'longtask', buffered: true });
    });
    for (const phase of ['cold', 'warm']) {
      const requests = [];
      sizes.set(label, requests);
      if (phase === 'cold') await page.goto(bases.get(label) + '/#/workspace', { waitUntil: 'load' });
      else await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => /rev\s*0/i.test(document.querySelector('#src-hash')?.textContent || ''), { timeout: 30000, polling: 'raf' });
      const readyMs = await page.evaluate(() => Math.round(performance.now()));
      await page.evaluate(async () => {
        await document.fonts.ready;
        const doc = document.querySelector('#live-frame')?.contentDocument;
        if (doc) await doc.fonts.ready;
      });
      await page.waitForNetworkIdle({ idleTime: 250, timeout: 15000 });
      const longTasks = await page.evaluate(() => window.startupLongTasks);
      const local = requests.slice();
      if (local.some(request => request.status >= 400) || pageErrors.length) throw Error(JSON.stringify({ local, pageErrors }));
      const rec = { label, rep, phase, readyMs, responseBodyBytes: local.reduce((sum, row) => sum + row.bytes, 0),
        requests: local, longTasks, longestTaskMs: Math.max(0, ...longTasks) };
      if (rep) runs.push(rec);
    }
  } finally { sizes.delete(label); await ctx.close(); }
}
try {
  for (const label of labels) {
    const server = await startServer(dirs[label], 0);
    server.prependListener('request', (req, res) => {
      const batch = sizes.get(label);
      if (!batch) return;
      const end = res.end;
      res.end = function(body, ...args) {
        batch.push({ url: req.url, status: res.statusCode, bytes: body ? Buffer.byteLength(body) : 0 });
        return end.call(this, body, ...args);
      };
    });
    servers.set(label, server);
    bases.set(label, 'http://127.0.0.1:' + server.address().port);
  }
  browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  results.browser = await browser.version();
  for (let rep = 0; rep <= budget.samples; rep++) {
    for (const label of (rep % 2 ? labels : [...labels].reverse())) await sample(label, rep);
    console.log('Completed pair', rep);
  }
  const summary = {};
  for (const phase of ['cold', 'warm']) {
    const row = {};
    for (const label of labels) {
      const selected = runs.filter(run => run.phase === phase && run.label === label);
      row[label] = Object.fromEntries(['readyMs', 'responseBodyBytes', 'longestTaskMs'].map(key => [key, stats(selected.map(run => run[key]))]));
    }
    row.withinBudget = row.candidate.readyMs.median <= row.rc4.readyMs.median * budget.maxMedianRatio
      && row.candidate.readyMs.p95 <= row.rc4.readyMs.p95 * budget.maxP95Ratio
      && row.candidate.responseBodyBytes.median <= row.rc4.responseBodyBytes.median * budget.maxBodyBytesRatio;
    summary[phase] = row;
  }
  results.summary = summary;
  results.status = Object.values(summary).every(row => row.withinBudget) ? 'PASS' : 'FAIL';
} catch (error) {
  results.error = String(error?.message || error).replaceAll(tmpdir(), '<tmp>').slice(0, 2000);
  results.status = browser ? 'FAIL' : 'BLOCKED';
} finally {
  if (browser) await browser.close();
  for (const server of servers.values()) await new Promise(resolve => server.close(resolve));
  writeFileSync(output, JSON.stringify(results, null, 2) + '\n');
}
console.log(JSON.stringify({ status: results.status, summary: results.summary, error: results.error }));
process.exitCode = results.status === 'PASS' ? 0 : 1;
