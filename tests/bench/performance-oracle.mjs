// This verifier has no dependency on the application. It reads supplied references,
// the actual DOM and artifact bytes outside every measured interval.
export const digest = async value => {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2,'0')).join('');
};
const check = (value, message) => { if (!value) throw Error('Output oracle: '+message); };
const omit = node => node.matches('nav.pf-toc[data-pf-generated],header.pf-cover[data-pf-generated],header.pf-titleblock[data-pf-generated]');
function tree(node) {
  if (node.nodeType === 3) return node.nodeValue;
  if (node.nodeType !== 1 || omit(node)) return null;
  if (node.classList.contains('pf-math')) return ['math', node.getAttribute('data-source-tex'),node.getAttribute('data-tex'),node.classList.contains('pf-math-display')];
  const attrs = ['href','src','alt','title','colspan','rowspan'].filter(a => node.hasAttribute(a)).map(a => [a,node.getAttribute(a)]);
  const children = Array.from(node.childNodes, tree).filter(x => x !== null);
  if(node.tagName.toLowerCase()==='article') return ['article', attrs, children.filter(x=>typeof x!=='string'||x.trim())];
  return [node.tagName.toLowerCase(),attrs,children];
}
// Paged.js adds bookkeeping data-ref/data-split/id attributes to copies.
function mathMarkup(element){
  function shape(node){
    if(node.nodeType===3)return node.nodeValue;
    if(node.nodeType!==1)return null;
    const attributes=Array.from(node.attributes).filter(a=>a.name!=='id'&&!a.name.startsWith('data-')).map(a=>[a.name,a.value]);
    return [node.localName,attributes,Array.from(node.childNodes,shape)];
  }
  return Array.from(element.childNodes,shape);
}
export function formulaTuple(node) {
  const mathml = node.querySelector('.katex-mathml math'), visual = node.querySelector('.katex-html');
  check(mathml && visual && visual.childElementCount && mathml.childElementCount, 'visual or MathML branch absent');
  return [node.getAttribute('data-source-tex'),node.getAttribute('data-tex'),node.classList.contains('pf-math-display'),
    mathml.querySelector('annotation[encoding="application/x-tex"]')?.textContent,
    mathMarkup(visual),mathMarkup(mathml)];
}
const parse = html => new DOMParser().parseFromString(html,'text/html');
export async function referenceProjection(html, ledger) {
  const doc=parse(html), article=doc.querySelector('article[data-template]'); check(article,'missing article');
  const math=Array.from(article.querySelectorAll('.pf-math'),formulaTuple);
  check(math.length===231 && math.every((x,i)=>x[0]===ledger[i].raw && x[1]===ledger[i].expected && x[2]===ledger[i].display && x[3]===x[1]),'accepted user HTML differs from expected formula ledger');
  const css=doc.querySelector('style[data-pf=s0]').textContent; check(new TextEncoder().encode(css).length===19710,'reference CSS length');
  return {math:await digest(JSON.stringify(math)),body:await digest(JSON.stringify(tree(article))),css:await digest(css),fonts:await fontDigest(doc)};
}
async function fontDigest(doc) {
  const css=doc.querySelector('style[data-pf=fonts]')?.textContent??'';
  const files=[...css.matchAll(/data:font\/woff2;base64,([a-zA-Z0-9+/=]+)/g)].map(x=>x[1]);
  check(files.length===10,'BUS font count');
  const sums=[];
  for(const file of files){const raw=atob(file);check(raw.startsWith('wOF2'),'WOFF2 header');sums.push(await digest(Uint8Array.from(raw,c=>c.charCodeAt(0))));}
  return digest(sums.sort().join('\n'));
}
export async function checkTrig(doc, reference, standalone) {
  const article=doc.querySelector('article[data-template]');check(article,'article');
  const actual={ math:await digest(JSON.stringify(Array.from(article.querySelectorAll('.pf-math'),formulaTuple))),body:await digest(JSON.stringify(tree(article))) };
  if(standalone){actual.css=await digest(doc.querySelector('style[data-pf=s0]')?.textContent??'');actual.fonts=await fontDigest(doc);}
  for(const [key,v] of Object.entries(actual))check(v===reference[key],key+' differs from accepted reference: '+v);
  return actual;
}
export async function checkPrinted(html, reference) {
  const doc=parse(html); const nodes=[...doc.querySelectorAll('.pagedjs_page_content .pf-math')].filter(n=>!n.closest('[data-pf-repeat]'));
  const math=await digest(JSON.stringify(nodes.map(formulaTuple)));
  check(math===reference.math,'paginated formula representation or order');
  return math;
}
export async function checkPlain(doc,source,small) {
  const article=doc.querySelector('article[data-template]');check(article,'article for plain text');
  const copy=article.cloneNode(true);copy.querySelectorAll('nav.pf-toc[data-pf-generated],header.pf-cover[data-pf-generated],header.pf-titleblock[data-pf-generated]').forEach(n=>n.remove());
  if(small){
    const expected=['x+1','x=2','x+1'];const m=[...copy.querySelectorAll('.pf-math')];
    check(m.length===expected.length && m.every((n,i)=>{const [raw,tex,display,ann]=formulaTuple(n); return (raw??tex)===expected[i]&&tex===expected[i]&&!display&&ann===tex;}),'small formula values/modes '+JSON.stringify(m.map(n=>formulaTuple(n).slice(0,4))));
    m.forEach(n=>n.replaceWith('$'+n.getAttribute('data-tex')+'$'));
  }
  const words=s=>s.replace(/\s+/g,'').trim();
  const actual=words(copy.textContent);
  const expected=words(source.split('\n').filter(l=>!/^\|[-|: ]+\|$/.test(l)).map(l=>l.startsWith('|') ? l.split('|').map(x=>x.trim()).join('') : l.replace(/^#+\s*/, '')).join(''));
  check(actual===expected,'all text/table cells/order of generated or small input');
  return digest(actual);
}
