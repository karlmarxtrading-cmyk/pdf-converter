// Observe a public document through the actual deployment UI. Native OS Save is a separate gate.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';
import { findChromium } from './browser-path.mjs';
import { deploymentIdentity } from './deployment-identity.mjs';
import { root } from './fingerprint.mjs';

const url = new URL(process.argv[2]);
const output = resolve(process.argv[3]);
const fixture = join(root, 'fixtures/device/native-print.md');
const hash = data => createHash('sha256').update(data).digest('hex');
const target = deploymentIdentity(join(root, 'dist'), JSON.parse(await readFile(join(root, 'package.json'))));
const temporary = await mkdtemp(join(tmpdir(), 'paperforma-preview-export-'));
await mkdir(output, { recursive: true });
const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: ['--no-sandbox'] });
const report = { tool: 'scripts/preview-export.mjs', url: url.origin, ...target, at: new Date().toISOString(),
  fixtureSha256: hash(await readFile(fixture)), browser: await browser.version(), method: 'Studio UI, downloaded standalone reopened offline, product print frame, Chromium PDF, Poppler text' };
const checkText = text => {
  for (const term of ['PF-MULAI-31415','ALFA','BETA','akhir kode','PF-AKHIR-92653']) assert.ok(text.includes(term), term);
};
try {
  const ctx = await browser.createBrowserContext({downloadBehavior:{policy:'allow',downloadPath:temporary}});
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);
  await page.setViewport({width:1440,height:1000});
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  const nav = await page.goto(new URL('/#/workspace',url).href);
  assert.ok(nav?.ok());
  assert.equal(new URL(nav.url()).origin, url.origin);
  assert.equal(hash(await nav.buffer()), target.indexSha256);
  await (await page.waitForSelector('#file-open')).uploadFile(fixture);
  await page.waitForFunction(() => document.querySelector('#live-frame')?.contentDocument?.querySelectorAll('article .pf-math').length === 2);
  const workerUrls = page.workers().map(worker => worker.url());
  assert.ok(workerUrls.some(value => new URL(value).origin === url.origin), 'No running same-origin worker');
  report.workers = workerUrls;
  async function publish(kind) {
    await page.click('[data-action="publish"]');
    await page.click('input[value="'+kind+'"]');
    if (await page.$('#pub-ack')) await page.click('#pub-ack');
    await page.waitForFunction(() => !document.querySelector('#pub-go').disabled);
    await page.click('#pub-go');
    await page.waitForSelector('#publish-result:not([hidden])', {timeout:120000});
    if (await page.$('#pub-review-ack')) {
      await page.click('#pub-review-ack');
      await page.click('#publish-result .btn-primary');
    }
    await page.waitForSelector('#publish-result.banner-ok', {timeout:120000});
    return page.$eval('#publish-result', el => el.textContent);
  }
  const receipt = await publish('html-standalone');
  let filename;
  for (let i=0;i<120 && !filename;i++) {
    filename = (await readdir(temporary)).find(name => name.endsWith('.html'));
    if (!filename) await delay(150);
  }
  assert.ok(filename, 'No completed HTML download');
  const bytes = await readFile(join(temporary,filename));
  report.htmlSha256 = hash(bytes);
  assert.ok(receipt.includes(report.htmlSha256));
  const standalone = join(output,'download.html');
  await writeFile(standalone, bytes);
  const off = await ctx.newPage();
  const network = [];
  off.on('request',req => {if (/^https?:/.test(req.url())) network.push(req.url());});
  await off.setOfflineMode(true);
  await off.goto(pathToFileURL(standalone).href);
  const offline = await off.evaluate(async () => {
    await Promise.all([...document.fonts].map(face => face.load()));
    const article = document.querySelector('article');
    return { text: article.textContent, scripts: document.scripts.length,
      cells: [...article.querySelectorAll('tr')].map(row => [...row.cells].map(cell => cell.querySelector('.pf-math')?.dataset.tex || cell.textContent.trim())),
      fonts: [...document.fonts].filter(face=>face.status==='loaded').length };
  });
  assert.deepEqual(offline.cells,[['Variabel','Hasil'],['ALFA','x+1'],['BETA','y-2']]);
  assert.equal(offline.scripts,0); assert.ok(offline.fonts>0); assert.deepEqual(network,[]); checkText(offline.text);
  delete offline.text;
  report.offline = {...offline,network};
  await page.click('#pub-close');
  await page.evaluate(() => window.addEventListener('message', e => {
    const frame=document.querySelector('iframe[title="PaperForma print"]');
    if(e.source===frame?.contentWindow && e.origin===location.origin && e.data?.type==='pf-print-result') window.pfHostedLayout=e.data.result.flattenedHtml;
  }));
  const printReceipt = await publish('print');
  const layout = await page.evaluate(()=>window.pfHostedLayout);
  assert.equal(typeof layout, 'string'); assert.ok(printReceipt.includes(hash(layout)));
  report.printLayoutSha256 = hash(layout);
  await off.setContent(layout, {waitUntil:'load'});
  await off.evaluate(()=>document.fonts.ready);
  const pdfPath=join(output,'print.pdf');
  await off.pdf({path:pdfPath, preferCSSPageSize:true,printBackground:true});
  checkText(execFileSync('pdftotext',['-layout',pdfPath,'-'],{encoding:'utf8'}));
  report.pdfSha256 = hash(await readFile(pdfPath));
  assert.deepEqual(pageErrors,[]);
  report.pass=true;
} catch(error) {
  report.pass=false; report.error=String(error); process.exitCode=1; console.error(error);
} finally {
  await browser.close(); await rm(temporary,{recursive:true,force:true});
  await writeFile(join(output,'results.json'),JSON.stringify(report,null,2)+'\n');
}
