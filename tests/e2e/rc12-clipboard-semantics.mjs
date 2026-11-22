// Exercise public document import and publishing on the production studio, saving
// the actual downloaded HTML, flattened print-engine HTML, and the resulting PDFs.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir, readdir, readFile, writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {launch} from './lib.mjs';
import {candidateSha256,distTreeSha256} from '../../scripts/fingerprint.mjs';

const dir=process.env.PF_CLIP_PRINT_DIST || 'dist';
const output=resolve(process.argv[2] || 'evidence/rc12/clipboard-semantics');
const fixture=join(output,'public-input.html');
const backtickTex = "`y`";
const input=String.raw`<!doctype html><meta charset="utf-8"><h1>Clipboard semantics</h1>
<p>First line<br><span data-tex=" x ">x</span><br>Last line</p>
<p>Path C:\Math<br><span data-tex="${backtickTex}">y</span><br>Next\step</p>
<p>Third line<br>\(z\)<br>Final line</p>
<table><caption>Sales</caption><tr><th id="category" scope="col">Region</th><th id="amount" scope="col">Amount</th></tr><tr><th id="north" scope="row">North</th><td headers="north amount">42</td></tr></table>
<table><tr><td>One</td><td>Two</td></tr><tr><td>Three</td><td>Four</td></tr></table><p>END-SEMANTICS</p>`;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function projected(root) {
  const tables=[...root.querySelectorAll('table')];
  return {
    lines:[...root.querySelectorAll('p')].filter(p=>p.querySelector('.pf-math')).map(p=>{
      const eq=p.querySelector('.pf-math'), copy=p.cloneNode(true);
      copy.querySelector('.pf-math').replaceWith('{equation}');
      for(const br of copy.querySelectorAll('br'))br.replaceWith('{br}');
      return [copy.textContent.replace(/\n/g,''),eq.getAttribute('data-tex'),eq.classList.contains('pf-math-display')];
    }),
    tables:tables.map(t=>[t.caption?.textContent??null,[...t.rows].map(r=>[...r.cells].map(c=>[
      c.tagName,c.textContent,c.getAttribute('scope'),c.headers.trim()?c.headers.trim().split(/\s+/).map(id=>t.ownerDocument.getElementById(id)?.textContent):[],
    ]))]),
  };
}
const expected={
  lines:[['First line{br}{equation}{br}Last line',' x ',false],[String.raw`Path C:\Math{br}{equation}{br}Next\step`,'`y`',false],['Third line{br}{equation}{br}Final line','z',false]],
  tables:[['Sales',[[['TH','Region','col',[]],['TH','Amount','col',[]]],[['TH','North','row',[]],['TD','42',null,['North','Amount']]]]],
    [null,[[['TD','One',null,[]],['TD','Two',null,[]]],[['TD','Three',null,[]],['TD','Four',null,[]]]]]],
};
await mkdir(output,{recursive:true});await writeFile(fixture,input);
const env=await launch({dir,port:Number(process.env.PF_CLIP_PRINT_PORT||4896)});
const report={candidateSha256:candidateSha256(),distTreeSha256:distTreeSha256(dir),inputSha256:digest(input),
  browser:await env.browser.version(),method:'Synthetic public HTML import using production UI, preview, downloaded HTML offline and actual Chromium print paths. System Save dialog is qualified separately.',results:[]};
async function waitDownload(downloadDir) {
  for(let i=0;i<300;i++){
    const name=(await readdir(downloadDir)).find(n=>n.endsWith('.html'));
    if(name)return readFile(join(downloadDir,name),'utf8');
    await delay(100);
  }
  throw Error('HTML download timed out');
}
try {
  for(const mode of ['html-standalone','print','print-book']){
    const modeDir=join(output,mode), downloadDir=join(modeDir,'download');
    await mkdir(downloadDir,{recursive:true});
    assert.equal((await readdir(downloadDir)).length,0,'Run in a fresh evidence directory');
    const ctx=await env.browser.createBrowserContext({downloadBehavior:{policy:'allow',downloadPath:downloadDir}}), page=await ctx.newPage();
    const row={mode};report.results.push(row);
    try {
      await page.setViewport({width:1440,height:1000});await page.goto(env.base+'/#/workspace');
      await (await page.waitForSelector('#file-open')).uploadFile(fixture);
      await page.waitForSelector('#dlg-diff[open]');await page.click('#dlg-diff button[value=apply]');
      await page.waitForFunction(()=>document.querySelector('#live-frame')?.contentDocument?.querySelectorAll('article .pf-math').length===3);
      const live=await (await page.$('#live-frame')).contentFrame();
      assert.ok(live);
      assert.deepEqual(await live.$eval('article',projected),expected);
      await page.click('[data-action="publish"]');await page.click('input[value="'+mode+'"]');
      if(await page.$('#pub-ack'))await page.click('#pub-ack');
      if(mode==='print')await page.evaluate(()=>window.addEventListener('message',e=>{
        if(e.origin===location.origin && e.source===document.querySelector('iframe[title="PaperForma print"]')?.contentWindow && e.data?.type==='pf-print-result')window.rc12PrintLayout=e.data.result?.flattenedHtml;
      }));
      await page.waitForFunction(()=>!document.querySelector('#pub-go').disabled);await page.click('#pub-go');
      let html;
      if(mode==='print'){
        await page.waitForSelector('#publish-result.banner-ok',{timeout:120000});
        html=await page.evaluate(()=>window.rc12PrintLayout);assert.ok(html);
        assert.ok((await page.$eval('#publish-result',e=>e.textContent)).includes(digest(html)));
      }else{
        if(mode==='print-book'){await page.waitForSelector('#book-save-html');await page.click('#book-save-html');}
        else{
          await page.waitForSelector('#publish-result:not([hidden])');
          if(await page.$('#pub-review-ack')){await page.click('#pub-review-ack');await page.click('#publish-result .btn-primary');}
          await page.waitForSelector('#publish-result.banner-ok');
        }
        html=await waitDownload(downloadDir);
      }
      const file=join(modeDir,'content.html');await writeFile(file,html);
      const offline=await ctx.newPage();await offline.setOfflineMode(true);await offline.goto(pathToFileURL(file).href);await offline.evaluate(()=>document.fonts.ready);
      row.output=await offline.$eval('body',projected);assert.deepEqual(row.output,expected);row.htmlSha256=digest(html);
      if(mode!=='html-standalone'){
        const path=join(modeDir,'content.pdf');const pdf=await offline.pdf({path,preferCSSPageSize:true,printBackground:true});
        const text=execFileSync('pdftotext',['-layout',path,'-'],{encoding:'utf8'});
        assert.match(text,/First line *\r?\n\s*x *\r?\n\s*Last line/);
        assert.match(text,/Third line *\r?\n\s*z *\r?\n\s*Final line/);
        assert.match(text,/North\s+42/);assert.match(text,/Three\s+Four/);assert.match(text,/END-SEMANTICS/);
        row.pdfBytes=pdf.length;row.pdfSha256=digest(pdf);
      }
      row.status='PASS';
    }catch(e){row.status='FAIL';row.error=String(e);process.exitCode=1;}
    finally{await ctx.close();console.log(mode,row.status,row.error??row.htmlSha256);}
  }
}finally{await env.close();await writeFile(join(output,'result.json'),JSON.stringify(report,null,2)+'\n');}
