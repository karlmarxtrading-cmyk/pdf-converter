// Uji lintas mesin browser (perintah lanjutan §12): alur inti pada Chromium (CDP), Firefox (WebDriver BiDi via
// puppeteer-core) dan WebKitGTK (W3C WebDriver, MiniBrowser). WebKitGTK ≠ Safari macOS/iOS; Firefox headless Linux ≠
// semua platform. Hasil → evidence/cross-browser.json.
// Variabel: PF_FIREFOX (biner firefox), PF_WEBKIT_DRIVER (WebKitWebDriver), PF_WEBKIT_BROWSER (MiniBrowser), DISPLAY.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import { startServer } from '../../scripts/serve-dist.mjs';
import { CHROME } from './lib.mjs';
import { generateStress } from '../../scripts/generate-stress.mjs';
import { candidateSha256, distTreeSha256 } from '../../scripts/fingerprint.mjs';
import { crossBrowserGate } from '../../scripts/result-gates.mjs';

const FIREFOX = process.env.PF_FIREFOX || '/opt/ff/root/bin/FirefoxApp/firefox';
const WK_DRIVER = process.env.PF_WEBKIT_DRIVER || '/usr/bin/WebKitWebDriver';
const WK_BROWSER = process.env.PF_WEBKIT_BROWSER || '/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1/MiniBrowser';
const PORT = 4360; const BASE = `http://127.0.0.1:${PORT}`;
const MIXED = readFileSync('fixtures/mixed-document.md', 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Driver minimal seragam: goto, js (fungsi tanpa argumen sebagai string ekspresi), waitFor. */
async function puppeteerDriver(kind) {
  const opts = kind === 'firefox'
    ? { browser: 'firefox', executablePath: FIREFOX, headless: true, env: { ...process.env, LD_LIBRARY_PATH: `${FIREFOX.replace(/\/firefox$/, '')}:/opt/ff/root/lib` } }
    : { executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu'] };
  const b = await puppeteer.launch(opts);
  const p = await b.newPage(); await p.setViewport({ width: 1366, height: 900 });
  const errors = []; p.on('pageerror', (e) => errors.push(String(e.message || e)));
  return { name: `${kind === 'firefox' ? 'Firefox' : 'Chromium'} ${await b.version()}`, errors,
    goto: (u) => p.goto(u, { waitUntil: 'load' }), js: (expr) => p.evaluate(`(async () => (${expr}))()`),
    async close() { await b.close(); } };
}
async function webkitDriver() {
  if (!process.env.DISPLAY) { const x = spawn('Xvfb', [':98', '-screen', '0', '1440x900x24'], { stdio: 'ignore', detached: true }); x.unref(); process.env.DISPLAY = ':98'; await sleep(800); }
  const port = 4461;
  const drv = spawn(WK_DRIVER, [`--port=${port}`], { stdio: 'ignore', env: process.env });
  await sleep(1500);
  const W = `http://127.0.0.1:${port}`;
  const j = async (m, u, b) => (await fetch(W + u, { method: m, headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })).json();
  const s = await j('POST', '/session', { capabilities: { alwaysMatch: { 'webkitgtk:browserOptions': { binary: WK_BROWSER, args: ['--automation'] } } } });
  const id = s.value.sessionId; if (!id) throw new Error('WebKit session: ' + JSON.stringify(s).slice(0, 300));
  await j('POST', `/session/${id}/window/rect`, { width: 1366, height: 900 });
  await j('POST', `/session/${id}/timeouts`, { script: 600000, pageLoad: 120000 });
  return { name: `WebKitGTK ${s.value.capabilities.browserVersion} (MiniBrowser)`, errors: [],
    goto: (u) => j('POST', `/session/${id}/url`, { url: u }),
    async js(expr) {
      const r = await j('POST', `/session/${id}/execute/async`, { script: `const done = arguments[arguments.length - 1]; (async () => (${expr}))().then((v) => done({ ok: v }), (e) => done({ err: String(e && e.message || e) }));`, args: [] });
      if (r.value?.err) throw new Error(r.value.err); if (r.value?.error) throw new Error(r.value.message); return r.value?.ok;
    },
    async close() { try { await j('DELETE', `/session/${id}`); } catch { /* */ } drv.kill(); } };
}
async function waitFor(d, expr, timeout = 120000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { if (await d.js(expr)) return true; await sleep(200); }
  throw new Error('timeout menunggu: ' + expr.slice(0, 120));
}
const setSrc = (src) => `(() => { const ed = document.querySelector('#editor'); ed.focus(); ed.value = ${JSON.stringify(src)}; ed.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`;
const READY = `(() => { const s = window.__pf && window.__pf.state(); return !!s && s.view.status === 'ready' && s.view.revision === s.revision; })()`;

async function flow(d) {
  const res = { browser: d.name, steps: {} };
  const t0 = Date.now();
  await d.goto(BASE + '/');
  res.steps.landing = await d.js(`!!document.querySelector('main') && !/harga|pricing|langganan/i.test(document.body.innerText)`);
  await d.goto(BASE + '/#/workspace');
  await waitFor(d, `!!window.__pf`, 60000);
  res.steps.studioMs = Date.now() - t0;
  await d.js(setSrc(MIXED)); await waitFor(d, READY, 180000);
  await waitFor(d, `/PENUTUP-AKHIR-DOKUMEN/.test(document.querySelector('#live-frame').contentDocument?.body?.textContent ?? '')`, 60000);
  const s1 = await d.js(`(() => { const s = window.__pf.state(); return { engine: window.__pf.engine(), integrityErrors: s.issues.filter((i) => i.scope === 'integrity' && i.severity === 'error').map((i) => i.code), reports: s.reports, liveHasEnd: /PENUTUP-AKHIR-DOKUMEN/.test(document.querySelector('#live-frame').contentDocument?.body?.textContent ?? '') }; })()`);
  res.steps.preview = s1;
  res.steps.digest = await d.js(`window.__pf.renderedDigest()`);
  // paginasi + verifikasi isi di mesin layout browser ini
  const tl = Date.now();
  await d.js(`(() => { document.querySelector('#t-checks').click(); document.querySelector('#p-checks .layout-btn').click(); return true; })()`);
  await waitFor(d, `['done','failed'].includes(window.__pf.state().layout.status)`, 600000);
  res.steps.layout = await d.js(`(() => { const s = window.__pf.state(); return { status: s.layout.status, pages: s.layout.pages, verification: s.layout.verification && { status: s.layout.verification.status, inventory: s.layout.verification.inventory.length, structure: (s.layout.verification.structure || []).length }, blocking: s.issues.filter((i) => i.blocking).map((i) => i.code + ': ' + i.message) }; })()`);
  res.steps.layout.ms = Date.now() - tl;
  // dokumen besar: 50 bagian
  await d.js(setSrc(generateStress(50))); await waitFor(d, READY, 300000);
  const tb = Date.now();
  await d.js(`(() => { document.querySelector('#p-checks .layout-btn').click(); return true; })()`);
  await waitFor(d, `(() => { const s = window.__pf.state(); return ['done','failed'].includes(s.layout.status) && s.layout.hash === s.view.hash; })()`, 900000);
  res.steps.large = await d.js(`(() => { const s = window.__pf.state(); return { status: s.layout.status, pages: s.layout.pages, verification: s.layout.verification && s.layout.verification.status }; })()`);
  res.steps.large.ms = Date.now() - tb;
  // penyimpanan lokal (IndexedDB) tersedia & aplikasi tidak melempar galat
  res.steps.storage = await d.js(`(() => ({ idb: typeof indexedDB !== 'undefined', save: window.__pf.state().save, worker: typeof Worker !== 'undefined' }))()`);
  res.errors = d.errors.slice(0, 5);
  const ok = res.steps.landing && s1.integrityErrors.length === 0 && s1.liveHasEnd && s1.engine.mode === 'worker'
    && res.steps.layout.status === 'done' && res.steps.layout.verification?.status === 'pass' && res.steps.large.verification === 'pass' && !res.errors.length;
  res.status = ok ? 'pass' : 'fail';
  return res;
}

const server = await startServer('dist-qa', PORT);
const results = [];
for (const [kind, make] of [['chromium', () => puppeteerDriver('chrome')], ['firefox', () => (existsSync(FIREFOX) ? puppeteerDriver('firefox') : null)], ['webkit', () => (existsSync(WK_DRIVER) ? webkitDriver() : null)]]) {
  let d = null;
  try {
    d = await make();
    if (!d) { results.push({ engine: kind, status: 'not-available' }); console.log(`- ${kind}: tidak tersedia`); continue; }
    const r = await flow(d);
    results.push({ engine: kind, ...r });
    console.log(`${r.status === 'pass' ? '✓' : '✗'} ${r.browser}: preview ${r.steps.preview.engine.mode}, layout ${r.steps.layout.pages}p ${r.steps.layout.verification?.status} (${r.steps.layout.ms} ms), 50 bagian ${r.steps.large.pages}p ${r.steps.large.verification} (${r.steps.large.ms} ms) ${r.errors.join(' | ')}`);
  } catch (e) { results.push({ engine: kind, status: 'fail', error: String(e?.stack || e).slice(0, 600) }); console.log(`✗ ${kind}: ${String(e).slice(0, 200)}`); }
  finally { if (d) await d.close(); }
}
await new Promise((r) => server.close(r));
// HTML isi yang dirender harus identik di semua mesin (mesin dokumen deterministik)
const gate = crossBrowserGate(results);
const out = { tool: 'tests/e2e/cross-browser.mjs', candidateSha256: candidateSha256(), distQaTreeSha256: distTreeSha256('dist-qa'), at: new Date().toISOString(),
  note: 'Mesin otomatis di Linux headless/Xvfb. WebKitGTK bukan Safari; tidak ada perangkat fisik atau pembaca layar.', ...gate, results };
writeFileSync('evidence/cross-browser.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify({ engines: results.map((r) => `${r.engine}:${r.status}`), ...gate }));
process.exit(gate.exitCode);
