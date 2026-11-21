// Node microbenchmark only: no browser, layout, network, or end-to-end PDF latency claim.
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {performance} from 'node:perf_hooks';
const [baselineArg,candidateArg,outArg]=process.argv.slice(2);
if(!baselineArg||!candidateArg||!outArg) throw Error('Usage: node snapshot-benchmark.mjs BASELINE_REPO CANDIDATE_REPO OUTPUT_JSON');
const baseline=resolve(baselineArg),candidate=resolve(candidateArg),out=resolve(outArg);
const {build}=createRequire(join(candidate,'package.json'))('esbuild');
const tmp=await mkdtemp(join(tmpdir(),'pf-snapshot-bench-'));
try{
 const mods=[];
 for(const [name,repo] of [['baseline',baseline],['candidate',candidate]]){
  const file=join(tmp,name+'.mjs');await build({entryPoints:[join(repo,'src/core/hash.ts')],outfile:file,bundle:true,platform:'node',format:'esm',target:'node24',logLevel:'silent'});
  mods.push(await import(pathToFileURL(file).href));
 }
 const [old,newer]=mods;
 const make=(kind)=>{
  const p={projectId:'bench-fixed',revision:100,source:kind==='small'?'paragraph\n'.repeat(2000):'paragraph \\(x^2\\)\n'.repeat(60000),settings:old.defaultSettings('BUS-01'),inputs:[],assets:[],history:[]};
  if(kind!=='small')p.history=Array.from({length:100},(_,i)=>({revision:i,source:'retained-history-'.repeat(3000),stateJson:JSON.stringify(p.settings)}));
  if(kind==='images')for(let i=0;i<10;i++){const bytes=new Uint8Array(1024*1024);bytes.fill(i+10);p.assets.push({id:'0'.repeat(64),path:`img-${i}.png`,mime:'image/png',bytes,origin:'upload',width:4,height:4});}
  return p;
 };
 const result={kind:'Node microbenchmark',node:process.version,iterations:30,warmups:3,order:'paired alternating baseline/candidate',at:new Date().toISOString(),results:[]};
 const options={now:()=> '2026-11-21T00:00:00Z',rendererVersion:'benchmark-same-renderer',templateVersion:'benchmark-same-template'};
 for(const kind of ['small','history','images']){
  const p=make(kind),times={baseline:[],candidate:[]};let stable=true;
  for(let i=0;i<33;i++){
   const order=i%2?[['candidate',newer],['baseline',old]]:[['baseline',old],['candidate',newer]];
   const snapshots={};
   for(const [label,mod] of order){const t=performance.now();snapshots[label]=await mod.makeSnapshot(p,options);const ms=performance.now()-t;if(i>=3)times[label].push(ms);}
   stable &&= snapshots.baseline.renderInputHash===snapshots.candidate.renderInputHash && snapshots.baseline.rawSourceHash===snapshots.candidate.rawSourceHash && snapshots.baseline.contentSnapshotHash===snapshots.candidate.contentSnapshotHash;
  }
  const stats=a=>{const s=[...a].sort((x,y)=>x-y);return{medianMs:(s[14]+s[15])/2,p95Ms:s[Math.ceil(.95*s.length)-1],samples:a};};
  result.results.push({scenario:kind,sourceChars:p.source.length,assetBytes:p.assets.reduce((n,a)=>n+a.bytes.length,0),historyChars:p.history.reduce((n,h)=>n+h.source.length,0),identicalHashes:stable,baseline:stats(times.baseline),candidate:stats(times.candidate)});
 }
 await writeFile(out,JSON.stringify(result,null,2));console.log(JSON.stringify(result.results.map(r=>({scenario:r.scenario,identicalHashes:r.identicalHashes,baselineMedian:r.baseline.medianMs,candidateMedian:r.candidate.medianMs})),null,2));
 if(result.results.some(r=>!r.identicalHashes)) process.exitCode=1;
}finally{await rm(tmp,{recursive:true,force:true});}
