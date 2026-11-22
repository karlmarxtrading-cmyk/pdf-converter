/** Run from the repo root against a clean production dist. CDP interception
 * replies locally to approved image loads. No traffic is sent to the test host. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { launch } from './lib.mjs';
import { candidateSha256, distTreeSha256 } from '../../scripts/fingerprint.mjs';

const dist = process.env.PF_NETWORK_DIST || 'dist';
const fingerprint = candidateSha256();
const tree = distTreeSha256(dist);
if (dist === 'dist') {
  const manifest=JSON.parse(await readFile('dist.build-manifest.json','utf8'));
  assert.equal(manifest.profile,'production');
  assert.equal(manifest.candidateSha256, fingerprint);
  assert.equal(manifest.distTreeSha256, tree);
}
const dir = await mkdtemp(join(tmpdir(), 'pf-consent-'));
const env = await launch({dir:dist,port:4488});
const reports = {};
const intercepted = [];
const png = await readFile('fixtures/korpus/assets/chart.png');
let phase = 'opening';
const browser = await env.browser.createBrowserContext({downloadBehavior:{policy:'allow', downloadPath:dir}});
async function open() {
  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  await page.setRequestInterception(true);
  page.on('request', request => {
    const url = new URL(request.url());
    if (!['http:', 'https:'].includes(url.protocol) || url.origin === env.base) return void request.continue();
    intercepted.push({phase, url:url.href, kind:request.resourceType()});
    if (url.host === 'paperforma-audit.invalid') {
      return void request.respond({ status:200, headers:{'cache-control':'no-store','access-control-allow-origin':'*'}, contentType:'image/png', body:png });
    }
    return void request.abort();
  });
  await page.goto(env.base+'/#/workspace');
  return page;
}
async function upload(page, name) {
  await (await page.waitForSelector('#file-open')).uploadFile(resolve('fixtures/rc11/network',name));
}
async function checkFigures(page, granted) {
  await page.waitForFunction(allowed => {
    const figures = [...document.querySelector('#live-frame')?.contentDocument?.querySelectorAll('article figure[data-pf-mermaid]') || []];
    return figures.length === 3 && figures[0].querySelector('svg')?.textContent.includes('Local finish') &&
      (allowed ? !!figures[1].querySelector('svg image') : !!figures[1].querySelector('.pf-mermaid-source')) &&
      !!figures[2].querySelector('.pf-mermaid-source');
  },{timeout:45_000},granted);
  return page.evaluate(() => [...document.querySelector('#live-frame').contentDocument.querySelectorAll('article figure[data-pf-mermaid]')]
    .map(f => ({ rendered:!!f.querySelector('svg'), image:f.querySelector('image')?.getAttribute('href') || null,
      fallback:f.querySelector('.pf-mermaid-source')?.textContent || null })));
}
async function setPermission(page, checked) {
  assert.equal(await page.$eval('#opt-external', box=>box.checked), !checked);
  // Exercise the actual checkbox change handler. Its pane may be collapsed.
  await page.$eval('#opt-external', box=>box.click());
}
async function standalone(page) {
  await page.click('[data-action=publish]');
  await page.waitForSelector('#dlg-publish[open] input[value=html-standalone]');
  await page.click('input[value=html-standalone]');
  if (await page.$('#pub-ack')) await page.click('#pub-ack');
  await page.click('#pub-go');
  await page.waitForSelector('#publish-result:not([hidden])',{timeout:45_000});
  if (await page.$('#pub-review-ack')) {
    await page.click('#pub-review-ack');
    await page.click('#publish-result .btn-primary');
  }
  let name;
  for(let i=0;i<150 && !name;i++) {
    name=(await readdir(dir)).find(s=>s.endsWith('.html'));
    if (!name) await delay(200);
  }
  assert.ok(name, await page.$eval('#publish-result',x=>x.textContent));
  const bytes = await readFile(join(dir,name));
  const digest=createHash('sha256').update(bytes).digest('hex');
  assert.ok((await page.$eval('#publish-result',x=>x.textContent)).includes(digest));
  const actual = await page.evaluate(text => {
    const template=document.createElement('template'); template.innerHTML=text;
    const figures=[...template.content.querySelectorAll('article figure[data-pf-mermaid]')];
    return { local:figures[0]?.querySelector('svg')?.textContent.includes('Local finish'),
      imageSource:figures[1]?.querySelector('.pf-mermaid-source')?.textContent,
      cssSource:figures[2]?.querySelector('.pf-mermaid-source')?.textContent,
      end:template.content.querySelector('article')?.textContent.trimEnd().endsWith('END OF DIAGRAM TEST') };
  },bytes.toString('utf8'));
  assert.ok(actual.local && actual.end);
  assert.ok(actual.imageSource.includes('mermaid.png') && actual.cssSource.includes('themeCSS'));
  return { sha256:digest, bytes:bytes.length, ...actual };
}
async function preparePrint(page, kind) {
  await page.click('#pub-close');
  await page.click('[data-action=publish]');
  await page.waitForSelector('#dlg-publish[open]');
  await page.click('input[value="'+kind+'"]');
  if (await page.$('#pub-ack')) await page.click('#pub-ack');
  await page.click('#pub-go');
  await page.waitForSelector(kind === 'print-book' ? '#book-html-hash' : '#publish-result .print-state', {timeout:60_000});
  const selector=kind === 'print-book' ? '#pf-book-print' : 'iframe[title="PaperForma print"]';
  const actual=await page.$eval(selector, frame => {
    const doc=frame.contentDocument;
    // The book frame owns its content directly. Standard pagination owns
    // copies inside Paged.js pages.
    const area=doc.querySelector('.pagedjs_pages') || doc.querySelector('article');
    return {local:[...area.querySelectorAll('.pf-mermaid-ok svg')].some(s=>s.textContent.includes('Local finish')),
      blocked:[...area.querySelectorAll('.pf-mermaid-source')].map(pre=>pre.textContent),
      end:area.textContent.includes('END OF DIAGRAM TEST')};
  });
  assert.ok(actual.local && actual.end);
  assert.ok(actual.blocked.some(src=>src.includes('mermaid.png')) && actual.blocked.some(src=>src.includes('themeCSS')));
  return actual;
}

try {
  const editor=await open();
  phase='mermaidOff';
  await upload(editor,'diagram-policy.md');
  reports.previewOff=await checkFigures(editor,false);
  assert.equal(intercepted.length,0);
  phase='mermaidOn';
  await setPermission(editor,true);
  reports.previewOn=await checkFigures(editor,true);
  assert.ok(intercepted.some(r=>r.phase===phase && r.url.endsWith('/mermaid.png')));
  phase='mermaidRevoked';
  await setPermission(editor,false);
  reports.previewRevoked=await checkFigures(editor,false);
  phase='standalone';
  reports.export=await standalone(editor);
  phase='standardPrint';
  reports.standardPrint=await preparePrint(editor,'print');
  phase='bookPrint';
  reports.bookPrint=await preparePrint(editor,'print-book');
  await editor.close();
  const recipient=await open();
  phase='bundleOpened';
  await upload(recipient,'from-sender.pfproj');
  await recipient.waitForFunction(()=>document.querySelector('#editor')?.value.includes('bundle.png') &&
    document.querySelector('#live-frame')?.contentDocument?.querySelector('article .pf-img-external'));
  assert.equal(await recipient.$eval('#opt-external',box=>box.checked),false);
  phase='bundleGranted';
  await setPermission(recipient,true);
  await recipient.waitForFunction(()=>document.querySelector('#live-frame')?.contentDocument?.querySelector('article img[data-external]')?.naturalWidth>0);
  assert.ok(intercepted.some(r=>r.phase===phase && r.url.endsWith('/bundle.png')));
  await recipient.$eval('#opt-localsave',box=>box.click());
  await recipient.waitForFunction(()=>/Terakhir tersimpan di perangkat|Last saved on device/i.test(document.querySelector('#storage-state')?.textContent || ''));
  phase='localRestore';
  const local=await open();
  const offer=await local.waitForFunction(()=>[...document.querySelectorAll('button')].find(b=>/^(Lanjutkan|Continue)$/.test(b.textContent.trim())));
  await offer.asElement().click();
  await local.waitForFunction(()=>document.querySelector('#opt-external').checked &&
    document.querySelector('#live-frame')?.contentDocument?.querySelector('article img[data-external]')?.naturalWidth>0);
  assert.ok(intercepted.some(r=>r.phase===phase && r.url.endsWith('/bundle.png')));
  phase='bundleRevoked';
  await setPermission(local,false);
  await local.waitForFunction(()=>document.querySelector('#live-frame')?.contentDocument?.querySelector('article .pf-img-external'));
  reports.bundle={senderGrantImported:false, explicitGrantLoaded:true, localConsentRecovered:true, revocationRemovedImage:true};
  assert.ok(intercepted.every(r=>['mermaidOn','bundleGranted','localRestore'].includes(r.phase)),JSON.stringify(intercepted));
  assert.ok(intercepted.every(r=>r.url === 'https://paperforma-audit.invalid/' +
    (r.phase === 'mermaidOn' ? 'mermaid.png' : 'bundle.png')),JSON.stringify(intercepted));
  const counts={};
  for (const step of ['mermaidOff','mermaidOn','mermaidRevoked','standalone','standardPrint','bookPrint','bundleOpened','bundleGranted','localRestore','bundleRevoked']) {
    counts[step]=intercepted.filter(r=>r.phase===step).length;
  }
  if (dist === 'dist') assert.equal(candidateSha256(),fingerprint);
  const report = {candidate:fingerprint, distTreeSha256:tree, manifestChecked:dist==='dist', browser:await env.browser.version(), counts,
    interception:'CDP Fetch interception with local image response',intercepted,reports};
  if (process.env.PF_NETWORK_REPORT) await writeFile(process.env.PF_NETWORK_REPORT,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
} finally {
  await browser.close();
  await env.close();
  await rm(dir,{recursive:true,force:true});
}
