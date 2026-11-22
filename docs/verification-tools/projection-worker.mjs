// Production-browser probe of independent source checking and cancellation before
// an iframe exists. Instrument only worker-message metadata, never document text.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {dirname} from 'node:path';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {launch} from '../../tests/e2e/lib.mjs';
import {candidateSha256,distTreeSha256} from '../../scripts/fingerprint.mjs';
const file=process.env.PF_PROJECTION_OUT||'evidence/rc12/lifecycle/projection-worker.json';
const build=JSON.parse(await readFile('dist.build-manifest.json'));
if(!process.env.PF_TRACE_DIST){assert.equal(build.candidateSha256,candidateSha256());assert.equal(build.distTreeSha256,distTreeSha256());}
const source=await readFile('fixtures/rc9/paragraphs-217850.md','utf8');
const hash=v=>createHash('sha256').update(v).digest('hex');
const env=await launch({dir:process.env.PF_TRACE_DIST||'dist',port:4767});
const out={build:process.env.PF_TRACE_DIST?null:build,source:hash(source),browser:await env.browser.version(),rows:[]};
await mkdir(dirname(file),{recursive:true});
try{
 const p=await env.browser.newPage();p.setDefaultTimeout(50000);
 await p.evaluateOnNewDocument(()=>{
  const Native=window.Worker;
  window.projectionRows=[];
  window.Worker=class extends Native {
   constructor(url,options){
    super(url,options);
    if(options?.name!=='paperforma-print-projection')return;
    const r=this.row={job:window.testJob,created:performance.now()};
    window.projectionRows.push(r);
    const cancel=()=>{r.cancel=performance.now();document.querySelector('#pub-cancel').click();};
    if(r.job==='startup')queueMicrotask(cancel);
    this.addEventListener('message',e=>{
     if(e.data?.type==='ready')r.ready=performance.now();
     if(e.data?.type==='print-projection-result'){r.reply=performance.now();r.keyUnits=e.data.key.length;}
    });
   }
   postMessage(data,...rest){
    const at=performance.now();const result=super.postMessage(data,...rest);
    if(this.row){
     this.row.sent=at;this.row.postMs=performance.now()-at;this.row.sourceUnits=data.source?.length;
     if(this.row.job==='computing')queueMicrotask(()=>{this.row.cancel=performance.now();document.querySelector('#pub-cancel').click();});
    }
    return result;
   }
   terminate(){if(this.row)this.row.terminated=performance.now();return super.terminate();}
  };
  addEventListener('message',e=>{
   if(window.testJob!=='retry'||e.origin!==location.origin||e.data?.type!=='pf-print-ready')return;
   const f=document.querySelector('iframe[title="PaperForma print"]');
   if(f&&e.source===f.contentWindow){window.projectionRows.at(-1).cancel=performance.now();document.querySelector('#pub-cancel').click();}
  });
 });
 await p.goto(env.base+'/#/workspace');
 await p.waitForFunction(()=>/rev \d+/.test(document.querySelector('#src-hash')?.textContent||''));
 await p.$eval('#editor',(e,v)=>{e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));},source);
 await p.waitForFunction(()=>document.querySelector('#live-frame')?.contentDocument?.querySelector('article')?.textContent.includes('kata217844'),{timeout:180000});
 for(const job of ['startup','computing','retry']){
  await p.evaluate(j=>{window.testJob=j;},job);
  await p.$eval('.ws-actions [data-action=publish]',e=>e.click());await p.waitForSelector('#dlg-publish[open]');
  await p.click('input[name=pub-kind][value=print]');if(await p.$('#pub-ack'))await p.click('#pub-ack');
  await p.click('#pub-go');
  await p.waitForFunction(()=>!document.querySelector('#publish-result').hidden&&/dibatalkan|cancelled/i.test(document.querySelector('#publish-result').textContent));
  const row=await p.evaluate(()=>({...window.projectionRows.at(-1),idle:performance.now(),frames:document.querySelectorAll('iframe[title="PaperForma print"]').length}));
  out.rows.push(row);assert.equal(row.job,job);assert.ok(row.terminated>=row.created&&row.idle-row.cancel<=2000);assert.equal(row.frames,0);
  if(job==='startup')assert.equal(row.sent,undefined);
  else {assert.equal(row.sourceUnits,source.length);assert.ok(row.postMs<=1000);}
  if(job==='retry'){assert.ok(row.keyUnits>0&&row.reply>=row.sent&&row.terminated>=row.reply&&row.terminated-row.reply<=1000);}
  else assert.equal(row.reply,undefined);
  await p.click('#pub-close');
 }
 assert.equal(hash(await p.$eval('#editor',e=>e.value)),out.source);
 out.pass=true;
}finally{await writeFile(file,JSON.stringify(out,null,2));await env.close();}
