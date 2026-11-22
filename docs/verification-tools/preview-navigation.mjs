// Run from the package root after npm ci and npm run build.
// PF_CHROME=/path/to/chromium node docs/verification-tools/preview-navigation.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { launch, page, setSource } from '../../tests/e2e/lib.mjs';
import { generateStress } from '../../scripts/generate-stress.mjs';

const token = 'START_SECTION_0118';
const targetId = 'h-bagian-0118';
const output = process.env.PF_NAV_OUT || 'evidence/rc8/operations/preview-navigation.json';
const dist = process.env.PF_NAV_DIST || 'dist';
const source = generateStress(118);
const digest = value => createHash('sha256').update(value).digest('hex');
const env = await launch({ dir: dist, port: Number(process.env.PF_NAV_PORT || 4396) });
const result = { status: 'FAIL', distribution: dist, input: { generator: 'generateStress(118)', bytes: Buffer.byteLength(source), sha256: digest(source) }, controls: [], navigation: [], selection: [] };
try {
  const p = await page(env, { lang: 'id' });
  result.browser = await env.browser.version();
  await p.goto(env.base + '/#/workspace', { waitUntil: 'load' });
  await p.waitForSelector('#editor', { visible: true });
  await setSource(p, source);
  await p.waitForFunction(id => document.querySelector('#live-frame')?.contentDocument?.getElementById(id), { timeout: 90000, polling: 100 }, targetId);
  await p.evaluate(() => document.querySelector('#live-frame').contentDocument.fonts.ready.then(() => true));
  result.structure = await p.evaluate(() => {
    const fr = document.querySelector('#live-frame');
    const doc = fr.contentDocument;
    const headingIds = Array.from(doc.querySelectorAll('article h2'), h => h.id);
    window.previewNavDocument = doc;
    window.previewNavEvents = [];
    for (const type of ['click', 'keydown', 'mouseup']) doc.addEventListener(type, event => {
      window.previewNavEvents.push({ type, trusted: event.isTrusted, key: event.key ?? null, tag: event.target?.tagName });
    }, true);
    return { headingIds, cells: doc.querySelectorAll('article td').length, paragraphs: doc.querySelectorAll('article > p[data-block-id]').length, url: doc.URL, sandbox: fr.getAttribute('sandbox') };
  });
  assert.deepEqual(result.structure.headingIds, Array.from({length: 118}, (_, i) => `h-bagian-${String(i + 1).padStart(4, '0')}`));
  assert.equal(result.structure.cells, 1888);
  const frame = await (await p.$('#live-frame')).contentFrame();
  const targetLink = `.pf-toc a[href="#${targetId}"]`;
  for (const enabled of [false, true]) {
    const search = await p.evaluate(({enabled, token}) => {
      const f = document.querySelector('#live-frame'), d = f.contentDocument, w = f.contentWindow;
      const style = d.querySelector('style[data-pf="long-preview"]');
      style.sheet.disabled = !enabled;
      const early = Array.from(d.querySelectorAll('article > p')).find(n => n.textContent === 'START_SECTION_0001');
      const end = Array.from(d.querySelectorAll('article > p')).find(n => n.textContent === token);
      w.scrollTo(0, 0);
      const range = d.createRange(); range.setStartBefore(early); range.collapse(true);
      w.getSelection().removeAllRanges(); w.getSelection().addRange(range);
      const apiMatch = w.find(token, false, false, true, false, false, false);
      return { cssEnabled: enabled, visibility: w.getComputedStyle(end).contentVisibility, offscreen: end.getBoundingClientRect().top > w.innerHeight, windowFind: apiMatch, windowFindSelection: w.getSelection().toString() };
    }, {enabled, token});
    result.controls.push(search);
    assert.equal(search.visibility, enabled ? 'auto' : 'visible');
    assert.equal(search.offscreen, true);
    for (const interaction of ['mouse', 'keyboard']) {
      const a = await frame.$(targetLink);
      if (interaction === 'mouse') await a.click();
      else { await a.focus(); await p.keyboard.press('Enter'); }
      await p.waitForFunction(id => document.querySelector('#live-frame').contentDocument.activeElement?.id === id, {timeout: 3500, polling: 50}, targetId);
      const n = await p.evaluate(() => {
        const f=document.querySelector('#live-frame'), d=f.contentDocument, h=d.activeElement;
        return { sameDocument:d === window.previewNavDocument, url:d.URL, focus:h.id, y:h.getBoundingClientRect().top, viewport:f.contentWindow.innerHeight };
      });
      result.navigation.push({cssEnabled: enabled, interaction, ...n});
      assert.ok(n.sameDocument && n.url === 'about:srcdoc' && n.focus === targetId && n.y >= -2 && n.y < n.viewport);
    }
    const coords = await p.evaluate(token => {
      const f = document.querySelector('#live-frame'), d = f.contentDocument;
      const para = Array.from(d.querySelectorAll('article > p')).find(e => e.textContent === token);
      const range = d.createRange(); range.selectNodeContents(para);
      const rect = range.getBoundingClientRect(), outer = f.getBoundingClientRect();
      return { startX:outer.left + f.clientLeft + rect.left - 1, endX: outer.left + f.clientLeft + rect.right + 1, y: outer.top + f.clientTop + rect.top + rect.height/2 };
    }, token);
    await p.mouse.move(coords.startX, coords.y); await p.mouse.down();
    await p.mouse.move(coords.endX, coords.y, {steps: 12}); await p.mouse.up();
    const selected = await p.evaluate(() => document.querySelector('#live-frame').contentWindow.getSelection().toString());
    result.selection.push({cssEnabled: enabled, method:'trusted pointer drag over actual text after navigation', selected});
    assert.equal(selected, token);
  }
  result.trustedEvents = await p.evaluate(() => window.previewNavEvents.filter(e => e.trusted));
  assert.ok(result.trustedEvents.some(e=>e.type==='click' && e.tag==='A') && result.trustedEvents.some(e=>e.type==='keydown' && e.key==='Enter'));
  result.nativeBrowserFind = {status:'NOT_RUN', reason:'The headless automation session does not expose the browser Find bar. The legacy window.find API observations are recorded for both CSS settings.'};
  result.sourceAfterSha256 = digest(await p.$eval('#editor', element => element.value));
  assert.equal(result.sourceAfterSha256, result.input.sha256);
  result.status = 'PASS';
} catch (error) {
  result.error = String(error?.stack || error); process.exitCode = 1;
} finally {
  await env.close();
  await mkdir(dirname(output), {recursive:true}); await writeFile(output, JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({status:result.status,controls:result.controls,navigation:result.navigation,selection:result.selection,error:result.error}));
}
