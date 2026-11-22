// Production UI only. A real keyboard copy from an authored HTML page supplies both clipboard MIME types.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';
import { startServer } from '../../../scripts/serve-dist.mjs';
import { findChromium } from '../../../scripts/browser-path.mjs';
import { candidateSha256, distTreeSha256 } from '../../../scripts/fingerprint.mjs';

const out = process.env.PF_EVIDENCE_DIR || 'evidence/rc8/browser/results';
const sha = text => createHash('sha256').update(text).digest('hex');
const root = resolve('evidence/rc8/browser');
const server = await startServer('dist',0), origin = 'http://127.0.0.1:'+server.address().port;
const browser = await puppeteer.launch({executablePath:findChromium(),headless:true,pipe:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const report = { pre:{candidate:candidateSha256(),dist:distTreeSha256()}, environment:{browser:await browser.version(),
  binarySha256:sha(await readFile(findChromium())), node:process.version, platform:process.platform, runAt:new Date().toISOString()}, cases:{} };
async function attempt(name, fn) {
  const context = await browser.createBrowserContext();
  try { report.cases[name] = {status:'PASS',...await fn(context)}; }
  catch(e) { report.cases[name] = {status:'FAIL',message:e.message}; process.exitCode=1; }
  finally { await context.close(); }
}
async function page(context, pos = '#/workspace') {
  const p=await context.newPage();
  p.setDefaultTimeout(90000);await p.setViewport({width:1280,height:880});
  await p.goto(origin+'/'+pos);
  if(pos==='#/workspace')await p.waitForFunction(()=>!document.querySelector('#view-workspace')?.hidden && /rev \d+/.test(document.querySelector('#src-hash')?.textContent||''),{timeout:90000});
  return p;
}
async function shortcut(p,k){await p.keyboard.down('Control');await p.keyboard.press(k);await p.keyboard.up('Control');}
const includesAll = (text,list) => list.map(token=>[token,text.includes(token)]);
const src="./clipboard-source.html";
try {
  await attempt('keyboardClipboardMimeAndOriginal',async ctx=>{
    await ctx.overridePermissions(origin,['clipboard-read','clipboard-write','clipboard-sanitized-write']);
    const from=await ctx.newPage();
    await from.goto(pathToFileURL(join(root,src)).href);
    await from.bringToFront();await shortcut(from,'a');await shortcut(from,'c');
    const p=await page(ctx); await p.waitForSelector('#editor');await p.bringToFront();
    const mimes=await p.evaluate(async()=> {
      const [item]=await navigator.clipboard.read();const entries={};
      for(const type of ['text/plain','text/html']) entries[type]=await (await item.getType(type)).text();
      return entries;
    });
    await p.evaluate(()=>window.addEventListener('paste',e=>{window.pfObservedPaste={html:e.clipboardData?.getData('text/html'),plain:e.clipboardData?.getData('text/plain'),trusted:e.isTrusted};},{capture:true,once:true,passive:true}));
    await p.click('#editor'); await shortcut(p,'v');
    await p.waitForFunction(()=>document.querySelector('#editor').value.includes('KEEP-INDEPENDENT-CONTENT'));
    await p.waitForSelector('#notices button'); 
    const action=await p.evaluateHandle(()=>[...document.querySelectorAll('#notices button')].find(b=>/Markdown/i.test(b.textContent)));
    assert.ok(action.asElement()); await action.asElement().click();
    await p.waitForSelector('#dlg-diff[open]');await p.click('#dlg-diff button[value=apply],#dlg-diff button[value=ok]');
    await p.waitForFunction(()=>document.querySelector('#editor').value.includes('007') && !document.querySelector('#dlg-diff').open);
    const text=await p.$eval('#editor',el=>el.value);
    const uiTokens=includesAll(text,['KEEP-INDEPENDENT-CONTENT','x-17','007','return x-17','[3]','α']);
    assert.ok(uiTokens.every(pair=>pair[1]),JSON.stringify(uiTokens));
    await p.click('#src-menu-btn');await p.click('[data-action=view-raw]');
    await p.waitForSelector('#dlg-raw[open]');await p.select('#raw-select','h0');
    const raw=await p.$eval('#raw-view',e=>e.textContent);
    const observedEvent=await p.evaluate(()=>window.pfObservedPaste);
    assert.equal(observedEvent.trusted,true);
    assert.equal(raw,observedEvent.html);
    await p.select('#raw-select','0');
    assert.equal(await p.$eval('#raw-view',e=>e.textContent),observedEvent.plain);
    const observed=includesAll(raw,['KEEP-INDEPENDENT-CONTENT','x-17','007','[3]','return x-17']);assert.ok(observed.every(pair=>pair[1]));
    return {source:'Independent local synthetic HTML page. Browser keyboard Ctrl+A/C and Ctrl+V, not a ClipboardEvent constructed by this harness.',
      operatorSource:'No external provider session.', location:'browser-profile clipboard on Linux',originalFixtureSha256:sha(await readFile(join(root,src))),mimes:Object.fromEntries(Object.entries(mimes).map(([t,v])=>[t,{sha256:sha(v),bytes:Buffer.byteLength(v)}])), rawHtmlSha256:sha(raw),trustedPasteEvent:true,rawHtmlMatchesDeliveredEvent:true,rawPlainMatchesDeliveredEvent:true,sourceMarkers:observed,convertedMarkers:uiTokens};
  });
  await attempt('cancelRetryAndLatestRevision',async ctx=>{
    const p=await page(ctx);await p.waitForSelector('#file-open');
    await (await p.$('#file-open')).uploadFile(resolve('fixtures/rc6/user-trigonometry.md'));
    await p.waitForFunction(()=>document.querySelector('#live-frame')?.contentDocument?.querySelectorAll('.pf-math').length===231);
    await p.click('[data-tpl="BUS-01"]');await p.waitForFunction(()=>document.querySelector('#live-frame')?.contentDocument?.querySelector('[data-template]')?.dataset.template==='BUS-01');
    await p.click('[data-action=publish]');await p.waitForSelector('#dlg-publish[open]');await p.click('input[value=print]');
    if(await p.$('#pub-ack'))await p.click('#pub-ack');await p.click('#pub-go');
    await p.waitForSelector('#pub-cancel:not([hidden])',{visible:true});await p.click('#pub-cancel');
    await p.waitForFunction(()=>/dibatalkan|cancelled/i.test(document.querySelector('#publish-result').textContent));
    const cancelled=await p.$eval('#publish-result',e=>e.innerText);
    await p.click('#publish-result button');await p.waitForSelector('#publish-result.banner-ok',{timeout:90000});
    const retry=await p.$eval('#publish-result',e=>e.innerText);
    assert.ok(/\d+ (?:pages|halaman)/i.test(retry),retry.slice(0,300));await p.keyboard.press('Escape');
    await p.waitForSelector('#dlg-publish[open]',{hidden:true});
    await p.click('#editor');await shortcut(p,'a');await p.keyboard.sendCharacter('# EDIT-A\n\n'+('Draft berulang. '.repeat(3500)));
    await shortcut(p,'a');await p.keyboard.sendCharacter('# EDIT-B\n\nFINAL-E017');
    await p.waitForFunction(()=>{const t=document.querySelector('#live-frame')?.contentDocument?.body?.textContent||'';return t.includes('FINAL-E017') && !t.includes('Draft berulang.');},{timeout:60000});
    assert.equal(await p.$eval('#editor',el=>el.value),'# EDIT-B\n\nFINAL-E017');
    return {visibleCancelStatus:cancelled,successfulPrintPreparationAfterRetry:retry,latestSourceAndPreviewAgree:true,nativeDialog:'Separate, not used in this case'};
  });
  await attempt('productionKeyboardAxeAndScale',async ctx=>{
    const p=await page(ctx,''); const axe=await readFile('node_modules/axe-core/axe.min.js','utf8');
    const snapshots={};
    async function audit(name){
      await p.evaluate(axe);
      snapshots[name]=await p.evaluate(async()=>{const r=await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}});return r.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(x=>x.target)}));});
    }
    await p.waitForSelector('main');await audit('landing');await p.goto(origin+'/#/workspace');await p.waitForSelector('#editor');await p.click('#editor');await p.keyboard.sendCharacter('Catatan 017.');await p.waitForFunction(()=>document.querySelector('#live-frame')?.contentDocument?.body?.textContent.includes('Catatan 017.'));
    await audit('workspace');
    const cdp=await p.createCDPSession();const tree=await cdp.send('Accessibility.getFullAXTree');
    const roles=tree.nodes.filter(n=>!n.ignored).map(n=>({role:n.role?.value,name:n.name?.value??'',live:n.properties?.find(x=>x.name==='live')?.value?.value}));
    const semanticAx={namedTextbox:roles.some(n=>n.role==='textbox'&&n.name),tablist:roles.some(n=>n.role==='tablist'),
      liveRegions:roles.filter(n=>n.live==='polite'||n.live==='assertive').length,readout:'Chromium accessibility tree; no synthesized screen-reader speech'};
    assert.ok(semanticAx.namedTextbox && semanticAx.tablist && semanticAx.liveRegions>0);
    await p.click('[data-action=publish]');await p.waitForSelector('#dlg-publish[open]');await audit('publishDialog');
    await p.keyboard.press('Escape');const restored=await p.evaluate(()=>document.activeElement?.dataset.action);assert.equal(restored,'publish');
    await p.setViewport({width:640,height:450,deviceScaleFactor:2});
    const reflow=await p.evaluate(()=>({width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,dpr:devicePixelRatio}));assert.equal(reflow.width,reflow.scrollWidth);
    assert.ok(!Object.values(snapshots).flat().length,JSON.stringify(snapshots));
    return {violations:snapshots,semanticAx,focusRestored:restored,reflow,scale:'2x DPR at half-width, emulated viewport. Native optical zoom and screen reader hardware require separate evidence.'};
  });
} finally {
  report.post={candidate:candidateSha256(),dist:distTreeSha256()};
  report.sameBytes=report.pre.candidate===report.post.candidate && report.pre.dist===report.post.dist;
  await writeFile(join(out,'uat.json'),JSON.stringify(report,null,2)+'\n');await browser.close();await new Promise(done=>server.close(done));
}
