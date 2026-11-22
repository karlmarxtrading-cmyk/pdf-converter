// Exercises a raw Markdown import and a browser-generated synthetic HTML/plain clipboard pair.
// Run from the project root after building. No private provider sessions or QA globals.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { launch } from './lib.mjs';
import { treeHash } from '../../scripts/fingerprint.mjs';

const cases = JSON.parse(await readFile('fixtures/rc8/mixed-wrappers.json','utf8'));
const subset = ['section','collapse','math-in-table-with-note'];
const sample = subset.map(name => cases.find(c=>c.name===name).html).join('\n\n');
const plain = 'KEEP-INDEPENDENT-CONTENT x+1 Definition Retained body x+1 Weights Group A Empty below End x+1';
const hash = data=>createHash('sha256').update(data).digest('hex');
const dir = process.env.PF_WRAPPER_DIST || 'dist';
const output = resolve(process.env.PF_WRAPPER_OUTPUT || 'evidence/rc12/wrappers');
await mkdir(output,{recursive:true});
const temp = await mkdtemp(join(tmpdir(),'paperforma-rich-'));
const env = await launch({dir,port:Number(process.env.PF_WRAPPER_PORT || 4375)});
const report = { browser:await env.browser.version(), productionTree:treeHash([dir]).sha256,sourceSha256:hash(sample),results:[] };
try {
  for(const route of ['raw','clipboard']){
    const download = join(temp,route);
    await mkdir(download);
    const ctx = await env.browser.createBrowserContext({downloadBehavior:{policy:'allow',downloadPath:download}});
    const page = await ctx.newPage();
    try {
      await page.setViewport({width:1440,height:1000});
      await page.goto(env.base+'/#/workspace');
      await page.waitForSelector('#editor');
      if(route==='raw'){
        const file=join(temp,'mixed-wrappers.md');
        await writeFile(file,sample);
        await (await page.$('#file-open')).uploadFile(file);
      }else{
        await ctx.overridePermissions(env.base,['clipboard-read','clipboard-write','clipboard-sanitized-write']);
        const visible=await Promise.all((await page.$$('[data-action="paste"]')).map(async b=>await b.isVisible()?b:null));
        const pasteButton=visible.find(Boolean); assert.ok(pasteButton,'visible paste action'); await pasteButton.click();
        await page.evaluate(async (html,text)=>{
          const item = new ClipboardItem({'text/html':new Blob([html],{type:'text/html'}),'text/plain':new Blob([text],{type:'text/plain'})});
          await navigator.clipboard.write([item]);
        },sample,plain);
        await page.focus('#paste-area');
        await page.keyboard.down('Control');await page.keyboard.press('v');await page.keyboard.up('Control');
        await page.waitForSelector('#paste-rich:not([hidden])');
        assert.ok(await page.$eval('input[name=paste-repr][value=markdown]',input=>input.checked && !input.disabled));
        await page.click('#paste-ok');
        await page.waitForSelector('#dlg-diff[open]');
        await page.click('#dlg-diff button[value=apply]');
      }
      await page.waitForFunction(()=>document.querySelector('#live-frame')?.contentDocument?.querySelectorAll('.pf-math').length===3);
      await page.click('[data-action="publish"]');
      await page.waitForSelector('#dlg-publish[open] input[value="html-standalone"]',{visible:true});
      await page.click('input[value="html-standalone"]');
      if(await page.$('#pub-ack')) await page.click('#pub-ack');
      await page.click('#pub-go');
      await page.waitForSelector('#publish-result:not([hidden])');
      if(await page.$('#pub-review-ack')){
        await page.click('#pub-review-ack');await page.click('#publish-result .btn-primary');
      }
      await page.waitForSelector('#publish-result.banner-ok');
      let name;
      for(let i=0;i<120&&!name;i++){name=(await readdir(download)).find(n=>/\.html$/i.test(n));if(!name)await delay(100);}
      assert.ok(name,'missing download');
      const bytes=await readFile(join(download,name));
      assert.ok((await page.$eval('#publish-result',e=>e.textContent)).includes(hash(bytes)));
      const example=join(output,'mixed-wrappers-'+route+'.html');
      await writeFile(example,bytes);
      const offline=await env.browser.createBrowserContext();
      try {
        const doc=await offline.newPage();
        await doc.setOfflineMode(true);
        const external=[];
        doc.on('request',r=>{if(/^https?:/i.test(r.url()))external.push(r.url());});
        await doc.goto(pathToFileURL(example).href);
        const content=await doc.evaluate(()=>{
          const article=document.querySelector('article');
          return {note:[...article.querySelectorAll('section')].some(e=>e.textContent==='KEEP-INDEPENDENT-CONTENT'),details:article.querySelector('details')?.textContent,
            caption:article.querySelector('caption')?.textContent, rowSpan:article.querySelector('th[rowspan]')?.rowSpan,
            colSpan:article.querySelector('td[colspan]')?.colSpan,emptyCells:article.querySelectorAll('td:empty').length,
            annotations:[...article.querySelectorAll('.pf-math annotation')].map(e=>e.textContent),scripts:document.scripts.length};
        });
        assert.deepEqual(content,{note:true,details:'DefinitionRetained body',caption:'Weights',rowSpan:2,colSpan:2,emptyCells:1,annotations:['x+1','x+1','x+1'],scripts:0});
        assert.deepEqual(external,[]);
        report.results.push({route,status:'PASS',content,externalRequests:external.length,bytes:bytes.length,sha256:hash(bytes),artifact:'mixed-wrappers-'+route+'.html'});
      }finally{await offline.close();}
    }catch(error){
      report.results.push({route,status:'FAIL',message:String(error.stack||error),statusText:await page.$$eval('#render-state,#publish-result,#paste-error',els=>els.map(e=>e.textContent)).catch(()=>[])});
    }finally{await ctx.close();}
  }
}finally{
  await env.close();await rm(temp,{recursive:true,force:true});
  await writeFile(join(output,'wrapper-downloads.json'),JSON.stringify(report,null,2)+'\n');
}
for(const row of report.results) console.log(row.route,row.status,row.message||row.sha256, row.statusText||'');
if(report.results.length!==2 || report.results.some(r=>r.status!=='PASS')) process.exitCode=1;
