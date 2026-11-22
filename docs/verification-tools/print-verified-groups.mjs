import {launch} from '../../tests/e2e/lib.mjs';
import {readFile,writeFile} from 'node:fs/promises';import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
const folder=resolve(process.argv[2]),plan=JSON.parse(await readFile(join(folder,'plan.json'))),hash=data=>createHash('sha256').update(data).digest('hex');
const env=await launch({dir:'dist',port:4796});const geometry=[],targets={},links=[];
try{
 for(const entry of plan.groups){
  const page=await env.browser.newPage();await page.setOfflineMode(true);await page.goto(pathToFileURL(join(folder,entry.file)).href,{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);
  const rows=await page.evaluate(()=>[...document.querySelectorAll('.pagedjs_page')].map(pg=>{
    const page=pg.getBoundingClientRect(),rects=[],targets={},links=[];
    const relative=r=>[r.left-page.left,r.top-page.top,r.right-page.left,r.bottom-page.top].map(n=>Math.round(n*100)/100);
    const area=pg.querySelector('.pagedjs_page_content'),walker=document.createTreeWalker(area,NodeFilter.SHOW_TEXT),range=document.createRange();
    for(let n=walker.nextNode();n;n=walker.nextNode()){
      const e=n.parentElement;if(!n.textContent.trim()||!e.closest('[data-block-id],[data-block-part-of]')||e.closest('[data-pf-repeat],.katex-mathml,script,style'))continue;
      range.selectNodeContents(n);for(const b of range.getClientRects())if(b.width&&b.height)rects.push(relative(b));
    }
    for(const e of area.querySelectorAll('[id]')){const id=e.id;targets[id]=relative(e.getBoundingClientRect());}
    for(const a of area.querySelectorAll('a[href]')){
      const href=a.getAttribute('href');for(const rect of a.getClientRects())if(rect.width&&rect.height)links.push({href,rect:relative(rect)});
    }
    return {width:page.width,height:page.height,rects,targets,links};
  }));
  if(rows.length!==entry.last-entry.first+1)throw Error('Unexpected DOM page count');
  for(const [i,r] of rows.entries()){
    const index=entry.first+i-1;
    for(const [id,rect] of Object.entries(r.targets))if(!(id in targets))targets[id]={index,rect};
    for(const link of r.links)links.push({...link,index});
    geometry.push({width:r.width,height:r.height,rects:r.rects});
  }
  const pdf=await page.pdf({path:join(folder,entry.file+'.pdf'),preferCSSPageSize:true,printBackground:true,timeout:180000});
  entry.pdfSha256=hash(pdf);await page.close();
  await writeFile(join(folder,'printed.json'),JSON.stringify(plan));
 }
 await writeFile(join(folder,'boxes.json'),JSON.stringify(geometry));await writeFile(join(folder,'anchors.private.json'),JSON.stringify({targets,links}));
}finally{await env.close();}
