import {launch} from '../../tests/e2e/lib.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const evidence='evidence/rc12/list';await mkdir(evidence,{recursive:true});
const html='<h1>Daftar Uji</h1><ol reversed start="7"><li>Urutan-A</li><li value="4">Urutan-B</li><li>Urutan-C<ol reversed><li>Nested-D</li><li>Nested-E</li></ol></li></ol>';
const env=await launch({dir:'dist',port:4691});
try{
 const ctx=await env.browser.createBrowserContext();await ctx.overridePermissions(env.base,['clipboard-read','clipboard-write','clipboard-sanitized-write']);const p=await ctx.newPage();
 await p.setViewport({width:1440,height:900});await p.goto(env.base+'/#/workspace');
 await p.waitForFunction(()=>/rev \d+/.test(document.querySelector('#src-hash')?.textContent||''));
 const source=await ctx.newPage();await source.goto(env.base+'/404.html');
 await source.bringToFront();await source.evaluate(v=>{document.body.innerHTML='<main>'+v+'</main>';const r=document.createRange();r.selectNodeContents(document.querySelector('main'));const s=getSelection();s.removeAllRanges();s.addRange(r);},html);
 await source.keyboard.down('Control');await source.keyboard.press('c');await source.keyboard.up('Control');
 await p.bringToFront();await p.click('#editor');await p.keyboard.down('Control');await p.keyboard.press('v');await p.keyboard.up('Control');
 await p.waitForSelector('#notices button');const convert=await p.evaluateHandle(()=>[...document.querySelectorAll('#notices button')].find(b=>/Markdown/i.test(b.textContent)));await convert.asElement().click();
 await p.waitForSelector('#dlg-diff[open]');await p.click('#dlg-diff button[value=apply]');
 await p.waitForFunction(()=>document.querySelector('#live-frame')?.contentDocument?.querySelector('article ol[reversed]'));
 const body=await p.$eval('#live-frame',f=>f.contentDocument.querySelector('article').innerHTML);
 const q=await ctx.newPage();await q.setContent('<html><body>'+body+'</body></html>');
 const pdf=resolve(evidence,'markers.pdf');await q.pdf({path:pdf,format:'A4'});
 const text=execFileSync('pdftotext',['-layout',pdf,'-'],{encoding:'utf8'});
 for(const [n,name] of [[7,'Urutan-A'],[4,'Urutan-B'],[3,'Urutan-C'],[2,'Nested-D'],[1,'Nested-E']])assert.match(text,new RegExp(n+'\\.\\s*'+name));
 const rawHash=createHash('sha256').update(html).digest('hex');
 await writeFile(evidence+'/result.json',JSON.stringify({status:'PASS',rawHTML:html,rawHash,method:'Real Ctrl+C/Ctrl+V through the production studio. Physical markers from Chromium rendering of the accepted preview list.',pdfSha256:createHash('sha256').update(await readFile(pdf)).digest('hex'),markers:text.trim(),identity:JSON.parse(await readFile('dist.build-manifest.json'))},null,2));
}finally{await env.close();}
