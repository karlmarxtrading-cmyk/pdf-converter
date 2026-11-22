// Public UI on the production bundle; read actual editor status and publication summary.
// The open-dialog edit dispatches an input event on the editor to exercise invalidation
// of an already open summary, including the interval before the next worker result.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { launch, setSource } from './lib.mjs';
import { treeHash } from '../../scripts/fingerprint.mjs';

const dir = resolve(process.argv[2] || 'dist');
const output = resolve(process.argv[3] || 'stats-browser.json');
const { candidateSha256, distTreeSha256 } = JSON.parse(await readFile(join(dirname(dir),'dist.build-manifest.json'),'utf8'));
assert.equal(treeHash(['dist'], dirname(dir)).sha256, distTreeSha256);
const result = { candidateSha256, distTreeSha256, method: 'Production Chromium, actual editor input and publish dialog. The second edit is dispatched while the dialog is open.' };
const env = await launch({dir, port:Number(process.env.PF_STATS_PORT || 4756)});
try {
  result.browser = await env.browser.version();
  const p = await env.browser.newPage();
  p.setDefaultTimeout(30000);
  await p.evaluateOnNewDocument(() => { localStorage.setItem('pf-lang','en'); });
  await p.setViewport({width:1400,height:1000});
  await p.goto(env.base+'/#/workspace');
  await p.waitForFunction(() => /rev \d+/i.test(document.querySelector('#src-hash')?.textContent || ''));
  async function status() {
    return p.evaluate(() => ({
      editor: document.querySelector('#render-state').textContent,
      summary: document.querySelector('#publish-summary').textContent,
      snapshot: document.querySelector('#src-hash').textContent,
      goDisabled: document.querySelector('#pub-go').disabled,
    }));
  }
  const raw = '# Alpha\n\n<table><tr><th>Name</th><th>Formula</th></tr><tr><td>Energy</td><td><span data-tex="x">x</span></td></tr></table>\n\n<pre>literal code</pre>';
  await setSource(p,raw);
  await p.waitForFunction(() => document.querySelector('#outline').textContent.includes('Alpha'));
  await p.click('[data-action="publish"]');
  await p.waitForSelector('#dlg-publish[open]');
  result.initial = await status();
  await setSource(p,'# Beta\n\nSatu dua tiga empat lima.');
  result.pending = await status();
  await p.waitForFunction(() => document.querySelector('#outline').textContent.includes('Beta'));
  result.edited = await status();
  await p.click('#pub-close');
  await p.click('[data-action="publish"]');
  await p.waitForSelector('#dlg-publish[open]');
  result.reopened = await status();
  for (const [key, words, tables, math, code] of [['initial',4,1,1,1],['edited',6,0,0,0],['reopened',6,0,0,0]]) {
    const receipt = result[key];
    const revision = /rev (\d+)/i.exec(receipt.snapshot)[1];
    assert.match(receipt.editor,new RegExp('(?:Revision|Revisi) '+revision+' · '+words+' (?:words|kata)'));
    assert.match(receipt.summary,new RegExp('rev '+revision+' ·'));
    assert.match(receipt.summary,new RegExp(words+' (?:words|kata) · '+tables+' (?:tables|tabel) · '+math+' (?:formulas|rumus) · 0 (?:images|gambar) · '+code+' (?:code blocks|blok kode)'));
  }
  assert.doesNotMatch(result.pending.summary,/\d+ (?:words|kata)/);
  assert.equal(result.pending.goDisabled,true);
  assert.match(result.pending.editor,/(Memproses|Processing)/i);
  result.pass = true;
} catch (error) {
  result.pass = false;
  result.error = String(error);
  process.exitCode = 1;
} finally {
  await writeFile(output,JSON.stringify(result,null,2)+'\n');
  await env.close();
}
