/** A local, script-free standalone export can also be printed with the browser's book stylesheet. */
import {launch} from '../../tests/e2e/lib.mjs';
import {readFile,writeFile} from 'node:fs/promises';import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
const [source,html,pdf,report]=process.argv.slice(2).map(x=>resolve(x));const digest=s=>createHash('sha256').update(s).digest('hex');
const env=await launch({dir:'dist',port:4863});
try {
 const p=await env.browser.newPage();await p.setOfflineMode(true);await p.goto(pathToFileURL(html).href,{waitUntil:'load',timeout:120000});
 await p.addStyleTag({content:'@page{size:A4;margin:20mm 19mm 22mm} @media print{body,main.pf-main,article.pf-doc{background:white!important;box-shadow:none!important;width:auto!important;max-width:none!important;padding:0!important;margin:0!important;overflow:visible!important;height:auto!important}.pf-main h2,.pf-main h3,.pf-main h4{break-after:avoid}.pf-doc p{orphans:2;widows:2}article.pf-doc :is(h1,h2,h3,h4,h5,h6){text-transform:none!important;font-variant:normal!important;font-variant-caps:normal!important}a.pf-skip{display:none}}'});
 const markers=await p.evaluate(()=>{const result=[];for(const list of document.querySelectorAll('article ol,article ul')){
   if(list.closest('nav'))continue;const items=[...list.children].filter(x=>x.tagName==='LI');
   if(!items.length||!items.every(x=>!x.textContent.trim()&&!x.children.length))continue;
   let number=list.hasAttribute('start')?Number(list.getAttribute('start')):list.hasAttribute('reversed')?items.length:1;
   for(const item of items){if(item.hasAttribute('value'))number=Number(item.getAttribute('value'));
     const label=list.tagName==='OL'?number+'.':'•';result.push(label);
     item.style.setProperty('list-style','none','important');list.style.setProperty('list-style','none','important');
     const token=document.createElement('span');token.setAttribute('aria-hidden','true');token.textContent=label;item.append(token);
     number+=list.hasAttribute('reversed')?-1:1;
   }
 }return result;});
 await p.evaluate(()=>document.fonts.ready);
 const bytes=await p.pdf({path:pdf,preferCSSPageSize:true,printBackground:true,timeout:240000,displayHeaderFooter:true,headerTemplate:'<span></span>',footerTemplate:'<div style="font:9px sans-serif;color:#444;text-align:center;width:100%"><span class="pageNumber"></span></div>'});
 await writeFile(report,JSON.stringify({source:digest(await readFile(source)),html:digest(await readFile(html)),pdf:digest(bytes),bytes:bytes.length,markers,method:'Offline source HTML from the studio. Automated Chromium printing. Preserve case and give non-text list items visible semantic labels.'},null,2));
}finally{await env.close();}
