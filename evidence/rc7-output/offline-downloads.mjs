/** Run from the project root with CHROME_PATH pointing to an installed Chromium. Opens the shipped files directly. */
import puppeteer from 'puppeteer-core';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {findChromium} from '../../scripts/browser-path.mjs';

const oracle=JSON.parse(await readFile('fixtures/rc6/user-trigonometry.expected.json','utf8'));
const desktop=JSON.parse(await readFile('evidence/rc7-output/desktop-downloads.json','utf8'));
const browser=await puppeteer.launch({executablePath:findChromium(),headless:true,args:['--no-sandbox']});
const report={engine:await browser.version(),distTree:desktop.distTree,method:'For each recorded completed desktop UI download, compare its SHA-256 then open file URL in a new Chromium browser context with networking offline before navigation.',results:[]};
try{
  for(const item of desktop.exports){
    const path=resolve('examples/rc7',item.file);
    const sha=createHash('sha256').update(await readFile(path)).digest('hex');
    if(sha!==item.appReportedSha256)throw new Error('Receipt mismatch: '+item.file);
    const context=await browser.createBrowserContext();
    try{
      const p=await context.newPage();
      const requests=[];p.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
      await p.setOfflineMode(true);await p.goto(pathToFileURL(path).href,{waitUntil:'load'});
      const metrics=await p.evaluate(async formulas=>{
        const math=[...document.querySelectorAll('.pf-math')];
        const differs=math.flatMap((el,i)=>{const e=formulas[i];return e && e.raw===el.dataset.sourceTex && e.expected===el.dataset.tex && !!el.querySelector('.katex-display')===e.display && el.querySelector('annotation')?.textContent===e.expected ? []:[i];});
        const faces=[...document.fonts];const states=await Promise.allSettled(faces.map(f=>f.load()));
        const ids=[...document.querySelectorAll('[id]')].map(n=>n.id);
        const bounds=math.map(n=>n.querySelector('.katex-html')?.getBoundingClientRect());
        const valid=bounds.filter(r=>r && r.width>0 && r.height>0).length;
        return {online:navigator.onLine,title:document.title,template:document.querySelector('[data-template]')?.dataset.template,formulas:math.length,withPositiveGeometry:valid,formulaDifferences:differs,mathml:document.querySelectorAll('.pf-math math annotation').length,tables:document.querySelectorAll('table').length,rows:document.querySelectorAll('table tr').length,cells:document.querySelectorAll('table td,table th').length,cssBytes:new TextEncoder().encode(document.querySelector('[data-pf="s0"]').textContent).length,
          accessibilityMathLayerPosition:getComputedStyle(document.querySelector('.katex-mathml')).position,
          verticalListLayout:getComputedStyle(document.querySelector('.katex .vlist-t')).display,fonts:faces.length,decodedFontCount:states.filter(s=>s.status==='fulfilled').length,idsDuplicated:ids.length-new Set(ids).size,
          missingFragmentTargets:[...document.querySelectorAll('a[href^="#"]')].filter(a=>!document.getElementById(decodeURIComponent(a.hash.slice(1)))).length,
          scripts:document.scripts.length,toc:document.querySelectorAll('.pf-toc a[href]').length};
      },oracle.formulas);
      const m=metrics;
      const pass=m.online===false && m.template===item.template && m.title==='Kumpulan Rumus Trigonometri Lengkap' && m.formulas===231 && m.mathml===231 && m.withPositiveGeometry===231 && m.formulaDifferences.length===0 && m.tables===5 && m.rows===33 && m.cells===115 && m.fonts>0 && m.fonts===m.decodedFontCount && m.accessibilityMathLayerPosition==='absolute' && m.verticalListLayout==='inline-table' && !m.scripts && !requests.length && !m.missingFragmentTargets && !m.idsDuplicated;
      report.results.push({file:item.file,sha256:sha,metrics,networkRequests:requests,status:pass?'PASS':'FAIL'});
    }finally{await context.close();}
  }
}finally{await browser.close();}
await writeFile('evidence/rc7-output/offline-desktop-downloads.json',JSON.stringify(report,null,2)+'\n');
if(report.results.some(r=>r.status!=='PASS'))process.exitCode=1;
