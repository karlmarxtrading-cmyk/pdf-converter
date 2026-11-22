/** Capture the exact verified print response from a fresh studio import without a second document tab. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';import {resolve,join} from 'node:path';
import puppeteer from 'puppeteer-core';import {startServer} from '../../scripts/serve-dist.mjs';import {findChromium} from '../../scripts/browser-path.mjs';import {createHash} from 'node:crypto';import {setTimeout as delay} from 'node:timers/promises';
const [sourceArg,outArg,reportArg]=process.argv.slice(2);if(!reportArg)throw Error('Pass source, private output directory, receipt directory.');
const out=resolve(outArg),reports=resolve(reportArg);await mkdir(out,{recursive:true});await mkdir(reports,{recursive:true});
const hash=s=>createHash('sha256').update(s).digest('hex'),source=await readFile(resolve(sourceArg)),build=JSON.parse(await readFile('dist.build-manifest.json'));
const server=await startServer('dist',0),origin='http://127.0.0.1:'+server.address().port,browser=await puppeteer.launch({headless:true,pipe:true,executablePath:findChromium(),protocolTimeout:900000,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--font-render-hinting=none','--lang=id-ID']});
const page=await browser.newPage(),t=Date.now(),d={sourceSha256:hash(source),sourceBytes:source.length,identity:build.candidateSha256,dist:build.distTreeSha256,browser:await browser.version(),status:'RUNNING',phase:'import',events:[]};
const save=()=>writeFile(join(reports,'original-default.json'),JSON.stringify(d,null,2));
const timer=setInterval(()=>void save().catch(()=>{}),4000);let crashed=false;
page.on('error',()=>{crashed=true;d.browserCrash=true;void save();});
try{
 await page.setViewport({width:1440,height:1000});await page.goto(origin+'/#/workspace');await page.waitForFunction(()=>/rev \d+/.test(document.querySelector('#src-hash')?.textContent||''));
 await (await page.$('#file-open')).uploadFile(resolve(sourceArg));await page.waitForFunction(()=>!!document.querySelector('#live-frame')?.contentDocument?.querySelector('[data-block-id]'),{timeout:160000});
 d.editorHash=hash(await page.$eval('#editor',e=>e.value));if(d.editorHash!==hash(source.toString().replace(/\r\n?/g,'\n')))throw Error('Source mismatch');
 await page.exposeFunction('reportPrint',v=>{d.events.push({...v,wallMs:Date.now()-t});});
 await page.evaluate(()=>{addEventListener('message',e=>{const f=document.querySelector('iframe[title="PaperForma print"]'),m=e.data;if(!f||e.source!==f.contentWindow||e.origin!==location.origin||!m)return;
   const {type,phase,pass,pages,units,jobId}=m;if(type==='pf-print-result')window.savedPrint=m.result;
   if(type)void window.reportPrint({type,phase,pass,pages,units,jobId});
 });});
 await page.$eval('.ws-actions [data-action=publish]',e=>e.click());await page.waitForSelector('#dlg-publish[open]');await page.click('input[name=pub-kind][value=print]');if(await page.$('#pub-ack'))await page.click('#pub-ack');d.inputSummary=await page.$eval('#publish-summary',e=>e.innerText);
 d.phase='print';await page.click('#pub-go');const until=Date.now()+960000;
 for(;;){if(crashed)throw Error('Chromium renderer crashed');if(Date.now()>until)throw Error('Observer deadline');if(await page.$eval('#publish-result',e=>!e.hidden))break;await delay(750);}
 const verified=await page.$('#publish-result.banner-ok');if(!verified)throw Error('Print guard rejected the layout');
 const result=await page.evaluate(()=>{const r=window.savedPrint;return {html:r.flattenedHtml,pages:r.pageCount,verification:r.verification,trace:r.trace,timings:r.timings};});
 d.flatSha256=hash(result.html);if(!(await page.$eval('#publish-result',e=>e.textContent)).includes(d.flatSha256)||result.verification.status!=='pass')throw Error('Page receipt mismatch');
 await writeFile(join(out,'verified-layout.private.html'),result.html);delete result.html;d.layout=result;d.phase='captured-layout';d.status='VERIFIED_LAYOUT_SAVED';
}catch(e){d.error=String(e.message);d.status='FAIL';process.exitCode=1;}
finally{clearInterval(timer);d.elapsedMs=Date.now()-t;await save();await browser.close();await new Promise(res=>server.close(res));}
