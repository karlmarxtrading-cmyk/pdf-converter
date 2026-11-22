/** Open an actual HTML file and a Markdown diagram in the production studio.
 * Verify downloaded bytes, original UTF-8 file, SVG labels, offline image and error fallback. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { launch } from './lib.mjs';
import { candidateSha256, distTreeSha256 } from '../../scripts/fingerprint.mjs';

const out = resolve(process.env.PF_RICH_REPORT || 'evidence/rc12/operations');
const examples = resolve(process.env.PF_RICH_EXAMPLES || 'examples/rc12');
await mkdir(out, {recursive:true});
await mkdir(examples, {recursive:true});
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const env = await launch({dir: process.env.PF_RICH_DIST || 'dist', port: 4389});
const result = {candidate:candidateSha256(), dist:process.env.PF_RICH_DIST ? null : distTreeSha256(),
  productionEntrySha256:digest(await readFile(join(process.env.PF_RICH_DIST || 'dist','index.html'))),
  browser:await env.browser.version(), cases:[]};
async function imported(p, kind, file, source) {
  const input = await p.waitForSelector('#file-open');
  await input.uploadFile(file);
  if (kind === 'html') {
    await p.waitForSelector('#dlg-diff[open]');
    await p.click('#dlg-diff button[value=cancel]');
    assert.equal(await p.$eval('#editor', x=>x.value),'');
    await input.uploadFile(file);
    await p.waitForSelector('#dlg-diff[open]');
    await p.click('#dlg-diff button[value=apply]');
  }
  await p.waitForFunction(() => document.querySelector('#live-frame')?.contentDocument?.querySelector('article h1'));
  await p.click('#src-menu-btn');
  await p.click('[data-action=view-raw]');
  await p.waitForSelector('#dlg-raw[open]');
  await p.select('#raw-select', '0');
  assert.equal(await p.$eval('#raw-view', x=>x.textContent),source);
  await p.keyboard.press('Escape');
}
async function save(p, downloads, destination) {
  await p.click('[data-action=publish]');
  await p.waitForSelector('#dlg-publish[open] input[value=html-standalone]');
  await p.click('input[value=html-standalone]');
  if (await p.$('#pub-ack')) await p.click('#pub-ack');
  await p.click('#pub-go');
  await p.waitForSelector('#publish-result:not([hidden])');
  if (await p.$('#pub-review-ack')) {
    await p.click('#pub-review-ack');
    await p.click('#publish-result .btn-primary');
  }
  let filename;
  for (let i=0;i<120 && !filename;i++) {
    filename=(await readdir(downloads)).find(name=>name.endsWith('.html'));
    if (!filename) await delay(250);
  }
  const receipt=await p.$eval('#publish-result',x=>x.textContent);
  assert.ok(filename,receipt);
  await copyFile(join(downloads,filename),destination);
  const bytes=await readFile(destination);
  assert.ok(receipt.includes(digest(bytes)),receipt);
  return digest(bytes);
}
try {
  for (const [kind,name,output] of [['html','pelajaran.htm','KELAS-HTML'],['diagram','diagram.md','DIAGRAM-DAN-GAMBAR']]) {
    const dir=await mkdtemp(join(tmpdir(),'pf8-rich-'));
    const session=await env.browser.createBrowserContext({downloadBehavior:{policy:'allow',downloadPath:dir}});
    try {
      const file=resolve('fixtures/rc8/document-import',name);
      const source=await readFile(file,'utf8');
      const page=await session.newPage();
      await page.goto(env.base+'/#/workspace');
      await imported(page,kind,file,source);
      const destination=join(examples,output+'.html');
      const sha256=await save(page,dir,destination);
      const offline=await session.newPage();
      await offline.setCacheEnabled(false);
      await offline.setOfflineMode(true);
      const external=[];
      offline.on('request',r=>{if (/^https?:/.test(r.url())) external.push(r.url());});
      await offline.goto(pathToFileURL(destination).href);
      const actual=await offline.evaluate(async()=>{
        const article=document.querySelector('article');
        const image=article.querySelector('img');
        if (image) await image.decode();
        return {text:article.textContent, equations:[...article.querySelectorAll('.pf-math annotation')].map(n=>n.textContent),
          merged:article.querySelector('[rowspan="2"]')?.textContent || null,
          svgText:article.querySelector('.pf-mermaid-ok svg')?.textContent || '',
          fallback:article.querySelector('.pf-mermaid-failed code')?.textContent || null,
          image:image?[image.alt,image.naturalWidth,image.naturalHeight]:null, scripts:document.scripts.length};
      });
      assert.equal(actual.scripts,0); assert.deepEqual(external,[]);
      if (kind==='html') {
        assert.ok(actual.text.includes('Nilai awal tetap –7.') && actual.text.includes('Catatan akhir dari kelas.'));
        assert.ok(!actual.text.includes('Metadata arsip'));
        assert.equal(actual.merged,'Senin'); assert.deepEqual(actual.equations,['x+1']);
      } else {
        for (const label of ['Catat nilai','Periksa tabel','Simpan hasil']) assert.ok(actual.svgText.includes(label),label);
        assert.equal(actual.fallback?.trimEnd(),'diagram-tanpa-jenis\n  Nilai belum ditetapkan');
        assert.deepEqual(actual.image,['Palet kelas',3,2]);
        assert.ok(actual.text.includes('Catatan penutup tetap terbaca.'));
      }
      result.cases.push({name,sha256,rawSha256:digest(Buffer.from(source)),offline:true,independentContent:true,externalRequests:external,
        rawOriginalIdentical:true, actualFormula:actual.equations, mergedCell:actual.merged, actualImage:actual.image, preservedFallback:actual.fallback,status:'PASS'});
    } catch(e) {result.cases.push({name,status:'FAIL',error:String(e)});}
    finally {await session.close();await rm(dir,{recursive:true,force:true});}
  }
} finally {await env.close();}
await writeFile(join(out,'rich-import.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
if (result.cases.some(c=>c.status!=='PASS'))process.exitCode=1;
