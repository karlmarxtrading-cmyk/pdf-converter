// Skenario E2E. Setiap skenario mengembalikan detail terukur; kegagalan melempar Error dengan alasan spesifik.
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { unzipSync, strFromU8 } from 'fflate';
import { generateStress } from '../../scripts/generate-stress.mjs';

const assert = (c, msg) => { if (!c) throw new Error(msg); };
const P1 = '', P4 = '', PF = '', P0 = '';

async function studio(ctx, opts = {}) {
  const p = await ctx.page(ctx.env, { lang: 'id', ...opts });
  await ctx.openStudio(p, ctx.env.base);
  return p;
}
async function downloads(p) {
  const dir = mkdtempSync(join(tmpdir(), 'pf-dl-'));
  const cdp = await p.createCDPSession();
  await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: dir });
  return {
    dir,
    async wait(ext, timeout = 30000) {
      const t0 = Date.now();
      while (Date.now() - t0 < timeout) {
        const f = readdirSync(dir).filter((x) => x.endsWith(ext) && !x.endsWith('.crdownload'));
        if (f.length) { await new Promise((r) => setTimeout(r, 200)); return join(dir, f[0]); }
        await new Promise((r) => setTimeout(r, 150));
      }
      throw new Error(`unduhan ${ext} tidak muncul`);
    },
    list: () => readdirSync(dir),
  };
}
async function loadSource(ctx, p, text) { await ctx.setSource(p, text); await ctx.waitReady(p, 120000); }
async function openPublish(p, kind) {
  await p.click('.ws-actions [data-action=publish]');
  await p.waitForSelector('#dlg-publish[open]');
  await p.click(`input[name=pub-kind][value=${kind}]`);
}
async function publishResult(p, timeout = 180000) {
  await p.waitForFunction(() => { const r = document.querySelector('#publish-result'); return r && !r.hidden && r.textContent.trim().length > 0; }, { timeout, polling: 100 });
  return p.$eval('#publish-result', (r) => ({ cls: r.className, text: r.textContent }));
}
async function closePublish(p) { await p.evaluate(() => { const d = document.querySelector('#dlg-publish'); if (d.open) d.close(); }); }
/** Hapus IndexedDB/localStorage origin dari halaman tanpa aplikasi (tidak ada koneksi DB yang menahan penghapusan). */
async function wipeStorage(ctx) {
  const w = await ctx.env.browser.newPage();
  await w.goto(ctx.env.base + '/404.html');
  await w.evaluate(() => new Promise((res) => { localStorage.clear(); const r = indexedDB.deleteDatabase('paperforma2'); r.onsuccess = r.onerror = r.onblocked = () => res(null); }));
  await w.close();
}
const terminalSave = (p) => p.waitForFunction(() => !['pending'].includes(window.__pf.state().save), { timeout: 20000, polling: 100 });
const bodyText = (p) => p.evaluate(() => document.body.innerText);
const liveText = (p) => p.evaluate(() => document.querySelector('#live-frame').contentDocument?.body?.textContent ?? '');

export const SCENARIOS = [
  {
    id: 'E01', matrix: ['ST-QA-04', 'ST-QA-38', 'F.5'], title: 'Beranda statis: tanpa harga/akun, tanpa jaringan eksternal, contoh dirender saat terlihat',
    async run(ctx) {
      const p = await ctx.page(ctx.env, { lang: 'id' });
      const t0 = Date.now();
      await p.goto(ctx.env.base + '/', { waitUntil: 'load' });
      const nav = await p.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return { domContentLoaded: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd) }; });
      await p.waitForFunction(() => !!window.__pf);
      const cardsAtBoot = await p.$$eval('#format-cards iframe', (f) => f.length);
      const text = await bodyText(p);
      for (const bad of [/\bRp\s?\d/, /\/bulan/, /berlangganan|langganan/i, /\bharga\b/i, /masuk akun|daftar akun|login/i, /kuota/i]) assert(!bad.test(text), `teks komersial di beranda: ${bad}`);
      assert(/Susun dokumen rapi/.test(text), 'judul hero tidak ada');
      await p.evaluate(() => document.querySelector('#formats').scrollIntoView());
      await p.waitForFunction(() => [...document.querySelectorAll('#format-cards iframe')].filter((f) => f.srcdoc).length >= 1, { timeout: 30000 });
      const cardsAfter = await p.$$eval('#format-cards iframe', (f) => f.length);
      const title = await p.title();
      await p.select('#pref-lang-l', 'en');
      const titleEn = await p.title();
      const textEn = await bodyText(p);
      assert(/Turn your material into tidy documents/.test(textEn), 'EN hero tidak ada');
      assert(!p.log.external.length, 'permintaan eksternal: ' + p.log.external.join(', '));
      assert(!p.log.errors.length, 'error konsol: ' + p.log.errors.join(' | '));
      await p.close();
      return { cardsAtBoot, cardsAfter, title, titleEn, nav, msToInteractive: Date.now() - t0, requests: p.log.requests.length };
    },
  },
  {
    id: 'E02', matrix: ['ST-QA-37', 'ST-QA-29', 'ST-QA-41'], title: 'Batas statis: endpoint backend lama 404, header HTTP, rute & MIME',
    async run(ctx) {
      const probes = ['/api/pdf', '/api/pdf/jobs/x', '/api/account', '/api/auth/session', '/api/quota', '/api/health', '/api/checkout', '/print.html', '/', '/docs/panduan.html', '/tidak-ada', '/licenses/THIRD_PARTY_NOTICES.txt'];
      const out = {};
      for (const u of probes) {
        const r = await fetch(ctx.env.base + u);
        out[u] = { status: r.status, type: r.headers.get('content-type'), csp: !!r.headers.get('content-security-policy'), nosniff: r.headers.get('x-content-type-options') };
      }
      for (const u of probes.filter((x) => x.startsWith('/api'))) assert(out[u].status === 404, `${u} bukan 404`);
      for (const u of ['/print.html', '/', '/docs/panduan.html']) assert(out[u].status === 200 && out[u].csp && out[u].nosniff === 'nosniff', `${u} header/status salah`);
      assert(out['/tidak-ada'].status === 404, '404 tidak dilayani');
      const html = await (await fetch(ctx.env.base + '/')).text();
      const asset = /src="(\/assets\/[^"]+\.js)"/.exec(html)?.[1];
      const ar = await fetch(ctx.env.base + asset);
      out.asset = { path: asset, status: ar.status, type: ar.headers.get('content-type'), cache: ar.headers.get('cache-control') };
      assert(/javascript/.test(out.asset.type) && /immutable/.test(out.asset.cache), 'MIME/cache aset salah');
      return out;
    },
  },
  {
    id: 'E03', matrix: ['ST-QA-57', 'UI-03', 'EN-010', 'ST-QA-35'], title: 'Satu klik Periksa halaman = satu pekerjaan; verifikasi isi lulus; kesiapan per target',
    async run(ctx) {
      const p = await studio(ctx);
      await p.click('#empty-state [data-action=sample]');
      await ctx.waitReady(p);
      const before = await ctx.state(p);
      assert(before.reports.html === 'ready', 'HTML belum siap: ' + before.reports.html);
      assert(before.reports.print === 'unchecked', 'Cetak seharusnya belum diperiksa sebelum layout: ' + before.reports.print);
      const jobs0 = await p.evaluate(() => window.__pf.layoutJobs());
      await p.click('#t-checks');
      await p.click('#p-checks .layout-btn');
      await p.waitForFunction(() => ['done', 'failed'].includes(window.__pf.state().layout.status), { timeout: 120000 });
      const jobs1 = await p.evaluate(() => window.__pf.layoutJobs());
      // pindah tab bolak-balik tidak memicu pekerjaan baru untuk hash yang sama
      await p.click('#t-live'); await p.click('#t-pages'); await ctx.sleep(300);
      const jobs2 = await p.evaluate(() => window.__pf.layoutJobs());
      const s = await ctx.state(p);
      assert(jobs1 - jobs0 === 1, `pekerjaan paginasi per klik = ${jobs1 - jobs0}`);
      assert(jobs2 === jobs1, 'pindah tab memicu paginasi ulang');
      assert(s.layout.verification?.status === 'pass' && s.layout.verification.inventory.length === 0, 'verifikasi inventaris tidak lulus');
      assert(s.reports.print === 'ready', 'cetak tidak siap: ' + s.reports.print);
      // edit → kesiapan turun seketika (UI-02)
      await p.evaluate(() => { const ed = document.querySelector('#editor'); ed.value += '\nTambahan.'; ed.dispatchEvent(new Event('input', { bubbles: true })); });
      const mid = await ctx.state(p);
      const readinessText = await p.$eval('#readiness-box', (b) => b.textContent);
      assert(mid.reports.html === null && mid.reports.print === null, 'laporan lama masih terpasang setelah edit');
      assert(/Memproses|Processing/.test(readinessText), 'label kesiapan tidak turun ke memproses: ' + readinessText);
      await ctx.waitReady(p);
      const after = await ctx.state(p);
      assert(after.reports.print === 'unchecked', 'status cetak revisi baru seharusnya belum diperiksa');
      assert(!p.log.errors.length, p.log.errors.join(' | '));
      await p.close();
      return { jobsPerClick: jobs1 - jobs0, pages: s.layout.pages, verification: s.layout.verification, readinessDuringEdit: readinessText.trim().slice(0, 80) };
    },
  },
  {
    id: 'E04', matrix: ['ST-QA-32', 'EN-003', 'ST-QA-16', 'ST-QA-05'], title: 'PUA literal + mata uang + rumus + Unicode: pratinjau dan HTML mandiri mempertahankan karakter',
    async run(ctx) {
      const p = await studio(ctx);
      const dl = await downloads(p);
      const src = `﻿# Uji ${P0}${P1}${P4}${PF}\r\n\r\nHarga $5 dan $10 ${P1}x${P4} lalu $a+b$ dan \\(c\\).  \r\nIndonesia: Rp1.250.000, −5%, 😀, é (é), 𝒳.\r\n\r\n| a | b |\r\n|---|---|\r\n| ${P1}${P4} | 0,50 |\r\n\r\n\`\`\`text\r\n${P1}literal${P4}\r\n\`\`\`\r\n`;
      // via pintu Buka berkas: sumber mentah (BOM/CRLF) dipertahankan apa adanya
      const f = join(mkdtempSync(join(tmpdir(), 'pf-pua-')), 'pua.md'); writeFileSync(f, src, 'utf8');
      await (await p.$('#file-open')).uploadFile(f);
      await p.waitForFunction(() => window.__pf.state().source.includes('Uji'), { timeout: 20000 });
      await ctx.waitReady(p);
      const live = await liveText(p);
      for (const ch of [P0, P1, P4, PF]) assert(live.includes(ch), `pratinjau kehilangan U+${ch.charCodeAt(0).toString(16)}`);
      assert(live.includes('Harga $5 dan $10'), 'mata uang berubah');
      const s = await ctx.state(p);
      assert(!s.issues.some((i) => i.code.startsWith('INTEGRITY')), 'integrity gagal: ' + JSON.stringify(s.issues));
      await openPublish(p, 'html-standalone');
      await p.click('#pub-go');
      let res = await publishResult(p);
      // glyph di luar font bawaan (PUA/emoji/𝒳) → keputusan eksplisit, bukan sukses diam-diam
      const review = /perlu keputusan Anda/.test(res.text);
      assert(review && /glyph-coverage/.test(res.text), 'pemeriksaan glyph tidak meminta keputusan: ' + res.text);
      assert(!dl.list().length, 'unduhan terjadi sebelum keputusan');
      await p.click('#pub-review-ack');
      await p.evaluate(() => [...document.querySelectorAll('#publish-result button')].find((b) => /Unduh dengan catatan/.test(b.textContent)).click());
      res = await publishResult(p);
      assert(/banner-ok/.test(res.cls), 'ekspor tidak sukses: ' + res.text);
      const file = await dl.wait('.html');
      const html = readFileSync(file, 'utf8');
      for (const ch of [P0, P1, P4, PF]) assert(html.includes(ch), `HTML kehilangan U+${ch.charCodeAt(0).toString(16)}`);
      assert(!/<script/i.test(html), 'HTML mandiri memuat skrip');
      assert(s.source === src.replace(/^﻿/, '') || s.source === src, 'sumber berubah');
      await p.close();
      return { htmlBytes: statSync(file).size, sourcePreserved: true, explicitGlyphDecision: review };
    },
  },
  {
    id: 'E05', matrix: ['ST-QA-16', 'ST-QA-17', 'MESIN-30..32'], title: 'HTML mandiri/ZIP/publikasi: dibuka luring tanpa jaringan pada 320/390/768/1440',
    async run(ctx) {
      const p = await studio(ctx);
      const dl = await downloads(p);
      await p.click('#empty-state [data-action=sample]');
      await ctx.waitReady(p);
      const out = {};
      for (const kind of ['html-standalone', 'html-zip', 'html-publication']) {
        await openPublish(p, kind);
        await p.click('#pub-go');
        const r = await publishResult(p);
        assert(/banner-ok/.test(r.cls), `${kind} gagal: ${r.text}`);
        await closePublish(p);
      }
      for (let i = 0; i < 100 && dl.list().filter((f) => f.endsWith('.zip')).length < 2; i++) await ctx.sleep(150);
      const files = dl.list();
      const htmlFile = join(dl.dir, files.find((f) => f.endsWith('.html')));
      const zips = files.filter((f) => f.endsWith('.zip')).map((f) => join(dl.dir, f));
      assert(zips.length === 2, 'ZIP tidak lengkap: ' + files.join(','));
      // buka HTML mandiri via file:// dengan seluruh jaringan diblokir
      const v = await ctx.env.browser.newPage();
      await v.setRequestInterception(true);
      const blocked = [];
      v.on('request', (r) => { if (/^(file|data|blob):/.test(r.url())) r.continue(); else { blocked.push(r.url()); r.abort(); } });
      for (const w of [320, 390, 768, 1440]) {
        await v.setViewport({ width: w, height: 800 });
        await v.goto('file://' + htmlFile, { waitUntil: 'load' });
        const m = await v.evaluate(() => ({ overflow: document.documentElement.scrollWidth - window.innerWidth, h1: document.querySelector('h1')?.textContent, fonts: [...document.fonts].filter((f) => f.status === 'loaded').length }));
        out[`standalone_${w}`] = m;
        assert(m.overflow <= 1, `overflow horizontal ${m.overflow}px pada ${w}px`);
      }
      assert(!blocked.length, 'HTML mandiri meminta jaringan: ' + blocked.join(','));
      // ZIP: ekstrak aman dan buka index.html via file://
      for (const z of zips) {
        const entries = unzipSync(readFileSync(z));
        const names = Object.keys(entries);
        assert(names.every((n) => !n.startsWith('/') && !n.includes('..')), 'path ZIP tidak aman');
        const man = JSON.parse(strFromU8(entries['manifest.json']));
        const dir = mkdtempSync(join(tmpdir(), 'pf-zip-'));
        for (const [n, b] of Object.entries(entries)) { const f = join(dir, n); execFileSync('mkdir', ['-p', join(f, '..')]); writeFileSync(f, b); }
        await v.setViewport({ width: 390, height: 800 });
        await v.goto('file://' + join(dir, 'index.html'), { waitUntil: 'load' });
        const m = await v.evaluate(() => ({ overflow: document.documentElement.scrollWidth - window.innerWidth, scripts: document.scripts.length, fonts: [...document.fonts].filter((f) => f.status === 'loaded').length }));
        out[z.split('/').pop()] = { files: names.length, manifestFiles: man.files.length, kind: man.kind ?? man.manifest?.kind, ...m };
        assert(m.overflow <= 1, 'ZIP overflow horizontal');
      }
      assert(!blocked.length, 'ZIP meminta jaringan: ' + blocked.join(','));
      await v.close(); await p.close();
      return out;
    },
  },
  {
    id: 'E06', matrix: ['ST-QA-44', 'QA-01', 'ST-QA-58', 'ST-QA-18'], title: 'Font gagal: ekspor HTML ditolak di dalam dialog, tidak ada unduhan',
    async run(ctx) {
      const p = await ctx.page(ctx.env, { lang: 'id' });
      await p.setRequestInterception(true);
      p.on('request', (r) => (/\.woff2(\?|$)/.test(r.url()) ? r.abort('failed') : r.continue()));
      await ctx.openStudio(p, ctx.env.base);
      const dl = await downloads(p);
      await loadSource(ctx, p, '# Judul\n\nIsi **tebal** dan $x^2$.\n');
      const s = await ctx.state(p);
      assert(s.issues.some((i) => i.code === 'FONT_LOAD_FAILED' && i.blocking), 'FONT_LOAD_FAILED tidak muncul di Pemeriksaan');
      assert(s.reports.html === 'fix', 'HTML seharusnya perlu diperbaiki: ' + s.reports.html);
      await openPublish(p, 'html-standalone');
      const gate = await p.$eval('#publish-gate', (g) => ({ hidden: g.hidden, text: g.textContent }));
      const goDisabled = await p.$eval('#pub-go', (b) => b.disabled);
      assert(!gate.hidden && /FONT_LOAD_FAILED/.test(gate.text), 'gerbang diblokir tidak tampil di dialog');
      assert(goDisabled, 'tombol buat hasil tidak dinonaktifkan');
      await ctx.sleep(500);
      assert(!dl.list().length, 'ada unduhan padahal diblokir');
      // Escape menutup dialog bila tidak ada proses berjalan; UI tidak macet
      await p.keyboard.press('Escape');
      const open = await p.$eval('#dlg-publish', (d) => d.open);
      assert(!open, 'dialog tidak tertutup dengan Escape saat idle');
      await p.close();
      return { gate: gate.text.slice(0, 160), downloads: 0 };
    },
  },
  {
    id: 'E07', matrix: ['ST-QA-19', 'EN-005', 'MESIN-33', 'ST-QA-35'], title: 'Cetak: halaman disiapkan & diverifikasi, dialog diminta, frame tidak dibuang dengan timer',
    async run(ctx) {
      const p = await studio(ctx);
      await p.click('#empty-state [data-action=sample]');
      await ctx.waitReady(p);
      await openPublish(p, 'print');
      const help = await p.$eval('#print-help', (d) => !d.hidden && d.open);
      await p.click('#pub-go');
      const r = await publishResult(p);
      assert(/banner-ok/.test(r.cls) && /SHA-256 HTML terpaginasi/.test(r.text), 'cetak tidak siap: ' + r.text);
      assert(!/PDF (berhasil|telah) (dibuat|disimpan)|PDF tersimpan|PDF saved|PDF created/i.test(r.text), 'klaim PDF dibuat/disimpan');
      const s1 = await ctx.state(p);
      assert(s1.print === 'prepared', 'status sesi: ' + s1.print);
      await p.evaluate(() => document.querySelector('#publish-result .btn-primary').click());
      await ctx.sleep(3000);
      const s2 = await ctx.state(p);
      const frames = await p.$$eval('iframe', (f) => f.filter((x) => (x.getAttribute('src') || '').includes('print.html')).length);
      const stateText = await p.$eval('.print-state', (e) => e.textContent);
      assert(['dialog-requested', 'returned', 'unknown'].includes(s2.print), 'lifecycle tidak tercatat: ' + s2.print);
      assert(frames >= 1, 'frame cetak dibuang');
      await closePublish(p);
      await ctx.sleep(300);
      const s3 = await ctx.state(p);
      await p.close();
      return { printHelpOpen: help, lifecycleAfterPrint: s2.print, stateText, framesKept: frames, afterClose: s3.print, note: 'Chrome headless: dialog native tidak tampil; hanya status yang teramati dicatat.' };
    },
  },
  {
    id: 'E08', matrix: ['ST-QA-58', 'UI-04', 'ST-QA-18'], title: 'Batalkan/Escape saat persiapan cetak dokumen panjang: status dibatalkan di dalam dialog, retry berjalan',
    async run(ctx) {
      const p = await studio(ctx);
      await loadSource(ctx, p, generateStress(30));
      await openPublish(p, 'print');
      await p.click('#pub-go');
      await p.waitForFunction(() => !document.querySelector('#publish-progress').hidden, { timeout: 10000 });
      await ctx.sleep(200);
      await p.keyboard.press('Escape');
      const r = await publishResult(p, 60000);
      const open = await p.$eval('#dlg-publish', (d) => d.open);
      assert(open, 'dialog tertutup saat proses dibatalkan');
      assert(/dibatalkan|cancelled/i.test(r.text), 'status batal tidak tampil: ' + r.text);
      const s = await ctx.state(p);
      assert(s.print === null, 'sesi cetak tertinggal setelah batal');
      // retry
      const retry = await p.$('#publish-result button');
      await retry.click();
      const r2 = await publishResult(p, 240000);
      assert(/banner-ok/.test(r2.cls), 'retry gagal: ' + r2.text);
      const s2 = await ctx.state(p);
      await p.close();
      return { cancelled: r.text.slice(0, 120), retryPages: s2.layout.pages, verification: s2.layout.verification?.status };
    },
  },
  {
    id: 'E09', matrix: ['ST-QA-60', 'UI-06'], title: 'Undo/Redo transaksi proyek: teks → templat → margin → brand → gambar',
    async run(ctx) {
      const p = await studio(ctx);
      await loadSource(ctx, p, '# Awal\n\nTeks.\n');
      await ctx.sleep(1300);
      await loadSource(ctx, p, '# Awal\n\nTeks diubah.\n');
      await ctx.sleep(1300);
      await p.click('#t-settings');
      await p.click('.goal[data-tpl=EDU-01]');
      await ctx.waitReady(p);
      await p.evaluate(() => { document.querySelector('#adv').open = true; });
      await p.$eval('#m-top', (i) => { i.value = '37'; i.dispatchEvent(new Event('change', { bubbles: true })); });
      await ctx.waitReady(p);
      await p.type('#b-name', 'Merek Uji');
      await p.click('#brand-editor .btn-primary');
      await ctx.waitReady(p);
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
      const f = join(mkdtempSync(join(tmpdir(), 'pf-img-')), 'titik.png'); writeFileSync(f, png);
      const input = await p.$('#file-assets'); await input.uploadFile(f);
      await p.waitForFunction(() => window.__pf.state().assets.length === 1, { timeout: 20000 });
      await ctx.waitReady(p);
      const sig = async () => { const s = await ctx.state(p); return [s.source.includes('diubah'), s.settings.template, s.settings.margins.top, s.brandKit?.name ?? null, s.assets.length]; };
      const seq = [await sig()];
      for (let i = 0; i < 5; i++) { await p.click('#btn-undo'); await ctx.waitReady(p); seq.push(await sig()); }
      const redo = [];
      for (let i = 0; i < 5; i++) { await p.click('#btn-redo'); await ctx.waitReady(p); redo.push(await sig()); }
      assert(JSON.stringify(seq[0]) === JSON.stringify([true, 'EDU-01', 37, 'Merek Uji', 1]), 'keadaan akhir salah ' + JSON.stringify(seq[0]));
      assert(seq[1][4] === 1 && seq[1][3] === 'Merek Uji', 'undo gambar: aset dipertahankan (tanpa rujukan) agar byte tidak hilang');
      assert(seq[2][3] === null, 'undo brand gagal');
      assert(seq[3][2] !== 37, 'undo margin gagal');
      assert(seq[4][1] !== 'EDU-01', 'undo templat gagal');
      assert(seq[5][0] === false, 'undo teks gagal');
      assert(JSON.stringify(redo[4]) === JSON.stringify(seq[0]), 'redo tidak kembali ke akhir: ' + JSON.stringify(redo[4]));
      // pemulihan revisi persisten (riwayat): seluruh keadaan
      await p.click('#src-menu-btn'); await p.click('#src-menu [data-action=history]');
      await p.waitForSelector('#dlg-history[open]');
      const count = await p.$eval('#history-count', (e) => e.textContent);
      await p.close();
      return { undoSequence: seq, redoEnd: redo[4], historyCount: count };
    },
  },
  {
    id: 'E10', matrix: ['ST-QA-59', 'ST-QA-53', 'UI-05'], title: 'Draf brand kit bertahan saat ID→EN→ID dan ganti tema; isi dokumen tidak berubah',
    async run(ctx) {
      const p = await studio(ctx);
      await loadSource(ctx, p, '# Dok\n\nIsi.\n');
      const h0 = (await ctx.state(p)).view.hash;
      await p.click('#t-settings');
      await p.evaluate(() => { document.querySelector('#adv').open = true; });
      await p.type('#b-name', 'Draf Merek');
      await p.type('#b-org', 'Lembaga X');
      await p.click('#src-menu-btn');
      await p.select('#pref-lang-w', 'en');
      await p.select('#pref-theme-w', 'dark');
      await p.select('#pref-lang-w', 'id');
      const v = await p.evaluate(() => ({ name: document.querySelector('#b-name').value, org: document.querySelector('#b-org').value, note: !document.querySelector('#brand-editor .banner').hidden, theme: document.documentElement.dataset.theme, title: document.title }));
      const s = await ctx.state(p);
      assert(v.name === 'Draf Merek' && v.org === 'Lembaga X', 'draf hilang: ' + JSON.stringify(v));
      assert(v.note, 'penanda draf belum disimpan tidak tampil');
      assert(s.view.hash === h0, 'hash render berubah hanya karena bahasa/tema');
      assert(s.brandKit === null, 'draf tersimpan tanpa Save');
      await p.close();
      return v;
    },
  },
  {
    id: 'E11', matrix: ['ST-QA-61', 'UI-07', 'ST-QA-06'], title: 'Tempel rich HTML lalu edit: HTML lama tidak dipakai; kalimat baru tidak hilang',
    async run(ctx) {
      const p = await studio(ctx);
      await p.click('#empty-state [data-action=paste]');
      await p.waitForSelector('#dlg-paste[open]');
      await p.focus('#paste-area');
      await p.evaluate(() => {
        const ta = document.querySelector('#paste-area');
        const dt = new DataTransfer(); dt.setData('text/plain', 'Judul\nParagraf lama.'); dt.setData('text/html', '<h1>Judul</h1><p>Paragraf <b>lama</b>.</p>');
        ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
        ta.value = 'Judul\nParagraf lama.'; ta.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await ctx.sleep(50);
      const fresh = await p.$eval('input[name=paste-repr][value=markdown]', (i) => !i.disabled);
      await p.evaluate(() => { const ta = document.querySelector('#paste-area'); ta.value += '\nKalimat baru ditambahkan.'; ta.dispatchEvent(new Event('input', { bubbles: true })); });
      const stale = await p.evaluate(() => ({ disabled: document.querySelector('input[name=paste-repr][value=markdown]').disabled, plain: document.querySelector('input[name=paste-repr][value=plain]').checked, msg: document.querySelector('#paste-rich-msg').textContent }));
      await p.click('#paste-ok');
      await ctx.waitReady(p);
      const s = await ctx.state(p);
      assert(fresh, 'opsi konversi tidak aktif untuk HTML yang masih sepadan');
      assert(stale.disabled && stale.plain, 'HTML basi masih dapat dipakai');
      assert(s.source.includes('Kalimat baru ditambahkan.'), 'kalimat baru hilang: ' + s.source);
      await p.close();
      return { staleMessage: stale.msg, source: s.source };
    },
  },
  {
    id: 'E12', matrix: ['ST-QA-61', 'ST-QA-10', 'ST-QA-21', 'UI-07'], title: 'Satu pintu Buka berkas: MD, ZIP, PNG, .pfproj, PDF/DOCX ditolak dengan pesan spesifik',
    async run(ctx) {
      const p = await studio(ctx);
      const dl = await downloads(p);
      const dir = mkdtempSync(join(tmpdir(), 'pf-open-'));
      const md = join(dir, 'catatan.md'); writeFileSync(md, '# Catatan\n\n![g](img/titik.png)\n\nIsi.\n');
      const { zipSync, strToU8 } = await import('fflate');
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
      const zip = join(dir, 'paket.zip'); writeFileSync(zip, zipSync({ 'doc/utama.md': strToU8('# Dari ZIP\n\n![g](img/titik%20satu.png)\n'), 'doc/img/titik satu.png': new Uint8Array(png), 'doc/catatan.exe': strToU8('x') }));
      const pdf = join(dir, 'x.pdf'); writeFileSync(pdf, '%PDF-1.4');
      const docx = join(dir, 'x.docx'); writeFileSync(docx, 'PK');
      const input = await p.$('#file-open');
      await input.uploadFile(md); await ctx.waitReady(p);
      const a = await ctx.state(p);
      assert(a.source.startsWith('# Catatan'), 'MD tidak dibuka');
      await input.uploadFile(zip);
      await p.waitForSelector('#dlg-confirm[open]');
      await p.select('#zip-pick', '0');
      await p.click('#dlg-confirm button[value=ok]');
      await p.waitForFunction(() => window.__pf.state().source.startsWith('# Dari ZIP'), { timeout: 20000 });
      await ctx.waitReady(p);
      const b = await ctx.state(p);
      assert(b.assets.some((x) => x.path.includes('titik satu.png')), 'aset ZIP tidak diimpor');
      const live = await p.evaluate(() => [...document.querySelector('#live-frame').contentDocument.images].map((i) => i.naturalWidth));
      assert(live.length && live.every((w) => w > 0), 'gambar ZIP tidak tampil di pratinjau');
      await input.uploadFile(pdf, docx);
      await ctx.sleep(300);
      const notes = await p.$$eval('#notices .notice', (n) => n.map((x) => x.textContent));
      assert(notes.some((t) => /impor PDF belum didukung/.test(t)) && notes.some((t) => /DOCX\/ODT\/RTF belum didukung/.test(t)), 'pesan penolakan spesifik tidak ada');
      // simpan paket kerja lalu buka lagi lewat pintu yang sama
      await p.click('#src-menu-btn'); await p.click('#src-menu [data-action=save-bundle]');
      const bundle = await dl.wait('.pfproj');
      const save = await ctx.state(p);
      assert(save.save === 'bundle', 'status simpan bukan "cadangan diminta": ' + save.save);
      await p.evaluate(() => { const ed = document.querySelector('#editor'); ed.value = 'diganti'; ed.dispatchEvent(new Event('input', { bubbles: true })); });
      await ctx.waitReady(p);
      await input.uploadFile(bundle);
      await p.waitForSelector('#dlg-choice[open]');
      await p.click('#dlg-choice button[value=discard]');
      await p.waitForFunction(() => window.__pf.state().source.startsWith('# Dari ZIP'), { timeout: 20000 });
      const c = await ctx.state(p);
      assert(c.assets.length === b.assets.length, 'aset .pfproj tidak pulih');
      await p.close();
      return { zipAssets: b.assets.map((x) => x.path), rejected: notes.filter((t) => /belum didukung/.test(t)).length, bundleBytes: statSync(bundle).size };
    },
  },
  {
    id: 'E13', matrix: ['ST-QA-62', 'UI-08'], title: '> 300 temuan dapat dijelajah sampai akhir; > 20 revisi dapat dipulihkan',
    async run(ctx) {
      const p = await studio(ctx);
      const lines = ['# Banyak tautan rusak', ''];
      for (let i = 1; i <= 340; i++) lines.push(`Tautan [${i}](#tidak-ada-${i}).`, '');
      await loadSource(ctx, p, lines.join('\n'));
      await p.click('#t-checks');
      const total = await p.$eval('#issue-count', (e) => e.textContent);
      const m = /dari (\d+)/.exec(total);
      assert(m && Number(m[1]) >= 340, 'jumlah temuan: ' + total);
      let pages = 1;
      while (!(await p.$eval('#issue-next', (b) => b.disabled))) { await p.click('#issue-next'); pages++; }
      const last = await p.$eval('#issue-count', (e) => e.textContent);
      const lastItem = await p.$$eval('#issue-list .issue', (l) => l.at(-1)?.textContent ?? '');
      assert(/tidak-ada-340/.test(lastItem) || /340/.test(last), 'temuan terakhir tidak terjangkau: ' + lastItem);
      // filter + cari
      await p.type('#check-q', 'tidak-ada-339');
      await ctx.sleep(300);
      const found = await p.$$eval('#issue-list .issue', (l) => l.length);
      assert(found === 1, 'pencarian tidak tepat: ' + found);
      // > 20 revisi
      for (let i = 0; i < 26; i++) await p.evaluate((i) => { const ed = document.querySelector('#editor'); ed.value = `# Rev ${i}\n`; ed.dispatchEvent(new Event('input', { bubbles: true })); }, i);
      await ctx.waitReady(p);
      await p.click('#src-menu-btn'); await p.click('#src-menu [data-action=history]');
      await p.waitForSelector('#dlg-history[open]');
      let hp = 1;
      while (!(await p.$eval('#history-next', (b) => b.disabled))) { await p.click('#history-next'); hp++; }
      const oldestText = await p.$$eval('#history-list li', (l) => l.at(-1).textContent);
      const btns = await p.$$('#history-list li button');
      await btns.at(-1).click();
      await ctx.waitReady(p);
      const s = await ctx.state(p);
      assert(s.source.startsWith('# Banyak tautan rusak') || s.source === '', 'revisi awal tidak dipulihkan: ' + s.source.slice(0, 40));
      await p.close();
      return { issueTotal: Number(m[1]), issuePages: pages, lastPage: last, historyPages: hp, oldest: oldestText.slice(0, 80) };
    },
  },
  {
    id: 'E14', matrix: ['ST-QA-55', 'ST-QA-36', 'UI-01', 'ST-QA-28(viewport)'], title: 'Status simpan terlihat di 360 px; penjaga tutup halaman untuk perubahan belum tersimpan; autosave IndexedDB',
    async run(ctx) {
      await wipeStorage(ctx);
      const p = await studio(ctx, { width: 360, height: 740 });
      const vis = async () => p.$eval('#save-status', (b) => { const r = b.getBoundingClientRect(); return { state: b.dataset.state, text: b.textContent.trim(), visible: r.width > 0 && r.right <= window.innerWidth + 1 }; });
      const empty = await vis();
      await loadSource(ctx, p, '# Belum disimpan\n');
      const off = await vis();
      assert(off.state === 'off' && off.visible, 'status belum disimpan tidak terlihat di 360 px: ' + JSON.stringify(off));
      // keyboard: tombol status dapat difokus dan membuka dialog penyimpanan
      await p.focus('#save-status'); await p.keyboard.press('Enter');
      await p.waitForSelector('#dlg-projects[open]');
      await p.click('#opt-localsave');
      await p.waitForFunction(() => window.__pf.state().save === 'saved', { timeout: 15000 });
      const saved = await vis();
      await p.keyboard.press('Escape');
      await p.evaluate(() => { const ed = document.querySelector('#editor'); ed.value += 'x'; ed.dispatchEvent(new Event('input', { bubbles: true })); });
      const pending = (await ctx.state(p)).save;
      await p.waitForFunction(() => window.__pf.state().save === 'saved', { timeout: 15000 });
      // matikan penyimpanan, ubah → kotor → beforeunload muncul
      await p.click('#save-status'); await p.waitForSelector('#dlg-projects[open]'); await p.click('#opt-localsave'); await p.keyboard.press('Escape');
      await p.evaluate(() => { const ed = document.querySelector('#editor'); ed.value += 'y'; ed.dispatchEvent(new Event('input', { bubbles: true })); });
      let dialog = null;
      p.on('dialog', async (d) => { dialog = d.type(); await d.dismiss(); });
      await p.close({ runBeforeUnload: true });
      await ctx.sleep(800);
      assert(dialog === 'beforeunload', 'beforeunload tidak dipicu untuk perubahan belum tersimpan');
      // reload tab baru: tawaran lanjutkan proyek terakhir dari IndexedDB
      const q = await ctx.page(ctx.env, { lang: 'id' });
      await ctx.openStudio(q, ctx.env.base);
      // penyimpanan otomatis tadi dimatikan → tidak ada tawaran; aktifkan lagi lalu muat ulang (proyek rev tersimpan tetap ada)
      await q.evaluate(() => localStorage.setItem('pf.store.enabled', '1'));
      await q.reload({ waitUntil: 'load' }); await q.waitForFunction(() => !!window.__pf);
      await ctx.sleep(800);
      const notice = await q.$$eval('#notices .notice', (n) => n.map((x) => x.textContent).join(' | '));
      assert(/Proyek terakhir/.test(notice), 'tidak ada tawaran pemulihan: ' + notice);
      await q.close();
      await wipeStorage(ctx);
      return { empty, off, saved, pendingObserved: pending, beforeunload: dialog, recovery: notice.slice(0, 120) };
    },
  },
  {
    id: 'E15', matrix: ['ST-QA-22', 'UI-01'], title: 'Dua tab mengubah proyek yang sama: konflik dilaporkan, bukan ditimpa diam-diam',
    async run(ctx) {
      await wipeStorage(ctx);
      const a = await studio(ctx);
      await a.evaluate(() => localStorage.setItem('pf.store.enabled', '1'));
      await a.reload({ waitUntil: 'load' }); await a.waitForFunction(() => !!window.__pf);
      await loadSource(ctx, a, '# Bersama\n\nVersi A.\n');
      await a.waitForFunction(() => window.__pf.state().save === 'saved', { timeout: 15000 });
      const b = await studio(ctx);
      await b.waitForSelector('#notices .notice button');
      await b.evaluate(() => [...document.querySelectorAll('#notices .notice button')].find((x) => /Lanjutkan/.test(x.textContent)).click());
      await b.waitForFunction(() => window.__pf.state().source.includes('Versi A'), { timeout: 15000 });
      await ctx.setSource(b, '# Bersama\n\nVersi B.\n');
      await ctx.sleep(1200); await terminalSave(b);
      const sb = (await ctx.state(b)).save;
      await ctx.setSource(a, '# Bersama\n\nVersi A2.\n');
      await ctx.sleep(1200); await terminalSave(a);
      const sa = await ctx.state(a);
      const label = await a.$eval('#save-status', (x) => x.textContent);
      await a.close(); await b.close();
      await wipeStorage(ctx);
      assert(sb === 'saved', 'tab B tidak tersimpan: ' + sb);
      assert(sa.save === 'conflict', 'konflik dua tab tidak dilaporkan: ' + sa.save);
      return { tabB: sb, tabA: sa.save, label };
    },
  },
  {
    id: 'E16', matrix: ['ST-QA-33', 'EN-011'], title: 'Tempel percakapan HTML yang hanya menyebut atribut: pesan tetap dikenali',
    async run(ctx) {
      const p = await studio(ctx);
      await p.click('#empty-state [data-action=paste-conv]');
      await p.waitForSelector('#dlg-paste[open]');
      await p.focus('#paste-area');
      const plain = 'Pengguna: Apa arti data-message-author-role?\nAsisten: Itu atribut HTML.';
      await p.evaluate((plain) => {
        const ta = document.querySelector('#paste-area');
        const dt = new DataTransfer(); dt.setData('text/plain', plain); dt.setData('text/html', '<p>Pengguna: Apa arti <code>data-message-author-role</code>?</p><p>Asisten: Itu atribut HTML.</p>');
        ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
        ta.value = plain; ta.dispatchEvent(new Event('input', { bubbles: true }));
      }, plain);
      await p.click('#paste-ok');
      await p.waitForFunction(() => document.querySelectorAll('#conv-panel .msg').length > 0, { timeout: 15000 });
      const n = await p.$$eval('#conv-panel .msg', (l) => l.length);
      assert(n >= 2, 'pesan dikenali: ' + n);
      await p.close();
      return { messages: n };
    },
  },
  {
    id: 'E17', matrix: ['ST-QA-27'], title: 'Aksesibilitas otomatis (axe-core) beranda, studio, dialog ekspor; navigasi keyboard dasar',
    async run(ctx) {
      const axe = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
      const p = await ctx.page(ctx.env, { lang: 'id' });
      const res = {};
      const audit = async (name) => {
        await p.evaluate(axe);
        const r = await p.evaluate(async () => { const out = await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'], resultTypes: ['violations'] }); return out.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, sample: v.nodes[0]?.target?.join(' ') })); });
        res[name] = r;
      };
      await p.goto(ctx.env.base + '/', { waitUntil: 'load' }); await p.waitForFunction(() => !!window.__pf);
      await audit('landing');
      await ctx.openStudio(p, ctx.env.base);
      await p.click('#empty-state [data-action=sample]'); await ctx.waitReady(p);
      await audit('studio');
      await openPublish(p, 'print');
      await audit('publishDialog');
      await p.keyboard.press('Escape');
      // skip link dan fokus kembali setelah dialog
      const focusBack = await p.evaluate(() => document.activeElement?.getAttribute('data-action'));
      await p.close();
      const all = Object.values(res).flat();
      assert(!all.length, 'pelanggaran axe WCAG 2 A/AA: ' + JSON.stringify(all));
      return { violations: res, focusReturnedTo: focusBack };
    },
  },
  {
    id: 'E18', matrix: ['ST-QA-52', 'ST-QA-03'], title: 'Kanari privasi: isi dokumen tidak keluar lewat URL, jaringan, atau konsol',
    async run(ctx) {
      const p = await studio(ctx);
      const canary = 'KANARI-7f3a9c-RAHASIA';
      const consoleAll = [];
      p.on('console', (m) => consoleAll.push(m.text()));
      await loadSource(ctx, p, `# ${canary}\n\nIsi ${canary}.\n`);
      await p.click('#t-checks'); await p.click('#p-checks .layout-btn');
      await p.waitForFunction(() => ['done', 'failed'].includes(window.__pf.state().layout.status), { timeout: 120000 });
      await openPublish(p, 'html-standalone'); await p.click('#pub-go'); await publishResult(p);
      const leaks = p.log.requests.filter((u) => u.includes(canary));
      assert(!leaks.length, 'kanari di URL: ' + leaks.join(','));
      assert(!p.log.external.length, 'permintaan eksternal: ' + p.log.external.join(','));
      assert(!consoleAll.some((t) => t.includes(canary)), 'kanari di konsol');
      const nonLocal = p.log.requests.filter((u) => !u.startsWith(ctx.env.base) && !/^(data|blob|about):/.test(u));
      await p.close();
      return { requests: p.log.requests.length, nonLocal };
    },
  },
  {
    id: 'E19', matrix: ['ST-QA-25', 'EN-006', 'ST-QA-26'], title: 'Paginasi ~10/50/200 bagian: verifikasi inventaris isi lulus; waktu diukur',
    async run(ctx) {
      const out = {};
      for (const n of [3, 15, 60]) {
        const p = await studio(ctx);
        const src = generateStress(n);
        const t0 = Date.now();
        await loadSource(ctx, p, src);
        const tReady = Date.now() - t0;
        await p.click('#t-checks'); await p.click('#p-checks .layout-btn');
        await p.waitForFunction(() => ['done', 'failed'].includes(window.__pf.state().layout.status), { timeout: 600000 });
        const s = await ctx.state(p);
        const metrics = await p.evaluate(() => window.__pf.metrics());
        out[`sections_${n}`] = { bytes: Buffer.byteLength(src), msToPreview: tReady, layout: s.layout.status, pages: s.layout.pages, verification: s.layout.verification, layoutMs: metrics.filter((m) => m.phase === 'layout').at(-1)?.ms, printPayloadMs: metrics.filter((m) => m.phase === 'print-payload').at(-1)?.ms, renderMs: metrics.filter((m) => m.phase === 'render').at(-1)?.ms };
        assert(s.layout.status === 'done' && s.layout.verification.status === 'pass', `paginasi ${n} bagian: ${JSON.stringify(s.layout)}`);
        await p.close();
      }
      return out;
    },
  },
  {
    id: 'E20', matrix: ['ST-QA-19(engine)', 'ST-QA-20(N/A)'], title: 'Mesin cetak Chrome (headless printToPDF) atas HTML terpaginasi: teks dapat dicari, jumlah halaman sama',
    async run(ctx) {
      const p = await studio(ctx);
      await loadSource(ctx, p, `# Uji cetak\n\nTeks unik ALFA-0007 dengan ${P1}PUA${P4}, $5, dan $x^2$.\n\n` + generateStress(4));
      await openPublish(p, 'print'); await p.click('#pub-go');
      const r = await publishResult(p, 240000);
      assert(/banner-ok/.test(r.cls), r.text);
      const html = await p.evaluate(() => { const f = [...document.querySelectorAll('iframe')].find((x) => (x.getAttribute('src') || '').includes('print.html') && x.contentWindow.__pfPrintResult); return f?.contentWindow.__pfPrintResult?.flattenedHtml ?? null; });
      const pagesUi = (await ctx.state(p)).layout.pages;
      assert(html, 'HTML terpaginasi tidak tersedia di build QA');
      const v = await ctx.env.browser.newPage();
      await v.setContent(html, { waitUntil: 'load' });
      await v.evaluate(() => document.fonts.ready);
      const pdf = await v.pdf({ preferCSSPageSize: true, printBackground: true });
      const f = join(mkdtempSync(join(tmpdir(), 'pf-pdf-')), 'cetak.pdf'); writeFileSync(f, pdf);
      const info = execFileSync('pdfinfo', [f]).toString();
      const pages = Number(/Pages:\s+(\d+)/.exec(info)?.[1]);
      const text = execFileSync('pdftotext', ['-layout', f, '-']).toString();
      await v.close(); await p.close();
      assert(pages === pagesUi, `halaman PDF headless ${pages} ≠ paginasi ${pagesUi}`);
      assert(text.includes('ALFA-0007') && text.includes('END_SECTION_0004'), 'teks tidak dapat dicari di PDF headless');
      return { pages, pagesUi, bytes: pdf.length, textHasMarker: true, note: 'Bukti mesin cetak Chrome headless; BUKAN uji dialog cetak native, dan aplikasi tidak menghasilkan byte PDF sendiri.' };
    },
  },
  {
    id: 'E21', matrix: ['ST-QA-11', 'QA-02'], title: 'Gambar dengan header ekstrem ditolak sebelum dekode; proyek tidak berubah',
    async run(ctx) {
      const p = await studio(ctx);
      await loadSource(ctx, p, '# Gambar\n');
      const b = Buffer.alloc(33); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]).copy(b); b.writeUInt32BE(100000, 16); b.writeUInt32BE(100000, 20);
      const f = join(mkdtempSync(join(tmpdir(), 'pf-big-')), 'raksasa.png'); writeFileSync(f, b);
      const rev0 = (await ctx.state(p)).revision;
      await (await p.$('#file-open')).uploadFile(f);
      await p.waitForFunction(() => [...document.querySelectorAll('#notices .notice')].some((n) => /terlalu besar untuk didekode/.test(n.textContent)), { timeout: 10000 });
      const s = await ctx.state(p);
      assert(s.assets.length === 0 && s.revision === rev0, 'proyek berubah');
      await p.close();
      return { rejected: true, revisionUnchanged: s.revision === rev0 };
    },
  },
  {
    id: 'E22', matrix: ['ST-QA-26', 'F.1', 'F.9'], title: 'Kinerja: muat dingin studio, ketikan beruntun pada naskah ~10 halaman (debounce), waktu siap',
    async run(ctx) {
      const p = await ctx.page(ctx.env, { lang: 'id' });
      const t0 = Date.now();
      await ctx.openStudio(p, ctx.env.base);
      const cold = Date.now() - t0;
      const nav = await p.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return { dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), transfer: n.transferSize }; });
      const src = generateStress(12);
      await loadSource(ctx, p, src);
      const before = (await p.evaluate(() => window.__pf.metrics())).filter((m) => m.phase.startsWith('analyze-')).length;
      const t1 = Date.now();
      for (let i = 0; i < 20; i++) { await p.evaluate((i) => { const ed = document.querySelector('#editor'); ed.value += ` k${i}`; ed.dispatchEvent(new Event('input', { bubbles: true })); }, i); await ctx.sleep(40); }
      await ctx.waitReady(p, 60000);
      const typingToReady = Date.now() - t1;
      const m = await p.evaluate(() => window.__pf.metrics());
      const renders = m.filter((x) => x.phase.startsWith('analyze-')).length - before;
      const last = (ph) => m.filter((x) => x.phase === ph).at(-1)?.ms;
      await p.close();
      assert(renders <= 3, `render per 20 ketikan = ${renders} (debounce tidak bekerja)`);
      return { coldStudioMs: cold, nav, sourceBytes: Buffer.byteLength(src), rendersFor20Keystrokes: renders, typingToReadyMs: typingToReady, lastAnalyzeMs: last('analyze-worker'), lastFinishMs: last('finish'), lastComposeMs: last('compose'), lastIntegrityMs: last('integrity'), env: 'Chrome headless Linux container (bukan perangkat referensi)' };
    },
  },
  {
    id: 'E23', matrix: ['ST-QA-07', 'ST-QA-08'], title: 'Masukan berbahaya (script, on*, iframe, javascript:, SVG/Mermaid) tidak dieksekusi di pratinjau maupun ekspor',
    async run(ctx) {
      const p = await studio(ctx);
      const dl = await downloads(p);
      let dialogs = 0; p.on('dialog', async (d) => { dialogs++; await d.dismiss(); });
      const src = ['# XSS', '', '<script>alert(1)</script>', '<img src=x onerror="alert(2)">', '<iframe src="javascript:alert(3)"></iframe>', '[klik](javascript:alert(4))', '<a href="data:text/html,<script>alert(5)</script>">d</a>', '<form action="https://evil.example"><input name=q></form>', '<style>body{background:url(https://evil.example/x)}</style>',
        '', '```mermaid', 'graph TD; A-->B; click A "javascript:alert(6)"', '```', '', '<svg><foreignObject><script>alert(7)</script></foreignObject></svg>', '', 'Teks aman.'].join('\n');
      await loadSource(ctx, p, src);
      await ctx.sleep(800);
      const live = await p.evaluate(() => { const d = document.querySelector('#live-frame').contentDocument; return { scripts: d.querySelectorAll('script').length, handlers: [...d.querySelectorAll('*')].filter((e) => [...e.attributes].some((a) => /^on/i.test(a.name))).length, js: [...d.querySelectorAll('[href],[src]')].filter((e) => /^\s*(javascript|data:text\/html)/i.test(e.getAttribute('href') || e.getAttribute('src') || '')).length, iframes: d.querySelectorAll('iframe').length, forms: d.querySelectorAll('form').length }; });
      await openPublish(p, 'html-standalone');
      const gate = await p.evaluate(() => ({ hidden: document.querySelector('#publish-gate').hidden, text: document.querySelector('#publish-gate').textContent, go: document.querySelector('#pub-go').disabled }));
      if (!gate.hidden && /pub-ack|meninjau/.test(await p.$eval('#publish-gate', (g) => g.innerHTML))) { await p.click('#pub-ack'); }
      let r = { cls: '', text: 'gate: ' + gate.text.slice(0, 200) };
      if (!(await p.$eval('#pub-go', (b) => b.disabled))) { await p.click('#pub-go'); r = await publishResult(p); }
      if (/perlu keputusan/.test(r.text)) { await p.click('#pub-review-ack'); await p.evaluate(() => [...document.querySelectorAll('#publish-result button')].find((b) => /Unduh dengan catatan/.test(b.textContent)).click()); r = await publishResult(p); }
      let exported = null;
      if (/banner-ok/.test(r.cls)) { const f = await dl.wait('.html'); const h = readFileSync(f, 'utf8'); exported = { scripts: (h.match(/<script/gi) || []).length, onAttr: /\son[a-z]+=/i.test(h.replace(/<pre[\s\S]*?<\/pre>/g, '')), jsUrl: /href="javascript:/i.test(h), evil: /src="https:\/\/evil/.test(h) }; }
      assert(!p.log.external.some((u) => u.includes('evil.example')), 'permintaan ke domain berbahaya');
      await p.close();
      assert(dialogs === 0, 'dialog alert tereksekusi');
      assert(live.scripts === 0 && live.handlers === 0 && live.js === 0 && live.iframes === 0 && live.forms === 0, 'elemen aktif lolos: ' + JSON.stringify(live));
      if (exported) assert(!exported.scripts && !exported.onAttr && !exported.jsUrl && !exported.evil, 'ekspor memuat elemen aktif: ' + JSON.stringify(exported));
      return { live, exported, exportResult: r.text.slice(0, 80), dialogs };
    },
  },
  {
    id: 'E24', matrix: ['ST-QA-34', 'MESIN-05'], title: 'Percakapan: pilih pesan 2/4/6, transkrip, bangun dokumen, simpan paket lalu buka ulang',
    async run(ctx) {
      const p = await studio(ctx);
      const dl = await downloads(p);
      const conv = [1, 2, 3, 4, 5, 6].map((i) => `${i % 2 ? 'Pengguna' : 'Asisten'}: Pesan nomor ${i}.`).join('\n\n');
      await p.click('#empty-state [data-action=paste-conv]');
      await p.waitForSelector('#dlg-paste[open]');
      await p.evaluate((t) => { const ta = document.querySelector('#paste-area'); ta.value = t; ta.dispatchEvent(new Event('input', { bubbles: true })); }, conv);
      await p.click('#paste-ok');
      await p.waitForFunction(() => document.querySelectorAll('#conv-panel .msg').length === 6, { timeout: 15000 });
      // kosongkan semua lalu pilih 2/4/6
      const setSel = async (want) => {
        for (let i = 0; i < 6; i++) {
          const checked = await p.$eval(`#conv-panel .msg:nth-child(${i + 1}) input[type=checkbox]`, (c) => c.checked);
          if (checked !== want.includes(i + 1)) { await p.click(`#conv-panel .msg:nth-child(${i + 1}) input[type=checkbox]`); await p.waitForFunction((n, v) => document.querySelector(`#conv-panel .msg:nth-child(${n}) input[type=checkbox]`)?.checked === v, {}, i + 1, want.includes(i + 1)); }
        }
      };
      await setSel([2, 4, 6]);
      await p.select('#conv-mode', 'transcript');
      await p.waitForFunction(() => document.querySelector('#conv-mode')?.value === 'transcript');
      await p.evaluate(() => [...document.querySelectorAll('#conv-panel button')].find((b) => /Buat dokumen|Build document/.test(b.textContent)).click());
      const confirm = await p.$('#dlg-confirm[open]'); if (confirm) await p.click('#dlg-confirm button[value=ok]');
      await p.waitForFunction(() => /Pesan nomor 6/.test(window.__pf.state().source), { timeout: 15000 });
      await ctx.waitReady(p);
      const s = await ctx.state(p);
      assert(/Pesan nomor 2/.test(s.source) && /Pesan nomor 4/.test(s.source) && !/Pesan nomor 3/.test(s.source), 'pilihan tidak diterapkan: ' + s.source.slice(0, 200));
      await p.click('#src-menu-btn'); await p.click('#src-menu [data-action=save-bundle]');
      const bundle = await dl.wait('.pfproj');
      const q = await studio(ctx);
      await (await q.$('#file-open')).uploadFile(bundle);
      await q.waitForFunction(() => /Pesan nomor 6/.test(window.__pf.state().source), { timeout: 20000 });
      const msgs = await q.$$eval('#conv-panel .msg', (l) => l.length);
      await p.close(); await q.close();
      assert(msgs === 6, 'percakapan asli tidak ikut paket: ' + msgs);
      return { template: s.settings.template, selected: [2, 4, 6], reopenedMessages: msgs };
    },
  },
  {
    id: 'E25', matrix: ['MESIN-36', 'ST-QA-50', 'ST-QA-56'], title: 'Worker: edit saat analisis dokumen besar berjalan — hasil usang ditolak, pratinjau milik revisi terakhir',
    async run(ctx) {
      const p = await studio(ctx);
      const src = generateStress(320); // ±540 halaman: analisis lebih lama dari debounce → pekerjaan tumpang-tindih
      await ctx.setSource(p, src);
      // tunggu analisis Worker benar-benar berjalan, lalu edit 3x sebelum selesai
      await p.waitForFunction(() => window.__pf.engine().started >= 1 && window.__pf.state().view.status === 'processing', { timeout: 30000, polling: 20 });
      await ctx.sleep(400);
      for (let i = 1; i <= 3; i++) {
        await p.evaluate((i) => { const ed = document.querySelector('#editor'); ed.value += `\n\nPENANDA-AKHIR-${i}`; ed.dispatchEvent(new Event('input', { bubbles: true })); }, i);
        await ctx.sleep(1400); // debounce dokumen besar 1,2 s → pekerjaan baru dimulai saat yang lama masih berjalan
      }
      await ctx.waitReady(p, 180000);
      const s = await ctx.state(p);
      const e = await p.evaluate(() => window.__pf.engine());
      const live = await liveText(p);
      const integ = s.issues.filter((i) => i.scope === 'integrity' && i.severity === 'error');
      await p.close();
      assert(e.mode === 'worker', 'mode mesin bukan worker: ' + e.mode + ' ' + (e.reason ?? ''));
      assert(s.view.revision === s.revision, 'pratinjau bukan revisi terakhir');
      assert(/PENANDA-AKHIR-3/.test(live), 'pratinjau tidak memuat edit terakhir');
      assert(e.cancelled + e.staleDropped >= 1, 'tidak ada pekerjaan usang yang dibatalkan/ditolak: ' + JSON.stringify(e));
      assert(e.errors === 0 && e.timeouts === 0, 'galat mesin: ' + JSON.stringify(e));
      assert(integ.length === 0, 'temuan integritas: ' + JSON.stringify(integ.slice(0, 3)));
      return { engine: e, finalRevision: s.revision, previewHasLastEdit: true };
    },
  },
  {
    id: 'E26', matrix: ['MESIN-36', 'ST-QA-26', 'F.1'], title: 'Responsivitas: jeda maksimum event loop utama selama analisis 196 halaman (Worker vs fallback)',
    async run(ctx) {
      const measure = async (mode) => {
        await wipeStorage(ctx);
        const p = await ctx.page(ctx.env, { lang: 'id' });
        if (mode === 'main') await p.evaluateOnNewDocument(() => { try { localStorage.setItem('pf.qa.engine', 'main'); } catch {} });
        await ctx.openStudio(p, ctx.env.base);
        await p.evaluate(() => {
          window.__gap = { max: 0, last: performance.now(), on: true, lt: [] };
          const tick = () => { const n = performance.now(); const g = n - window.__gap.last; if (window.__gap.on && g > window.__gap.max) window.__gap.max = g; window.__gap.last = n; if (window.__gap.on) setTimeout(tick, 10); };
          setTimeout(tick, 10);
          new PerformanceObserver((l) => { for (const x of l.getEntries()) window.__gap.lt.push(Math.round(x.duration)); }).observe({ type: 'longtask' });
        });
        const src = generateStress(115);
        const t0 = Date.now();
        await ctx.setSource(p, src);
        // ketikan selama analisis: ukur latensi event input (antre → ditangani)
        const lat = [];
        await p.waitForFunction(() => window.__pf.state().view.status === 'processing', { timeout: 30000, polling: 20 });
        for (let i = 0; i < 5; i++) {
          lat.push(await p.evaluate(() => new Promise((res) => { const t = performance.now(); setTimeout(() => res(Math.round(performance.now() - t)), 0); })));
          await ctx.sleep(150);
        }
        await ctx.waitReady(p, 180000);
        const ready = Date.now() - t0;
        const gap = await p.evaluate(() => { window.__gap.on = false; return { max: Math.round(window.__gap.max), longtasks: window.__gap.lt.sort((a, b) => b - a).slice(0, 5) }; });
        const e = await p.evaluate(() => window.__pf.engine());
        const digest = await p.evaluate(() => window.__pf.renderedDigest());
        const s = await ctx.state(p);
        await p.close();
        return { mode: e.mode, readyMs: ready, maxEventLoopGapMs: gap.max, topLongTasksMs: gap.longtasks, timerLatencyMs: lat, digest, integrityErrors: s.issues.filter((i) => i.scope === 'integrity' && i.severity === 'error').length };
      };
      const w = await measure('worker');
      const f = await measure('main');
      await wipeStorage(ctx);
      assert(w.mode === 'worker' && f.mode === 'fallback', `mode: ${w.mode}/${f.mode}`);
      assert(w.digest.sha256 === f.digest.sha256, 'HTML hasil Worker ≠ fallback');
      assert(w.integrityErrors === 0 && f.integrityErrors === 0, 'temuan integritas');
      assert(w.maxEventLoopGapMs < f.maxEventLoopGapMs, `Worker tidak lebih responsif (${w.maxEventLoopGapMs} vs ${f.maxEventLoopGapMs})`);
      assert(w.maxEventLoopGapMs < 400, `jeda event loop dengan Worker ${w.maxEventLoopGapMs} ms ≥ 400 ms`);
      return { worker: w, fallback: f, env: 'Chrome headless Linux container (bukan perangkat referensi)' };
    },
  },
  {
    id: 'E27', matrix: ['ST-QA-27', 'ST-QA-28', 'ST-QA-53'], title: 'Keyboard saja, zoom 200 %, tema gelap (axe), layar 320 px: alur inti dapat dijalankan',
    async run(ctx) {
      const axe = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
      const out = {};
      // 1) keyboard saja: Tab sampai editor, ketik, Tab sampai tombol ekspor, Enter membuka dialog, Escape menutup, fokus kembali
      {
        const p = await studio(ctx);
        await p.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
        let tabs = 0, onEditor = false;
        for (; tabs < 60 && !onEditor; tabs++) { await p.keyboard.press('Tab'); onEditor = await p.evaluate(() => document.activeElement?.id === 'editor'); }
        assert(onEditor, 'editor tidak terjangkau dengan Tab');
        await p.keyboard.type('# Judul keyboard\n\nIsi diketik lewat papan ketik.');
        await ctx.waitReady(p);
        let onPublish = false, back = 0;
        for (; back < 60 && !onPublish; back++) { await p.keyboard.down('Shift'); await p.keyboard.press('Tab'); await p.keyboard.up('Shift'); onPublish = await p.evaluate(() => document.activeElement?.matches('.ws-actions [data-action=publish]') ?? false); }
        assert(onPublish, 'tombol ekspor tidak terjangkau dengan Shift+Tab');
        await p.keyboard.press('Enter');
        await p.waitForSelector('#dlg-publish[open]');
        const inDialog = await p.evaluate(() => !!document.activeElement?.closest('#dlg-publish'));
        await p.keyboard.press('Escape');
        await p.waitForFunction(() => !document.querySelector('#dlg-publish[open]'));
        const returned = await p.evaluate(() => document.activeElement?.matches('.ws-actions [data-action=publish]') ?? false);
        const positiveTabindex = await p.evaluate(() => [...document.querySelectorAll('[tabindex]')].filter((e) => Number(e.getAttribute('tabindex')) > 0).length);
        await p.close();
        assert(inDialog && returned, `fokus dialog: masuk=${inDialog} kembali=${returned}`);
        assert(positiveTabindex === 0, 'tabindex positif ditemukan');
        out.keyboard = { tabsToEditor: tabs, shiftTabsToExport: back, focusInDialog: inDialog, focusReturned: returned };
      }
      // 2) zoom 200 % (1366 px CSS → 683 px, DPR 2) dan 320 px: tanpa gulir horizontal, kontrol utama terlihat
      for (const [name, vp] of [['zoom200', { width: 683, height: 450, deviceScaleFactor: 2 }], ['w320', { width: 320, height: 640, deviceScaleFactor: 2 }]]) {
        const p = await ctx.page(ctx.env, { lang: 'id' });
        await p.setViewport(vp);
        await p.goto(ctx.env.base + '/', { waitUntil: 'load' });
        const landing = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        await ctx.openStudio(p, ctx.env.base);
        await p.click('#empty-state [data-action=sample]'); await ctx.waitReady(p);
        const studioX = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        const vis = () => p.evaluate(() => ['.ws-actions [data-action=publish]', '#editor'].map((q) => { const e = document.querySelector(q); const r = e?.getBoundingClientRect(); return !!r && r.width > 0 && r.height > 0; }));
        let visible = await vis();
        // layar sempit: panel dipilih lewat tab Sumber/Pratinjau/Format — editor harus muncul setelah memilih "Sumber"
        if (!visible[1]) { await p.click('[data-mtab=left]'); visible = await vis(); }
        await p.close();
        assert(landing <= 1 && studioX <= 1, `${name}: gulir horizontal ${landing}/${studioX}px`);
        assert(visible.every(Boolean), `${name}: kontrol utama tidak terlihat ${visible}`);
        out[name] = { landingOverflowPx: landing, studioOverflowPx: studioX, controlsVisible: visible };
      }
      // 3) tema gelap: axe tanpa pelanggaran di studio + dialog
      {
        const p = await ctx.page(ctx.env, { lang: 'id' });
        await p.evaluateOnNewDocument(() => { try { localStorage.setItem('pf.ui.theme', 'dark'); } catch {} });
        await ctx.openStudio(p, ctx.env.base);
        await p.click('#empty-state [data-action=sample]'); await ctx.waitReady(p);
        const run = async () => { await p.evaluate(axe); return p.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'], resultTypes: ['violations'] })).violations.map((v) => ({ id: v.id, n: v.nodes.length, sample: v.nodes[0]?.target?.join(' ') }))); };
        const studioV = await run();
        await openPublish(p, 'print');
        const dlgV = await run();
        const theme = await p.evaluate(() => document.documentElement.dataset.theme ?? document.documentElement.className);
        await p.close();
        assert(!studioV.length && !dlgV.length, 'axe tema gelap: ' + JSON.stringify([...studioV, ...dlgV]));
        out.dark = { theme, studio: studioV.length, dialog: dlgV.length };
      }
      return out;
    },
  },
  {
    id: 'E28', matrix: ['MESIN-36', 'ST-QA-43'], title: 'Worker gagal dimuat (chunk hilang setelah deploy baru): revisi pertama tetap jadi lewat fallback, banner menjelaskan',
    async run(ctx) {
      await wipeStorage(ctx);
      const p = await ctx.page(ctx.env, { lang: 'id' });
      await p.evaluateOnNewDocument(() => { try { localStorage.setItem('pf.qa.engine', 'broken'); } catch {} });
      await ctx.openStudio(p, ctx.env.base);
      await loadSource(ctx, p, readFileSync('fixtures/mixed-document.md', 'utf8'));
      const s = await ctx.state(p);
      const e = await p.evaluate(() => window.__pf.engine());
      const banner = await p.$eval('#compat-banner', (b) => ({ hidden: b.hidden, text: b.textContent }));
      const failedRevisions = (await p.evaluate(() => window.__pf.metrics())).filter((m) => m.phase === 'analyze-worker').length;
      await p.close(); await wipeStorage(ctx);
      assert(s.view.status === 'ready' && s.view.revision === s.revision, 'revisi tidak selesai');
      assert(e.mode === 'fallback' && /worker-load-failed/.test(e.reason ?? ''), 'mode/alasan: ' + JSON.stringify(e));
      assert(!banner.hidden && /thread utama/.test(banner.text), 'banner fallback tidak tampil');
      assert(s.issues.filter((i) => i.scope === 'integrity' && i.severity === 'error').length === 0, 'integritas');
      return { engine: e, banner: banner.text.slice(0, 160), workerRuns: failedRevisions };
    },
  },
  {
    id: 'E29', matrix: ['ST-QA-53'], title: 'Gerak dikurangi dihormati; tema "sistem" mengikuti preferensi gelap OS; ganti bahasa UI tidak mengubah isi/angka dokumen',
    async run(ctx) {
      const p = await studio(ctx);
      await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }, { name: 'prefers-color-scheme', value: 'dark' }]);
      await p.evaluate(() => { try { localStorage.setItem('pf.ui.theme', 'system'); } catch {} });
      await p.reload({ waitUntil: 'load' }); await p.waitForFunction(() => !!window.__pf);
      await loadSource(ctx, p, '# Angka\n\nNilai 1.234,56 dan 7,5 % pada 21/11/2026.\n');
      const motion = await p.evaluate(() => [...document.querySelectorAll('button, .btn, dialog, .banner')].slice(0, 40).map((e) => { const cs = getComputedStyle(e); return [cs.transitionDuration, cs.animationName]; }));
      const allStill = motion.every(([d, a]) => d.split(',').every((x) => parseFloat(x) === 0) && (a === 'none' || a === ''));
      const theme = await p.evaluate(() => ({ attr: document.documentElement.dataset.theme ?? '', bg: getComputedStyle(document.body).backgroundColor }));
      const before = await liveText(p);
      const hashBefore = (await ctx.state(p)).view.hash;
      await p.select('#pref-lang-w', 'en'); await ctx.sleep(300);
      const after = await liveText(p);
      const hashAfter = (await ctx.state(p)).view.hash;
      await p.close();
      const lum = (c) => { const m = c.match(/\d+/g).map(Number); return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; };
      assert(allStill, 'transisi/animasi masih aktif dengan reduced motion: ' + JSON.stringify(motion.slice(0, 3)));
      assert(lum(theme.bg) < 0.3, 'tema sistem tidak mengikuti mode gelap: ' + JSON.stringify(theme));
      assert(before === after && /1\.234,56/.test(after) && hashBefore === hashAfter, 'isi dokumen berubah saat bahasa UI diganti');
      return { elementsChecked: motion.length, theme, documentUnchanged: true };
    },
  },
  {
    id: 'E30', matrix: ['ST-QA-23', 'ST-QA-55'], title: 'Kuota penyimpanan penuh (kuota origin dipaksa kecil): status "penuh" jujur, isi tetap, paket cadangan tetap dapat diunduh',
    async run(ctx) {
      await wipeStorage(ctx);
      const p = await studio(ctx);
      const dl = await downloads(p);
      const cdp = await p.createCDPSession();
      await cdp.send('Storage.overrideQuotaForOrigin', { origin: ctx.env.base, quotaSize: 2048 });
      await loadSource(ctx, p, '# Kuota\n\n' + 'Isi besar yang tidak muat dalam kuota. '.repeat(400));
      await p.click('#save-status'); await p.waitForSelector('#dlg-projects[open]'); await p.click('#opt-localsave');
      await p.waitForFunction(() => !['pending', 'off'].includes(window.__pf.state().save), { timeout: 20000, polling: 100 });
      const st = (await ctx.state(p)).save;
      const label = await p.$eval('#save-status', (b) => b.textContent.trim());
      await p.keyboard.press('Escape');
      const src = (await ctx.state(p)).source.length;
      await p.click('#src-menu-btn'); await p.click('#src-menu [data-action=save-bundle]');
      const bundle = await dl.wait('.pfproj');
      await cdp.send('Storage.overrideQuotaForOrigin', { origin: ctx.env.base });
      await p.close(); await wipeStorage(ctx);
      assert(['quota', 'failed'].includes(st), 'status setelah kuota penuh bukan quota/failed: ' + st);
      assert(src > 10000, 'isi hilang setelah gagal simpan');
      assert(statSync(bundle).size > 1000, 'paket cadangan tidak terunduh');
      return { saveStatus: st, label, sourceChars: src, bundleBytes: statSync(bundle).size };
    },
  },
  {
    id: 'E31', matrix: ['ST-QA-24'], title: 'Pindah origin (staging → domain lain): paket .pfproj dari origin A dibuka utuh di origin B; penyimpanan tidak ikut pindah',
    async run(ctx) {
      const { startServer } = await import('../../scripts/serve-dist.mjs');
      const portB = 4399; const serverB = await startServer('dist-qa', portB); const baseB = `http://localhost:${portB}`;
      try {
        await wipeStorage(ctx);
        const a = await studio(ctx);
        const dl = await downloads(a);
        const src = readFileSync('fixtures/mixed-document.md', 'utf8');
        await loadSource(ctx, a, src);
        await a.click('#src-menu-btn'); await a.click('#src-menu [data-action=save-bundle]');
        const bundle = await dl.wait('.pfproj');
        const hashA = (await ctx.state(a)).view.hash;
        await a.close();
        const b = await ctx.page(ctx.env, { lang: 'id' });
        await b.goto(baseB + '/#/workspace', { waitUntil: 'load' }); await b.waitForFunction(() => !!window.__pf);
        const emptyAtB = (await ctx.state(b)).source.length;
        await (await b.$('#file-open')).uploadFile(bundle);
        await b.waitForFunction(() => /PENUTUP-AKHIR-DOKUMEN/.test(window.__pf.state().source), { timeout: 30000 });
        await ctx.waitReady(b, 120000);
        const sb = await ctx.state(b);
        await b.close(); await wipeStorage(ctx);
        assert(emptyAtB === 0, 'origin B sudah berisi proyek (penyimpanan tidak boleh lintas origin)');
        assert(sb.source === src.replace(/\r\n/g, '\n') || sb.source === src, 'sumber berbeda setelah pindah origin');
        assert(sb.view.hash === hashA, 'renderInputHash berbeda antar origin');
        return { originA: ctx.env.base, originB: baseB, bundleBytes: statSync(bundle).size, identicalRenderInputHash: true };
      } finally { await new Promise((r) => serverB.close(r)); }
    },
  },
];
