// End-to-end evidence for RC9-F06. The independent markers are authored beside the original HTML.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile, writeFile, mkdir, mkdtemp, readdir, copyFile, rm} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {setTimeout as delay} from 'node:timers/promises';
import {launch} from './lib.mjs';
import {candidateSha256, distTreeSha256} from '../../scripts/fingerprint.mjs';

const out = resolve(process.env.PF_LIST_OUT || 'evidence/rc12/ordered-lists');
const sourceFile = resolve('fixtures/rc10/ordered-markers.md');
const raw = await readFile(sourceFile,'utf8');
const expectedMarkers = JSON.parse(await readFile('fixtures/rc10/ordered-markers.json','utf8'));
const hash = data => createHash('sha256').update(data).digest('hex');
const manifest = JSON.parse(await readFile('dist.build-manifest.json','utf8'));
const devDist = process.env.PF_LIST_DEV_DIST;
if (!devDist) {
  assert.equal(manifest.profile,'production');
  assert.equal(manifest.candidateSha256,candidateSha256());
  assert.equal(manifest.distTreeSha256,distTreeSha256());
}
const report = {status:'RUNNING',candidateSha256:devDist ? null : manifest.candidateSha256,
  distTreeSha256:devDist ? null : manifest.distTreeSha256,sourceSha256:hash(raw),expectedMarkers,routes:{}};
await mkdir(out,{recursive:true});
const env = await launch({dir:devDist || 'dist',port:4783});
const shortcut = async (p,key) => { await p.keyboard.down('Control'); await p.keyboard.press(key); await p.keyboard.up('Control'); };

function listShape(html, articleOnly=false) {
  const doc = new DOMParser().parseFromString(html,'text/html');
  const root = articleOnly ? doc.querySelector('article#pf-content') : doc.body;
  return Array.from(root.querySelectorAll('ol,ul,li'),el => {
    const path = [];
    for (let node=el;node;node=node.parentElement) if (['OL','UL','LI'].includes(node.tagName)) path.unshift(node.tagName);
    return [path.join('/'),el.getAttribute('type'),el.getAttribute('start'),el.hasAttribute('reversed'),el.getAttribute('value'),el.textContent.trim()];
  });
}

async function publish(p,target) {
  await p.click('.ws-actions [data-action="publish"]');
  await p.waitForSelector('#dlg-publish[open]');
  await p.click('input[value="'+target+'"]');
  if (await p.$('#pub-ack')) await p.click('#pub-ack');
  await p.waitForFunction(()=>!document.querySelector('#pub-go').disabled);
  await p.click('#pub-go');
  await p.waitForFunction(()=>!document.querySelector('#publish-result').hidden);
  if (await p.$('#pub-review-ack')) {
    await p.click('#pub-review-ack');
    await p.click('#publish-result .btn-primary');
  }
  return p.$eval('#publish-result',el=>el.textContent);
}

async function run(route) {
  const dir=join(out,route); await mkdir(dir,{recursive:true});
  const downloadPath=await mkdtemp(join(tmpdir(),'pf-list-download-'));
  const ctx=await env.browser.createBrowserContext({downloadBehavior:{policy:'allow',downloadPath}});
  const r={}; report.routes[route]=r;
  try {
    await ctx.overridePermissions(env.base,['clipboard-read','clipboard-write','clipboard-sanitized-write']);
    const p=await ctx.newPage();
    await p.evaluateOnNewDocument(()=>window.addEventListener('message',event=>{
      if(event.origin!==location.origin) return;
      if(window!==window.parent && event.source===window.parent && event.data?.type==='pf-print'){
        window.parent.pfObservedBody=event.data.payload.bodyInner;
      }
      if(event.source===document.querySelector('iframe[title="PaperForma print"]')?.contentWindow && event.data?.type==='pf-print-result'){
        window.pfObservedResult=event.data.result;
      }
    }));
    await p.setViewport({width:1440,height:1000});
    await p.goto(env.base+'/#/workspace');
    await p.waitForFunction(()=>/rev \d+/.test(document.querySelector('#src-hash')?.textContent||''));
    const expected=await p.evaluate(listShape,raw);
    if(route==='clipboard'){
      const src=await ctx.newPage();await src.goto(env.base);
      await src.bringToFront();
      await src.evaluate(html=>{
        document.body.innerHTML='<main>'+html+'</main>'; const range=document.createRange();
        range.selectNodeContents(document.querySelector('main'));getSelection().removeAllRanges();getSelection().addRange(range);
        window.addEventListener('copy',e=>{window.pfCopyTrusted=e.isTrusted;},{capture:true,once:true});
      },raw);
      await shortcut(src,'c');r.trustedCopy=await src.evaluate(()=>window.pfCopyTrusted);assert.equal(r.trustedCopy,true);
      await p.bringToFront();
      await p.evaluate(()=>window.addEventListener('paste',e=>{window.pfPaste={html:e.clipboardData.getData('text/html'),trusted:e.isTrusted};},{capture:true,once:true}));
      await p.click('#editor');await shortcut(p,'v');
      await p.waitForFunction(()=>document.querySelector('#editor').value.includes('Mike'));
      const plain=await p.$eval('#editor',e=>e.value);
      const observed=await p.evaluate(()=>window.pfPaste);r.trustedPaste=observed.trusted;assert.equal(r.trustedPaste,true);
      assert.deepEqual(await p.evaluate(listShape,observed.html),expected,'Source formatting in native clipboard');
      await p.waitForSelector('#notices button');
      const convert=await p.evaluateHandle(()=>[...document.querySelectorAll('#notices button')].find(el=>/Markdown/i.test(el.textContent)));
      await convert.asElement().click();
      await p.waitForSelector('#dlg-diff[open]');r.conversionDiff=true;
      await p.click('#dlg-diff button[value=apply]');
      await p.waitForFunction(()=>document.querySelector('#editor').value.includes('<ol'));
      const converted=await p.$eval('#editor',e=>e.value);
      await p.click('#btn-undo');await p.waitForFunction(s=>document.querySelector('#editor').value===s,{},plain);
      await p.click('#btn-redo');await p.waitForFunction(s=>document.querySelector('#editor').value===s,{},converted);r.undoRedo=true;
      await p.click('#src-menu-btn');await p.click('[data-action=view-raw]');await p.waitForSelector('#dlg-raw[open]');
      await p.select('#raw-select','h0');
      const backup=await p.$eval('#raw-view',e=>e.textContent);assert.equal(backup,observed.html);r.clipboardBackupSha256=hash(backup);
      await writeFile(join(dir,'original-clipboard.html'),backup);
      await p.click('#dlg-raw button[type=submit]');await src.close();
    } else {
      await (await p.$('#file-open')).uploadFile(sourceFile);
      await p.waitForFunction(v=>document.querySelector('#editor').value===v,{},raw);
    }
    await p.waitForFunction(()=>document.querySelector('#live-frame')?.contentDocument?.querySelector('article ol'));
    await p.$eval('[data-tpl="BUS-01"]',e=>e.click());
    for(const id of ['s-cover','s-toc']) await p.$eval('#'+id,e=>{if(e.checked)e.click();});
    const htmlReceipt=await publish(p,'html-standalone');
    let file; for(let k=0;k<150&&!file;k++){file=(await readdir(downloadPath)).find(f=>f.endsWith('.html'));if(!file)await delay(100);}
    assert.ok(file,htmlReceipt); await copyFile(join(downloadPath,file),join(dir,'standalone.html'));
    const html=await readFile(join(dir,'standalone.html'),'utf8');r.htmlSha256=hash(html);
    assert.ok((await p.$eval('#publish-result',el=>el.textContent)).includes(r.htmlSha256));
    assert.deepEqual(await p.evaluate(listShape,html,true),expected,'Actual standalone HTML');
    await p.click('#pub-close');
    const receipt=await publish(p,'print');
    const result=await p.evaluate(()=>({status:window.pfObservedResult?.verification.status,
      pages:window.pfObservedResult?.pageCount,flat:window.pfObservedResult?.flattenedHtml,body:window.pfObservedBody}));
    assert.equal(result.status,'pass',receipt);assert.ok(result.body);
    await writeFile(join(dir,'print-payload-body.html'),result.body);r.payloadBodySha256=hash(result.body);
    assert.deepEqual(await p.evaluate(listShape,result.body,true),expected,'Actual print payload');
    r.flatSha256=hash(result.flat);assert.ok(receipt.includes(r.flatSha256));
    const print=await ctx.newPage();await print.setContent(result.flat,{waitUntil:'load'});await print.evaluate(()=>document.fonts.ready);
    const pdf=join(dir,'markers.pdf');await print.pdf({path:pdf,preferCSSPageSize:true,printBackground:true});
    r.pdfSha256=hash(await readFile(pdf));r.pages=result.pages;
    const text=execFileSync('pdftotext',['-layout',pdf,'-'],{encoding:'utf8'});
    await writeFile(join(dir,'markers.txt'),text);
    const lines=text.split(/[\r\n\f]+/u).map(s=>s.trim().replace(/\s+/gu,' '));
    const matches=lines.filter(line=>/^(?:[a-z]+|\d+)\./i.test(line));
    assert.deepEqual(matches,expectedMarkers.map(([marker,text])=>(marker+' '+text).trim()),'Physical page markers in reading order');
    r.physicalMarkers=matches;r.status='PASS';
  } finally { await ctx.close();await rm(downloadPath,{recursive:true,force:true}); }
}
try {
  report.browser=await env.browser.version();
  for (const route of ['raw','clipboard']) {
    try { await run(route); }
    catch (error) {
      report.routes[route].status='FAIL';
      report.routes[route].error=String(error.stack||error);
    }
  }
  assert.ok(Object.values(report.routes).every(r=>r.status==='PASS'), Object.entries(report.routes).map(([name,r])=>name+' '+(r.error||r.status)).join('\n'));
  report.status='PASS';
} catch (error) { report.status='FAIL';report.error=String(error.stack||error);process.exitCode=1; }
finally { await env.close(); await writeFile(join(out,'result.json'),JSON.stringify(report,null,2)+'\n'); }
console.log(report.status,report.error||'');
