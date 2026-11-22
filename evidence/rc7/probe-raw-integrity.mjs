/** From either extracted root: node --input-type=module < /path/to/probe-raw-integrity.mjs */
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const win = new JSDOM('<!doctype html>').window;
for (const key of ['window', 'document', 'DOMParser', 'Element', 'HTMLElement', 'Node']) globalThis[key] = win[key];
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const {renderBody} = await server.ssrLoadModule('/src/core/render.ts');
  const {checkRenderIntegrity} = await server.ssrLoadModule('/src/core/integrity.ts');
  const controls = [], mutations = [];
  const prepare = async (name, source, assets = []) => {
    const rendered = await renderBody(source, {template:'BUS-01', assets, allowExternalImages:false});
    const b = new DOMParser().parseFromString(rendered.html, 'text/html').body;
    const intact = checkRenderIntegrity(source,b);
    controls.push({name, accepted:intact.ok, checkedBlocks:intact.checkedBlocks,
      skippedBlocks:intact.skippedBlocks, coverage:intact.coverage, issueCodes:intact.issues.map(i=>i.code)});
    return (name, mutate) => {
      const c = b.cloneNode(true);
      mutate(c);
      if (c.innerHTML === b.innerHTML) throw new Error('Mutation did not change the DOM: '+name);
      const report = checkRenderIntegrity(source,c);
      mutations.push({name, detected:!report.ok, issueCodes:report.issues.map(i=>i.code)});
    };
  };
  const raw = await prepare('self-contained HTML between two Markdown blocks', String.raw`Awal.

<div><p>Alpha + 2.</p><p>Berikut \(x+y\)</p><figure><img src="g.png" alt="Kurva" title="Gambar"><figcaption>Diagram</figcaption></figure><a href="/refs">Rujukan</a><table><tr><td>5</td></tr><tr><td>7</td></tr></table><pre>  $x$</pre></div>

Akhir.`);
  raw('operator', b=>b.querySelector('div p').textContent='Alpha - 2.');
  raw('formula removed', b=>b.querySelector('.pf-math').remove());
  raw('formula provenance', b=>b.querySelector('.pf-math').setAttribute('data-source-tex','y-x'));
  raw('paragraph removed', b=>b.querySelector('div p').remove());
  raw('nested element order', b=>b.querySelector('div').prepend(b.querySelector('figure')));
  raw('whole block order', b=>b.append(b.querySelector('div')));
  raw('nested table row', b=>b.querySelector('tr').remove());
  raw('link destination', b=>b.querySelector('a').setAttribute('href','/other'));
  raw('image removed', b=>b.querySelector('.pf-img-placeholder').remove());
  raw('alternative text', b=>b.querySelector('.pf-img-placeholder').setAttribute('data-alt','Salah'));
  raw('image title', b=>b.querySelector('.pf-img-placeholder').setAttribute('title','Salah'));
  raw('caption semantics', b=>b.querySelector('figcaption').replaceWith('Diagram'));
  raw('code indentation', b=>b.querySelector('pre').textContent=' $x$');
  const link = await prepare('Markdown link with rewritten fragment', '[Go](#one)\n\n# One\n\n# Two');
  link('actual href points to another existing id', b=>b.querySelector('a').setAttribute('href','#'+b.querySelectorAll('h1')[1].id));
  link('target id removed', b=>b.querySelector('h1').removeAttribute('id'));
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGMQUTMFAADBAHC9Rd/7AAAAAElFTkSuQmCC','base64');
  const asset = {id:createHash('sha256').update(bytes).digest('hex'), path:'a.png', mime:'image/png', bytes, origin:'upload'};
  const image = await prepare('Markdown embedded image', '![Kurva](a.png "Grafik")',[asset]);
  image('embedded image src removed', b=>b.querySelector('img').removeAttribute('src'));
  const placeholder = await prepare('Markdown missing asset placeholder', '![Kurva](a.png "Grafik")');
  placeholder('visible placeholder label removed', b=>b.querySelector('.pf-ui-label').remove());
  console.log(JSON.stringify({type:'Synthetic input, production core modules via Vite SSR, DOM from jsdom',
    version:JSON.parse(readFileSync('package.json','utf8')).version, controls, mutations,
    total:mutations.length, detected:mutations.filter(m=>m.detected).length},null,2));
} finally {await server.close();}
