/** Inspect table roles and resolved header associations in an actual offline export. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {launch} from './lib.mjs';

const dist = resolve(process.env.PF_AX_DIST || 'dist');
const fixture = resolve('fixtures/device/clipboard-table-headers.html');
const output = resolve(process.argv[2] || 'evidence/rc12/audit/accessible-tables');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const manifest = JSON.parse(await readFile(dist+'.build-manifest.json','utf8'));
const temp = await mkdtemp(join(tmpdir(),'paperforma-headers-'));
await mkdir(output,{recursive:true});
const host = await launch({dir:dist, port:Number(process.env.PF_AX_PORT || 4897)});
const result = {manifest, fixtureSha256:hash(await readFile(fixture)), browser:await host.browser.version(),
  method:'GUI import, preview, HTML download, offline file, DOM and Chromium accessibility tree. Native screen reader has its own gate.'};
let active;
try {
  const context = await host.browser.createBrowserContext({downloadBehavior:{policy:'allow',downloadPath:temp}});
  const page = await context.newPage();
  active = page;
  await page.setViewport({width:1440,height:1000});
  await page.goto(host.base+'/#/workspace');
  await page.waitForFunction(()=>/rev \d+/.test(document.querySelector('#src-hash')?.textContent || ''),{polling:100});
  await (await page.waitForSelector('#file-open')).uploadFile(fixture);
  result.stage='import';
  await page.waitForSelector('#dlg-diff[open]');
  await page.click('#dlg-diff button[value=apply]');
  result.stage='preview';
  await page.waitForFunction(()=>document.querySelector('#live-frame')?.contentDocument?.body?.textContent.includes('PF-AKHIR-578'),{polling:100});
  result.stage='publish';
  await page.click('[data-action=publish]');
  await page.click('input[value="html-standalone"]');
  if(await page.$('#pub-ack')) await page.click('#pub-ack');
  await page.waitForFunction(()=>!document.querySelector('#pub-go').disabled);
  await page.click('#pub-go');
  await page.waitForSelector('#publish-result:not([hidden])');
  if(await page.$('#pub-review-ack')){
    await page.click('#pub-review-ack');
    await page.click('#publish-result .btn-primary');
  }
  result.stage='download';
  let found;
  for(let i=0; i<150 && !found; i++){
    found=(await readdir(temp)).find(name=>name.endsWith('.html'));
    if(!found) await delay(120);
  }
  assert.ok(found,'HTML file downloaded');
  const standalone=join(output,'jadwal-pengamatan.html');
  const bytes=await readFile(join(temp,found));
  await writeFile(standalone,bytes);
  const offline=await context.newPage();
  await offline.setOfflineMode(true);
  await offline.goto(pathToFileURL(standalone).href);
  result.stage='offline';
  const actual=await offline.$eval('article',article=>{
    const [table,grid]=article.querySelectorAll('table');
    const p=[...article.querySelectorAll('p')].find(n=>n.textContent.includes('Langkah A'));
    const rows=[...table.rows].map(row=>[...row.cells].map(cell=>({
      tag:cell.tagName,scope:cell.getAttribute('scope'),text:cell.textContent.trim(),
      headers:cell.headers.split(/\s+/).filter(Boolean).map(id=>article.ownerDocument.getElementById(id)?.textContent.trim()??null)
    })));
    return {caption:table.caption?.textContent,rows,plainGrid:[...grid.rows].map(r=>[...r.cells].map(c=>[c.tagName,c.textContent.trim()])),
      lineBreaks:p?.querySelectorAll('br').length,tex:p?.querySelector('.pf-math')?.getAttribute('data-tex')};
  });
  const client=await offline.createCDPSession();
  const tree=await client.send('Accessibility.getFullAXTree');
  const roles=tree.nodes.filter(node=>!node.ignored&&['table','rowheader','columnheader','cell'].includes(node.role?.value)).map(node=>[node.role.value,node.name?.value||'']);
  Object.assign(result,{actual,roles,standaloneSha256:hash(bytes)});
  assert.equal(actual.lineBreaks,2);
  assert.equal(actual.tex,' x+1 ');
  assert.equal(actual.caption,'Suhu ruang kelas');
  assert.deepEqual(actual.rows.slice(1).map(row=>row[1].headers),[['Pagi','Ruang A'],['Siang','Ruang A']]);
  assert.deepEqual(actual.plainGrid,[[['TD','Alfa'],['TD','Beta']],[['TD','Gamma'],['TD','Delta']]]);
  for(const [role,name] of [['rowheader','Pagi'],['rowheader','Siang'],['columnheader','Ruang A'],['columnheader','Waktu']])
    assert.ok(roles.some(([r,n])=>r===role&&n===name),'Missing browser accessibility role '+role+' '+name);
  result.status='PASS';
} catch(error){
  result.status='FAIL';result.error=String(error);process.exitCode=1;
  if(active) result.previewDiagnostic=await active.evaluate(()=>{
    const frame=document.querySelector('#live-frame');
    return {location:location.hash,previewUrl:frame?.contentDocument?.URL,frameText:frame?.contentDocument?.body?.textContent.slice(-900),
      sourceEnd:document.querySelector('#editor')?.value.slice(-400),htmlContainsEnd:frame?.srcdoc.includes('PF-AKHIR-578')};
  }).catch(()=>null);
  if(active) result.messages=await active.$$eval('#render-state,#publish-gate,#publish-result,#paste-error,dialog[open]',els=>els.map(el=>el.textContent.slice(0,800))).catch(()=>[]);
} finally {
  await host.close();await rm(temp,{recursive:true,force:true});
  await writeFile(join(output,'result.json'),JSON.stringify(result,null,2)+'\n');
  console.log(result.status,result.error||result.standaloneSha256);
}
