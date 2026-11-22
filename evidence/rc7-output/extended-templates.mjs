/** Complement the 231-formula matrix with a small synthetic document and the full pre-existing mixed document. */
import {mkdtemp,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {setTimeout as wait} from 'node:timers/promises';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {launch} from '../../tests/e2e/lib.mjs';
import {treeHash} from '../../scripts/fingerprint.mjs';
const scratch=await mkdtemp(join(tmpdir(),'pf-templates-'));
const small=join(scratch,'small.md');
await writeFile(small,'# Small check\n\nFirst $x^2$.\n\n| Name | Value |\n|---|---|\n| Alpha | 12 |\n\nEnd of small check.\n');
const cases=[{id:'small-synthetic',file:small,n:1,end:'End of small check.'},{id:'original-long-mixed',file:resolve('fixtures/mixed-document.md'),n:3,end:'PENUTUP-AKHIR-DOKUMEN'}];
const env=await launch({dir:'dist',port:4368});
const report={engine:await env.browser.version(),distTree:treeHash(['dist'],resolve('.')).sha256,cases:[]};
try{
  for(const c of cases){
    for(const template of ['BUS-01','EDU-01','EDT-01','CON-01']){
      const folder=await mkdtemp(join(scratch,'d-'));
      const ctx=await env.browser.createBrowserContext({downloadBehavior:{policy:'allow',downloadPath:folder}});
      const rec={id:c.id,template};report.cases.push(rec);
      try{
        const p=await ctx.newPage();await p.setViewport({width:1440,height:1000});await p.goto(env.base+'/#/workspace');
        await p.waitForSelector('#editor');await (await p.$('#file-open')).uploadFile(c.file);
        await p.waitForFunction(s=>document.querySelector('#live-frame')?.contentDocument?.body?.textContent.includes(s),{},c.end);
        await p.click('[data-tpl="'+template+'"]');await p.click('[data-action="publish"]');
        await p.waitForSelector('#dlg-publish[open] input[value="html-standalone"]',{visible:true});
        await p.click('input[value="html-standalone"]');
        if(await p.$('#pub-ack'))await p.click('#pub-ack');
        await p.click('#pub-go');await p.waitForSelector('#publish-result:not([hidden])');
        if(await p.$('#pub-review-ack')){rec.review=await p.$eval('#publish-result h3',n=>n.innerText);await p.click('#pub-review-ack');await p.click('#publish-result .btn-primary');}
        await p.waitForSelector('#publish-result.banner-ok');const receipt=await p.$eval('#publish-result',e=>e.innerText);
        let f;for(let i=0;i<120;i++){f=(await readdir(folder)).find(n=>/\.html$/i.test(n));if(f)break;await wait(250);}
        if(!f)throw new Error('HTML missing after completed UI export');
        const file=join(folder,f),bytes=await readFile(file);rec.sha256=createHash('sha256').update(bytes).digest('hex');rec.bytes=bytes.length;
        if(!receipt.includes(rec.sha256))throw new Error('Browser download does not match the application receipt');
        const isolated=await env.browser.createBrowserContext();
        try{
          const q=await isolated.newPage();const req=[];
          q.on('request',r=>{if(/^https?:/i.test(r.url()))req.push(r.url());});await q.setOfflineMode(true);await q.goto(pathToFileURL(file).href);
          rec.output=await q.evaluate(async ({c,template})=>{
            const fonts=await Promise.allSettled([...document.fonts].map(f=>f.load()));
            const imgs=[...document.images];await Promise.allSettled(imgs.map(i=>i.decode()));
            const article=document.querySelector('[data-template]');
            return {offline:!navigator.onLine,template:article?.dataset.template,templateMatch:article?.dataset.template===template,
              formulas:document.querySelectorAll('.pf-math .katex').length,tables:article?.querySelectorAll('table').length,
              hasEnd:!!article?.textContent.includes(c.end),fontsLoaded:fonts.filter(r=>r.status==='fulfilled').length,fonts:fonts.length,images:imgs.length,imagesDecoded:imgs.filter(i=>i.complete && i.naturalWidth>0).length};
          },{c,template});rec.networkRequests=req;const v=rec.output;
          rec.status=v.templateMatch && v.offline && v.hasEnd && v.formulas===c.n && v.tables>=1 && v.fonts>0 && v.fontsLoaded===v.fonts && v.images===v.imagesDecoded && !req.length?'PASS':'FAIL';
        }finally{await isolated.close();}
      }catch(error){rec.status='FAIL';rec.error=String(error);}
      finally{await ctx.close();}
    }
  }
}finally{await env.close();await rm(scratch,{recursive:true,force:true});}
await writeFile('evidence/rc7-output/extended-templates.json',JSON.stringify(report,null,2)+'\n');
if(report.cases.some(c=>c.status!=='PASS'))process.exitCode=1;
