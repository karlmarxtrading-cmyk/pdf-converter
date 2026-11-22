// Run from repository root: PF_CHROME=/path/to/chrome node evidence/rc7-ux/real-storage.mjs
// A temporary browser profile contains only synthetic projects. The quota override
// belongs to a separate isolated context. No existing user database is cleared.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import puppeteer from 'puppeteer-core';
import { startServer } from '../../../scripts/serve-dist.mjs';
import { findChromium } from '../../../scripts/browser-path.mjs';

const server = await startServer('dist', 4397);
const base = 'http://127.0.0.1:4397';
const identity = JSON.parse(readFileSync('dist.build-manifest.json','utf8'));
const browser = await puppeteer.launch({ executablePath:findChromium(), headless:true, pipe:true, args:['--no-sandbox','--disable-dev-shm-usage'] });
const evidence = { build:identity, browser:await browser.version(), tests:{} };
const dir = (process.env.PF_EVIDENCE_DIR || 'evidence/rc9/browser/results');
const wait = ms => new Promise(resolve=>setTimeout(resolve,ms));
async function awaitStatus(page,status) {
  await page.waitForFunction(expected=>document.querySelector('#save-status').dataset.state===expected,{timeout:14000},status);
}
async function open(context) {
  const page = await context.newPage();
  await page.setViewport({width:1440,height:900});
  await page.goto(base+'/#/workspace');
  await page.waitForFunction(()=>document.querySelector('#view-workspace:not([hidden])') && document.querySelector('#src-hash').textContent.includes('rev'));
  assert.equal(await page.$eval('meta[name="pf-version"]', el=>el.content), identity.version);
  return page;
}
async function enter(page, value) {
  await page.click('#editor');
  await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
  await page.keyboard.sendCharacter(value);
  assert.equal(await page.$eval('#editor',e=>e.value), value);
}
async function enableStorage(page) {
  await page.click('#save-status');
  await page.waitForSelector('#dlg-projects[open]');
  await page.click('#opt-localsave');
  await page.click('#dlg-projects button[value=ok]');
}
async function selectedProject(page, targetName) {
  await page.click('#save-status');
  await page.waitForSelector('#dlg-projects[open]');
  const row = await page.evaluateHandle(target=>[...document.querySelectorAll('#proj-list li')].find(li=>li.querySelector('strong')?.textContent===target),targetName);
  const button = await row.asElement()?.$('button');
  assert.ok(button, 'the project is listed');
  await button.click(); await page.waitForSelector('#dlg-projects[open]',{hidden:true});
}
try {
  const context = await browser.createBrowserContext();
  const a = await open(context);
  await a.setViewport({width:360,height:780});
  await a.click('[data-mtab=left]');
  const fixture='# Latihan Studio\n\nSimpan teks $a+b$ dan angka 017.\n';
  await context.overridePermissions(base,['clipboard-read','clipboard-write','clipboard-sanitized-write']);
  await a.evaluate(async value=>{await navigator.clipboard.writeText(value)},fixture);
  await a.click('#editor');
  await a.keyboard.down('Control'); await a.keyboard.press('v'); await a.keyboard.up('Control');
  await a.waitForFunction(value=>document.querySelector('#editor').value===value,{},fixture);
  const measure=()=>a.evaluate(()=>({viewport:document.documentElement.clientWidth,content:document.documentElement.scrollWidth}));
  const source=await measure();assert.deepEqual(source,{viewport:360,content:360});
  await a.keyboard.down('Control'); await a.keyboard.press('z'); await a.keyboard.up('Control');
  assert.equal(await a.$eval('#editor',e=>e.value),'');
  await a.keyboard.down('Control'); await a.keyboard.press('y'); await a.keyboard.up('Control');
  assert.equal(await a.$eval('#editor',e=>e.value),fixture);
  await a.focus('#t-src'); await a.keyboard.press('ArrowRight');
  assert.equal(await a.evaluate(()=>document.activeElement.id),'t-msgs');
  await a.click('[data-mtab=right]');
  await a.focus('#goal-grid [aria-checked=true]'); await a.keyboard.press('ArrowLeft');
  assert.equal(await a.evaluate(()=>document.activeElement.dataset.tpl),'EDU-01');
  const format=await measure(); assert.deepEqual(format,source);
  await a.click('[data-mtab=center]');
  const preview=await measure(); assert.deepEqual(preview,source);
  evidence.tests.narrow={status:'PASS',viewport:source.viewport,source,format,preview,clipboard:'navigator.clipboard.writeText + Ctrl+V; synthetic fixture in browser session',undoRedo:true,focusMessagesAndEdu:true};
  await a.setViewport({width:1440,height:900}); await a.click('#t-src');
  const seed = '# Two-tab study\nBase 017.';
  await enter(a, seed);
  await a.click('#doc-title'); await a.keyboard.sendCharacter('QA two tabs'); await a.keyboard.press('Tab');
  await a.click('#save-status');await a.waitForSelector('#dlg-projects[open]');
  assert.equal(await a.$eval('#opt-localsave',el=>el.checked),false);
  assert.deepEqual(await a.evaluate(async()=> (await indexedDB.databases()).map(x=>x.name).filter(Boolean)),[]);
  await a.click('#dlg-projects button[value=ok]');
  evidence.tests.optIn={status:'PASS', freshContext:true, uncheckedBeforeExplicitOptIn:true, indexedDatabasesBeforeOptIn:0};
  await enableStorage(a);
  await awaitStatus(a,'saved');
  const b = await open(context);
  await selectedProject(b,'QA two tabs');
  assert.equal(await b.$eval('#editor',e=>e.value),seed);
  const one=seed+'\nWriter A.'; const two=seed+'\nWriter B.';
  await enter(a,one); await awaitStatus(a,'saved');
  await enter(b,two); await awaitStatus(b,'conflict');
  assert.equal(await b.$eval('#editor',e=>e.value),two);
  const c = await open(context);
  await selectedProject(c,'QA two tabs');
  assert.equal(await c.$eval('#editor',e=>e.value),one);
  await c.click('#save-status'); await c.waitForSelector('#dlg-projects[open]');
  const recovery = await c.$eval('#proj-list',ul=>[...ul.querySelectorAll('strong')].map(n=>n.textContent).find(s=>s.includes('conflict copy')));
  assert.ok(recovery); await c.click('#dlg-projects button[value=ok]');
  await selectedProject(c,recovery);
  assert.equal(await c.$eval('#editor',e=>e.value),two);
  evidence.tests.conflict={status:'PASS',bothReopened:true,secondTabStatus:'conflict'};
  // Test deletion only inside this unique disposable browser context after saving and reopening both artificial copies.
  await a.close();await b.close();
  await c.reload();await c.waitForSelector('#editor');await selectedProject(c,recovery);
  assert.equal(await c.$eval('#editor',e=>e.value),two);
  await c.click('#save-status');await c.waitForSelector('#dlg-projects[open]');
  const target = await c.evaluateHandle(()=>[...document.querySelectorAll('#proj-list li')].find(li=>li.querySelector('strong')?.textContent==='QA two tabs')?.querySelector('.btn-danger'));
  assert.ok(target.asElement());await target.asElement().click();await c.waitForSelector('#dlg-confirm[open]');await c.click('#dlg-confirm button[value=cancel]');
  assert.ok(await c.$eval('#proj-list',el=>[...el.querySelectorAll('strong')].some(x=>x.textContent==='QA two tabs')));
  await target.asElement().click();await c.waitForSelector('#dlg-confirm[open]');await c.click('#dlg-confirm button[value=ok]');
  await c.waitForFunction(()=>![...document.querySelectorAll('#proj-list strong')].some(x=>x.textContent==='QA two tabs'));
  assert.ok(await c.$eval('#proj-list',(el,name)=>[...el.querySelectorAll('strong')].some(x=>x.textContent===name),recovery));
  await c.click('#dlg-projects button[value=ok]');await c.reload();await c.waitForSelector('#editor');await c.click('#save-status');await c.waitForSelector('#dlg-projects[open]');
  const remaining=await c.$$eval('#proj-list strong',els=>els.map(e=>e.textContent));assert.ok(!remaining.includes('QA two tabs') && remaining.includes(recovery));
  evidence.tests.reloadAndDelete={status:'PASS', originalAndConflictCopyReopened:true, savedSourceSurvivedReload:true, cancelKeptOriginal:true, explicitDeleteRemovedOnlyDisposableOriginal:true, verifiedAgainAfterReload:true};
  await context.close();

  const emptyContext=await browser.createBrowserContext();
  const q=await open(emptyContext);
  const cdp=await q.createCDPSession();
  await cdp.send('Storage.overrideQuotaForOrigin',{origin:base,quotaSize:3072});
  const quotaText='## Quota simulation\n'+Array.from({length:2000},(_,i)=>i.toString(36).padStart(4,'0')).join(' ');
  await enter(q,quotaText); await enableStorage(q);
  await q.waitForFunction(()=>['quota','failed'].includes(document.querySelector('#save-status').dataset.state),{timeout:14000});
  const quotaStatus=await q.$eval('#save-status',el=>el.dataset.state);
  assert.equal(await q.$eval('#editor',e=>e.value),quotaText);
  const downloadDir=mkdtempSync(join(tmpdir(),'pf-ux-download-'));
  await cdp.send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:downloadDir});
  await q.click('#src-menu-btn'); await q.click('[data-action=save-bundle]');
  for(let i=0;i<100 && !readdirSync(downloadDir).some(n=>n.endsWith('.pfproj'));i++) await wait(100);
  const name=readdirSync(downloadDir).find(n=>n.endsWith('.pfproj')); assert.ok(name,'project backup downloaded');
  const backup=join(downloadDir,name);
  const bytes=readFileSync(backup);
  const restoredContext=await browser.createBrowserContext();
  const restored=await open(restoredContext);
  await (await restored.$('#file-open')).uploadFile(backup);
  await restored.waitForFunction(wanted=>document.querySelector('#editor').value===wanted,{timeout:12000},quotaText);
  writeFileSync(join(dir,'synthetic-browser-backup.pfproj'),bytes);
  evidence.tests.quotaBackup={status:'PASS',quotaLimitBytes:3072,storageStatus:quotaStatus,syntheticSourceBytes:Buffer.byteLength(quotaText),sourceRestored:true,downloadBytes:bytes.length,downloadSha256:createHash('sha256').update(bytes).digest('hex')};
  await restoredContext.close();
  await cdp.send('Storage.overrideQuotaForOrigin',{origin:base}); await emptyContext.close();
} catch(error) {
  evidence.failure=String(error.stack||error);process.exitCode=1;
} finally {
  await browser.close(); await new Promise(resolve=>server.close(resolve));
  writeFileSync(join(dir,'browser-storage.json'),JSON.stringify(evidence,null,2));
  console.log(JSON.stringify(evidence));
}
