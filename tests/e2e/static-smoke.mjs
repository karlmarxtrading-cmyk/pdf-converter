// Smoke test build PRODUKSI (dist/) di server ala Pages + Chrome: aplikasi boot, tidak ada kait QA, tidak ada jaringan
// eksternal, endpoint backend lama 404, header keamanan terpasang. → evidence/static-smoke.json
import { mkdirSync, writeFileSync } from 'node:fs';
import { launch, page } from './lib.mjs';
import { candidateSha256, distTreeSha256 } from '../../scripts/fingerprint.mjs';

const env = await launch({ dir: 'dist', port: 4320 });
const checks = [];
const ok = (name, pass, detail) => { checks.push({ name, pass: !!pass, detail }); console.log(`${pass ? '✓' : '✗'} ${name}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`); };
try {
  const p = await page(env, { lang: 'id' });
  await p.goto(env.base + '/', { waitUntil: 'load' });
  await p.waitForSelector('#hero-title');
  ok('beranda tampil', /Susun dokumen rapi/.test(await p.$eval('#hero-title', (e) => e.textContent)));
  ok('tidak ada kait QA (window.__pf) di produksi', (await p.evaluate(() => typeof window.__pf)) === 'undefined');
  await p.goto(env.base + '/#/workspace', { waitUntil: 'load' });
  await p.waitForSelector('#editor');
  await p.evaluate(() => { const ed = document.querySelector('#editor'); ed.value = '# Uji produksi\n\nIsi $5.'; ed.dispatchEvent(new Event('input', { bubbles: true })); });
  await p.waitForFunction(() => /Uji produksi/.test(document.querySelector('#live-frame').contentDocument?.body?.textContent ?? ''), { timeout: 30000 });
  ok('studio merender pratinjau', true);
  const printFrameHooks = await p.evaluate(async () => {
    const f = document.createElement('iframe'); f.src = '/print.html'; document.body.append(f);
    await new Promise((r) => (f.onload = r));
    return { pfPaginate: typeof f.contentWindow.pfPaginate, result: typeof f.contentWindow.__pfPrintResult };
  });
  ok('print.html tanpa kait QA', printFrameHooks.pfPaginate === 'undefined' && printFrameHooks.result === 'undefined', printFrameHooks);
  ok('tanpa permintaan eksternal', !p.log.external.length, p.log.external);
  ok('tanpa error konsol', !p.log.errors.length, p.log.errors);
  for (const u of ['/api/pdf', '/api/account', '/api/v1/ready', '/api/checkout']) { const r = await fetch(env.base + u); ok(`${u} → 404`, r.status === 404, r.status); }
  for (const u of ['/', '/print.html']) {
    const r = await fetch(env.base + u);
    const csp = r.headers.get('content-security-policy') || '';
    ok(`${u} CSP connect-src 'self' & frame-ancestors`, csp.includes("connect-src 'self'") && csp.includes('frame-ancestors'), csp.slice(0, 60));
  }
  await p.close();
} finally { await env.close(); }
const out = { tool: 'tests/e2e/static-smoke.mjs', candidateSha256: candidateSha256(), distTreeSha256: distTreeSha256('dist'), at: new Date().toISOString(), pass: checks.every((c) => c.pass), checks };
mkdirSync('evidence', { recursive: true });
writeFileSync('evidence/static-smoke.json', JSON.stringify(out, null, 2));
process.exit(out.pass ? 0 : 1);
