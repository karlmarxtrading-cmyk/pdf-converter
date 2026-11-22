/** Run from the project root after npm run build. Exercises the production UI and validates actual downloads offline.
 * PF_OUTPUT_DIR selects the directory for this new run. Native print-dialog saving is a separate test.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { launch } from './lib.mjs';
import { distTreeSha256 } from '../../scripts/fingerprint.mjs';

const folder = resolve(process.env.PF_OUTPUT_DIR || 'evidence/rc7-output-local');
const fixture = resolve('fixtures/rc6/user-trigonometry.md');
const oracle = JSON.parse(await readFile('fixtures/rc6/user-trigonometry.expected.json', 'utf8'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(digest(await readFile(fixture)), oracle.input_sha256);
await mkdir(folder, {recursive:true});
const env = await launch({dir:'dist', port:4358});
const records = [];
try {
  for (const template of ['BUS-01','EDU-01','EDT-01','CON-01']) {
    const dir = await mkdtemp(join(tmpdir(), 'pf-html-'));
    const context = await env.browser.createBrowserContext({downloadBehavior:{policy:'allow', downloadPath:dir}});
    try {
      const p = await context.newPage();
      await p.setViewport({width:1440, height:1000});
      await p.goto(env.base + '/#/workspace');
      await p.waitForSelector('#editor');
      await (await p.$('#file-open')).uploadFile(fixture);
      await p.waitForFunction(() => document.querySelector('#live-frame')?.contentDocument?.querySelectorAll('.pf-math').length === 231);
      await p.click('[data-tpl="' + template + '"]');
      await p.waitForFunction(id => document.querySelector('#live-frame')?.contentDocument?.querySelector('[data-template]')?.dataset.template === id,{},template);
      await p.click('[data-action="publish"]');
      await p.waitForSelector('#dlg-publish[open] input[value="html-standalone"]', {visible:true});
      await p.click('input[value="html-standalone"]');
      if (await p.$('#pub-ack')) await p.click('#pub-ack');
      await p.click('#pub-go');
      await p.waitForSelector('#publish-result:not([hidden])');
      if (await p.$('#pub-review-ack')) {
        await p.click('#pub-review-ack');
        await p.click('#publish-result .btn-primary');
      }
      await p.waitForSelector('#publish-result.banner-ok');
      let file;
      for (let i=0; i<120; i++) {
        file = (await readdir(dir)).find(f => /\.html$/i.test(f));
        if (file) break;
        await delay(250);
      }
      assert.ok(file,'Completed HTML download is missing');
      const artifact = join(folder, template + '.html');
      await copyFile(join(dir,file),artifact);
      const bytes = await readFile(artifact);
      const hash = digest(bytes);
      assert.ok((await p.$eval('#publish-result',e=>e.textContent)).includes(hash));
      const offline = await env.browser.createBrowserContext();
      try {
        const q = await offline.newPage();
        const external = [];
        q.on('request', req=>{if (/^https?:/i.test(req.url())) external.push(req.url());});
        await q.setOfflineMode(true);
        await q.goto(pathToFileURL(artifact).href, {waitUntil:'load'});
        const result = await q.evaluate(async ({id,expected}) => {
          const formulas = [...document.querySelectorAll('.pf-math')];
          const differences = formulas.flatMap((n,i)=>{
            const e = expected[i];
            const ok = e && n.dataset.tex === e.expected && n.dataset.sourceTex === e.raw &&
              n.querySelector('annotation')?.textContent === e.expected && !!n.querySelector('.katex-display') === e.display;
            return ok ? [] : [i];
          });
          const faces = [...document.fonts];
          const loaded = await Promise.allSettled(faces.map(face=>face.load()));
          const geo = n => { const r=n?.getBoundingClientRect(); return r && r.width>0 && r.height>0; };
          return { title:document.title, template:document.querySelector('[data-template]')?.dataset.template, intended:id,
            count:formulas.length, katex:document.querySelectorAll('.pf-math .katex').length,
            mathml:document.querySelectorAll('.pf-math math').length, differences,
            tables:document.querySelectorAll('table').length, toc:document.querySelectorAll('.pf-toc a[href]').length,
            broken:[...document.querySelectorAll('a[href^="#"]')].filter(a=>!document.getElementById(decodeURIComponent(a.hash.slice(1)))).length,
            styled: getComputedStyle(document.querySelector('.katex-mathml')).position === 'absolute' &&
              getComputedStyle(document.querySelector('.katex .vlist-t')).display === 'inline-table',
            visibleMath: formulas.filter(n=>geo(n.querySelector('.katex-html'))).length,
            fontFaces:faces.length, fontsLoaded: loaded.filter(x=>x.status==='fulfilled').length,
            scripts:document.scripts.length, errorMarkers:document.querySelectorAll('.pf-math-error,.katex-error').length };
        },{id:template,expected:oracle.formulas});
        assert.equal(result.template,template);
        assert.equal(result.title,'Kumpulan Rumus Trigonometri Lengkap');
        assert.equal(result.count,231);
        assert.equal(result.katex,231);
        assert.equal(result.mathml,231);
        assert.equal(result.visibleMath,231);
        assert.equal(result.tables,5);
        assert.equal(result.broken,0);
        assert.equal(result.scripts,0);
        assert.equal(result.errorMarkers,0);
        assert.ok(result.styled && result.fontFaces>0 && result.fontFaces===result.fontsLoaded);
        assert.deepEqual(result.differences,[]);
        assert.deepEqual(external,[]);
        records.push({template,bytes:bytes.length,sha256:hash,offline:result,externalRequests:external,status:'PASS'});
      } finally {await offline.close();}
    } catch (error) {records.push({template,status:'FAIL',error:String(error)});}
    finally {await context.close();await rm(dir,{recursive:true,force:true});}
  }
  await writeFile(join(folder,'browser.json'), JSON.stringify({engine:await env.browser.version(),distTree:distTreeSha256(),input:oracle.input_sha256,records},null,2));
} finally { await env.close(); }
if (records.some(r=>r.status!=='PASS')) process.exitCode=1;
