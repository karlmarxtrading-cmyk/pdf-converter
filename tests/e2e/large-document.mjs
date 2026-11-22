/** Real production import and downloads, with independent, ordered source tokens. */
import {readFile,writeFile,mkdir,mkdtemp,readdir,rm,copyFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {launch} from './lib.mjs';
const [shape='paragraphs',toc='off',port='4493']=process.argv.slice(2);
const fixture=resolve(process.env.PF_LARGE_SOURCE || 'fixtures/rc9/'+shape+'-217850.md');
const out=resolve(process.env.PF_LARGE_OUT || 'examples/rc12/large',shape+'-'+toc);
const receiptDir=resolve(process.env.PF_LARGE_REPORT || 'evidence/rc12/large');
await mkdir(out,{recursive:true});await mkdir(receiptDir,{recursive:true});
const file=join(receiptDir,shape+'-'+toc+'.json');
const source=await readFile(fixture,'utf8');
const hash=v=>createHash('sha256').update(v).digest('hex');
const manifest=JSON.parse(await readFile('dist.build-manifest.json'));
const srcWords=source.match(/kata\d{6}/g) || [];
const downloads=await mkdtemp(join(tmpdir(),'pf-large-'));
const env=await launch({dir:'dist',port:Number(port)});
const ctx=await env.browser.createBrowserContext({downloadBehavior:{policy:'allow',downloadPath:downloads}});
const p=await ctx.newPage();p.setDefaultTimeout(45000);p.setDefaultNavigationTimeout(120000);
const start=Date.now();
const scratchPdf=await mkdtemp(join(tmpdir(),'paperforma-physical-'));
const report={shape,toc,sourceSha256:hash(source),sourceBytes:Buffer.byteLength(source),identity:manifest.candidateSha256,dist:manifest.distTreeSha256,browser:await env.browser.version(),events:[],method:'Production UI. Chromium automatic PDF of the exact verified, hash-matched print response.',phase:'startup',status:'RUNNING'};
const save=()=>writeFile(file,JSON.stringify(report,null,2)+'\n');
await p.exposeFunction('trackLarge',event=>{report.events.push({...event,wallMs:Date.now()-start});});
const interval=setInterval(()=>{void save().catch(()=>{});},3000);
try{
  await p.setViewport({width:1440,height:1000});await p.goto(env.base+'/#/workspace');await p.waitForFunction(()=>!document.querySelector('#view-workspace')?.hidden && /rev \d+/.test(document.querySelector('#src-hash')?.textContent||''));
  await p.evaluate(()=>{
    window.addEventListener('message',e=>{
      const frame=document.querySelector('iframe[title="PaperForma print"]');
      if(!frame || e.origin!==location.origin || e.source!==frame.contentWindow)return;
      const {type,phase,pass,pages,jobId,units}=e.data||{};
      if(type==='pf-print-result')window.largePrint=e.data.result;
      if(type)void window.trackLarge({type,phase,pass,pages,jobId,units});
    });
  });
  report.phase='import';await (await p.$('#file-open')).uploadFile(fixture);
  await p.waitForFunction(()=>!!document.querySelector('#live-frame')?.contentDocument?.querySelector('[data-block-id]'),{timeout:150000});
  report.editorHash=hash(await p.$eval('#editor',e=>e.value));assert.equal(report.editorHash,hash(source.replace(/\r\n?/g,'\n')));
  await p.$eval('.ws-actions [data-action=publish]',e=>e.click());
  await p.waitForSelector('#dlg-publish[open]');
  report.initialSummary=await p.$eval('#publish-summary',e=>e.innerText);
  await p.click('#pub-close');
  if(toc!=='default'){
  await p.$eval('[data-tpl="BUS-01"]',e=>e.click());await p.select('#s-paper','A4');await p.select('#s-orient','portrait');
  for(const [id,checked] of [['s-cover',false],['s-toc',toc==='on']]){
    await p.$eval('#'+id,(e,value)=>{if(e.checked!==value)e.click();},checked);
  }
  }
  report.settings=await p.evaluate(()=>Object.fromEntries([...document.querySelectorAll('[data-set]')].map(e=>[e.dataset.set,e.type==='checkbox'?e.checked:e.value])));
  delete report.settings.title;delete report.settings.author;
  async function publish(kind){
    await p.$eval('.ws-actions [data-action=publish]',e=>e.click());await p.waitForSelector('#dlg-publish[open]');
    await p.click('input[value="'+kind+'"]');if(await p.$('#pub-ack'))await p.click('#pub-ack');
    await p.waitForFunction(()=>!document.querySelector('#pub-go').disabled);
    report.inputSummary=await p.$eval('#publish-summary',e=>e.innerText);
    await p.click('#pub-go');
    // Keep CDP observation separate from the application's print deadlines.
    // A single in-page polling promise would hit CDP's default 180 s timeout.
    const until=Date.now()+960000;
    while(!await p.$eval('#publish-result',e=>!e.hidden)){
      if(Date.now()>until)throw new Error('Observer deadline after 960 seconds');
      await delay(500);
    }
    return p.$eval('#publish-result',e=>e.textContent);
  }
  report.phase='standalone';let receipt=await publish('html-standalone');
  if(await p.$('#pub-review-ack')){await p.click('#pub-review-ack');await p.click('#publish-result .btn-primary');}
  for(let i=0;i<100 && !(await readdir(downloads)).some(f=>f.endsWith('.html'));i++)await delay(100);
  const name=(await readdir(downloads)).find(f=>f.endsWith('.html'));assert.ok(name,receipt);
  const htmlFile=join(out,'dokumen.html');await copyFile(join(downloads,name),htmlFile);
  report.htmlSha256=hash(await readFile(htmlFile));receipt=await p.$eval('#publish-result',e=>e.textContent);assert.ok(receipt.includes(report.htmlSha256));
  const off=await ctx.newPage();const network=[];
  off.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
  await off.setOfflineMode(true);await off.goto(pathToFileURL(htmlFile).href);
  const offline=await off.evaluate(()=>{
    const article=document.querySelector('article');return {text:article.textContent,tables:article.querySelectorAll('table').length,scripts:document.scripts.length,formulas:article.querySelectorAll('.pf-math').length,fonts:[...document.fonts].length};
  });await off.close();
  // Token separators in the DOM can be represented by block boundaries.
  assert.deepEqual(offline.text.match(/kata\d{6}/g)||[],srcWords);delete offline.text;
  assert.equal(offline.scripts,0);assert.deepEqual(network,[]);report.offline={...offline,sourceTokens:srcWords.length,network};
  await p.click('#pub-close');report.phase='print';
  const printReceipt=await publish('print');assert.ok(await p.$('#publish-result.banner-ok'),printReceipt.slice(0,900));
  const result=await p.evaluate(()=>{const r=window.largePrint;return {html:r.flattenedHtml,pages:r.pageCount,verification:r.verification,timings:r.timings,trace:r.trace,pass:r.passes};});
  assert.equal(result.verification.status,'pass');report.flatSha256=hash(result.html);assert.ok(printReceipt.includes(report.flatSha256));
  const html=result.html;delete result.html;report.layout=result;await save();
  await p.close();
  const print=await ctx.newPage();await print.setContent(html,{waitUntil:'load',timeout:180000});await print.evaluate(()=>document.fonts.ready);
  const boxes=await print.evaluate(()=>[...document.querySelectorAll('.pagedjs_page')].map(pg=>{
    const page=pg.getBoundingClientRect(), output=[];
    const area=pg.querySelector('.pagedjs_page_content');
    const walker=document.createTreeWalker(area,NodeFilter.SHOW_TEXT);
    const range=document.createRange();
    for(let n=walker.nextNode();n;n=walker.nextNode()){
      const parent=n.parentElement;
      if(!n.textContent.trim() || !parent.closest('[data-block-id],[data-block-part-of]') || parent.closest('[data-pf-repeat],.katex-mathml,script,style'))continue;
      range.selectNodeContents(n);
      for(const b of range.getClientRects())if(b.width&&b.height)
        output.push([b.left-page.left,b.top-page.top,b.right-page.left,b.bottom-page.top].map(v=>Math.round(v*100)/100));
    }
    return {width:page.width,height:page.height,rects:output};
  }));
  await writeFile(join(scratchPdf,'boxes.json'),JSON.stringify(boxes));
  report.phase='pdf';const pdf=await print.pdf({preferCSSPageSize:true,printBackground:true,timeout:360000,path:join(out,'dokumen.pdf')});
  report.pdfSha256=hash(pdf);report.pdfBytes=pdf.length;report.status='PDF_SAVED';await save();
  report.physical=JSON.parse(execFileSync(process.env.PF_PYTHON || (process.platform === 'win32' ? 'python' : 'python3'),['tests/e2e/large-physical.py',fixture,htmlFile,join(out,'dokumen.pdf'),join(scratchPdf,'boxes.json')],{encoding:'utf8',maxBuffer:4<<20}));
  report.status=report.physical.pass?'PASS':'PDF_REVIEW';if(!report.physical.pass)process.exitCode=1;
}catch(error){report.status='FAIL';report.error=String(error.stack).slice(0,1600);process.exitCode=1;}
finally{clearInterval(interval);report.elapsedMs=Date.now()-start;await save();await ctx.close();await env.close();await rm(downloads,{recursive:true,force:true});await rm(scratchPdf,{recursive:true,force:true});console.log(shape,toc,report.status,report.error||report.layout?.pages);}
