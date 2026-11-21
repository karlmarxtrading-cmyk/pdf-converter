// Uji PDF NYATA (perintah lanjutan §7–8): build QA → paginasi terverifikasi di aplikasi → HTML datar (yang dicetak) →
// PDF oleh mesin cetak Chrome (sama dengan "Simpan sebagai PDF" di dialog Chrome) dan, bila tersedia, mesin cetak Firefox.
// PDF diperiksa dengan poppler/qpdf: validitas, jumlah halaman, halaman kosong, teks per halaman terhadap isi blok,
// nomor halaman & header, font tersemat (tanpa Type 3), gambar, anotasi tautan eksternal & internal, ukuran, waktu.
// Juga: memori setelah persiapan cetak berulang. Hasil → evidence/pdf-verification.json (+ PDF contoh di evidence/pdf/).
// CATATAN: ini BUKAN uji dialog cetak native (yang memerlukan interaksi manusia) — lihat docs/TESTING.md.
import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import { launch, page, openStudio, waitReady, state, setSource } from './lib.mjs';
import { generateStress } from '../../scripts/generate-stress.mjs';
import { candidateSha256, distTreeSha256 } from '../../scripts/fingerprint.mjs';

const FIREFOX = process.env.PF_FIREFOX || '/opt/ff/root/bin/FirefoxApp/firefox';
const MIXED = readFileSync('fixtures/mixed-document.md', 'utf8');
const CASES = [
  { id: 'small-mixed-A4', src: MIXED, keep: true },
  // regresi mesin matematika (rumus Einstein): rumus dikecualikan dari teks blok, sisa prosa/tabel/kode diperiksa per halaman
  { id: 'einstein-A4', src: readFileSync('fixtures/einstein/einstein.md', 'utf8'), keep: true },
  { id: 'small-mixed-Letter-landscape', src: MIXED, paper: 'Letter', orient: 'landscape' },
  { id: 'small-mixed-A5', src: MIXED, paper: 'A5' },
  { id: 'medium-30', src: MIXED + '\n\n' + generateStress(30) },
  { id: 'large-115', src: generateStress(115) },
];
const only = (() => { const i = process.argv.indexOf('--only'); return i > 0 ? process.argv[i + 1].split(',') : null; })();
const sh = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
// Normalisasi terdokumentasi (docs/TESTING.md §PDF): NFC, huruf kecil (CSS text-transform), tanpa spasi/tanda hubung
// (pemecahan baris/hyphenation sah). Karakter TANPA glyph tersemat — Private Use & emoji berpresentasi emoji — dikeluarkan
// dari perbandingan teks karena dicetak sebagai glyph Type 3/kotak dan tidak dapat diekstrak; aplikasi melaporkannya
// sebagai FONT_GLYPH_NOT_BUNDLED. Simbol yang dibundel (© € → ≤) TETAP dibandingkan.
const UNBUNDLED = /[\uE000-\uF8FF\u{F0000}-\u{10FFFF}\p{Emoji_Presentation}\uFE0F]|\u200D|\p{Emoji_Modifier}/gu;
const norm = (s) => s.normalize('NFC').toLowerCase().replace(UNBUNDLED, '').replace(/[\s\u00ad\u200b\u2010\u2011-]/g, '');

/** Fragmen isi per halaman dari HTML datar (dihitung di browser). */
async function fragments(p) {
  return p.evaluate(() => {
    const pages = [...document.querySelectorAll('.pagedjs_page')];
    return pages.map((pg) => {
      const area = pg.querySelector('.pagedjs_page_content'); if (!area) return { blocks: [], cells: [] };
      const blocks = []; const cells = [];
      for (const el of area.querySelectorAll('[data-block-id]')) {
        if (el.parentElement?.closest('[data-block-id]')) continue;
        if (el.querySelector('.pf-math, .katex, img, svg') || el.matches('.pf-math, pre.pf-mermaid')) continue; // rumus/gambar diperiksa terpisah
        const c = el.cloneNode(true); c.querySelectorAll('.katex-mathml, [data-pf-repeat], sup[data-footnote-ref], .pf-ui-label').forEach((n) => n.remove());
        if (el.tagName === 'TABLE') { for (const td of c.querySelectorAll('td, th')) { const t = td.textContent.trim(); if (t) cells.push(t); } continue; }
        if (el.tagName === 'UL' || el.tagName === 'OL') {
          // penanda daftar (1., •) ada di PDF tetapi bukan teks DOM → periksa teks tiap butir (tanpa sub-daftar) berurutan
          for (const li of c.querySelectorAll('li')) { const x = li.cloneNode(true); x.querySelectorAll('ul, ol').forEach((n) => n.remove()); const t = x.textContent.trim(); if (t) blocks.push({ id: el.getAttribute('data-block-id'), text: t }); }
          continue;
        }
        const t = c.textContent.trim(); if (t) blocks.push({ id: el.getAttribute('data-block-id'), text: t });
      }
      return { blocks, cells, label: JSON.parse(pg.style.getPropertyValue('--pf-pnum') || '""'), cover: pg.classList.contains('pagedjs_pf-cover_page') };
    });
  });
}

function inspectPdf(file, frags, meta) {
  const r = { file, bytes: statSync(file).size, checks: {}, problems: [] };
  const info = sh('pdfinfo', [file]);
  r.pages = Number(/Pages:\s+(\d+)/.exec(info)?.[1] ?? 0);
  r.pdfVersion = /PDF version:\s+([\d.]+)/.exec(info)?.[1];
  try { sh('qpdf', ['--check', file]); r.checks.qpdfValid = true; } catch (e) {
    // exit 3 = struktur dapat dibaca dengan peringatan (mis. kunci kamus ganda dari penulis PDF Firefox) → dicatat, tidak dianggap korup
    r.checks.qpdfValid = e.status === 3; r.qpdfCheckWarnings = String(e.stderr || e.stdout || '').split('\n').filter((l) => /WARNING/.test(l)).length;
    if (!r.checks.qpdfValid) r.problems.push('qpdf --check gagal');
  }
  r.checks.pageCount = r.pages === meta.pages;
  if (!r.checks.pageCount) r.problems.push(`halaman PDF ${r.pages} ≠ paginasi ${meta.pages}`);
  const fonts = sh('pdffonts', [file]).split('\n').slice(2).filter(Boolean);
  r.fonts = fonts.length;
  r.checks.fontsEmbedded = fonts.every((l) => / yes +(yes|no) +(yes|no) /.test(l) || /\byes\b.*\byes\b/.test(l.slice(40)));
  r.type3Fonts = fonts.filter((l) => /Type 3/.test(l)).map((l) => l.split(/\s+/)[0]);
  // Type 3 hanya sah untuk glyph yang memang tidak dibundel dan sudah dilaporkan aplikasi (FONT_GLYPH_NOT_BUNDLED)
  r.checks.noType3 = !r.type3Fonts.length || meta.glyphNotBundledReported;
  if (!r.checks.fontsEmbedded) r.problems.push('ada font tidak tersemat');
  if (!r.checks.noType3) r.problems.push('ada font Type 3 (glyph sintetis)');
  let imgs = 0; try { imgs = sh('pdfimages', ['-list', file]).split('\n').slice(2).filter(Boolean).length; } catch { /* */ }
  r.images = imgs;
  // anotasi tautan
  const tmp = join(mkdtempSync(join(tmpdir(), 'pfq-')), 'q.pdf');
  try { sh('qpdf', ['--qdf', '--object-streams=disable', file, tmp]); } catch (e) { if (e.status !== 3) throw e; r.qpdfWarnings = String(e.stderr || '').split('\n').filter(Boolean).length; }
  const raw = readFileSync(tmp, 'latin1');
  r.linkAnnots = { uri: (raw.match(/\/URI\s*\(/g) ?? []).length, internal: (raw.match(/\/Dest\s*[[(/]|\/S\s*\/GoTo\b/g) ?? []).length };
  r.checks.externalLinks = r.linkAnnots.uri >= meta.externalLinks;
  r.checks.internalLinks = r.linkAnnots.internal >= Math.min(1, meta.internalLinks);
  if (!r.checks.externalLinks) r.problems.push(`anotasi URI ${r.linkAnnots.uri} < tautan eksternal ${meta.externalLinks}`);
  if (!r.checks.internalLinks) r.problems.push('tidak ada tautan internal di PDF');
  // teks per halaman
  let missing = [], blank = [], pnum = [], cellMiss = 0, header = 0;
  const n = Math.min(r.pages, frags.length);
  for (let i = 0; i < n; i++) {
    const t = sh('pdftotext', ['-f', String(i + 1), '-l', String(i + 1), '-enc', 'UTF-8', file, '-']);
    const nt = norm(t);
    // urutan baca pdftotext kadang mengelompokkan kolom (mis. baris kode terbungkus); urutan aliran konten (-raw) sebagai cadangan
    let ntRaw = null; const raw = () => (ntRaw ??= norm(sh('pdftotext', ['-raw', '-f', String(i + 1), '-l', String(i + 1), '-enc', 'UTF-8', file, '-'])));
    const f = frags[i];
    if (!nt && !f.cover) blank.push(i + 1);
    let cur = 0;
    for (const b of f.blocks) {
      const x = norm(b.text); if (!x) continue;
      const at = nt.indexOf(x, cur);
      if (at < 0 && raw().includes(x)) { r.rawOrderMatches = (r.rawOrderMatches ?? 0) + 1; continue; }
      if (at < 0) {
        if (nt.indexOf(x) >= 0) missing.push({ page: i + 1, id: b.id, why: 'urutan' });
        else { let k = x.length; let lo = 0, hi = x.length; while (lo < hi) { const m = Math.ceil((lo + hi) / 2); if (nt.includes(x.slice(0, m))) lo = m; else hi = m - 1; } k = lo; missing.push({ page: i + 1, id: b.id, text: b.text.slice(0, 60), matchedPrefix: k, expectedNext: x.slice(k, k + 40), pdfNear: nt.slice(Math.max(0, nt.indexOf(x.slice(Math.max(0, k - 15), k)) ), nt.indexOf(x.slice(Math.max(0, k - 15), k)) + 55) }); }
      }
      else cur = at + x.length;
    }
    for (const c of f.cells) if (!nt.includes(norm(c))) cellMiss++;
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
  r.status = r.problems.length ? 'fail' : 'pass';
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
        externalLinks: new Set([...document.querySelectorAll('.pagedjs_page_content a[href^="http"]')].map((a) => a.href)).size,
        internalLinks: document.querySelectorAll('.pagedjs_page_content a[href^="#"]').length,
        images: new Set([...document.querySelectorAll('.pagedjs_page_content img')].map((i) => i.src)).size,
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
      await cdp.send('HeapProfiler.collectGarbage');
      const h = await cdp.send('Runtime.getHeapUsage');
      rounds.push({ round: i + 1, usedMiB: +(h.usedSize / 1048576).toFixed(1), iframes: await p.evaluate(() => document.querySelectorAll('iframe').length) });
    }
    await p.close();
    const growth = rounds.at(-1).usedMiB - rounds[1].usedMiB;
    const mem = { id: 'memory-repeat-layout', rounds, growthMiBRound2to6: +growth.toFixed(1), status: growth < 20 && rounds.every((r) => r.iframes === rounds[0].iframes) ? 'pass' : 'fail' };
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
