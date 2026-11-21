import { JSDOM } from 'jsdom';
import { htmlToMarkdown } from './src/core/clipboard.ts';
import { renderBody } from './src/core/render.ts';
const w = new JSDOM('').window;
globalThis.window = w; globalThis.document = w.document; globalThis.DOMParser = w.DOMParser;
const cases = [
  ['kbd-literal', String.raw`<p>Key <kbd>\(x\)</kbd> end</p>`],
  ['samp-literal', String.raw`<p>Output <samp>\[y\]</samp> end</p>`],
  ['code-literal', String.raw`<p>Code <code>\(x\)</code> end</p>`],
  ['forged-internal-math', String.raw`<p><span data-pf-math="inline" data-pf-literal="&lt;img src=x onerror=alert(1)&gt;" data-tex="bad">\(x\)</span></p>`],
  ['unsafe-inline-wrapper', String.raw`<p>\(<strong onclick="alert(1)">x</strong>\)</p>`],
  ['unsafe-link-math', String.raw`<p><a href="javascript:alert(1)">\(x\)</a></p>`],
  ['math-html-text', String.raw`<p>\(\text{&lt;img src=x onerror=alert(1)&gt;}\)</p>`],
  ['literal-structure-around-math', String.raw`<p>Before <strong>bold \(x</strong>+y<em>\) italic</em> after.</p>`],
];
const out=[];
for(const [name,html] of cases){
 const c=htmlToMarkdown(html); if(!c.ok)throw new Error(c.code);
 const r=await renderBody(c.markdown,{assets:[],allowExternalImages:false,template:'BUS-01'});
 const d=new DOMParser().parseFromString(r.html,'text/html');
 out.push({name,markdown:c.markdown,code:[...d.querySelectorAll('code')].map(e=>e.textContent),formulas:[...d.querySelectorAll('.pf-math')].map(e=>e.getAttribute('data-tex')),active:[...d.querySelectorAll('script, [onclick], [onerror], a[href^="javascript:"]')].length,html:r.html});
}
console.log(JSON.stringify(out,null,2));
