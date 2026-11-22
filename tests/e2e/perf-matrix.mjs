// Matriks performa (perintah lanjutan §9): ±10/50/100/200/500/1000 halaman A4, pengukuran berulang (median, min–maks, p95
// bila n ≥ 5). Diukur pada build QA statis di Chrome headless kontainer Linux — BUKAN perangkat referensi pengguna.
// Pemakaian: node tests/e2e/perf-matrix.mjs [--sizes 6,30,59,118,295,590] [--reps 5] → evidence/perf-matrix.json
import { mkdirSync } from 'node:fs';
import { protocol,atomic,bind,environment,outputDir,fileHash } from '../bench/performance-binding.mjs';
import { performance } from 'node:perf_hooks';
import { launch, page, openStudio, waitReady, setSource } from './lib.mjs';
import { generateStress } from '../../scripts/generate-stress.mjs';
import { candidateSha256, distTreeSha256 } from '../../scripts/fingerprint.mjs';
import { performanceRunPass } from '../../scripts/result-gates.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SIZES = arg('--sizes', '6,30,59,118,295,590').split(',').map(Number);
const REPS = Number(arg('--reps', '5'));
const acceptance=process.argv.includes('--acceptance');
const policy=protocol.capacity;
const dest=acceptance?outputDir+'/capacity.json':'evidence/perf-matrix.json';
mkdirSync(outputDir,{recursive:true});
const before=acceptance?{candidate:bind(process.cwd()),qa:bind(process.cwd(),'qa'),protocol:fileHash('tests/bench/performance-protocol.json')}:null;
const stat = (xs) => {
  const v = xs.filter((x) => typeof x === 'number').sort((a, b) => a - b); if (!v.length) return null;
  const q = (p) => v[Math.min(v.length - 1, Math.ceil(p * v.length) - 1)];
  return { n: v.length, median: v.length % 2 ? v[(v.length - 1) / 2] : Math.round((v[v.length / 2 - 1] + v[v.length / 2]) / 2), min: v[0], max: v[v.length - 1], ...(v.length >= 5 ? { p95: q(0.95) } : {}) };
};
const env = await launch({ dir: 'dist-qa', port: 4370 });
const rows = [];
const receipt={schema:1,protocol:policy,before,environment:environment(),rows,status:'RUNNING',started:new Date().toISOString()};
receipt.environment.browser=await env.browser.version();
const save=()=>atomic(dest,receipt);
try {
  for (const sections of SIZES) {
    const src = generateStress(sections);
    const runs = [];
    const row={sections,runs};rows.push(row);
    const p=await page(env,{lang:'id'}),cdp=await p.createCDPSession();
    await openStudio(p,env.base);
    for (let r = 0; r < REPS; r++) {
      const heapSamples=[],start=performance.now();let sampling=true;
      const sampleHeap=async()=>{
        const requested=performance.now()-start;
        try{const heap=await cdp.send('Runtime.getHeapUsage');heapSamples.push({tMs:Math.round(performance.now()-start),requestedMs:Math.round(requested),bytes:heap.usedSize??null});}
        catch{heapSamples.push({tMs:Math.round(performance.now()-start),requestedMs:Math.round(requested),bytes:null});}
      };
      const polling=(async()=>{while(sampling){await sampleHeap();await new Promise(r=>setTimeout(r,policy.heapIntervalMs));}})();
      await p.evaluate(() => {
        window.__perf = { gap: 0, last: performance.now(), on: true, lt: [], events: [], phase: 'preview', byPhase: {} };
        const P = window.__perf;
        const tick = () => { const n = performance.now(); const g = n - P.last; if (g > P.gap) P.gap = g; P.byPhase[P.phase] = Math.max(P.byPhase[P.phase] ?? 0, g); P.last = n; if (P.on) setTimeout(tick, 16); };
        setTimeout(tick, 16);
        P.observer=new MutationObserver(()=>{const text=document.querySelector('#render-state')?.textContent;if(text&&P.phase==='layout'&&P.events.at(-1)?.text!==text)P.events.push({text,ms:Math.round(performance.now()-P.layoutStart)});});
        P.observer.observe(document.querySelector('#render-state'),{childList:true,subtree:true,characterData:true});
        P.longTasks=new PerformanceObserver((l) => { for (const x of l.getEntries()) P.lt.push({ d: Math.round(x.duration), phase: P.phase }); });P.longTasks.observe({type:'longtask'});
      });
      const rec = { sections, rep: r + 1, timestamp:new Date().toISOString(), sourceBytes: Buffer.byteLength(src) };
      try {
        let t = Date.now();
        await setSource(p, src); await waitReady(p, 900000);
        rec.previewMs = Date.now() - t;
        const m = await p.evaluate(() => window.__pf.metrics());
        const last = (ph) => m.filter((x) => x.phase === ph).at(-1)?.ms ?? null;
        Object.assign(rec, { workerParseRenderMs: last('engine-render'), workerCharsMs: last('engine-chars'), workerIntegrityModelMs: last('engine-integrityModel'), workerReferencesMs: last('engine-references'),
          analyzeWallMs: last('analyze-worker') ?? last('analyze-fallback'), mainFinishMs: last('finish'), mainIntegrityMs: last('integrity'), composeMs: last('compose') });
        await p.evaluate(() => { window.__perf.phase='layout';window.__perf.layoutStart=performance.now(); });
        t = Date.now();
        await p.click('#t-checks'); await p.click('#p-checks .layout-btn');
        await p.waitForFunction(() => ['done', 'failed'].includes(window.__pf.state().layout.status), { timeout: 1800000, polling: 500 });
        rec.layoutWallMs = Date.now() - t;
        rec.printReadyMs = rec.previewMs + rec.layoutWallMs;
        const f = await p.evaluate(() => window.__pf.flattened());
        const s = await p.evaluate(() => window.__pf.state());
        rec.layoutStatus = s.layout.status; rec.pages = s.layout.pages; rec.verification = s.layout.verification?.status ?? null;
        rec.blocking = s.issues.filter((i) => i.blocking).map((i) => i.code);
        if (f?.timings) Object.assign(rec, { paginatePassesMs: f.timings.paginatePasses, contentVerifyMs: f.timings.verify, flattenMs: f.timings.flatten, layoutTotalMs: f.timings.total, forcedBreaks: f.timings.forcedBreaks });
        // ekspor PDF (jalur A: mesin cetak Chrome atas HTML datar yang sama)
        if (f?.html && rec.verification === 'pass') {
          await p.evaluate(()=>{window.__perf.phase='pdf';});
          const q = await env.browser.newPage();
          t = Date.now(); await q.setContent(f.html, { waitUntil: 'load', timeout: 600000 }); await q.evaluate(() => document.fonts.ready);
          const pdf = await q.pdf({ preferCSSPageSize: true, printBackground: true, timeout: 1200000 });
          rec.pdfExportMs = Date.now() - t; rec.pdfBytes = pdf.length; await q.close();
        }
        // edit ulang setelah siap: waktu pratinjau & paginasi revisi baru
        await p.evaluate(() => { window.__perf.phase = 'reedit'; });
        t = Date.now();
        await p.evaluate(() => { const ed = document.querySelector('#editor'); ed.value += '\n\nParagraf tambahan setelah suntingan.'; ed.dispatchEvent(new Event('input', { bubbles: true })); });
        await waitReady(p, 900000);
        rec.reeditPreviewMs = Date.now() - t;
        {
          await p.evaluate(()=>{window.__perf.phase='cancel';});
          // pembatalan paginasi yang sedang berjalan: waktu dari Escape sampai status kembali diam
          await p.click('.ws-actions [data-action=publish]'); await p.waitForSelector('#dlg-publish[open]');
          await p.click('input[name=pub-kind][value=print]'); await p.click('#pub-go');
          await p.waitForFunction(() => !document.querySelector('#publish-progress').hidden, { timeout: 30000 });
          await new Promise((res) => setTimeout(res, Math.min(3000, 300 + sections * 5)));
          t = Date.now(); await p.keyboard.press('Escape');
          await p.waitForFunction(() => { const r = document.querySelector('#publish-result'); return r && !r.hidden && /dibatalkan|cancelled|siap|ready/i.test(r.textContent); }, { timeout: 120000, polling: 50 });
          rec.cancelToIdleMs = Date.now() - t;
          rec.cancelOutcome = await p.$eval('#publish-result', (e) => e.textContent.trim().slice(0, 80));
          rec.printSessionAfterCancel = (await p.evaluate(() => window.__pf.state())).print;
        }
        await cdp.send('HeapProfiler.collectGarbage');
        rec.heapAfterGcBytes=(await cdp.send('Runtime.getHeapUsage')).usedSize??null;
        const perf = await p.evaluate(() => { window.__perf.on = false; const P = window.__perf;P.observer.disconnect();P.longTasks.disconnect();return { gap: Math.round(P.gap), byPhase: Object.fromEntries(Object.entries(P.byPhase).map(([k, v]) => [k, Math.round(v)])), events:P.events, lt: P.lt }; });
        rec.progressEvents=perf.events;
        rec.firstProgressMs=perf.events[0]?.ms??null;
        const eventTimes=[0,...perf.events.map(v=>v.ms),rec.layoutWallMs];
        rec.maxProgressGapMs=Math.max(...eventTimes.slice(1).map((t,i)=>Math.max(0,t-eventTimes[i])));
        rec.maxEventLoopGapMs = perf.byPhase;
        const lt = (ph) => perf.lt.filter((x) => x.phase === ph).map((x) => x.d);
        rec.longTasks = { preview: { count: lt('preview').length, maxMs: Math.max(0, ...lt('preview')) }, layout: { count: lt('layout').length, maxMs: Math.max(0, ...lt('layout')) } };
        rec.engineMode = (await p.evaluate(() => window.__pf.engine())).mode;
        rec.errors = p.log.errors.slice(0, 3);
        await p.evaluate(()=>{document.querySelector('#dlg-publish')?.close();document.querySelector('[data-action=new]').click();});
        await p.waitForSelector('#dlg-choice[open] button[value=discard]',{timeout:5000});
        await p.click('#dlg-choice button[value=discard]');
        await p.waitForFunction(()=>window.__pf.state().revision===0 && document.querySelector('#editor').value==='',{timeout:15000});
        await waitReady(p);await cdp.send('HeapProfiler.collectGarbage');
        rec.closedProjectHeapAfterGcBytes=(await cdp.send('Runtime.getHeapUsage')).usedSize??null;
      } catch (e) { rec.error = String(e?.message || e).slice(0, 300); }
      finally { sampling=false;await polling;await sampleHeap();rec.heapSamples=heapSamples;
        rec.maximumSampledTargetHeapBytes=heapSamples.some(s=>s.bytes===null)?null:Math.max(...heapSamples.map(s=>s.bytes),rec.heapAfterGcBytes??0,rec.closedProjectHeapAfterGcBytes??0);
        rec.SLA={preview:rec.previewMs<=policy.previewMs,reedit:rec.reeditPreviewMs<=policy.reeditPreviewMs,
          print:rec.printReadyMs<=policy.printReadyMs,firstProgress:rec.firstProgressMs!=null&&rec.firstProgressMs<=policy.firstProgressMs,
          progressGap:rec.maxProgressGapMs<=policy.maxProgressGapMs,cancel:rec.cancelToIdleMs<=policy.cancelToIdleMs&&/dibatalkan|cancelled/i.test(rec.cancelOutcome??''),
          responsiveness:['preview','layout','reedit'].every(ph=>rec.maxEventLoopGapMs?.[ph]<=policy.maxEventLoopGapMs),
          observedHeap:rec.maximumSampledTargetHeapBytes>0&&rec.heapAfterGcBytes>0&&rec.closedProjectHeapAfterGcBytes>0};
      }
      runs.push(rec);save();
      console.log(`sections=${sections} rep=${r + 1}: pages=${rec.pages} preview=${rec.previewMs} layout=${rec.layoutWallMs} verify=${rec.contentVerifyMs} pdf=${rec.pdfExportMs} sampledHeapBytes=${rec.maximumSampledTargetHeapBytes} ${rec.verification ?? ''} ${rec.error ?? ''}`);
    }
    const keys = ['previewMs', 'workerParseRenderMs', 'workerCharsMs', 'workerIntegrityModelMs', 'workerReferencesMs', 'analyzeWallMs', 'mainFinishMs', 'mainIntegrityMs', 'composeMs', 'layoutWallMs', 'paginatePassesMs', 'contentVerifyMs', 'flattenMs', 'printReadyMs', 'pdfExportMs', 'pdfBytes', 'reeditPreviewMs', 'maximumSampledTargetHeapBytes', 'heapAfterGcBytes','closedProjectHeapAfterGcBytes'];
    const summary = Object.fromEntries(keys.map((k) => [k, stat(runs.map((x) => x[k]))]));
    summary.maxEventLoopGapMs = Object.fromEntries(['preview', 'layout', 'reedit'].map((ph) => [ph, stat(runs.map((x) => x.maxEventLoopGapMs?.[ph]))]));
    summary.longTaskMaxMs = { preview: stat(runs.map((x) => x.longTasks?.preview.maxMs)), layout: stat(runs.map((x) => x.longTasks?.layout.maxMs)) };
    await p.close();
    const closed=runs.map(r=>r.closedProjectHeapAfterGcBytes).filter(Number.isFinite);
    const drift=closed.length===runs.length?closed.at(-1)-closed[0]:null;
    Object.assign(row,{ closedProjectHeapDriftBytes:drift, closedProjectDriftWithinSla:drift!==null&&drift<=policy.afterCloseRetainedDriftBytes, pages: runs.find((x) => x.pages)?.pages ?? null, reps: runs.length, allVerified: runs.length > 0 && runs.every(performanceRunPass), failures: runs.filter((x) => !performanceRunPass(x)).map((x) => x.error ?? x.blocking), summary, cancel: runs[0] && { ms: runs[0].cancelToIdleMs, outcome: runs[0].cancelOutcome, sessionLeft: runs[0].printSessionAfterCancel }, runs });
  }
} finally { await env.close(); }
const out = { ...receipt,after:acceptance?{candidate:bind(process.cwd()),qa:bind(process.cwd(),'qa'),protocol:fileHash('tests/bench/performance-protocol.json')}:null, tool: 'tests/e2e/perf-matrix.mjs', candidateSha256: candidateSha256(), distQaTreeSha256: distTreeSha256('dist-qa'), at: new Date().toISOString(), browser: 'Chrome headless (lihat evidence/toolchain.txt)', env: 'Kontainer Linux, CPU bersama; bukan perangkat referensi. Angka untuk perbandingan relatif antar-kandidat.',
  baselineRc1: { sections: 115, pages: 196, layoutWallMs: 9256, previewMs: 2942, mainThreadLongestTaskMs: 888, source: 'evidence RC1 stress-115.json + profil awal sesi ini' }, rows };
const full=JSON.stringify(SIZES)===JSON.stringify(policy.sections)&&REPS>=policy.reps;
const good=rows.length===SIZES.length && rows.every(r=>r.allVerified && r.runs.every(x=>Object.values(x.SLA).every(Boolean))&&r.closedProjectDriftWithinSla);
out.status=good&&(!acceptance||full)&&JSON.stringify(out.before)===JSON.stringify(out.after)?'PASS':'FAIL';
atomic(dest,out);
console.log(JSON.stringify(rows.map(r=>({sections:r.sections,pages:r.pages,reps:r.reps,verified:r.allVerified,closedProjectHeapDriftBytes:r.closedProjectHeapDriftBytes,failingSLA:r.runs.flatMap(x=>Object.entries(x.SLA).filter(([,ok])=>!ok).map(([key])=>key))}))));
process.exitCode=out.status==='PASS'?0:1;
