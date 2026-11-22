import {launch} from '../../tests/e2e/lib.mjs';
import {resolve,join} from 'node:path';import {readFile,writeFile} from 'node:fs/promises';import {pathToFileURL} from 'node:url';
const folder=resolve(process.argv[2]),plan=JSON.parse(await readFile(join(folder,'plan.json'))),env=await launch({dir:'dist',port:4865});const rows=[];
try{
 for(const entry of plan.groups){
  const file=join(folder,entry.file),src=await readFile(file,'utf8');
  if(!src.includes('data-item-num')&&!src.includes('<ul '))continue;
  const p=await env.browser.newPage();await p.setOfflineMode(true);await p.goto(pathToFileURL(file).href);await p.evaluate(()=>document.fonts.ready);
  const data=await p.evaluate(()=>[...document.querySelectorAll('.pagedjs_page')].flatMap((pg,num)=>{
   const page=pg.getBoundingClientRect(),out=[];
   for(const list of pg.querySelectorAll('.pagedjs_page_content article ul,.pagedjs_page_content article ol')){
    if(list.closest('nav'))continue;const items=[...list.children].filter(e=>e.tagName==='LI');if(!items.length||!items.every(e=>!e.textContent.trim()&&!e.children.length))continue;
    let number=list.hasAttribute('start')?Number(list.getAttribute('start')):list.hasAttribute('reversed')?items.length:1;
    for(const li of items){if(li.hasAttribute('value'))number=Number(li.getAttribute('value'));const b=li.getBoundingClientRect(),style=getComputedStyle(li);
     out.push({num,block:list.closest('[data-block-id]')?.dataset.blockId,ordered:list.tagName==='OL',label:list.tagName==='OL'?number+'.':'•',left:(b.x-page.x)/page.width,top:(b.y-page.y)/page.height,bottom:(b.bottom-page.y)/page.height,font:style.fontFamily,height:style.lineHeight});number+=list.hasAttribute('reversed')?-1:1;
    }
   }return out;
  }));rows.push(...data.map(row=>({...row,page:entry.first+row.num})));await p.close();
 }
 await writeFile(join(folder,'marker-positions.json'),JSON.stringify(rows,null,2));
}finally{await env.close();}
