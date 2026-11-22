import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve,join,dirname } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
const base=resolve('..');
const jsdom = new JSDOM('<!doctype html>',{url:'https://bench.invalid/'});
globalThis.window = jsdom.window;
for(const key of ['document','DOMParser','HTMLElement','Element','Node','NodeFilter','XMLSerializer','HTMLImageElement','MutationObserver']) globalThis[key]=jsdom.window[key];
const modules = {'src/core/math-diagnostics.ts':'residualMathIssues','src/core/render.ts':'finishRender, renderStage1','src/core/integrity.ts':'extractRenderedBlocks, checkRenderIntegrity, integrityExpectation','src/render/document.ts':'prepareBody, composeDocument','src/core/projects.ts':'createProject','src/core/hash.ts':'makeSnapshot','src/render/templates.ts':'templateDefaultSettings','src/engine/analyze.ts':'analyze'};
const md=await readFile(join(base,'rc7/fixtures/rc6/user-trigonometry.md'),'utf8');
const revisions={};
for(const name of ['rc6','rc7']){
const repo=join(base,name), req=createRequire(join(repo,'package.json')), out=resolve(name+'.mjs');
const contents=Object.entries(modules).map(([k,v])=>'export { '+v+' } from '+JSON.stringify(join(repo,k))+';').join('\n');
await build({stdin:{contents,resolveDir:repo,loader:'ts'},bundle:true,outfile:out,format:'esm',platform:'node',packages:'external',logLevel:'silent',plugins:[{name:'raw',setup(b){b.onResolve({filter:/\?raw$/},({path,importer})=>{const clean=path.slice(0,-4);return {path:clean.startsWith('.')?resolve(dirname(importer),clean):req.resolve(clean),namespace:'raw'};});b.onLoad({filter:/.*/,namespace:'raw'},async({path})=>({contents:await readFile(path,'utf8'),loader:'text'}));}}]});
revisions[name]=await import(pathToFileURL(out).href);
}
const m0=revisions.rc6, opts={assets:[],template:'BUS-01',allowExternalImages:false};
const project=m0.createProject({template:'BUS-01',source:md,projectId:'perf-fixture'});project.settings=m0.templateDefaultSettings('BUS-01',{title:'Kumpulan Rumus Trigonometri Lengkap',author:'',cover:false,toc:true});
const snapshot=await m0.makeSnapshot(project);
const stage=await m0.renderStage1(md,opts);const body=m0.finishRender(stage,[]);const inert=new DOMParser().parseFromString(body.html,'text/html').body;
const exp=m0.integrityExpectation(md);
const receipts={method:'One process and two source bundles, shared exact RC6 rendered DOM and stage-1 slots to isolate changes. AB/BA order, no GC inside clocks. Per-function microbenchmarks; not final browser gates.',counts:{formulas:body.stats.math,modelBlocks:exp.blocks.length,rawHtml:inert.querySelectorAll('[data-pf-raw-html]').length,needMarkBroken:/data-(?:pf-target|source-href|src-path)|pf-img-placeholder/.test(body.html),parsedHtmlElements:inert.querySelectorAll('*').length},runs:{},summary:{}};
const q=(xs,p)=>[...xs].sort((a,b)=>a-b)[Math.max(0,Math.ceil(xs.length*p)-1)];
function summ(k){
const r=receipts.runs[k];const sum={};
for(const n of ['rc6','rc7']){const a=r.map(e=>e[n]);sum[n]={medianMs:q(a,.5),p95Ms:q(a,.95)};}
sum.deltaMs=sum.rc7.medianMs-sum.rc6.medianMs;
sum.n=r.length;receipts.summary[k]=sum;
}
async function bench(k,fn,{warm=2,n=6,batch=1,forceGc=false}={}){
const r=receipts.runs[k]=[];
for(let i=-warm;i<n;i++){
const order=i%2===0?['rc6','rc7']:['rc7','rc6'];
const row={};
for(const name of order){if(forceGc)global.gc();const t=performance.now();for(let j=0;j<batch;j++)await fn(revisions[name]);row[name]=(performance.now()-t)/batch;}
if(i>=0)r.push(row);
}
summ(k);await writeFile('profile.json',JSON.stringify(receipts,null,2));console.log(k,receipts.summary[k]);
}
await bench('residualsOnSameDOM',m=>m.residualMathIssues(inert),{n:20,batch:12});
await bench('extractOnSameDOM',m=>m.extractRenderedBlocks(inert),{n:20,batch:2});
await bench('checkIntegrityFromSameString',m=>m.checkRenderIntegrity(md,body,{expected:exp}),{n:6,forceGc:true});
await bench('finishSameStage',m=>m.finishRender(stage,[]),{n:6,forceGc:true});
await bench('prepareSameBody',m=>m.prepareBody(snapshot,body,{mode:'screen',renderMermaid:false,allowExternalImages:false}),{n:6,forceGc:true});
