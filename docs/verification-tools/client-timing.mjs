/** Use the actual print client in Chromium, a controlled frame and real wall clocks. */
import {candidateSha256,distTreeSha256} from '../../scripts/fingerprint.mjs';
import {build} from 'esbuild';import {createServer} from 'node:http';import {mkdir,readFile,writeFile} from 'node:fs/promises';import puppeteer from 'puppeteer-core';import {findChromium} from '../../scripts/browser-path.mjs';
const buildIdentity=JSON.parse(await readFile('dist.build-manifest.json'));
if (!process.env.PF_TRACE_DIST && (buildIdentity.profile!=='production'||candidateSha256()!==buildIdentity.candidateSha256||distTreeSha256()!==buildIdentity.distTreeSha256))throw Error('Source/dist identity mismatch');
const prefix=process.env.PF_TRACE_OUT||'evidence/rc12/lifecycle';
const built=await build({entryPoints:['src/render/print-client.ts'],bundle:true,format:'esm',write:false,platform:'browser'});
const script=`const kind=new URL(location).searchParams.get('kind');
const send=m=>parent.postMessage(m,location.origin);
if(kind!=='no-ready')send({type:'pf-print-ready'});
onmessage=e=>{if(e.source!==parent||e.origin!==location.origin||e.data?.type!=='pf-print')return;
 const jobId=e.data.payload.jobId, result=(id,marker)=>send({type:'pf-print-result',jobId:id,result:{status:'ok',marker}});
 if(kind==='near'){let pages=0;let timer=setInterval(()=>send({type:'pf-print-progress',jobId,phase:'paginate',pass:1,pages:++pages}),110);setTimeout(()=>{clearInterval(timer);result(jobId,'official');},1300);}
 if(kind==='repeat'){setInterval(()=>send({type:'pf-print-progress',jobId,phase:'paginate',pass:1,pages:7}),65);}
 if(kind==='stale'){result('previous-job','stale');setTimeout(()=>result(jobId,'official'),250);}
 if(kind==='total'){let pages=0;setInterval(()=>send({type:'pf-print-progress',jobId,phase:'paginate',pass:1,pages:++pages}),65);}
};`;
const http=createServer((q,r)=>{const path=new URL(q.url,'http://localhost').pathname;
 if(path==='/client.mjs'){r.setHeader('Content-Type','text/javascript');r.end(built.outputFiles[0].text);return;}
 r.setHeader('Content-Type','text/html');r.end(path==='/frame'?'<script>'+script+'</script>':'<div id="ready">ready</div>');
});await new Promise(r=>http.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+http.address().port;
const browser=await puppeteer.launch({headless:true,pipe:true,executablePath:findChromium(),args:['--no-sandbox','--disable-dev-shm-usage']});
const out={build:process.env.PF_TRACE_DIST?null:buildIdentity,browser:await browser.version(),method:'Bundled candidate print-client.ts, real browser messages and timers, controlled responders. Full Paged.js jobs and real UI cancellation are separate evidence.',rows:[]};
try{
 const page=await browser.newPage();await page.goto(origin);
 for(const [kind,want] of [['no-ready','FRAME_STARTUP_TIMEOUT'],['repeat','FRAME_STALLED'],['total','FRAME_DEADLINE'],['stale','official'],['near','official']]){
 const row=await page.evaluate(async({kind,origin})=>{
  const {paginateInFrame}=await import('/client.mjs');const jobId='current-'+kind;let result,code;const events=[],now=performance.now();
  const task=paginateInFrame({page:{widthMm:210},jobId,bodyInner:'abc'},{
    timeoutMs:kind==='near'?1800:950,stallMs:400,startupMs:500,printUrl:origin+'/frame?kind='+kind,onProgress:p=>events.push({phase:p.phase,pages:p.pages,at:Math.round(performance.now()-now)})});
  if(kind==='stale'){
   window.postMessage({type:'pf-print-result',jobId,result:{status:'ok',marker:'wrong-window'}},origin);
   const frame=document.querySelector('iframe');window.dispatchEvent(new MessageEvent('message',{origin:'https://else.invalid',source:frame.contentWindow,data:{type:'pf-print-result',jobId,result:{status:'ok',marker:'wrong-origin'}}}));
  }
  try{result=(await task).result.marker;}catch(e){code=e.failure?.code;}
  return {kind,result,code,progress:events,elapsedMs:Math.round(performance.now()-now),remainingFrames:document.querySelectorAll('iframe').length};
 },{kind,origin});
 row.pass=(row.code||row.result)===want&&row.remainingFrames===0;out.rows.push(row);
 }
 await page.bringToFront();
 await page.evaluate(async(origin)=>{
   const {paginateInFrame}=await import('/client.mjs');
   window.visibilityLog=[{state:document.visibilityState,ms:performance.now()}];
   document.addEventListener('visibilitychange',()=>window.visibilityLog.push({state:document.visibilityState,ms:performance.now()}));
   window.backgroundJob=paginateInFrame({page:{widthMm:210},jobId:'background',bodyInner:'abc'},
     {timeoutMs:5000,stallMs:2500,printUrl:origin+'/frame?kind=near'}).then(x=>x.result.marker,e=>e.failure?.code);
 },origin);
 const front=await browser.newPage();await front.bringToFront();
 if(await page.evaluate(()=>document.visibilityState)==='visible') {
   // Headless-shell may keep both tabs visible. Exercise actual page freeze,
   // resume and foreground focus via CDP; record the document's own events.
   const cdp=await page.createCDPSession();
   await cdp.send('Page.setWebLifecycleState',{state:'frozen'});
   await new Promise(resolve=>setTimeout(resolve,400));
   await cdp.send('Page.setWebLifecycleState',{state:'active'});
   await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:true});
   out.visibilityProtocol='Controlled CDP freeze/resume and focus emulation, not a native OS switch';
 }else{
   await new Promise(resolve=>setTimeout(resolve,400));
   out.visibilityProtocol='Browser tab activation';
 }
 await page.bringToFront();await front.close();
 out.backgroundOutcome=await page.evaluate(()=>window.backgroundJob);
 out.visibility=await page.evaluate(()=>window.visibilityLog);
 out.pass=out.rows.every(r=>r.pass)&&out.backgroundOutcome==='official'&&
   out.visibility.map(e=>e.state).join(',')==='visible,hidden,visible';
}finally{await mkdir(prefix,{recursive:true});await writeFile(prefix+'/client-timing.json',JSON.stringify(out,null,2));await browser.close();await new Promise(r=>http.close(r));}
if(!out.pass)process.exitCode=1;
