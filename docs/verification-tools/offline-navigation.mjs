import {launch} from '../../tests/e2e/lib.mjs';
import {readFile,mkdir,writeFile,readdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';import {resolve} from 'node:path';import {createHash} from 'node:crypto';
const folder='evidence/rc12/offline';await mkdir(folder,{recursive:true});const env=await launch({dir:'dist',port:4793});
const output=[];
try {
const paths=(await readdir('examples/rc12/book')).map(s=>[s,'examples/rc12/book/'+s+'/dokumen.html']);if(process.env.PF_PRIVATE_HTML)paths.push(['private-original',process.env.PF_PRIVATE_HTML]);
for(const [name,file] of paths){
 const page=await env.browser.newPage(); const requests=[];page.on('request',r=>{if(/^https?:/i.test(r.url()))requests.push(r.resourceType());});
 await page.setOfflineMode(true);await page.goto(pathToFileURL(resolve(file)).href);await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.fonts].map(font=>font.load()));});
 const row=await page.evaluate(()=>{
  const article=document.querySelector('article'), source=[...article.querySelectorAll('[data-block-id]')],last=source.filter(x=>x.textContent.trim()).pop();
  const range=document.createRange();range.selectNodeContents(last);const sel=getSelection();sel.removeAllRanges();sel.addRange(range);
  // Browser selection inserts tabs and newlines for table-cell boundaries.
  const compact=value=>value.normalize('NFC').replace(/\s+/gu,'');
  const selectionReadable=compact(sel.toString())===compact(last.textContent)&&last.textContent.length>0;
  const anchors=[...document.querySelectorAll('a[href^="#"]')].filter(a=>a.hash.length>1), ids=new Set([...document.querySelectorAll('[id]')].map(e=>e.id));
  const valid=anchors.filter(a=>ids.has(decodeURIComponent(a.hash.slice(1))));
  if(valid[0])valid[0].click();
  return {sourceBlocks:source.length,tables:article.querySelectorAll('table').length,anchors:anchors.length,valid:valid.length,firstAnchorNavigates:!valid.length||location.hash===valid[0].hash,selectionReadable,
    noScript:document.scripts.length===0,fonts:[...document.fonts].map(f=>[f.family,f.status]),lastBlockId:last.getAttribute('data-block-id')};
 });
 output.push({name,sha256:createHash('sha256').update(await readFile(file)).digest('hex'),...row,requests,pass:row.noScript&&!requests.length&&row.firstAnchorNavigates&&row.valid===row.anchors&&row.selectionReadable});await page.close();
}
}finally{await env.close();await writeFile(folder+'/navigation.json',JSON.stringify(output,null,2));}
