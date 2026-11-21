// Evaluasi Jalur B (PDF client-side tanpa backend) vs Jalur A (mesin cetak browser) — perintah lanjutan §7.
// Prototipe B1: jsPDF.html() (html2canvas → konteks 2D jsPDF, teks vektor dengan font standar PDF).
// Prototipe B2: rasterisasi per halaman (html2canvas → JPEG → pdf-lib) — pola "Download PDF" umum.
// Input: HTML datar terverifikasi dari aplikasi (halaman sudah final), sehingga perbedaan murni berasal dari mesin PDF.
// Pustaka prototipe TIDAK masuk dependensi aplikasi; jalur skrip: PF_EVAL_LIBS=<dir node_modules berisi jspdf, html2canvas, pdf-lib>.
import { writeFileSync, readFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { launch, page, openStudio, waitReady, setSource } from './lib.mjs';
import { generateStress } from '../../scripts/generate-stress.mjs';
import { candidateSha256 } from '../../scripts/fingerprint.mjs';

const LIBS = process.env.PF_EVAL_LIBS || '/home/claude/work/pdfeval/node_modules';
const MIXED = readFileSync('fixtures/mixed-document.md', 'utf8');
const CASES = [{ id: 'small', src: MIXED }, { id: 'medium', src: MIXED + '\n\n' + generateStress(30) }, { id: 'large', src: generateStress(115) }];
const sh = (c, a) => { try { return execFileSync(c, a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28 }); } catch (e) { return String(e.stdout || ''); } };
const norm = (s) => s.normalize('NFC').toLowerCase().replace(/[-\p{Emoji_Presentation}️‍]/gu, '').replace(/[\s­-]/g, '');
const out = { tool: 'tests/e2e/pdf-engine-eval.mjs', candidateSha256: candidateSha256(), at: new Date().toISOString(), cases: [] };
mkdirSync('evidence/pdf-eval', { recursive: true });
const env = await launch({ dir: 'dist-qa', port: 4350 });
try {
  for (const c of CASES) {
    const p = await page(env, { lang: 'id' });
    await openStudio(p, env.base); await setSource(p, c.src); await waitReady(p, 300000);
    await p.click('#t-checks'); await p.click('#p-checks .layout-btn');
    await p.waitForFunction(() => ['done', 'failed'].includes(window.__pf.state().layout.status), { timeout: 900000, polling: 250 });
    const flat = await p.evaluate(() => window.__pf.flattened()); await p.close();
    const q = await env.browser.newPage();
    await q.setViewport({ width: 1200, height: 900 });
    await q.setContent(flat.html, { waitUntil: 'load' }); await q.evaluate(() => document.fonts.ready);
    const expected = await q.evaluate(() => [...document.querySelectorAll('.pagedjs_page_content [data-block-id]')].filter((e) => !e.parentElement.closest('[data-block-id]') && !e.querySelector('.katex, img')).map((e) => e.textContent.trim()).filter(Boolean));
    const rec = { id: c.id, pages: flat.pages, engines: [] };
    const check = (file, ms) => {
      const info = sh('pdfinfo', [file]); const fonts = sh('pdffonts', [file]).split('\n').slice(2).filter(Boolean);
      const txt = norm(sh('pdftotext', ['-enc', 'UTF-8', file, '-']));
      const found = expected.filter((b) => txt.includes(norm(b))).length;
      return { ms, bytes: statSync(file).size, pages: Number(/Pages:\s+(\d+)/.exec(info)?.[1] ?? 0), fonts: fonts.map((l) => l.split(/\s+/).slice(0, 2).join(' ')).slice(0, 8),
        embeddedAll: fonts.every((l) => /\byes\b/.test(l.slice(50))), textBlocksFound: `${found}/${expected.length}`, textCoverage: +(found / Math.max(1, expected.length)).toFixed(3) };
    };
    // A — mesin cetak Chrome (sama dengan "Simpan sebagai PDF")
    let t = Date.now(); const fa = `evidence/pdf-eval/${c.id}.A-chrome.pdf`;
    writeFileSync(fa, await q.pdf({ preferCSSPageSize: true, printBackground: true, timeout: 900000 }));
    rec.engines.push({ engine: 'A: Chrome print engine', ...check(fa, Date.now() - t) });
    // html2canvas 1.4.1 gagal mengurai fungsi warna CSS modern (color()/color-mix) → dipakai fork html2canvas-pro
    await q.addScriptTag({ path: join(LIBS, 'html2canvas-pro/dist/html2canvas-pro.min.js') });
    await q.evaluate(() => { window.html2canvas = window.html2canvas || window.html2canvasPro; });
    await q.addScriptTag({ path: join(LIBS, 'jspdf/dist/jspdf.umd.min.js') });
    await q.addScriptTag({ path: join(LIBS, 'pdf-lib/dist/pdf-lib.min.js') });
    for (const kind of ['B1-jspdf-html', 'B2-raster']) {
      t = Date.now();
      const res = await q.evaluate(async (kind, limitMs) => {
        const pages = [...document.querySelectorAll('.pagedjs_page')];
        const r0 = pages[0].getBoundingClientRect(); const wPx = r0.width, hPx = r0.height;
        const wPt = wPx * 0.75, hPt = hPx * 0.75; const start = performance.now();
        const timedOut = () => performance.now() - start > limitMs;
        let memPeak = 0; const mem = () => { const m = performance.memory?.usedJSHeapSize ?? 0; if (m > memPeak) memPeak = m; };
        try {
          if (kind === 'B1-jspdf-html') {
            const doc = new window.jspdf.jsPDF({ unit: 'pt', format: [wPt, hPt], orientation: wPt > hPt ? 'l' : 'p' });
            for (let i = 0; i < pages.length; i++) {
              if (timedOut()) return { timeout: true, done: i };
              if (i) doc.addPage([wPt, hPt], wPt > hPt ? 'l' : 'p');
              await doc.html(pages[i], { x: 0, y: i * hPt, width: wPt, windowWidth: wPx, autoPaging: false, html2canvas: { logging: false, useCORS: false } });
              mem();
            }
            const bytes = new Uint8Array(doc.output('arraybuffer'));
            return { b64: btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join('')), memPeak };
          }
          const pdf = await window.PDFLib.PDFDocument.create();
          for (let i = 0; i < pages.length; i++) {
            if (timedOut()) return { timeout: true, done: i };
            const cv = await window.html2canvas(pages[i], { scale: 2, logging: false, backgroundColor: '#ffffff' });
            const jpg = await pdf.embedJpg(await (await fetch(cv.toDataURL('image/jpeg', 0.85))).arrayBuffer());
            pdf.addPage([wPt, hPt]).drawImage(jpg, { x: 0, y: 0, width: wPt, height: hPt });
            cv.width = cv.height = 0; mem();
          }
          const bytes = await pdf.save();
          let s = ''; for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
          return { b64: btoa(s), memPeak };
        } catch (e) { return { error: String(e && e.message || e) }; }
      }, kind, c.id === 'large' ? 100000 : 150000);
      const ms = Date.now() - t;
      if (!res.b64) { rec.engines.push({ engine: kind, ms, result: res.timeout ? `timeout setelah ${res.done} halaman` : `galat: ${res.error}` }); continue; }
      const f = `evidence/pdf-eval/${c.id}.${kind}.pdf`; writeFileSync(f, Buffer.from(res.b64, 'base64'));
      rec.engines.push({ engine: kind, ...check(f, ms), jsHeapPeakMiB: Math.round(res.memPeak / 1048576) });
    }
    await q.close();
    out.cases.push(rec);
    console.log(c.id, flat.pages, JSON.stringify(rec.engines.map((e) => [e.engine, e.ms, e.bytes, e.pages, e.textCoverage ?? e.result])));
  }
} finally { await env.close(); }
writeFileSync('evidence/pdf-engine-eval.json', JSON.stringify(out, null, 2));
