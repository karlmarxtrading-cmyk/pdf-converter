// Audit-only control-flow probe. Executes the actual paginate() source with synthetic
// helper results and a synthetic clock; it does NOT measure or validate browser layout.
// Usage: node probe-pagination-accounting.mjs SOURCE_ROOT WORK_WITH_NODE_MODULES
import fs from 'node:fs';
import {candidateSha256,distTreeSha256} from '../../scripts/fingerprint.mjs';
import path from 'node:path';
import { createRequire } from 'node:module';
const sourceRoot=path.resolve(process.argv[2]??'.');
const workRoot=path.resolve(process.argv[3]??'.');
const require=createRequire(path.join(workRoot,'package.json'));
const esbuild=require('esbuild');
const source=fs.readFileSync(path.join(sourceRoot,'src/render/paginate.ts'),'utf8');
const start=source.indexOf('export async function paginate(');
if(start<0)throw new Error('paginate function not found');
const fn=esbuild.transformSync(source.slice(start).replace('export async function','async function'),{loader:'ts',target:'es2022'}).code;
const traceSource=fs.readFileSync(path.join(sourceRoot,'src/render/print-trace.ts'),'utf8');
const recorder=esbuild.transformSync(traceSource.replace('export class PrintTrace','class PrintTrace'),{loader:'ts',target:'es2022'}).code;
async function scenario(toc,stabilizesAfter,repairCount,inject){
 const ctrl=new AbortController();
 let clock=0,previewCalls=0,finishedAttempts=0,passInAttempt=0;
 const onProgress=[];
 const target={classList:{contains:()=>false,add:()=>{}}};
 const paged=()=>({children:[{matches:()=>true}],innerHTML:'<div/>',remove(){},cloneNode:()=>temp()});
 const temp=()=>({innerHTML:'',children:[],querySelector:()=>target,querySelectorAll:()=>[],insertAdjacentHTML(){}});
 const doc={documentElement:{},body:{className:''},title:'',head:{appendChild(){}},querySelector:()=>({textContent:''}),querySelectorAll:()=>[],createElement:temp};
 const page={};
 const renderTo={ownerDocument:doc,innerHTML:'',querySelectorAll:()=>[],querySelector:paged,append(){}};
 const payload={issues:[],lang:'id',bodyClass:'',title:'fixture',fontCss:'',bodyInner:'synthetic fixture',styles:[],tocIds:toc?['heading']:[],headingIds:['heading'],page:{numberStart:1,widthMm:210},options:{imageTimeoutMs:15000,maxPasses:4},fonts:[],jobId:'audit',settings:{template:'BUS-01'},snapshot:{}};
 const helpers={
  performance:{now:()=>clock},location:{href:'https://audit.invalid/print.html'},TextEncoder,
  PaginationError:class extends Error{constructor(failure,issues,events){super(failure.message);Object.assign(this,{failure,issues,events});}},awaitFonts:async()=>[],awaitImages:async()=>[],
  printBatches:(_doc,content)=>inject==='cache'?['unchanged-a','unchanged-b']:[content],preLayoutFixes:()=>({html:'synthetic fixture',issues:[],trackedCells:new Map(),tableFits:0,mathScaled:0}),
  loadPaged:async()=>({Previewer:class{constructor(){this.chunker={on(){}}} async preview(){previewCalls++;passInAttempt++;clock+=10;if(inject==='abort')ctrl.abort();if(inject&&inject!=='cache')throw Error('controlled failure');}}}),
  computeMap:(_root,ids)=>({pages:[page],labels:['1'],map:ids.length?{heading:{page:1,label:String(Math.min(passInAttempt,stabilizesAfter-1))}}:{}}),
  stripEngineHyphensInCode(){},reconcileCodeLabels(){},applyPageNumbers(){},
  strandedHeadings(){const repair=finishedAttempts++<repairCount;passInAttempt=0;return repair?[{key:'#heading',text:'Synthetic heading',page:1}]:[];},
  diagnostics:()=>({issues:[],diag:[]}),tableContentIntact:()=>true,flatten:()=>'<html></html>',
  contentInventory:()=>({blocks:[]}),verifyFlattened:async()=>({lost:[],inventory:[],structure:[],status:'pass',pages:1}),describeInventoryDiff:()=>'',
 };
 const run=new Function(...Object.keys(helpers),recorder+fn+'; return paginate;')(...Object.values(helpers));
 let result;
 try{result=await run(payload,{renderTo,signal:ctrl.signal,onProgress:e=>onProgress.push(e)});}
 catch(error){if(!inject)throw error;return {inject,code:error.failure.code,events:error.events};}
 return {cachedPages:result.timings.reusedPages??0,toc,stabilizesAfter:toc?stabilizesAfter:1,repairCount,actualPreviewCalls:previewCalls,events:result.events,trace:result.trace,enginePreviewCalls:result.timings.totalPreviewCalls,finalAttemptPasses:result.timings.finalAttemptPasses,returnedPasses:result.passes,returnedPaginatePassesMs:result.timings.paginatePasses,syntheticActualPreviewTimeMs:previewCalls*10,returnedTotalMs:result.timings.total,returnedForcedBreaks:result.timings.forcedBreaks,progressPassSequence:onProgress.filter(p=>p.phase==='paginate'&&!('pages'in p)).map(p=>p.pass)};
}
const rows=[];
for(const [toc,passes,repairs] of [[false,1,0],[true,2,0],[false,1,1],[false,1,6],[true,2,6],[true,4,6]])rows.push(await scenario(toc,passes,repairs));
for (const row of rows) {
 const expected=(row.repairCount+1)*row.stabilizesAfter;
 if (row.enginePreviewCalls!==expected||row.actualPreviewCalls!==expected||row.returnedPasses!==expected||row.finalAttemptPasses!==row.stabilizesAfter||row.trace.filter(t=>t.repair).length!==row.repairCount||row.returnedPaginatePassesMs!==expected*10) throw Error('Incorrect cumulative accounting');
}
const failures=await Promise.all(['abort','engine-error'].map(inject=>scenario(false,1,0,inject)));
const build=JSON.parse(fs.readFileSync(path.join(sourceRoot,'dist.build-manifest.json'),'utf8'));
if(!process.env.PF_TRACE_DIST && (build.profile!=='production'||candidateSha256(sourceRoot)!==build.candidateSha256||distTreeSha256()!==build.distTreeSha256))throw Error('Source/dist identity mismatch');
const cache=await scenario(true,2,0,'cache');
const singleRepairToc=await scenario(true,2,1);
const report={singleRepairToc,cache,status:'PASS',build:process.env.PF_TRACE_DIST?null:build,method:'Actual paginate() control flow, synthetic layout helpers and clock. Not a browser benchmark or proof of actual orphan geometry.',rows,failures};
const out=process.argv[4];
if(out){fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2));}
else console.log(JSON.stringify(report,null,2));
