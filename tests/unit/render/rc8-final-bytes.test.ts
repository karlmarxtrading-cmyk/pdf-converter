// @vitest-environment jsdom
import { it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { exportHtml, staticChecks } from '../../../src/render/exports';
import { finalArticleMatches, sourceCheck } from '../../../src/render/final-integrity';
import { realDoc, nodeFontSource } from './helpers';

it('rejects corruption in final HTML, including CSS/font bytes when source expects math',async()=>{
  const doc=await realDoc('# Proteksi\n\n$x-2$.','BUS-01',{cover:false,toc:false});
  const out=await exportHtml({...doc,profile:'standalone',fontSource:nodeFontSource});
  const final=new DOMParser().parseFromString(out.html,'text/html');
  const model=await sourceCheck(doc.snapshot,doc.body);
  const article=final.querySelector('article')!;
  const input={...model,articleInner:article.innerHTML};
  const fontCss=final.querySelector('style[data-pf="fonts"]')!.textContent;
  const opts={scriptsAllowed:false,networkAllowed:false,sourceMath:model.hasMath,fontCss,expectedArticle:input};
  const ok=()=>staticChecks(final.documentElement.outerHTML,opts);
  expect(ok().every(c=>c.status==='pass')).toBe(true);
  expect(fontCss).toContain('base64,d09GMg');
  final.querySelectorAll('style:not([data-pf="fonts"])').forEach(style=>style.remove());
  final.querySelector('style')!.textContent=fontCss.replace('base64,d09GMg','base64,AAAAAA');
  final.querySelector('.pf-math')!.replaceChildren();
  const failures=ok().filter(c=>c.status==='fail').map(c=>c.name);
  expect(failures).toEqual(expect.arrayContaining(['katex-layout','integrity','fonts-embedded']));
  article.innerHTML=input.articleInner;
  const decoration=final.createElement('nav');decoration.setAttribute('data-pf-generated','');decoration.textContent='INJECTED AFTER COMPOSITION';article.prepend(decoration);
  expect(finalArticleMatches(final,input)).toBe(false);
  if (process.env.PF_INTEGRITY_FINAL_BYTES) writeFileSync(process.env.PF_INTEGRITY_FINAL_BYTES,JSON.stringify({cases:{cssAndFonts:true,mutatedArticle:true},failures,cleanOutputHash:out.manifest.outputHash,mutations:['removed layout CSS and all rendered formula children','damaged the actual embedded font data','injected a generated-looking navigation element in the compiled article']},null,2)+'\n');
});
