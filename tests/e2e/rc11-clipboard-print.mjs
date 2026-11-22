/** Synthetic public HTML, production import and publishing controls, real print-engine PDFs.
 * This does not certify a native Windows clipboard provider or the OS Save dialog. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {pathToFileURL} from 'node:url';
import {launch} from './lib.mjs';
import {distTreeSha256} from '../../scripts/fingerprint.mjs';

const directory = process.env.PF_CLIP_PRINT_DIST || 'dist';
const output = resolve(process.env.PF_CLIP_PRINT_EVIDENCE || 'evidence/rc12/clipboard-print');
const digest = bytes=>createHash('sha256').update(bytes).digest('hex');
const items = Array.from({length:84}, (_,i) => i===2 ? '<li type="A">Third marker</li>' :
  i===82 ? '<li type="i" value="7">Late marker</li>' : '<li>Sample '+(i+1)+'</li>').join('');
const html = '<!doctype html><meta charset="utf-8"><h1>Clipboard fidelity</h1><p>Before <span data-tex=" x + 1 ">x+1</span> after.</p>'
  + '<table><tr><th>Left <math display="block"><annotation encoding="application/x-tex">x+2</annotation></math> right</th><th>Column B</th></tr><tr><td>Cell C</td><td>Cell D</td></tr></table>'
  + '<ol>'+items+'</ol><p>Refer to C. and vii. End of sample.</p>';
await mkdir(output,{recursive:true});
const temp=await mkdtemp(join(tmpdir(),'paperforma-markers-'));
const fixture=join(output,'clipboard-input.html');
await writeFile(fixture,html);
const env=await launch({dir:directory,port:Number(process.env.PF_CLIP_PRINT_PORT || 4893)});
const report={distTreeSha256:distTreeSha256(directory),inputSha256:digest(html),browser:await env.browser.version(),
  method:'Production HTML file import, visible publishing controls, exact print layout bytes, Chromium CDP PDF and Poppler PDF text; synthetic fixture.',results:[]};
try {
  for (const mode of ['print','print-book']) {
    const ctx=await env.browser.createBrowserContext({downloadBehavior:{policy:'allow',downloadPath:temp}});
    const page=await ctx.newPage();
    const row={mode};
    try {
      await page.setViewport({width:1440,height:1000});
      await page.goto(env.base+'/#/workspace');
      await (await page.waitForSelector('#file-open')).uploadFile(fixture);
      await page.waitForSelector('#dlg-diff[open]');
      await page.click('#dlg-diff button[value=apply]');
      await page.waitForFunction(()=>document.querySelector('#live-frame')?.contentDocument?.querySelectorAll('article .pf-math').length===2);
      await page.click('[data-action="publish"]');
      await page.click('input[value="'+mode+'"]');
      if(await page.$('#pub-ack')) await page.click('#pub-ack');
      if(mode==='print') await page.evaluate(()=>{
        window.addEventListener('message',event=>{
          if(event.origin===location.origin && event.source===document.querySelector('iframe[title="PaperForma print"]')?.contentWindow &&
             event.data?.type==='pf-print-result') window.rc11PrintResult=event.data.result;
        });
      });
      await page.waitForFunction(()=>!document.querySelector('#pub-go').disabled);
      await page.click('#pub-go');
      let layout;
      if(mode==='print'){
        await page.waitForSelector('#publish-result.banner-ok',{timeout:120000});
        layout=await page.evaluate(()=>window.rc11PrintResult?.flattenedHtml);
        assert.ok(layout);
        assert.ok((await page.$eval('#publish-result',el=>el.innerText)).includes(digest(layout)));
      }else{
        await page.waitForSelector('#book-save-html');
        await page.click('#book-save-html');
        let file;
        for(let tries=0;tries<120&&!file;tries++) {
          file=(await readdir(temp)).find(n=>n.endsWith('.html'));
          if(!file) await delay(100);
        }
        assert.ok(file);
        layout=await readFile(join(temp,file),'utf8');
        assert.equal(await page.$eval('#book-html-hash',el=>el.dataset.sha256),digest(layout));
      }
      const layoutPath=join(output,mode+'.html');
      await writeFile(layoutPath,layout);
      const offline=await ctx.newPage(); await offline.setOfflineMode(true);
      await offline.goto(pathToFileURL(layoutPath).href); await offline.evaluate(()=>document.fonts.ready);
      const equations=await offline.$$eval('.pf-math',nodes=>nodes.filter(n=>!n.closest('[data-pf-repeat]')).map(el=>[
        el.getAttribute('data-tex'),el.classList.contains('pf-math-display'),el.closest('th,td')?.tagName??null,el.querySelector('annotation')?.textContent]));
      assert.deepEqual(equations,[[' x + 1 ',false,null,' x + 1 '],['x+2',true,'TH','x+2']]);
      const path=join(output,mode+'.pdf');
      const pdf=await offline.pdf({path,preferCSSPageSize:true,printBackground:true});
      const pages=execFileSync('pdftotext',['-layout',path,'-'],{encoding:'utf8'}).split('\f').filter(s=>s.trim());
      const early=pages.findIndex(text=>/\bC\.\s*Third marker/.test(text));
      const late=pages.findIndex(text=>/\bvii\.\s*Late marker/.test(text));
      assert.ok(early>=0 && late>early, 'physical per-item markers on distinct PDF pages');
      assert.match(pages.join(' '),/\bCell C\s+Cell D/);
      assert.match(pages.at(-1),/Refer to C\. and vii\. End of sample\./);
      Object.assign(row,{status:'PASS',equations,physicalPages:pages.length,earlyMarkerPage:early+1,lateMarkerPage:late+1,
        layoutSha256:digest(layout),pdfSha256:digest(pdf),pdfBytes:pdf.byteLength});
    } catch(error) {
      Object.assign(row,{status:'FAIL',message:String(error),ui:await page.$$eval('#render-state,#paste-error,#publish-result,#publish-gate',els=>els.map(e=>e.textContent)).catch(()=>[])});
      process.exitCode=1;
    } finally {report.results.push(row); await ctx.close();}
  }
} finally {
  await env.close();await rm(temp,{recursive:true,force:true});
  await writeFile(join(output,'print-results.json'),JSON.stringify(report,null,2)+'\n');
  for(const row of report.results) console.log(row.mode,row.status,row.message||row.pdfSha256);
}
