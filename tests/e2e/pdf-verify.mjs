// Uji PDF NYATA (perintah lanjutan §7–8): build QA → paginasi terverifikasi di aplikasi → HTML datar (yang dicetak) →
// PDF oleh mesin cetak Chrome (sama dengan "Simpan sebagai PDF" di dialog Chrome) dan, bila tersedia, mesin cetak Firefox.
// PDF diperiksa dengan poppler/qpdf: validitas, jumlah halaman, halaman kosong, teks per halaman terhadap isi blok,
// nomor halaman & header, font tersemat (tanpa Type 3), gambar, anotasi tautan eksternal & internal, ukuran, waktu.
// Juga: memori setelah persiapan cetak berulang. Hasil → evidence/pdf-verification.json (+ PDF contoh di evidence/pdf/).
// CATATAN: ini BUKAN uji dialog cetak native (yang memerlukan interaksi manusia) — lihat docs/TESTING.md.
import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import { launch, page, openStudio, waitReady, state, setSource } from './lib.mjs';
import { generateStress } from '../../scripts/generate-stress.mjs';
import { candidateSha256, distTreeSha256 } from '../../scripts/fingerprint.mjs';
import { normalizePdfText, orderedTextCheck, pdfFragments } from './pdf-oracle.mjs';

const FIREFOX = process.env.PF_FIREFOX || '/opt/ff/root/bin/FirefoxApp/firefox';
const MIXED = readFileSync('fixtures/mixed-document.md', 'utf8');
const CASES = [
  { id: 'small-mixed-A4', src: MIXED, keep: true },
  // regresi mesin matematika (rumus Einstein): rumus dikecualikan dari teks blok, sisa prosa/tabel/kode diperiksa per halaman
  { id: 'trigonometry-A4', src: readFileSync('fixtures/trigonometry/trigonometry.md', 'utf8'), keep: true },
  { id: 'einstein-A4', src: readFileSync('fixtures/einstein/einstein.md', 'utf8'), keep: true },
  { id: 'small-mixed-Letter-landscape', src: MIXED, paper: 'Letter', orient: 'landscape' },
  { id: 'small-mixed-A5', src: MIXED, paper: 'A5' },
  { id: 'medium-30', src: MIXED + '\n\n' + generateStress(30) },
  { id: 'large-115', src: generateStress(115) },
];
const only = (() => { const i = process.argv.indexOf('--only'); return i > 0 ? process.argv[i + 1].split(',') : null; })();
const sh = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
// PF-R4-06: significance-preserving PDF text oracle. Math glyph geometry still requires visual review.
const norm = normalizePdfText;
const fragments = (p) => p.evaluate(pdfFragments);

function inspectPdf(file, frags, meta) {
  const r = { file, bytes: statSync(file).size, checks: {}, problems: [] };
  const info = sh('pdfinfo', [file]);
  r.pages = Number(/Pages:\s+(\d+)/.exec(info)?.[1] ?? 0);
  r.pdfVersion = /PDF version:\s+([\d.]+)/.exec(info)?.[1];
  const structural = JSON.parse(sh(process.env.PF_PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), ['tests/e2e/inspect-pdf.py', file]));
  r.structureInspector = structural.checker;
  r.checks.pypdfReadable = structural.pages === r.pages;
  try { sh('qpdf', ['--check', file]); r.checks.qpdfValid = true; }
  catch (e) {
    if (e.code === 'ENOENT') r.qpdf = 'NOT_RUN: qpdf unavailable; pypdf strict reader is a narrower check';
    else { r.checks.qpdfValid = e.status === 3; r.qpdfCheckWarnings = String(e.stderr || e.stdout || '').split('\n').filter(l => /WARNING/.test(l)).length; }
    if (r.checks.qpdfValid === false) r.problems.push('qpdf --check gagal');
  }
  r.checks.pageCount = r.pages === meta.pages;
  if (!r.checks.pageCount) r.problems.push(`halaman PDF ${r.pages} ≠ paginasi ${meta.pages}`);
  const fonts = sh('pdffonts', [file]).split('\n').slice(2).filter(Boolean);
  r.fonts = fonts.length;
  r.checks.fontsEmbedded = fonts.length > 0 && fonts.every(l => l.trim().split(/\s+/).at(-5) === 'yes');
  r.type3Fonts = fonts.filter((l) => /Type 3/.test(l)).map((l) => l.split(/\s+/)[0]);
  // One unsupported-glyph warning cannot authorize every synthesized/raster Type 3 font.
  r.checks.noType3 = !r.type3Fonts.length;
  r.unsupportedGlyphsReported = !!meta.glyphNotBundledReported;
  if (!r.checks.fontsEmbedded) r.problems.push('ada font tidak tersemat');
  if (!r.checks.noType3) r.problems.push('ada font Type 3 (glyph sintetis)');
  let imgs = 0; try { imgs = sh('pdfimages', ['-list', file]).split('\n').slice(2).filter(Boolean).length; } catch { /* */ }
  r.images = imgs;
  r.checks.rasterImagesPresent = imgs >= (meta.rasterImages ?? 0);
  if (!r.checks.rasterImagesPresent) r.problems.push(`gambar raster ${imgs} < sumber ${meta.rasterImages}`);
  // Actual annotation objects, not substring counts in a decompressed PDF dump.
  r.linkAnnots = { uri: structural.uri, internal: structural.internal };
  r.checks.externalLinks = (meta.externalTargets ?? []).every(href => structural.uriTargets.includes(href));
  r.checks.internalLinks = r.linkAnnots.internal >= meta.internalLinks;
  if (!r.checks.externalLinks) r.problems.push('anotasi URI tidak mencakup semua tujuan tautan eksternal');
  if (!r.checks.internalLinks) r.problems.push(`anotasi internal ${r.linkAnnots.internal} < tujuan unik ${meta.internalLinks}`);
  // teks per halaman
  let missing = [], blank = [], pnum = [], cellMiss = 0, header = 0;
  const n = Math.min(r.pages, frags.length);
  for (let i = 0; i < n; i++) {
    const t = sh('pdftotext', ['-f', String(i + 1), '-l', String(i + 1), '-enc', 'UTF-8', file, '-']);
    const nt = norm(t);
    const raw = sh('pdftotext', ['-raw', '-f', String(i + 1), '-l', String(i + 1), '-enc', 'UTF-8', file, '-']);
    const f = frags[i];
    if (!nt && !f.cover && (f.blocks.length || f.cells.length)) blank.push(i + 1);
    // Only a reported unsupported-glyph case may omit those exact categories from text comparison.
    // It still fails the no-Type-3 gate until the output is visually reviewed; it is never a blanket PDF pass.
    const blocks = orderedTextCheck(f.blocks, { logical: t, raw }, !!meta.glyphNotBundledReported);
    if (!blocks.pass) missing.push({ page: i + 1, matched: blocks.matched, total: blocks.total, firstMissing: blocks.firstMissing?.slice(0, 100) });
    if (blocks.pass && blocks.mode === 'raw') r.rawOrderMatches = (r.rawOrderMatches ?? 0) + 1;
    const cellCheck = orderedTextCheck(f.cells, { logical: t, raw }, !!meta.glyphNotBundledReported);
    if (!cellCheck.pass) cellMiss += cellCheck.total - cellCheck.matched;
    if (f.label) { const lines = t.split('\n').map((l) => l.trim()).filter(Boolean); const edge = [...lines.slice(0, 3), ...lines.slice(-3)]; if (!edge.some((l) => new RegExp(`(^|\\s)${f.label}($|\\s)`).test(l))) pnum.push(i + 1); }
    if (i > 0 && !f.cover && meta.title && nt.includes(norm(meta.title))) header++;
  }
  r.text = { pagesChecked: n, blocksMissing: missing.length, missingSample: missing.slice(0, 5), tableCellsMissing: cellMiss, blankPages: blank, pageNumberMissing: pnum, pagesWithHeaderTitle: header };
  r.checks.allBlocksPresent = missing.length === 0;
  r.checks.allCellsPresent = cellMiss === 0;
  r.checks.noUnexpectedBlank = blank.length === 0;
  r.checks.pageNumbers = pnum.length === 0;
  if (missing.length) r.problems.push(`${missing.length} blok tidak ditemukan di teks PDF (mis. ${JSON.stringify(missing[0])})`);
  if (cellMiss) r.problems.push(`${cellMiss} sel tabel tidak ditemukan`);
  if (blank.length) r.problems.push(`halaman kosong: ${blank.join(',')}`);
  if (pnum.length) r.problems.push(`nomor halaman tidak ditemukan di halaman ${pnum.slice(0, 8).join(',')}`);
  r.visualReview = { formulas: frags.reduce((n, p) => n + (p.formulas ?? 0), 0), status: 'NOT_RUN', note: 'Text/annotation checks do not prove equation glyph geometry or visual clipping.' };
  r.status = r.problems.length || Object.values(r.checks).some(v => v === false) ? 'fail' : 'pass';
  return r;
}

const env = await launch({ dir: 'dist-qa', port: 4340 });
let ff = null;
if (existsSync(FIREFOX)) {
  try { ff = await puppeteer.launch({ browser: 'firefox', executablePath: FIREFOX, headless: true, env: { ...process.env, LD_LIBRARY_PATH: `${FIREFOX.replace(/\/firefox$/, '')}:/opt/ff/root/lib` } }); }
  catch (e) { console.log('Firefox tidak dapat dijalankan:', e.message); }
}
mkdirSync('evidence/pdf', { recursive: true });
const results = [];
try {
  for (const c of CASES) {
    if (only && !only.includes(c.id)) continue;
    const rec = { id: c.id, sourceBytes: Buffer.byteLength(c.src), paper: c.paper ?? 'A4', orientation: c.orient ?? 'portrait' };
    const p = await page(env, { lang: 'id' });
    try {
      await openStudio(p, env.base);
      const t0 = Date.now();
      await setSource(p, c.src); await waitReady(p, 300000);
      rec.previewMs = Date.now() - t0;
      if (c.paper) { await p.select('#s-paper', c.paper); await waitReady(p, 300000); }
      if (c.orient) { await p.select('#s-orient', c.orient); await waitReady(p, 300000); }
      const t1 = Date.now();
      await p.click('#t-checks'); await p.click('#p-checks .layout-btn');
      await p.waitForFunction(() => ['done', 'failed'].includes(window.__pf.state().layout.status), { timeout: 900000, polling: 250 });
      rec.layoutMs = Date.now() - t1;
      const flat = await p.evaluate(() => window.__pf.flattened());
      const s = await state(p);
      rec.appVerification = flat?.verification ?? null;
      rec.layoutStatus = s.layout.status;
      rec.blockingIssues = s.issues.filter((i) => i.blocking).map((i) => i.code);
      if (!flat || flat.verification.status !== 'pass') { rec.status = 'fail'; rec.problems = ['verifikasi paginasi aplikasi tidak lulus']; results.push(rec); continue; }
      rec.pages = flat.pages;
      const fp = await env.browser.newPage();
      await fp.setContent(flat.html, { waitUntil: 'load' }); await fp.evaluate(() => document.fonts.ready);
      const frags = await fragments(fp);
      const meta = await fp.evaluate(() => ({
        externalTargets: [...new Set([...document.querySelectorAll('.pagedjs_page_content a[href^="http"]')].map(a => a.href))],
        internalLinks: new Set([...document.querySelectorAll('.pagedjs_page_content a[href^="#"]')].filter(a => { try { return !!document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1))); } catch { return false; } }).map(a => a.getAttribute('href'))).size,
        rasterImages: new Set([...document.querySelectorAll('.pagedjs_page_content img')].filter(i => !i.src.startsWith('data:image/svg+xml')).map(i => i.src)).size,
        title: document.title,
      }));
      meta.pages = flat.pages;
      meta.glyphNotBundledReported = s.issues.some((i) => i.code === 'FONT_GLYPH_NOT_BUNDLED');
      if (c.keep) writeFileSync(join('evidence/pdf', `${c.id}.flattened.html`), flat.html);
      rec.meta = meta;
      const engines = [];
      // Chrome: mesin cetak yang sama dengan dialog "Simpan sebagai PDF"
      let t = Date.now();
      const chromePdf = join('evidence/pdf', `${c.id}.chrome.pdf`);
      writeFileSync(chromePdf, await fp.pdf({ preferCSSPageSize: true, printBackground: true, timeout: 600000 }));
      engines.push({ engine: `Chrome ${await env.browser.version()}`, ms: Date.now() - t, ...inspectPdf(chromePdf, frags, meta) });
      await fp.close();
      if (ff) {
        const q = await ff.newPage();
        t = Date.now();
        await q.setContent(flat.html, { waitUntil: 'load', timeout: 600000 }); await q.evaluate(() => document.fonts.ready);
        const ffPdf = join('evidence/pdf', `${c.id}.firefox.pdf`);
        writeFileSync(ffPdf, await q.pdf({ preferCSSPageSize: true, printBackground: true, timeout: 600000 }));
        engines.push({ engine: `Firefox ${await ff.version()}`, ms: Date.now() - t, ...inspectPdf(ffPdf, frags, meta) });
        await q.close();
      }
      rec.engines = engines;
      rec.status = engines.every((e) => e.status === 'pass') ? 'pass' : 'fail';
    } catch (e) { rec.status = 'fail'; rec.error = String(e?.stack || e).slice(0, 800); }
    finally { await p.close(); }
    results.push(rec);
    console.log(`${rec.status === 'pass' ? '✓' : '✗'} ${c.id} pages=${rec.pages} ` + (rec.engines ?? []).map((e) => `${e.engine.split(' ')[0]}:${e.status}${e.problems?.length ? ' [' + e.problems.join('; ') + ']' : ''}`).join(' ') + (rec.error ? ' ' + rec.error.split('\n')[0] : ''));
  }
  // memori setelah persiapan cetak berulang (dokumen menengah, edit kecil di antara putaran)
  if (!only || only.includes('memory')) {
    const p = await page(env, { lang: 'id' });
    await openStudio(p, env.base);
    await setSource(p, MIXED + '\n\n' + generateStress(20)); await waitReady(p, 300000);
    const cdp = await p.createCDPSession();
    const rounds = [];
    for (let i = 0; i < 6; i++) {
      if (i) { await p.evaluate((i) => { const ed = document.querySelector('#editor'); ed.value += `\n\nPutaran ${i}.`; ed.dispatchEvent(new Event('input', { bubbles: true })); }, i); await waitReady(p, 300000); }
      await p.click('#t-checks'); await p.click('#p-checks .layout-btn');
      await p.waitForFunction(() => ['done', 'failed'].includes(window.__pf.state().layout.status) && window.__pf.state().layout.hash === window.__pf.state().view.hash, { timeout: 600000, polling: 250 });
      const verifiedLayout = await p.evaluate(() => {
        const s = window.__pf.state(), flat = window.__pf.flattened();
        return s.layout.status === 'done' && flat?.verification.status === 'pass' && flat.pages > 0 && !s.issues.some(i => i.blocking);
      });
      await cdp.send('HeapProfiler.collectGarbage');
      const h = await cdp.send('Runtime.getHeapUsage');
      rounds.push({ round: i + 1, verifiedLayout, usedMiB: +(h.usedSize / 1048576).toFixed(1), iframes: await p.evaluate(() => document.querySelectorAll('iframe').length) });
    }
    await p.close();
    const growth = rounds.at(-1).usedMiB - rounds[1].usedMiB;
    const mem = { id: 'memory-repeat-layout', rounds, growthMiBRound2to6: +growth.toFixed(1), status: growth < 20 && rounds.every((r) => r.verifiedLayout && r.iframes === rounds[0].iframes) ? 'pass' : 'fail' };
    results.push(mem);
    console.log(`${mem.status === 'pass' ? '✓' : '✗'} memory growth ${mem.growthMiBRound2to6} MiB, iframes ${rounds.map((r) => r.iframes).join('/')}`);
  }
} finally { await env.close(); if (ff) await ff.close(); }
const out = { tool: 'tests/e2e/pdf-verify.mjs', candidateSha256: candidateSha256(), distQaTreeSha256: distTreeSha256('dist-qa'), at: new Date().toISOString(),
  note: 'PDF dihasilkan oleh mesin cetak browser headless dari HTML datar yang sama dengan yang dibuka dialog cetak. Dialog cetak native TIDAK diuji di sini.',
  summary: { total: results.length, pass: results.filter((r) => r.status === 'pass').length, fail: results.filter((r) => r.status !== 'pass').length }, results };
writeFileSync(only ? 'evidence/pdf-verification.partial.json' : 'evidence/pdf-verification.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out.summary));
process.exit(out.summary.fail ? 1 : 0);
