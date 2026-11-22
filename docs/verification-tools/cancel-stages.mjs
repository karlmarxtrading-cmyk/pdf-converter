import {launch} from '../../tests/e2e/lib.mjs';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname} from 'node:path';
import {candidateSha256,distTreeSha256} from '../../scripts/fingerprint.mjs';
const file=process.env.PF_LIFECYCLE_OUTPUT || 'evidence/rc12/lifecycle/cancel-stages.json';
await mkdir(dirname(file),{recursive:true});
const identity=JSON.parse(await readFile('dist.build-manifest.json'));
if(!process.env.PF_TRACE_DIST && (identity.profile!=='production'||candidateSha256()!==identity.candidateSha256||distTreeSha256()!==identity.distTreeSha256))throw Error('Source/dist identity mismatch');
const env=await launch({dir:process.env.PF_TRACE_DIST||'dist',port:Number(process.env.PF_LIFECYCLE_PORT||4758)});
const source=process.env.PF_LIFECYCLE_SOURCE ? await readFile(process.env.PF_LIFECYCLE_SOURCE,'utf8') :
  Array.from({length:1200},(_,i)=>'Baris '+(i+1)+' '+('belajar bersama tentang pecahan dan bilangan. '.repeat(10))).join('\n\n');
const hash=s=>createHash('sha256').update(s).digest('hex');
const out={method:'Production workspace and actual print Cancel button, triggered by a matching same-origin print-frame message. A 50 ms main-window timer measures scheduling gaps from Publish through visible idle. Heap is the CDP target after GC, not the native renderer footprint.',source:hash(source),large:!!process.env.PF_LIFECYCLE_SOURCE,identity:process.env.PF_TRACE_DIST?null:identity,browser:await env.browser.version(),rows:[]};
const save=()=>writeFile(file,JSON.stringify(out,null,2));
const phases=['startup-ready','fonts','images','paginate','heading-check','diagnostics','flatten','inventory','inventory-reopen','geometry','verified-pages'];
try {
 const page=await env.browser.newPage();page.setDefaultTimeout(90000);
 const cdp=await page.createCDPSession();
 const heap=async()=>{await cdp.send('HeapProfiler.collectGarbage');return(await cdp.send('Runtime.getHeapUsage')).usedSize;};
 await page.setViewport({width:1440,height:960});await page.goto(env.base+'/#/workspace');
 await page.waitForFunction(()=>/rev \d+/.test(document.querySelector('#src-hash')?.textContent||''));
 await page.$eval('#editor',(e,v)=>{e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));},source);
 await page.waitForFunction(s=>document.querySelector('#live-frame')?.contentDocument?.querySelector('article')?.textContent.includes(s),{timeout:180000},source.includes('Baris 1200')?'Baris 1200':source.split(/\s+/).filter(Boolean).slice(-5,-4)[0]);
 await page.evaluate(()=>{
  window.addEventListener('message',e=>{
   const f=document.querySelector('iframe[title="PaperForma print"]'),r=window.runMetric;
   if(!r||!f||e.source!==f.contentWindow||e.origin!==location.origin)return;
   const m=e.data;
   const phase=m?.type==='pf-print-ready'?'startup-ready':m?.type==='pf-print-progress'?m.phase:null;
   if(!phase||!r.started)return;
   const at=performance.now()-r.started;
   r.progress.push({ms:at,phase,job:m.jobId||null,pass:m.pass??0,units:m.units??m.pages??0});
   if(phase===r.target&&!r.cross&&!document.querySelector('#pub-cancel').hidden){
    r.cross={ms:at,job:m.jobId||null,phase};
    document.querySelector('#pub-cancel').click();
   }
  },true);
 });
 for(const phase of phases){
  try{
   await page.$eval('.ws-actions [data-action=publish]',e=>e.click());await page.waitForSelector('#dlg-publish[open]');
   await page.click('input[name=pub-kind][value=print]');if(await page.$('#pub-ack'))await page.click('#pub-ack');
   const heapBefore=await heap();
   await page.evaluate(target=>{
    const r=window.runMetric={target,progress:[],loop:[0],cross:null,started:0,idle:0};
    const button=document.querySelector('#pub-go');
    const result=document.querySelector('#publish-result');
    button.addEventListener('click',()=>{
     r.started=performance.now();
     const timer=setInterval(()=>r.loop.push(performance.now()-r.started),50);
     const observer=new MutationObserver(()=>{
      if(result.hidden)return;
      r.idle=performance.now()-r.started;r.loop.push(r.idle);clearInterval(timer);observer.disconnect();
     });
     observer.observe(result,{attributes:true,childList:true,subtree:true});
    },{once:true,capture:true});
   },phase);
   await page.click('#pub-go');
   await page.waitForFunction(()=>window.runMetric.idle>0,{timeout:915000,polling:40});
   const row=await page.evaluate(()=>{
    const r=window.runMetric;window.runMetric=null;
    return {...r,cancelled:/dibatalkan|cancelled/i.test(document.querySelector('#publish-result').textContent),frames:document.querySelectorAll('iframe[title="PaperForma print"]').length,source:document.querySelector('#editor').value};
   });
   row.source=hash(row.source);
   await page.click('#pub-close');
   row.heapBefore=heapBefore;row.heapAfter=await heap();
   row.phase=phase;row.elapsed=row.cross?row.idle-row.cross.ms:null;
   row.pass=row.cross?.phase===phase&&row.cancelled&&row.frames===0&&row.source===out.source;
   out.rows.push(row);
  }catch(e){out.rows.push({phase,pass:false,error:e.message});break;}
  await save();
 }
 out.pass=out.rows.length===phases.length&&out.rows.every(r=>r.pass);
}finally{await save();await env.close();}
if(!out.pass)process.exitCode=1;
