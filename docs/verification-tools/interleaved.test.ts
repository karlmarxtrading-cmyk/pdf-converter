// @vitest-environment jsdom
import {it,expect} from 'vitest';
import {writeFileSync} from 'node:fs';
import {realDoc,nodeFontSource} from '../../tests/unit/render/helpers';
import {checkRenderIntegrity} from '../../src/core/integrity';
import {exportHtml} from '../../src/render/exports';
import {buildPrintPayload} from '../../src/render/print-payload';
it('checks interleaved A and B snapshots after cache eviction and rejects same-count mutations on detached DOM',async()=>{
 const source='Awal $x-2$ akhir.\n\n$$\na+7\n$$';
 const a=await realDoc(source,'EDU-01'), other='Lain $z+9$ selesai.', b=await realDoc(other,'BUS-01');
 const opts={fontSource:nodeFontSource,renderMermaid:false};
 const many=Array.from({length:160},(_,i)=>'$y+'+i+'$').join(' ');
 const c=await realDoc(many,'EDU-01');expect(checkRenderIntegrity(many,c.body.html).ok).toBe(true);
 const loaded=await Promise.all([exportHtml({...a,...opts,profile:'standalone'}),buildPrintPayload(b.snapshot,b.body,opts),buildPrintPayload(a.snapshot,a.body,opts),exportHtml({...b,...opts,profile:'standalone'})]);
 const parse=(s:string)=>new DOMParser().parseFromString(s,'text/html');
 for(const [output,n] of [[loaded[0].html,2],[loaded[1].bodyInner,1],[loaded[2].bodyInner,2],[loaded[3].html,1]] as const) expect(parse(output).querySelectorAll('.pf-math')).toHaveLength(n);
 const outputs=loaded.map((item,i)=>{
  const html='html' in item ? item.html : item.bodyInner;
  const formulas=[...parse(html).querySelectorAll('.pf-math')].map(node=>({
   tex:node.querySelector('annotation')?.textContent,mode:node.classList.contains('pf-math-display')?'display':'inline'
  }));
  return {document:i===0||i===2?'A':'B',route:i===0||i===3?'standalone':'print',formulas};
 });
 const trials=[];
 const mutations:Record<string,(d:Document)=>void>={
  visual:d=>d.querySelector('.katex-html')!.replaceChildren(),
  mathml:d=>d.querySelector('math mi')!.replaceChildren('y'),
  annotation:d=>d.querySelector('annotation')!.replaceChildren('x+2'),
  provenance:d=>d.querySelector('.pf-math')!.setAttribute('data-source-tex','x+2'),
  tex:d=>d.querySelector('.pf-math')!.setAttribute('data-tex','x+2'),
  mode:d=>d.querySelector('.pf-math')!.classList.replace('pf-math-inline','pf-math-display'),
 };
 for(const [name,change] of Object.entries(mutations)){
  const doc=parse(a.body.html);change(doc);
  expect(doc.querySelectorAll('.pf-math')).toHaveLength(2);
  for(const [form,value] of [['Document',doc],['Element',doc.body],['string',doc.body.innerHTML]] as const) {
   const checked=checkRenderIntegrity(source,value);
   expect(checked.ok).toBe(false);
   trials.push({mutation:name,form,beforeCount:2,afterCount:doc.querySelectorAll('.pf-math').length,accepted:checked.ok});
  }
 }
 for(const value of [a.body,a.body.html,parse(a.body.html),parse(a.body.html).body])expect(checkRenderIntegrity(source,value).ok).toBe(true);
 writeFileSync('evidence/rc12/integrity/interleaved.json',JSON.stringify({outputs,trials,evictionKeys:160,parallelExports:['A standalone','B print','A print','B standalone'],formulas:[2,1,2,1],damagedForms:['Document','Element','string'],unchangedCounts:true,rejected:Object.keys(mutations),pass:true},null,2));
});
