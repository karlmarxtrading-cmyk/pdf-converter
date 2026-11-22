// Exercise the normal production editor, downloads and print controls with
// ordinary small raster swatches. The real browser Image decoder stays in use.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as pause} from 'node:timers/promises';
import {candidateSha256, distTreeSha256} from '../../scripts/fingerprint.mjs';
import {launch, setSource} from './lib.mjs';

const dist = process.env.PF_RASTER_DIST || 'dist';
const candidate = candidateSha256(), tree = distTreeSha256(dist);
if (dist === 'dist') {
  const manifest = JSON.parse(await readFile('dist.build-manifest.json','utf8'));
  assert.equal(manifest.candidateSha256,candidate); assert.equal(manifest.distTreeSha256,tree);
}
const temp = await mkdtemp(join(tmpdir(),'pf-raster-public-'));
const env = await launch({dir: dist, port: Number(process.env.PF_RASTER_PORT || 4513)});
const context = await env.browser.createBrowserContext({downloadBehavior: {policy:'allow', downloadPath: temp}});
const page = await context.newPage();
page.setDefaultTimeout(60_000);
const good = 'data:image/png;base64,' + (await readFile('fixtures/rc12/raster/8px.png')).toString('base64');
const mismatched = good.replace('image/png','image/jpeg');
const shape = url => 'flowchart LR\nA@{ img: "' + url + '", label: "Public swatch", pos: "b", h: 12, constraint: "on" }';
const source = '# Raster check\n\n' + [shape(good),shape(mismatched)].map(s=>'\x60\x60\x60mermaid\n'+s+'\n\x60\x60\x60').join('\n\n') + '\n\nRASTER END';
const reports = {};
const external = [];
page.on('request',req=>{ const url = new URL(req.url()); if (url.protocol==='https:' && url.origin!==new URL(env.base).origin) external.push(url.origin); });

function verify(collected, text) {
  assert.ok(collected.images.includes(good), JSON.stringify(collected));
  assert.ok(collected.fallback.includes(shape(mismatched)), JSON.stringify(collected));
  assert.ok(collected.end.includes(text));
}

async function checkDocument(frameSelector, mode, end='RASTER END') {
  const args = {frameSelector,mode};
  const read = ({frameSelector,mode}) => {
    const doc = document.querySelector(frameSelector)?.contentDocument;
    const area = mode === 'print' ? doc?.querySelector('.pagedjs_pages') : doc?.querySelector('article');
    return {images:[...area?.querySelectorAll('figure.pf-mermaid-ok svg image')||[]].map(i=>i.getAttribute('href')),
      fallback:[...area?.querySelectorAll('.pf-mermaid-source')||[]].map(s=>s.textContent),end:area?.textContent?.slice(-100)||''};
  };
  for(let i=0;i<300;i++) {
    const actual=await page.evaluate(read,args);
    if(actual.images.includes(good) && actual.end.includes(end)) { verify(actual,end); return actual; }
    await pause(100);
  }
  throw Error('Output not ready: '+mode+' '+JSON.stringify(await page.evaluate(read,args)));
}

async function openMode(mode) {
  await page.click('[data-action=publish]');
  await page.waitForSelector('#dlg-publish[open]');
  await page.click('#dlg-publish input[value="'+mode+'"]');
  const ack = await page.$('#pub-ack');
  if (ack && !await ack.evaluate(el=>el.checked)) await ack.click();
  await page.waitForSelector('#pub-go:not([disabled])');
}

try {
  await page.evaluateOnNewDocument(() => {
    if (window !== window.top) return;
    const decode = HTMLImageElement.prototype.decode;
    window.paperFormaDecodeTrace=[];
    HTMLImageElement.prototype.decode=function(...args) {
      window.paperFormaDecodeTrace.push(this.getAttribute('src'));
      return decode.apply(this,args);
    };
  });
  await page.goto(env.base+'/#/workspace');
  await page.waitForSelector('#editor');
  await setSource(page,source);
  reports.preview = await checkDocument('#live-frame','preview');
  await openMode('html-standalone'); await page.click('#pub-go');
  await page.waitForSelector('#publish-result:not([hidden])');
  if(await page.$('#pub-review-ack')) {
    await page.click('#pub-review-ack'); await page.click('#publish-result .btn-primary');
  }
  let file;
  for(let i=0;i<300 && !file;i++) {file=(await readdir(temp)).find(s=>s.endsWith('.html')); if(!file) await pause(100);}
  assert.ok(file);
  const html=await readFile(join(temp,file),'utf8');
  const output=await page.evaluate(html=>{
    const d=document.createElement('template');d.innerHTML=html; const a=d.content.querySelector('article');
    return {images:[...a.querySelectorAll('figure.pf-mermaid-ok svg image')].map(i=>i.getAttribute('href')),
      fallback:[...a.querySelectorAll('.pf-mermaid-source')].map(s=>s.textContent),end:a.textContent.slice(-100)};
  },html);
  verify(output,'RASTER END');
  reports.standalone={sha256:createHash('sha256').update(html).digest('hex'),imagePreserved:true,fallbackExact:true};
  await page.click('#pub-close');
  for(const mode of ['print','print-book']) {
    await openMode(mode); await page.click('#pub-go');
    await page.waitForSelector(mode==='print'?'#publish-result .print-state':'#book-html-hash');
    reports[mode]=await checkDocument(mode==='print'?'iframe[title="PaperForma print"]':'#pf-book-print',mode);
    await page.click('#pub-close');
  }
  const edited=source.replace('RASTER END','RASTER EDITED');
  await setSource(page,edited); await checkDocument('#live-frame','preview','RASTER EDITED');
  await openMode('print-book');
  await page.evaluate(()=>{document.querySelector('#pub-go').click();document.querySelector('#pub-cancel').click();});
  await page.waitForSelector('#publish-result.banner-warn:not([hidden])');
  await page.click('#publish-result button'); await page.waitForSelector('#book-open-print');
  await checkDocument('#pf-book-print','print-book','RASTER EDITED');
  assert.equal(await page.$eval('#editor',e=>e.value),edited);
  await page.click('#pub-close');
  await page.waitForSelector('#pf-book-print',{hidden:true});
  reports.cancelledAndRetriedEditedSource=true;
  const trace=await page.evaluate(()=>window.paperFormaDecodeTrace);
  assert.ok(trace.includes(good)); assert.ok(!trace.includes(mismatched)); assert.equal(external.length,0);
  reports.decoder={validCalls:trace.filter(v=>v===good).length,mismatchedCalls:0,remoteRequests:0};
  const report = {candidateSha256:candidate,distTreeSha256:tree,browser:await env.browser.version(),reports};
  console.log(JSON.stringify(report,null,2)); if(process.env.PF_RASTER_REPORT) await writeFile(process.env.PF_RASTER_REPORT,JSON.stringify(report,null,2)+'\n');
} finally {await context.close(); await env.close(); await rm(temp,{recursive:true,force:true});}
