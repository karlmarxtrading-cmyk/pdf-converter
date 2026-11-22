// node tests/bench/performance-oracle-check.mjs
import { strict as assert } from 'node:assert';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { referenceProjection, checkTrig } from './performance-oracle.mjs';
const dom=new JSDOM('');globalThis.DOMParser=dom.window.DOMParser;
const source=readFileSync('examples/reference-rc6/RUMUS TRIGONOMETRI 1.html','utf8');
const formula=JSON.parse(readFileSync('fixtures/rc6/user-trigonometry.expected.json')).formulas;
const expected=await referenceProjection(source,formula),parse=()=>new DOMParser().parseFromString(source,'text/html');
await checkTrig(parse(),expected,true);
const probes={
  operator:doc=>doc.querySelector('.pf-math').setAttribute('data-tex','x−1'),
  mode:doc=>doc.querySelector('.pf-math').classList.toggle('pf-math-display'),
  annotation:doc=>{doc.querySelector('annotation').textContent+='+';},
  visual:doc=>{doc.querySelector('.katex-html').textContent='';},
  order:doc=>{const [a,b]=doc.querySelectorAll('.pf-math');a.before(b);},
  content:doc=>doc.querySelector('article').append('Extraneous'),
  css:doc=>{doc.querySelector('style[data-pf=s0]').textContent+=' ';},
  font:doc=>{const s=doc.querySelector('style[data-pf=fonts]');s.textContent=s.textContent.replace(/(base64,d09GM[g-zA-Z0-9+/]{20})[a-zA-Z0-9]/,'$1!');}
};
for(const [name,mutate] of Object.entries(probes)){
  const doc=parse();mutate(doc);assert.equal(doc.querySelectorAll('.pf-math').length,231);
  await assert.rejects(checkTrig(doc,expected,true),name);
}
console.log('Baseline reference accepted; eight same-count mutations rejected.');
