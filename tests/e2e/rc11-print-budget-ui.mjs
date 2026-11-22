// Real production editor and publication controls; generates a one-pixel PNG
// with a large, valid tEXt chunk. Repeating one local asset expands the payload
// while the small source Markdown and stored project stay within input quotas.
import assert from 'node:assert/strict';
import { crc32, deflateSync } from 'node:zlib';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { launch, setSource } from './lib.mjs';
import { candidateSha256, treeHash } from '../../scripts/fingerprint.mjs';

const servingDir = resolve(process.env.PF_BUDGET_DIST || 'dist');
const output = resolve(process.argv[2] ?? 'evidence/print-budget');
await mkdir(output,{recursive:true});
const temp = await mkdtemp(join(tmpdir(),'pf-asset-test-'));
const name = 'a06-pixel.png';
function chunk(type,data) {
  const length = Buffer.alloc(4), checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type),data]);
  checksum.writeUInt32BE(crc32(typed));
  return Buffer.concat([length,typed,checksum]);
}
const header = Buffer.from([0,0,0,1,0,0,0,1,8,0,0,0,0]);
const png = Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),
  chunk('tEXt',Buffer.from('Description\0'+'A'.repeat(2*1024*1024))),
  chunk('IDAT',deflateSync(Buffer.from([0,0]))),chunk('IEND',Buffer.alloc(0))]);
await writeFile(join(temp,name),png);
const source = '# A06 gambar lokal\n\n' + ('![piksel]('+name+')\n\n').repeat(18) + 'Akhir dokumen 42.';
const edited = '# A06 revisi\n\nNaskah terbaru 73.';
const result = {candidateSha256:candidateSha256(), servedTree:treeHash(['.'],servingDir).sha256,
  assetBytes:png.length, sourceBytes:Buffer.byteLength(source), repetitions:18, refusals:[]};
let env;
try {
  env = await launch({dir:servingDir,port:Number(process.env.PF_BUDGET_UI_PORT || 4503)});
  result.browser = await env.browser.version();
  const p = await env.browser.newPage();
  p.setDefaultTimeout(120000);
  await p.setViewport({width:1440,height:1000});
  await p.goto(env.base+'/#/workspace');
  await p.waitForFunction(() => /rev \d+/.test(document.querySelector('#src-hash')?.textContent || ''));
  await (await p.$('#file-assets')).uploadFile(join(temp,name));
  await p.waitForFunction(n => document.querySelector('#asset-list').textContent.includes(n),{},name);
  await setSource(p,source);
  await p.waitForFunction(() => document.querySelector('#outline')?.textContent.includes('A06 gambar lokal'));
  async function openMode(mode) {
    await p.click('[data-action="publish"]');
    await p.waitForSelector('#dlg-publish[open]');
    await p.click('#dlg-publish input[value="'+mode+'"]');
    const ack = await p.$('#pub-ack');
    if (ack && !await ack.evaluate(el => el.checked)) await ack.click();
    await p.waitForSelector('#pub-go:not([disabled])');
  }
  for (const mode of ['print','print-book']) {
    await openMode(mode);
    await p.click('#pub-go');
    await p.waitForSelector('#publish-result.banner-error:not([hidden])');
    const receipt = await p.$eval('#publish-result',el => el.innerText);
    assert.match(receipt,/47,185,920/);
    assert.equal(await p.$eval('#editor',el => el.value),source);
    assert.equal(await p.$('iframe[title="PaperForma print"],#pf-book-print'),null);
    result.refusals.push({mode,receipt,sourceIntact:true,noPrintFrame:true});
    await p.click('#pub-close');
  }
  await setSource(p,edited);
  await p.waitForFunction(() => document.querySelector('#outline')?.textContent.includes('A06 revisi'));
  await openMode('print-book');
  await p.evaluate(() => {document.querySelector('#pub-go').click();document.querySelector('#pub-cancel').click();});
  await p.waitForSelector('#publish-result.banner-warn:not([hidden])');
  result.cancelReceipt = await p.$eval('#publish-result',el=>el.innerText);
  await p.click('#publish-result button');
  await p.waitForSelector('#book-open-print');
  const finalText = await p.$eval('#pf-book-print',fr=>fr.contentDocument.querySelector('article').innerText);
  assert.match(finalText,/Naskah terbaru 73/);
  assert.doesNotMatch(finalText,/Akhir dokumen 42/);
  assert.equal(await p.$eval('#editor',el=>el.value),edited);
  result.retry = {receipt:await p.$eval('#publish-result',el=>el.innerText), finalText,sourceIntact:true};
  await p.click('#pub-close');
  await p.waitForSelector('#pf-book-print',{hidden:true});
  result.ok = true;
} catch (e) {result.ok = false;result.error = e.stack;process.exitCode = 1;}
finally {
  result.distFolder = basename(servingDir);
  await writeFile(join(output,'browser-ui.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
  await env?.close();
  await rm(temp,{recursive:true,force:true});
}
