// @vitest-environment jsdom
import {it,expect} from 'vitest';
import {renderBody} from '../../../src/core/render';
import {htmlToMarkdown} from '../../../src/core/clipboard';
import {checkRenderIntegrity} from '../../../src/core/integrity';
const opts={assets:[],template:'BUS-01' as const,allowExternalImages:false};
it('independently checks detached formula documents after render, cache eviction and damage',async()=>{
  const src='Nilai $a+17$.';const a=await renderBody(src,opts);
  await renderBody('Nilai $b-29$.',opts);
  for(const count of [0,140]){
    if(count){const many=Array.from({length:count},(_,i)=>'$x+'+i+'$').join(' ');const b=await renderBody(many,opts);expect(checkRenderIntegrity(many,b.html).ok).toBe(true);}
    const doc=new DOMParser().parseFromString(a.html,'text/html');
    for(const value of [a,a.html,doc.body,doc])expect(checkRenderIntegrity(src,value).ok).toBe(true);
    const math=doc.querySelector('.katex-html')!;math.replaceChildren();expect(checkRenderIntegrity(src,doc).ok).toBe(false);
  }
});
it.each(['<ol reversed><li>A</li><li value="-5">B</li></ol>','<ol start="7" reversed><li>A<ol reversed><li>B</li></ol></li></ol>','<div data-tex="x"><ol reversed start="4"><li>A</li><li>B</li></ol><p>kata</p></div>'])('keeps original ordered list controls on conversion',async raw=>{
  const old=new DOMParser().parseFromString(raw,'text/html');
  const converted=await htmlToMarkdown(raw);if(!converted.ok) throw new Error(converted.code);const body=await renderBody(converted.markdown,opts);
  const actual=new DOMParser().parseFromString(body.html,'text/html');
  const projection=(d:Document)=>[...d.querySelectorAll('ol,li')].map(e=>[e.tagName,e.getAttribute('start'),e.hasAttribute('reversed'),e.getAttribute('value'),e.textContent]);
  expect(projection(actual)).toEqual(projection(old));expect(checkRenderIntegrity(converted.markdown,body).ok).toBe(true);
});
