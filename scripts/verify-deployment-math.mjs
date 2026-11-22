// Verifikasi mesin matematika pada DEPLOYMENT nyata (build produksi, tanpa kait QA).
// Pemakaian:  npm run verify:deployment -- https://performa-cwd.pages.dev
// Membutuhkan Chrome/Chromium lokal (CHROME_PATH atau /usr/bin/google-chrome). Menulis evidence/deployment-math-<host>/results.json + PNG.
// Alur: buka studio → tempel dokumen Einstein seperti dari ChatGPT (text/plain + text/html berdelimiter literal, dan
// text/html KaTeX) lewat ClipboardEvent sintetis → setujui konversi → periksa pratinjau: 11 rumus KaTeX, TeX sama
// dengan sumber, tidak ada \(…\) / \[…\] / \boxed mentah, mata uang & kode utuh; lalu tempel teks biasa ke editor.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { deploymentIdentity } from './deployment-identity.mjs';
import { root } from './fingerprint.mjs';
import { deploymentMathPass } from './result-gates.mjs';
import { findChromium } from './browser-path.mjs';

const base = (process.argv[2] || '').replace(/\/$/, '');
const identity = deploymentIdentity(join(root, 'dist'), JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')));
const expectedVersion = identity.version;
if (!/^https?:\/\//.test(base)) { console.error('Pemakaian: node scripts/verify-deployment-math.mjs <URL deployment>'); process.exit(2); }
const CHROME = findChromium();
if (!CHROME) { console.error('Chrome tidak ditemukan; set CHROME_PATH.'); process.exit(2); }
const md = readFileSync(new URL('../fixtures/einstein/einstein.md', import.meta.url), 'utf8');
const htmlL = readFileSync(new URL('../fixtures/einstein/chatgpt-literal.html', import.meta.url), 'utf8');
const htmlK = readFileSync(new URL('../fixtures/einstein/chatgpt-katex.html', import.meta.url), 'utf8');
const EXPECTED = ['m', 'E_0', '\\boxed{E_0=mc^2}', 'v', '\\gamma=\\frac{1}{\\sqrt{1-\\frac{v^2}{c^2}}}', 'E=\\gamma mc^2', '\\Delta E = \\Delta m\\, c^2',
  "\\begin{pmatrix} ct' \\\\ x' \\end{pmatrix} = \\begin{pmatrix} \\gamma & -\\gamma\\beta \\\\ -\\gamma\\beta & \\gamma \\end{pmatrix} \\begin{pmatrix} ct \\\\ x \\end{pmatrix}",
  '\\tau = \\int_{t_1}^{t_2} \\sqrt{1-\\frac{v(t)^2}{c^2}}\\,dt', 'E_0=mc^2', 'p=\\gamma m v'];
const output = process.argv[3] ? resolve(root, process.argv[3]) : join(root, 'evidence', 'deployment-math-' + encodeURIComponent(new URL(base).host));
mkdirSync(output, { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const results = [];
const paste = (p, sel, plain, html) => p.evaluate((sel, plain, html) => {
  const t = document.querySelector(sel); t.focus();
  const dt = new DataTransfer(); dt.setData('text/plain', plain); if (html) dt.setData('text/html', html);
  if (t.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))) { t.value = plain; t.dispatchEvent(new Event('input', { bubbles: true })); }
}, sel, plain, html);
const measure = (p) => p.evaluate(() => {
  const d = document.querySelector('#live-frame').contentDocument;
  const vis = d.body.cloneNode(true); vis.querySelectorAll('.pf-math, pre, code').forEach((n) => n.remove());
  const t = vis.textContent;
  return { katex: d.querySelectorAll('.pf-math .katex').length, errors: d.querySelectorAll('.pf-math-error').length,
    tex: [...d.querySelectorAll('.pf-math[data-tex]')].map((e) => e.getAttribute('data-tex').replace(/\s+/g, ' ').trim()),
    display: [...d.querySelectorAll('.pf-math[data-tex]')].map((e) => !!e.querySelector('.katex-display')),
    raw: ['\\(', '\\)', '\\[', '\\]', '\\boxed', '\\frac', '$$', '$E'].filter((x) => t.includes(x)),
    currency: /\$5 untuk versi hitam-putih dan \$10/.test(t.replace(/\s+/g, ' ')), code: (d.querySelector('pre')?.textContent ?? '').includes('echo "\\(x\\) tetap teks, $HOME juga"') };
});
async function run(name, act) {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage(); await p.setViewport({ width: 1366, height: 900 });
  const errs = []; p.on('pageerror', (e) => errs.push(String(e.message)));
  const rec = { case: name };
  try {
    const nav = await p.goto(base + '/#/workspace', { waitUntil: 'networkidle0', timeout: 60000 });
    if (!nav?.ok() || new URL(nav.url()).origin !== new URL(base).origin) throw Error('Halaman deployment gagal atau berpindah origin.');
    rec.version = await p.evaluate(() => document.querySelector('meta[name="pf-version"]')?.content ?? null);
    rec.indexSha256 = createHash('sha256').update(await nav.buffer()).digest('hex');
    if (rec.indexSha256 !== identity.indexSha256 || rec.version !== expectedVersion) {
      throw Error('Versi atau SHA-256 halaman deployment berbeda dari build yang diuji.');
    }
    await p.waitForSelector('#editor', { timeout: 30000 });
    await act(p);
    await p.waitForFunction(() => /PENUTUP-EINSTEIN/.test(document.querySelector('#live-frame')?.contentDocument?.body?.textContent ?? ''), { timeout: 60000, polling: 200 });
    // beri waktu pratinjau menyelesaikan revisi terakhir (debounce + Worker), lalu ukur apa adanya
    await p.waitForFunction(() => document.querySelector('#live-frame')?.contentDocument?.querySelectorAll('.pf-math').length >= 11, { timeout: 8000, polling: 200 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 500));
    Object.assign(rec, await measure(p));
    await p.evaluate(() => (document.querySelector('#live-frame').contentDocument.querySelector('.pf-math-display') ?? document.querySelector('#live-frame').contentDocument.querySelector('h1'))?.scrollIntoView({ block: 'start' }));
    await (await p.$('#live-frame')).screenshot({ path: join(output, name + '.png') });
  } catch (e) { rec.error = String(e?.message || e).slice(0, 300); }
  rec.pageErrors = errs.slice(0, 3);
  rec.pass = deploymentMathPass(rec, { version: expectedVersion, tex: EXPECTED, display: [false, false, true, false, true, false, true, true, false, false, false] });
  console.log(`${rec.pass ? '✓' : '✗'} ${name}: version=${rec.version ?? 'MISSING'} expected=${expectedVersion} katex=${rec.katex} raw=${(rec.raw ?? []).join(' ') || '-'} ${rec.error ?? ''}`);
  results.push(rec); await ctx.close();
}
const viaDialog = (plain, html) => async (p) => {
  await p.click('#empty-state [data-action=paste]'); await p.waitForSelector('#dlg-paste[open]');
  await paste(p, '#paste-area', plain, html); await new Promise((r) => setTimeout(r, 100));
  await p.click('input[name=paste-repr][value=markdown]'); await p.click('#paste-ok');
  await p.waitForSelector('#dlg-diff[open]', { timeout: 15000 }); await p.click('#dlg-diff button[value=apply]');
};
await run('chatgpt-html-literal', viaDialog(md, htmlL));
await run('chatgpt-html-katex', viaDialog(md, htmlK));
await run('plain-text-editor', (p) => paste(p, '#editor', md, null));
await browser.close();
const out = { tool: 'scripts/verify-deployment-math.mjs', url: base, ...identity, expectedVersion, at: new Date().toISOString(), chrome: CHROME, pass: results.every((r) => r.pass), results };
writeFileSync(join(output, 'results.json'), JSON.stringify(out, null, 2));
console.log(out.pass ? 'LULUS' : 'GAGAL');
process.exit(out.pass ? 0 : 1);
