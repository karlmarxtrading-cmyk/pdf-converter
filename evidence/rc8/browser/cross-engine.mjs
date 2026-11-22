// From the project root, set PLAYWRIGHT_BROWSERS_PATH and PF_PLAYWRIGHT_MODULE to your Playwright installation.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdtemp,readFile,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename,dirname,join,resolve } from 'node:path';
import { startServer } from '../../../scripts/serve-dist.mjs';
import { distTreeSha256 } from '../../../scripts/fingerprint.mjs';

const require = createRequire(import.meta.url);
const playwright = require(process.env.PF_PLAYWRIGHT_MODULE || 'playwright');
const engine = process.argv[2];
assert.ok(['firefox','webkit'].includes(engine));
const expected = JSON.parse(await readFile('fixtures/rc6/user-trigonometry.expected.json','utf8'));
const build = JSON.parse(await readFile('dist.build-manifest.json','utf8'));
const r = {engine,distTreeSha256:distTreeSha256(),fixtureHash:expected.input_sha256,
  launch:'NOT_RUN', preview:'NOT_RUN', download:'NOT_RUN', offline:'NOT_RUN', pagination:'NOT_RUN',errors:[]};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fixture = resolve('fixtures/rc6/user-trigonometry.md');
assert.equal(hash(await readFile(fixture)),expected.input_sha256);
const binary=process.env.PF_ENGINE_EXECUTABLE || playwright[engine].executablePath();
const binaryFiles=engine==='webkit'&&basename(binary)==='pw_run.sh' ? [binary,join(dirname(binary),'minibrowser-wpe/bin/MiniBrowser'),join(dirname(binary),'minibrowser-wpe/bin/WPEWebProcess')] : [binary];
r.binarySha256={};for(const b of binaryFiles)r.binarySha256[basename(b)]=hash(await readFile(b));
r.runUTC=new Date().toISOString();
let step = 'launch', browser, server, app;
const dir=await mkdtemp(join(tmpdir(),'pf-cross-'));
try {
  browser = await playwright[engine].launch({
    headless:true,timeout:25000,
    ...(process.env.PF_ENGINE_EXECUTABLE ? {executablePath:process.env.PF_ENGINE_EXECUTABLE} : {}),
  });
  r.version = browser.version(); r.launch = 'PASS'; step='preview';
  server=await startServer('dist',0);
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  const page=await context.newPage(); app=page;
  const errors=[];page.on('pageerror',e=>errors.push(e.message)); r.pageErrors=errors;
  await page.goto('http://127.0.0.1:'+server.address().port+'/#/workspace',{waitUntil:'domcontentloaded'});
  assert.equal(await page.locator('meta[name="pf-version"]').getAttribute('content'),build.version);
  await page.waitForFunction(()=>!document.querySelector('#view-workspace')?.hidden && /rev \d+/.test(document.querySelector('#src-hash')?.textContent||''),null,{timeout:95000});
  await page.locator('#file-open').setInputFiles(fixture);
  await page.frameLocator('#live-frame').locator('.pf-math').nth(230).waitFor({state:'attached',timeout:95000});
  await page.locator('[data-tpl="BUS-01"]').click();
  await page.frameLocator('#live-frame').locator('[data-template="BUS-01"] .pf-math').nth(230).waitFor({state:'attached',timeout:80000});
  r.preview='PASS';step='download';
  await page.locator('[data-action="publish"]').click();
  await page.locator('input[value="html-standalone"]').check();
  if (await page.locator('#pub-ack').isVisible()) await page.locator('#pub-ack').check();
  const pending = page.waitForEvent('download',{timeout:90000}).catch(e=>({error:e.message}));
  await page.locator('#pub-go').click();
  await page.locator('#pub-review-ack, #publish-result.banner-ok').first().waitFor({state:'visible',timeout:70000});
  if (await page.locator('#pub-review-ack').isVisible()) {
    await page.locator('#pub-review-ack').check();await page.locator('#publish-result .btn-primary').click();
  }
  const download=await pending;if(download.error)throw new Error(download.error);
  const path=join(dir,'export.html');await download.saveAs(path);
  const bytes=await readFile(path);
  r.outputBytes=bytes.byteLength;r.outputSha256=hash(bytes);
  assert.ok((await page.locator('#publish-result').innerText()).includes(r.outputSha256));
  r.download='PASS';step='offline';
  const offline = await browser.newContext({offline:true,serviceWorkers:'block'});
  const output = await offline.newPage(), resources = [];
  output.on('request',q=>{if (/^(?:https?|wss?|file):/i.test(q.url())) resources.push(q.url());});
  await output.setContent(bytes.toString('utf8'),{waitUntil:'load'});
  r.standalone=await output.evaluate(async oracle=>{
    const nodes=[...document.querySelectorAll('.pf-math')];
    const differences=nodes.flatMap((n,i)=>{const e=oracle[i];return !e || n.dataset.tex!==e.expected || n.dataset.sourceTex!==e.raw ||
      n.querySelector('annotation')?.textContent!==e.expected || !!n.querySelector('.katex-display')!==e.display ? [i] : [];});
    const fonts=[...document.fonts];await Promise.all(fonts.map(f=>f.load()));await document.fonts.ready;
    return {online:navigator.onLine,template:document.querySelector('[data-template]')?.dataset.template,
      count:nodes.length,inline:nodes.filter(n=>!n.querySelector('.katex-display')).length,
      mathml:document.querySelectorAll('.pf-math math').length,errors:document.querySelectorAll('.pf-math-error,.katex-error').length,
      tables:document.querySelectorAll('article table').length,styles:[getComputedStyle(document.querySelector('.vlist-t')).display,
        getComputedStyle(document.querySelector('.katex-mathml')).position],fontsLoaded:fonts.filter(f=>f.status==='loaded').length,
      fonts:fonts.length,displayBoxes:nodes.filter(n=>n.querySelector('.katex-html')?.getBoundingClientRect().width>0).length,
      missingAnchors:[...document.querySelectorAll('a[href^="#"]')].filter(a=>!document.getElementById(decodeURIComponent(a.hash.slice(1)))).length,
      differences};
  },expected.formulas);
  r.externalOrFileRequests=resources.length;
  assert.deepEqual([r.standalone.template,r.standalone.count,r.standalone.inline,r.standalone.mathml,r.standalone.displayBoxes,r.standalone.tables,r.standalone.missingAnchors,r.standalone.errors],
    ['BUS-01',231,103,231,231,5,0,0]);
  assert.deepEqual(r.standalone.styles,['inline-table','absolute']);assert.deepEqual(r.standalone.differences,[]);
  assert.ok(r.standalone.fonts>0 && r.standalone.fontsLoaded===r.standalone.fonts);
  assert.equal(resources.length,0);
  assert.equal(r.standalone.online,false);
  r.offline='PASS'; await offline.close();step='pagination';
  if(await page.locator('#dlg-publish[open]').isVisible())await page.locator('#dlg-publish[open] [data-dismiss],#dlg-publish[open] button[value="cancel"],#dlg-publish[open] .dlg-close').first().click({timeout:3000}).catch(()=>page.keyboard.press('Escape'));
  await page.locator('#t-pages').click();
  await page.waitForFunction(()=>/(?:\d+ (?:pages|halaman).*\d+ (?:passes|lintasan))|(?:page check failed|pemeriksaan halaman gagal)/i.test(document.querySelector('#render-state')?.textContent||''),null,{timeout:120000});
  r.layoutUI=await page.locator('#render-state').innerText();
  assert.match(r.layoutUI,/\d+ (?:pages|halaman)/i);
  const frame = page.frameLocator('#p-pages iframe');
  r.pages=await frame.locator('.pagedjs_page').count();
  r.pagedFormulaCount=await frame.locator('.pagedjs_page_content .pf-math').count();
  const original=await frame.locator('.pagedjs_page_content .pf-math').evaluateAll(nodes=>nodes.filter(n=>!n.closest('[data-pf-repeat]')).map(n=>({original:n.dataset.sourceTex,tex:n.dataset.tex,annotation:n.querySelector('annotation')?.textContent,display:!!n.querySelector('.katex-display')})));
  r.pagedOriginalFormulas=original.length;r.pagedRepeatedFormulas=r.pagedFormulaCount-original.length;
  r.pagedMismatchIndices=original.flatMap((n,i)=>{const e=expected.formulas[i];return !e||e.raw!==n.original||e.expected!==n.tex||e.expected!==n.annotation||e.display!==n.display?[i]:[];});
  assert.ok(r.pages>1);assert.equal(r.pagedOriginalFormulas,231);assert.deepEqual(r.pagedMismatchIndices,[]);
  r.pagination='PASS';
} catch(error) {
  r[step] = step === 'launch' ? 'BLOCKED' : 'FAIL';r.errors.push(String(error?.message||error).slice(0,4000));
  if(app)r.lastUi=await app.locator('#render-state,#publish-result,#notices').allTextContents().catch(()=>[]);
} finally {
  if(browser)await browser.close();
  if(server)await new Promise(done=>server.close(done));
  await rm(dir,{recursive:true,force:true});
}
r.status=Object.values(r).some(v=>v==='BLOCKED')?'BLOCKED':(r.errors.length?'FAIL':'PASS');
r.appVersion=build.version; r.postDistTreeSha256=distTreeSha256();
assert.equal(r.distTreeSha256,r.postDistTreeSha256);
await writeFile(join(process.env.PF_EVIDENCE_DIR || 'evidence/rc8/browser/results','playwright-'+engine+'.json'),JSON.stringify(r,null,2)+'\n');
console.log(JSON.stringify(r));

if(r.status!=='PASS')process.exitCode=1;
