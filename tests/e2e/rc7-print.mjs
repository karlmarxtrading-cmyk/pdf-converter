/** Production print UI → verified flattened HTML → Chromium print engine → independent PDF inspection.
 * Run in project root with npm ci, npm run build, Chromium, Python/pypdf and Poppler installed.
 * PF_PDF_DIR is the output directory. Optional case IDs are accepted as command line arguments.
 */
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {join, relative, resolve} from 'node:path';
import {readdirSync,readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {launch} from './lib.mjs';
import {pdfFragments, orderedTextCheck} from './pdf-oracle.mjs';
import {treeHash} from '../../scripts/fingerprint.mjs';

const dir = resolve(process.env.PF_PDF_DIR || 'evidence/rc7-production-pdf');
const trig = 'fixtures/rc6/user-trigonometry.md', mixed = 'fixtures/mixed-document.md';
const expectedFormulas=JSON.parse(await readFile('fixtures/rc6/user-trigonometry.expected.json','utf8')).formulas;
const rc8 = process.env.PF_PDF_RC8 === '1';
const tests = rc8 ? (await import('./rc8-pdf-cases.mjs')).cases : [
  ['trigonometry-BUS-A4',trig,'BUS-01','A4','portrait'],
  ['trigonometry-EDU-A4',trig,'EDU-01','A4','portrait'],
  ['trigonometry-EDT-A5',trig,'EDT-01','A5','portrait'],
  ['trigonometry-CON-Letter-landscape',trig,'CON-01','Letter','landscape'],
  ['mixed-EDU-A4',mixed,'EDU-01','A4','portrait'],
  ['mixed-BUS-Letter-landscape',mixed,'BUS-01','Letter','landscape'],
  ['mixed-EDT-A5',mixed,'EDT-01','A5','portrait'],
];
const selection = process.argv.slice(2);
assert.ok(selection.every(id=>tests.some(t=>t[0]===id)),'Unknown case ID');
const cases=tests.filter(t=>!selection.length||selection.includes(t[0]));
const sha = bytes=>createHash('sha256').update(bytes).digest('hex');
const run=(cmd,args)=>execFileSync(cmd,args,{encoding:'utf8',maxBuffer:16<<20});
const mm={A4:[210,297],A5:[148,210],Letter:[215.9,279.4]};
function inspectPdfPage(bbox, label, box, dimensions) {
  const sheet=/<page width="([\d.]+)" height="([\d.]+)">/.exec(bbox);
  if (!sheet) throw new Error('Poppler omitted physical page dimensions');
  const width=Number(sheet[1]),height=Number(sheet[2]);
  const words=[...bbox.matchAll(/<word xMin="([\d.-]+)" yMin="([\d.-]+)" xMax="([\d.-]+)" yMax="([\d.-]+)">([^<]*)<\/word>/g)];
  const number=!label || !!box && words.some(([,l,t,r,b,text])=>{
    const x=(Number(l)+Number(r))/(2*width), y=(Number(t)+Number(b))/(2*height);
    return text===label && x>=box.left-.002 && x<=box.right+.002 && y>=box.top-.002 && y<=box.bottom+.002;
  });
  return {number, widthPt:width,heightPt:height, expectedSize:[width,height].every((v,i)=>Math.abs(v-dimensions[i]*72/25.4)<1)};
}
const servingDir = process.env.PF_PDF_DIST || 'dist';
const env=await launch({dir:servingDir,port:Number(process.env.PF_PDF_PORT || 4359)});
function servedDistTree(dir) {
  if (resolve(dir)===resolve('dist')) return treeHash(['dist'],resolve('.')).sha256;
  const files = readdirSync(dir,{recursive:true,withFileTypes:true}).filter(e=>e.isFile()).map(e=>join(e.parentPath,e.name)).sort();
  const hash=createHash('sha256');
  for (const file of files) hash.update('dist/'+relative(dir,file).split('\\').join('/')+'\0'+sha(readFileSync(file))+'\n');
  return hash.digest('hex');
}
const summary={engine:await env.browser.version(),distTree:servedDistTree(servingDir),method:'Verified production print response, HTML SHA-256 matched against the production UI receipt. Chromium Page.printToPDF with CSS page size. No native save-dialog interaction in this test.',results:[]};
const reportDir=resolve(process.env.PF_PDF_EVIDENCE || dir);
await mkdir(dir,{recursive:true}); await mkdir(reportDir,{recursive:true});
try {
  for (const [id,file,template,paper,orientation,expectedDecision] of cases) {
    const p=await env.browser.newPage();
    if (rc8) { p.setDefaultTimeout(120000); p.setDefaultNavigationTimeout(120000); }
    let phase='open production editor';
    const rec={id,file,template,paper,orientation,sourceSha256:sha(await readFile(file))};
    summary.results.push(rec);
    try {
      await p.setViewport({width:1440,height:1000});await p.goto(env.base+'/#/workspace');
      await p.waitForSelector('#editor');
      if (rc8) {
        phase='wait for active workspace and first completed editor revision';
        await p.waitForFunction(()=>document.querySelector('#view-workspace')?.hidden===false &&
          /rev \d+/.test(document.querySelector('#src-hash')?.textContent||''));
      }
      phase='import source and wait for live preview';
      await (await p.$('#file-open')).uploadFile(resolve(file));
      await p.waitForFunction(()=>!!document.querySelector('#live-frame')?.contentDocument?.querySelector('[data-block-id]'));
      phase='select template and paper';
      await p.click('[data-tpl="'+template+'"]');await p.select('#s-paper',paper);await p.select('#s-orient',orientation);
      phase='open publication dialog after settings change';
      await p.click('[data-action="publish"]');await p.waitForSelector('#dlg-publish[open] input[value="print"]',{visible:true});
      phase='select print and read preflight';
      await p.click('input[value="print"]');
      if (await p.$('#pub-ack')) await p.click('#pub-ack');
      rec.inputSummary=await p.$eval('#publish-summary',e=>e.innerText);
      if (file===trig) assert.match(rec.inputSummary,/231 (formulas|rumus)/);
      await p.evaluate(()=>{
        window.addEventListener('message',event=>{
          const frame=document.querySelector('iframe[title="PaperForma print"]');
          if (event.origin===location.origin && frame && event.source===frame.contentWindow && event.data?.type==='pf-print-result')
            window.pfTestCapturedPrint=event.data.result;
        });
      });
      phase='check print decision and pagination';
      if (expectedDecision === 'blocked') {
        const gate = await p.$eval('#publish-gate',e=>e.innerText);
        rec.refusal = {gate, disabled:await p.$eval('#pub-go',e=>e.disabled), rawSourceUnchanged:
          sha(await p.$eval('#editor',e=>e.value))===rec.sourceSha256};
        assert.ok(rec.refusal.disabled && rec.refusal.rawSourceUnchanged);
        assert.match(gate,/U\+E000/); assert.match(gate,/U\+F8FF/);
        assert.match(gate,/31/);
        await p.click('#pub-close'); await p.click('#t-pages');
        // This document is explicitly refused for printing. Capture the diagnostic
        // preview only, to verify the original A5 pagination with exact source bytes.
        await p.waitForFunction(()=>window.pfTestCapturedPrint?.flattenedHtml,{timeout:180000});
      } else {
      await p.click('#pub-go');
      await p.waitForSelector('#publish-result:not([hidden])',{timeout:300000});
      rec.receipt=await p.$eval('#publish-result',e=>e.innerText);
      assert.ok(await p.$('#publish-result.banner-ok'),'Application print gate rejected this job: '+rec.receipt.slice(0,450));
      }
      const result=await p.evaluate(()=>{
        const r=window.pfTestCapturedPrint;
        return r && {html:r.flattenedHtml,pages:r.pageCount,verification:r.verification.status,passes:r.passes,
          diagnostics:r.issues.map(i=>({code:i.code,severity:i.severity})),timings:r.timings};
      });
      assert.ok(result?.html);rec.flatHash=sha(result.html);if (expectedDecision !== 'blocked') assert.ok(rec.receipt.includes(rec.flatHash));
      else rec.artifactClass='diagnostic preview of refused original; never offered as final PDF';
      rec.pages=result.pages;rec.verification=result.verification;rec.passes=result.passes;rec.diagnostics=result.diagnostics;
      assert.equal(rec.verification,'pass');
      phase='read paginated bytes, create actual PDF and inspect pages';
      const q=await env.browser.newPage();
      try{
        await q.setContent(result.html,{waitUntil:'load'});await q.evaluate(()=>document.fonts.ready);
        const frags=await q.evaluate(pdfFragments);
        const footerBoxes=await q.evaluate(id=>[...document.querySelectorAll('.pagedjs_page')].map(page=>{
          const rect=page.getBoundingClientRect();
          const box=page.querySelector(id==='EDT-01'?'.pagedjs_margin-bottom-center':'.pagedjs_margin-bottom-right')?.getBoundingClientRect();
          if (!box || !box.width || !box.height) return null;
          return {left:(box.left-rect.left)/rect.width,right:(box.right-rect.left)/rect.width,top:(box.top-rect.top)/rect.height,bottom:(box.bottom-rect.top)/rect.height};
        }),template);
        const meta=await q.evaluate((formulaOracle)=>{
          const all=[...document.querySelectorAll('.pagedjs_page_content .pf-math')];
          const original=all.filter(n=>!n.closest('[data-pf-repeat]'));
          const differences=formulaOracle ? original.flatMap((n,i)=>{
            const e=formulaOracle[i];
            return e && n.dataset.tex===e.expected && n.dataset.sourceTex===e.raw && n.querySelector('annotation')?.textContent===e.expected && !!n.querySelector('.katex-display')===e.display ? [] : [i];
          }) : [];
          return {
          uri:[...new Set([...document.querySelectorAll('.pagedjs_page_content a[href^="http"]')].map(a=>a.href))],
          internal:new Set([...document.querySelectorAll('.pagedjs_page_content a[href^="#"]')].map(a=>a.hash).filter(h=>h && document.getElementById(decodeURIComponent(h.slice(1))))).size,
          repeatedHeaders:document.querySelectorAll('thead[data-pf-repeat]').length,
          formulaInstances:all.length,formulas:original.length,formulaDifferences:differences,
          fontSizePt:parseFloat(getComputedStyle(document.querySelector('.pagedjs_page_content')).fontSize)*0.75
        };},file===trig?expectedFormulas:null);
        rec.paginated=meta;assert.equal(frags.length,rec.pages);

        if (rc8) {
          rec.review = await q.evaluate(() => {
            const pages = [...document.querySelectorAll('.pagedjs_page')];
            const boxes = [], codeParts = [];
            for (const [i,pg] of pages.entries()) {
              const rect=pg.getBoundingClientRect();
              const relative = el => {
                const b=el.getBoundingClientRect(); return [(b.x-rect.x)/rect.width,(b.y-rect.y)/rect.height,
                  (b.right-rect.x)/rect.width,(b.bottom-rect.y)/rect.height];
              };
              for (const formula of pg.querySelectorAll('.pagedjs_page_content .pf-math')) {
                if (formula.closest('[data-pf-repeat]')) continue;
                const visual=formula.querySelector('.katex-html'); if (!visual) continue;
                boxes.push({page:i+1,box:relative(visual),tex:formula.dataset.tex});
              }
              for (const pre of pg.querySelectorAll('.pagedjs_page_content pre[data-lang="python"]')) {
                const lines=[...pre.querySelectorAll('.pf-line[data-pf-code-line]')];
                codeParts.push({page:i+1,begin:lines[0]?.dataset.pfCodeLine,label:getComputedStyle(pre,'::before').content,
                  lines:lines.map(l=>[l.dataset.pfCodeLine,l.textContent]),hasChildren:pre.hasChildNodes()});
              }
            }
            return {boxes,codeParts};
          });
        }
        const dest=expectedDecision==='blocked' && reportDir!==dir ? join(reportDir,'diagnostics') : dir;
        await mkdir(dest,{recursive:true});
        const path=join(dest,(expectedDecision === 'blocked' ? 'DIAGNOSTIC-' : '')+id+'.pdf');
        rec.pdfPath=relative(resolve('.'),path).split('\\').join('/');
        const bytes=await q.pdf({path,preferCSSPageSize:true,printBackground:true,timeout:120000});
        rec.pdfSha256=sha(bytes);rec.pdfBytes=bytes.length;
        const structure=JSON.parse(run(process.env.PF_PYTHON || (process.platform === 'win32' ? 'python' : 'python3'),['tests/e2e/inspect-pdf.py',path]));
        const fonts=run('pdffonts',[path]).split('\n').slice(2).filter(Boolean);
        rec.structure=structure;rec.fonts=fonts.map(line=>line.trim().split(/\s+/)[0]);
        const pages=[];
        for (const [i,frag] of frags.entries()) {
          const args=['-f',String(i+1),'-l',String(i+1),'-enc','UTF-8',path,'-'];
          const logical=run('pdftotext',args),raw=run('pdftotext',['-raw',...args]);
          const blocks=orderedTextCheck(frag.blocks,{logical,raw}),cells=orderedTextCheck(frag.cells,{logical,raw});
          const lines=logical.split('\n').map(l=>l.trim()).filter(Boolean);
          const dims=orientation==='landscape'?[...mm[paper]].reverse():mm[paper];
          const placement=inspectPdfPage(run('pdftotext',['-bbox',...args]),frag.label,footerBoxes[i],dims);
          pages.push({n:i+1,blocks:blocks.pass,cells:cells.pass,expectedFragments:blocks.total,expectedCellFragments:cells.total,matchedBlocks:blocks.matched,matchedCellFragments:cells.matched,firstMissing:blocks.firstMissing?.slice(0,140),
            ...placement,hasText:lines.length>0,formulas:frag.formulas});
        }
        rec.pdfPages=pages;rec.checks={formulaInventory:file!==trig || (meta.formulas===231 && meta.formulaDifferences.length===0),pages:structure.pages===rec.pages,embeddedFonts:fonts.length>0 && fonts.every(l=>l.trim().split(/\s+/).at(-5)==='yes'),
          noType3:fonts.every(l=>!l.includes('Type 3')),externalLinks:meta.uri.every(u=>structure.uriTargets.includes(u)),internalLinks:structure.internal>=meta.internal,
          physicalPageSizes:pages.every(z=>z.expectedSize),pageLabels:pages.every(z=>z.number),nonempty:pages.every(z=>z.hasText),proseOrder:pages.every(z=>z.blocks),cellOrder:pages.every(z=>z.cells)};
        if (expectedDecision === 'blocked') {
          // Keep diagnostic errors visible independently; these bytes cannot be delivered by the UI.
          rec.status='UNSUPPORTED_BLOCKED'; rec.diagnosticStatus=Object.values(rec.checks).every(Boolean)?'PASS':'FAIL';
        } else rec.status=Object.values(rec.checks).every(Boolean)?'PASS':'FAIL';
      }finally{await q.close();}
    }catch(error){rec.status='FAIL';rec.phase=phase;rec.error=String(error).slice(0,1200);}
    finally{await p.close();await writeFile(join(reportDir,'results.json'),JSON.stringify(summary,null,2)+'\n');console.log(id,rec.status,rec.pages||'',rec.error||'');}
  }
}finally{await env.close();}
process.exitCode=summary.results.every(r=>r.status==='PASS' || r.status==='UNSUPPORTED_BLOCKED')?0:1;
