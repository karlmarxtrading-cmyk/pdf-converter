/** Run from project root. Requires Puppeteer/Chromium, Pandoc, PyMuPDF and lxml.
 * Supply the original manuscript and a private output directory via PF_PRIVATE_SOURCE
 * and PF_PRIVATE_OUT. Synthetic case names correspond to fixtures/rc9/<shape>-217850.md. */
import {createHash} from 'node:crypto';
import {createWriteStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,copyFile,mkdtemp,mkdir,readdir,rm} from 'node:fs/promises';
import {join,resolve,relative} from 'node:path';
import {platform,release,tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {startServer} from '../../scripts/serve-dist.mjs';
import {findChromium} from '../../scripts/browser-path.mjs';

const cases=['original-default','headings-on','long-table-off','paragraphs-off','paragraphs-on','single-paragraph-off'];
const name=process.argv[2];
if(!cases.includes(name))throw Error('Choose one of '+cases.join(', '));
const privateCase=name==='original-default', pilot=!!process.env.PF_BOOK_PILOT;
const shape=name.slice(0,name.lastIndexOf('-')), toc=name.split('-').at(-1);
const sourcePath=privateCase ? process.env.PF_PRIVATE_SOURCE : 'fixtures/rc9/'+shape+'-217850.md';
if(privateCase && (!sourcePath || !process.env.PF_PRIVATE_OUT))throw Error('A private input and private output directory are required');
const input=resolve(pilot && process.env.PF_PILOT_SOURCE || sourcePath);
const out=resolve(privateCase ? process.env.PF_PRIVATE_OUT : pilot ? process.env.PF_BOOK_PILOT+'/artifacts/'+name : 'examples/rc12/book/'+name);
if(privateCase && !relative(resolve('.'),out).startsWith('..'))throw Error('Keep the private manuscript outside the package');
const reports=resolve(pilot ? process.env.PF_BOOK_PILOT+'/records' : 'evidence/rc12/book');
const raw=await readFile(input), sha=v=>createHash('sha256').update(v).digest('hex');
const sourceSha256=sha(raw);
if(privateCase && !pilot)assert.equal(sourceSha256,'88901d44a592ead82c757b65f57ce26e5f0003598a7a74064d6921439dbd0454');
await Promise.all([mkdir(out,{recursive:true}),mkdir(reports,{recursive:true})]);
const manifest=JSON.parse(await readFile('dist.build-manifest.json'));
const runId=pilot ? 'pilot' : JSON.parse(await readFile('evidence/rc12/acceptance/start.json')).runId;
const report={schemaVersion:1,runId,candidateSha256:manifest.candidateSha256,distTreeSha256:manifest.distTreeSha256,case:name,sourceSha256,sourceBytes:raw.length,route:'print-book',toc,platform:platform()+' '+release(),startedAt:new Date().toISOString(),status:'RUNNING',events:[],method:'Production import, standalone HTML browser download, book print control, exact official book document rendered by Chromium PrintToPDF (headless). Native OS Save is a separate gate.'};
const clock=performance.now(), event=phase=>report.events.push({phase,elapsedMs:Math.round(performance.now()-clock)});
const save=()=>writeFile(join(reports,name+'.json'),JSON.stringify(report,null,2)+'\n');
const dir=await mkdtemp(join(tmpdir(),'pf10-book-')), port=Number(process.env.PF_BOOK_PORT||4871);
const server=await startServer(pilot && process.env.PF_PILOT_DIST || 'dist',port);
let browser;
try{
  const deadline=900000, base='http://127.0.0.1:'+port;
  browser=await puppeteer.launch({executablePath:findChromium(),headless:true,pipe:true,protocolTimeout:deadline,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--lang=id-ID','--font-render-hinting=none']});
  report.browser=await browser.version();
  const ctx=await browser.createBrowserContext({downloadBehavior:{policy:'allow',downloadPath:dir}});
  const page=await ctx.newPage();
  page.setDefaultTimeout(150000);page.setDefaultNavigationTimeout(150000);
  const errors=[];page.on('pageerror',error=>errors.push(sha(error.message)));
  page.on('error',error=>errors.push(sha(error.message)));
  await page.setViewport({width:1440,height:1000});
  await page.goto(base+'/#/workspace');
  await page.waitForFunction(()=>!document.querySelector('#view-workspace')?.hidden && /rev \d+/.test(document.querySelector('#src-hash')?.textContent||''));
  event('import');
  await (await page.$('#file-open')).uploadFile(input);
  const normalizedSource=raw.toString('utf8').replace(/\r\n?/g,'\n');
  await page.waitForFunction(len=>document.querySelector('#editor')?.value.length===len,{},normalizedSource.length);
  await page.waitForFunction(()=>document.querySelector('#live-frame')?.contentDocument?.querySelector('[data-block-id]'));
  report.sourceEditorSha256=sha(await page.$eval('#editor',e=>e.value));assert.equal(report.sourceEditorSha256,sha(normalizedSource));event('editor-verified');
  if(toc!=='default'){
    await page.$eval('[data-tpl="BUS-01"]',e=>e.click());await page.select('#s-paper','A4');await page.select('#s-orient','portrait');
    for(const [id,checked] of [['s-cover',false],['s-toc',toc==='on']]){
      await page.$eval('#'+id,(e,val)=>{if(e.checked!==val)e.click();},checked);
    }
  }
  const settings=await page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('[data-set]')].map(e=>[e.dataset.set,e.type==='checkbox'?e.checked:e.value])));
  report.settings=Object.fromEntries(Object.entries(settings).filter(([k])=>['paper','orientation','margins','baseSizePt','lineHeight','cover','toc','tocDepth','pageNumberStart','pageNumbers','chapterBreak','contentLang','bodyFont'].includes(k)));
  report.settingsTitleSha256=sha(settings.title||'');report.settingsTitleLength=(settings.title||'').length;
  async function publish(kind){
    await page.$eval('.ws-actions [data-action=publish]',e=>e.click());await page.waitForSelector('#dlg-publish[open]');
    await page.click('input[name=pub-kind][value="'+kind+'"]');
    const ack=await page.$('#pub-ack');if(ack && await ack.isVisible() && !await ack.evaluate(e=>e.checked))await ack.click();
    await page.waitForFunction(()=>!document.querySelector('#pub-go').disabled);
    await page.click('#pub-go');
    await page.waitForFunction(()=>!document.querySelector('#publish-result').hidden,{timeout:deadline});
    const review=await page.$('#pub-review-ack');
    if(review && await review.isVisible()){await review.click();await page.click('#publish-result .btn-primary');}
  }
  async function collect(target){
    for(let i=0;i<300;i++){
      const file=(await readdir(dir)).find(f=>f.endsWith('.html'));
      if(file){await copyFile(join(dir,file),target);await rm(join(dir,file));return await readFile(target);}
      await delay(100);
    }
    throw Error('Browser download was not completed');
  }
  event('standalone-request');await publish('html-standalone');
  const htmlPath=join(out,'dokumen.html'),bookPath=join(out,'buku.html'),pdfPath=join(out,'dokumen.pdf');
  const html=await collect(htmlPath);report.htmlBytes=html.length;report.htmlSha256=sha(html);
  assert.ok((await page.$eval('#publish-result',e=>e.textContent)).includes(report.htmlSha256),'Standalone download hash absent from UI receipt');
  event('standalone-downloaded');await page.click('#pub-close');event('prepare-book');
  await publish('print-book');await page.waitForSelector('#book-open-print');
  const frameUrl=await page.$eval('#pf-book-print',e=>e.src);
  assert.ok(frameUrl.startsWith('blob:'+base+'/'));
  report.receiptSha256=await page.$eval('#book-html-hash',e=>e.dataset.sha256);
  await page.click('#book-save-html');const book=await collect(bookPath);
  report.bookHtmlBytes=book.length;report.bookHtmlSha256=sha(book);assert.equal(report.bookHtmlSha256,report.receiptSha256);
  event('book-downloaded');
  await page.$eval('#pf-book-print',f=>f.contentWindow.addEventListener('beforeprint',()=>{f.dataset.observedBeforeprint='1';},{once:true}));
  await page.click('#book-open-print');await page.waitForFunction(()=>document.querySelector('#pf-book-print')?.dataset.observedBeforeprint==='1',{timeout:20000});
  event('product-print-requested');
  const print=await ctx.newPage();
  // Keep the Blob-backed product document as the print target. A same-origin
  // top-level browsing context lets CDP print the document without the studio/UI.
  await print.goto(base+'/favicon.svg');
  const response=await print.goto(frameUrl,{waitUntil:'load',timeout:180000});
  report.printResponseSha256=sha(await response.buffer());assert.equal(report.printResponseSha256,report.bookHtmlSha256);
  await print.evaluate(()=>document.fonts.ready);
  await page.close();event('product-document-bound');await save();
  const paginationAt=performance.now();
  const stream=await print.createPDFStream({printBackground:true,preferCSSPageSize:true,displayHeaderFooter:false,timeout:deadline});
  const streamAt=performance.now(), pdfDigest=createHash('sha256');
  let pdfBytes=0;
  await pipeline(stream,async function* measure(chunks){
    for await (const bytes of chunks){pdfDigest.update(bytes);pdfBytes+=bytes.length;yield bytes;}
  },createWriteStream(pdfPath));
  report.profile={browserPaginationAndPdfSerializationMs:Math.round(streamAt-paginationAt),readPdfStreamAndWriteFileMs:Math.round(performance.now()-streamAt)};
  report.pdfSha256=pdfDigest.digest('hex');report.pdfBytes=pdfBytes;report.savedPdfSha256=sha(await readFile(pdfPath));assert.equal(report.pdfSha256,report.savedPdfSha256);
  event('pdf-saved');await print.close();
  const offline=await ctx.newPage(),requests=[];
  offline.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.resourceType());});
  await offline.setOfflineMode(true);await offline.goto(pathToFileURL(htmlPath).href,{timeout:180000});await offline.evaluate(()=>document.fonts.ready);
  report.offline=await offline.evaluate(async()=>{
    const article=document.querySelector('article'), blocks=[...article.querySelectorAll('[data-block-id]')].filter(n=>!n.parentElement.closest('[data-block-id]'));
    const last=blocks.filter(b=>b.textContent.trim()).at(-1);
    const selection=getSelection(),range=document.createRange();range.selectNodeContents(last);selection.removeAllRanges();selection.addRange(range);
    const compact=s=>s.normalize('NFC').replace(/\s+/gu,'');
    const selectionReadable=compact(selection.toString())===compact(last.textContent);
    const anchors=[...document.querySelectorAll('a[href^="#"]')].filter(a=>a.hash.length>1);
    const targets=anchors.map(a=>document.getElementById(decodeURIComponent(a.hash.slice(1))));
    if(targets[0])anchors[0].click();
    const fonts=[...document.fonts];await Promise.all(fonts.map(f=>f.load()));
    return {sourceBlocks:blocks.length,anchors:anchors.length,valid:targets.filter(Boolean).length,firstAnchorNavigates:!anchors.length||location.hash===anchors[0].hash,selectionReadable,scripts:document.scripts.length,fonts:fonts.length,fontsLoaded:fonts.filter(f=>f.status==='loaded').length,images:document.images.length,imagesLoaded:[...document.images].filter(i=>i.complete && i.naturalWidth>0).length};
  });
  report.offline.networkRequests=requests;assert.equal(requests.length,0);assert.equal(report.offline.scripts,0);
  assert.equal(report.offline.anchors,report.offline.valid);assert.ok(report.offline.selectionReadable && report.offline.firstAnchorNavigates);
  assert.equal(report.offline.fonts,report.offline.fontsLoaded);assert.equal(report.offline.images,report.offline.imagesLoaded);
  event('offline-reopened');report.pageErrorHashes=errors;assert.deepEqual(errors,[]);
  await ctx.close();await browser.close();browser=null;await save();
  const verificationAt=performance.now();
  const physical=JSON.parse(execFileSync(process.env.PF_PYTHON || (process.platform === 'win32' ? 'python' : 'python3'),['docs/verification-tools/verify-product-book.py',input,htmlPath,bookPath,pdfPath,JSON.stringify({...report.settings,settingsTitleSha256:report.settingsTitleSha256})],{encoding:'utf8',maxBuffer:8<<20}));
  report.profile.independentReopenAndComparisonMs=Math.round(performance.now()-verificationAt);
  Object.assign(report.offline,{
    expectedTextSha256:physical.htmlSourceProjection.text,actualTextSha256:physical.standaloneProjection.text,
    expectedStructureSha256:physical.htmlSourceProjection.shape,actualStructureSha256:physical.standaloneProjection.shape
  });
  report.physical=physical;event('physical-reopened');report.status=physical.pass?'PASS':'FAIL';
  if(!physical.pass)process.exitCode=1;
}catch(error){report.status='FAIL';report.error=privateCase ? 'Private case stopped during '+(report.events.at(-1)?.phase||'startup') : String(error.message).split('\n')[0].slice(0,220);process.exitCode=1;}
finally{
  await browser?.close().catch(()=>{});await new Promise(done=>server.close(done));await rm(dir,{recursive:true,force:true});
  report.finishedAt=new Date().toISOString();await save();console.log(name,report.status,report.error||report.physical?.differences||[]);
}
