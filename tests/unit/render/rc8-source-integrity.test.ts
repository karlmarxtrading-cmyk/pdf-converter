// @vitest-environment jsdom
import { afterAll, describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { realDoc, nodeFontSource } from './helpers';
import { checkRenderIntegrity, expectedBlocksFor } from '../../../src/core/integrity';
import { exportHtml } from '../../../src/render/exports';
import { buildPrintPayload } from '../../../src/render/print-payload';
import { contentInventory, compareInventory } from '../../../src/render/paginate';

const source = '# Audit\n\nHarga 51. $x-2$ lalu $y+3$.\n\n$$\nz=7\n$$\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n```js\n  let x = 2\n\n```\n\n[Lihat](https://example.org/awal)';
const parse = (html:string) => new DOMParser().parseFromString(html,'text/html').body;
const options = {fontSource:nodeFontSource,renderMermaid:false};
const summary:Record<string,unknown> = {};
const run = (key:string, observed:boolean) => {summary[key]=observed; expect(observed,key).toBe(true);};
afterAll(() => {
  const output = process.env.PF_INTEGRITY_EVIDENCE;
  if (output) writeFileSync(output,JSON.stringify({source,method:'Literal mutations and expected block outcomes on normal render, HTML export and paginated-print preparation',cases:summary},null,2)+'\n');
});

const changes: Record<string,(root:HTMLElement)=>void> = {
  emptyFormula:r => r.querySelector('.pf-math')!.replaceChildren(),
  visual:r => r.querySelector('.katex-html')!.remove(),
  mathML:r => r.querySelector('.katex-mathml')!.remove(),
  annotation:r => {r.querySelector('annotation')!.textContent='x+2';},
  mathMLToken:r => {r.querySelector('math mi')!.textContent='q';},
  visualMinus:r => {r.querySelector('.katex-html .mbin')!.textContent='+';},
  canonical:r => r.querySelector('.pf-math')!.setAttribute('data-tex','x+2'),
  raw:r => r.querySelector('.pf-math')!.setAttribute('data-source-tex','x+2'),
  mode:r => r.querySelector('.pf-math')!.classList.replace('pf-math-inline','pf-math-display'),
  equationOrder:r => {const [a,b]=r.querySelectorAll('.pf-math');a!.before(b!);},
  rootText:r => r.append('Tambahan 999'),
  untrackedNode:r => {const e=r.ownerDocument.createElement('section');e.innerHTML='<p>Tambahan 999</p>';r.append(e);},
  pua:r => r.append('\uE000'),
  foreignId:r => {const e=r.ownerDocument.createElement('p');e.dataset.blockId='asing';e.textContent='Tambahan 999';r.append(e);},
  duplicateId:r => r.append(r.querySelector('[data-block-id]')!.cloneNode(true)),
  nestedId:r => {const e=r.ownerDocument.createElement('span');e.dataset.blockId='palsu';r.querySelector('p')!.append(e);},
  order:r => {const [a,b]=r.querySelectorAll('[data-block-id]');a!.before(b!);},
  spoofedDecoration:r => {const el=r.ownerDocument.createElement('span');el.className='pf-ui-label';el.dataset.pfGenerated='';el.textContent='Klaim 999';r.querySelector('p')!.append(el);},
  spoofedTOC:r => {const el=r.ownerDocument.createElement('nav');el.className='pf-toc';el.dataset.pfGenerated='';el.textContent='Klaim 999';r.prepend(el);},
  digit:r => {r.querySelector('p')!.firstChild!.textContent='Harga 15. ';},
  cell:r => {r.querySelector('td')!.textContent='9';},
  link:r => {r.querySelector('a')!.setAttribute('href','https://example.org/ubah');},
  codeWhitespace:r => {r.querySelector('pre code')!.textContent=' let x = 2\n';},
};
describe('RC8 source fidelity',()=>{
  for (const [name,mutate] of Object.entries(changes)) it('rejects '+name,async()=>{
    const doc=await realDoc(source,'BUS-01',{cover:false,toc:false});
    const root=parse(doc.body.html);mutate(root);
    const report=checkRenderIntegrity(source,root);
    run(name,!report.ok && report.issues.some(i=>i.blocking));
  });
  it('rejects invented prose bearing real but non-emitting source IDs',async()=>{
    const md = 'Text.\n\n[link]: https://example.org\n\n---\n\n[^unused]: Saved in source.';
    const doc = await realDoc(md,'BUS-01');
    expect(checkRenderIntegrity(md,doc.body).ok).toBe(true);
    for (const model of expectedBlocksFor(md,{}).filter(b => ['definition','thematicBreak','footnoteDefinition'].includes(b.kind))) {
      const root=parse(doc.body.html);
      const added=root.ownerDocument.createElement('p'); added.dataset.blockId=model.id; added.textContent='EXTRA CLAIM';
      const before=root.querySelector(`[data-block-id="${model.id}"]`);
      if (before) before.replaceWith(added); else root.append(added);
      run('spoofedSourceId-'+model.kind,!checkRenderIntegrity(md,root).ok);
    }
  });
  it('preserves source semantics and valid decorations',async()=>{
    const doc=await realDoc(source+'\n\n## Catatan\n\nReferensi[^1].\n\n[^1]: Catatan.','BUS-01',{cover:true,toc:true});
    const out=await exportHtml({...doc,...options,profile:'standalone'});
    const root=parse(out.html);
    const control={toc:!!root.querySelector('nav.pf-toc'),equations:root.querySelectorAll('article .pf-math').length,back:!!root.querySelector('a[data-footnote-backref]')};
    summary.control=control;run('generatedControls',control.toc && control.equations===3 && control.back);
  });
  it('blocks delivery through every HTML profile plus print',async()=>{
    const doc=await realDoc(source,'EDU-01');
    const results: Record<string,boolean> = {};
    for (const type of ['emptyFormula','untrackedNode']) {
      const r=parse(doc.body.html);changes[type]!(r);
      const altered={...doc,body:{...doc.body,html:r.innerHTML}};
      for (const profile of ['standalone','zip','publication'] as const) {
        try {await exportHtml({...altered,...options,profile});results[type+profile]=false;} catch(e){results[type+profile]=(e as {code:string}).code==='EXPORT_BLOCKED';}
      }
      try {await buildPrintPayload(doc.snapshot,altered.body,options);results[type+'print']=false;} catch(e){results[type+'print']=(e as {code:string}).code==='PRINT_BLOCKED';}
    }
    summary.routes=results;run('htmlAndPrint',Object.values(results).every(Boolean));
  });
  it('checks fallback against complete source and marks it for review',async()=>{
    const md='A $\\notACommandPF{x}$ B.';
    const doc=await realDoc(md,'EDU-01'); const r=parse(doc.body.html);
    const valid=checkRenderIntegrity(md,doc.body).ok && r.querySelector('.pf-math-src')?.textContent==='$\\notACommandPF{x}$' && doc.body.issues.some(i=>i.code==='MATH_PARSE_ERROR');
    r.querySelector('.pf-math-src')!.textContent='x';
    run('fallback',valid && !checkRenderIntegrity(md,r).ok);
  });
  it('compares the accessible and visual equations after page layout',async()=>{
    const doc=await realDoc('# Sample\n\n$x-2$','EDT-01');
    const clean=parse(doc.body.html);
    const expected=contentInventory([clean]);
    clean.querySelector('math mi')!.textContent='q';clean.querySelector('.katex-html .mbin')!.textContent='+';
    run('pagedRepresentations',compareInventory(expected,contentInventory([clean])).some(i=>i.field==='formulas'));
  });
});
