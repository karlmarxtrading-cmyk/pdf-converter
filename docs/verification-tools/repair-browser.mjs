import {candidateSha256,distTreeSha256} from '../../scripts/fingerprint.mjs';
import {launch} from '../../tests/e2e/lib.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const identity=JSON.parse(await readFile('dist.build-manifest.json'));
if(!process.env.PF_TRACE_DIST&&(identity.profile!=='production'||candidateSha256()!==identity.candidateSha256||distTreeSha256()!==identity.distTreeSha256))throw Error('Source/dist identity mismatch');
const env=await launch({dir:process.env.PF_TRACE_DIST||'dist',port:4794});const origin=env.base;
const out={method:'Real production print.html and Paged.js. Synthetic geometry controls are added to an otherwise ordinary studio payload to deliberately strand 0, 1 and 6 headings.',build:process.env.PF_TRACE_DIST?null:identity,rows:[]};
const prefix=process.env.PF_TRACE_OUT||'evidence/rc12/accounting'; const file=prefix+'/browser.json';await mkdir(prefix,{recursive:true});
try{
const p=await env.browser.newPage();await p.evaluateOnNewDocument(()=>{if(window!==parent)window.addEventListener('message',e=>{if(e.origin===location.origin&&e.data?.type==='pf-print'&&!parent.pfSeed)parent.pfSeed=e.data.payload;});});
await p.goto(origin+'/#/workspace');await p.waitForFunction(()=>/rev \d+/.test(document.querySelector('#src-hash')?.textContent||''));
await p.$eval('#editor',e=>{e.value='# Pembuka\n\nNaskah untuk pengujian paginasi.';e.dispatchEvent(new Event('input',{bubbles:true}));});
await p.waitForFunction(()=>document.querySelector('#live-frame')?.contentDocument?.querySelector('article')?.textContent.includes('pengujian paginasi'));
await p.$eval('.ws-actions [data-action=publish]',e=>e.click());await p.waitForSelector('#dlg-publish[open]');await p.click('input[name=pub-kind][value=print]');
if(await p.$('#pub-ack'))await p.click('#pub-ack');await p.click('#pub-go');await p.waitForFunction(()=>window.pfSeed&& !document.querySelector('#publish-result').hidden);
for(const repairs of [0,1,6])for(const toc of [false,true]){
 const row=await p.evaluate(async({repairs,toc})=>{
  const cfg=structuredClone(window.pfSeed),tmp=document.createElement('div');tmp.innerHTML=cfg.bodyInner;
  const article=tmp.querySelector('article');const count=Math.max(1,repairs),ids=[];
  cfg.jobId='controlled-'+repairs+'-'+toc;cfg.settings.cover=false;cfg.settings.toc=toc;
  tmp.querySelectorAll('.pf-cover,.pf-toc').forEach(el=>el.remove());article.replaceChildren();
  const add=(tag,cls,id,value)=>{const e=document.createElement(tag);e.className=cls;e.id=id;e.dataset.blockId=id;e.textContent=value;article.append(e);};
  for(let i=0;i<count;i++){
   const id='control-h-'+i;ids.push(id);add('p','study-lead','lead'+i,'Awal bagian '+i);
   add('h2','study-heading',id,'Judul '+i);add('blockquote','study-follow','follow'+i,'Isi bagian '+i);
  }
  if(toc){
   const menu=document.createElement('nav');menu.className='pf-toc';menu.innerHTML=ids.map(id=>'<a href="#'+id+'">Judul <span class="pf-toc-page" data-target="'+id+'">0</span></a>').join('');article.before(menu);
  }
  cfg.headingIds=ids;cfg.tocIds=toc?ids:[];cfg.bodyInner=tmp.innerHTML;cfg.styles.push('.study-lead{break-before:page;height:'+(repairs?Math.round(cfg.page.contentHeightMm*.80):15)+'mm!important;margin:0!important;} .study-heading{break-before:auto;break-after:auto!important;margin:0!important;} .study-heading.pf-force-break{break-before:page!important;} .study-follow{break-inside:avoid!important;height:80mm;margin:0!important;}');
  let f;return new Promise((ok,fail)=>{
   const cleanup=()=>{clearTimeout(timer);removeEventListener('message',listener);f?.remove();};
   const timer=setTimeout(()=>{cleanup();fail(Error('Print control deadline'));},60000);
   function listener(e){if(e.origin!==location.origin||e.source!==f.contentWindow)return;const m=e.data;
    if(m.type==='pf-print-ready')f.contentWindow.postMessage({type:'pf-print',payload:cfg},location.origin);
    if(m.type==='pf-print-error'){cleanup();fail(Error(m.failure.message));}
    if(m.type==='pf-print-result'){const {timings,trace,events,status,verification}=m.result;cleanup();ok({repairs,toc,status,verification:verification.status,timings,trace,events,pass:status==='ok'&&timings.forcedBreaks===repairs&&verification.status==='pass'});}
   }
   addEventListener('message',listener);f=document.createElement('iframe');f.src='/print.html';f.style='position:absolute;left:-3000px;width:1000px;height:1100px';document.body.append(f);
  });
 },{repairs,toc});out.rows.push(row);await writeFile(file,JSON.stringify(out,null,2));
}
out.pass=out.rows.every(r=>r.pass);
}finally{await writeFile(file,JSON.stringify(out,null,2));await env.close();}
if(!out.pass)process.exitCode=1;
