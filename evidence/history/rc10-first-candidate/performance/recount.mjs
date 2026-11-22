// Run from the candidate project root. Recompute every G09 quantile from raw arms.
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {isDeepStrictEqual} from 'node:util';
import {join} from 'node:path';

const base='evidence/rc10/performance';
const load=path=>JSON.parse(readFileSync(path,'utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const protocolPath='tests/bench/performance-protocol.json',protocol=load(protocolPath);
const manifest=load('dist.build-manifest.json');
const baselineManifestSha='6827509a82bf2b903bda374e6782e3df77ec1cccb940739c31911fce49340279';
const summary={schema:'paperforma-g09-independent-recount/1',candidateSha256:manifest.candidateSha256,distTreeSha256:manifest.distTreeSha256,computedAt:new Date().toISOString(),cohorts:{}};
const stats=values=>{
 const a=values.toSorted((a,b)=>a-b),n=a.length;
 return n?{n,min:a[0],median:(a[Math.floor((n-1)/2)]+a[Math.floor(n/2)])/2,p95:a[Math.ceil(.95*n)-1],max:a.at(-1)}:{n};
};
const fixtureSha=sha(readFileSync('fixtures/rc6/user-trigonometry.md')),refSha=sha(readFileSync('examples/reference-rc6/RUMUS TRIGONOMETRI 1.html'));
for(const kind of ['node','browser'])for(const idx of [1,2]){
 const name=(kind==='node'?'node':'recovery-cohort')+'-'+idx+'.json';
 const rowsFile=join(base,name),r=load(rowsFile),flows=protocol[kind+'Flows'];
 const errors=[];
 const check=(ok,why)=>{if(!ok)errors.push(why);};
 check(isDeepStrictEqual(r.protocol,protocol),'Protocol differs');
 check(isDeepStrictEqual(r.before,r.after),'Identity before/after differs');
 check(r.before.rc6.manifestSha256===baselineManifestSha && r.before.rc6.candidateSha256===protocol.baselineSource && r.before.rc6.distTreeSha256===protocol.baselineDist,'Baseline identity differs');
 check(r.before.candidate.candidateSha256===manifest.candidateSha256 && r.before.candidate.distTreeSha256===manifest.distTreeSha256 && r.before.candidate.manifestSha256===sha(readFileSync('dist.build-manifest.json')),'Candidate identity differs');
 check(r.before.benchmarkDependencies?.rc6==='774d75eec73c9088e839e3b252e2f6cc26e3c8fef1beba192b8a95d35204130c' && r.before.benchmarkDependencies?.candidate==='ef77e877abfc9dccc5fa3dba56f968d73ededbc84368ece98d80957ae5857e68','Benchmark dependencies differ from authenticated baseline and prior candidate');
 check(r.before.fixture===fixtureSha && fixtureSha===protocol.trigSource && r.before.acceptedReference===refSha && refSha===protocol.referenceHtml,'Fixture/reference identity differs');
 check(r.before.settings===sha(readFileSync(protocolPath)) && r.before.oracle===sha(readFileSync('fixtures/rc6/user-trigonometry.expected.json')),'Protocol/oracle hash differs');
 check(r.environment.nodeExecutableSha256==='acbe4b8d9153b841ed0697cbfc4f93e767386620edb745ab9358306c0a6f31aa' && r.environment.browserExecutableSha256==='53a15d6c3a3d27dfb54c4ba60278b1683136f70cf1e67e989da7dfbd3d451ef0','Runtime differs from historical run');
 if(kind==='browser'){
  check(r.driverSha256===protocol.officialBrowserLifecycle.driverSha256 && r.procedureSha256===protocol.officialBrowserLifecycle.procedureSha256,'Browser driver/procedure differs');
  check(!r.incidents.length,'Browser incidents retained');
 }
 const arms=r.runs,metrics={};
 check(arms.every(a=>Object.hasOwn(flows,a.task)), 'Unknown task in raw observations');
 for(const [task,names] of Object.entries(flows)){
  const forTask=arms.filter(a=>a.task===task);
  const planned=[];
  if(kind==='node') for(let i=-1;i<protocol.pairs;i++)planned.push(i);
  else for(let block=0;block<protocol.pairs/protocol.officialBrowserLifecycle.pairsPerBlock;block++){
   planned.push(-(1+100*block));
   for(let j=0;j<protocol.officialBrowserLifecycle.pairsPerBlock;j++)planned.push(block*protocol.officialBrowserLifecycle.pairsPerBlock+j);
  }
  const expectedOrder=planned.flatMap(round=>(round+(idx===2?1:0))%2?[[round,'candidate'],[round,'rc6']]:[[round,'rc6'],[round,'candidate']]);
  check(isDeepStrictEqual(forTask.map(a=>[a.round,a.label]),expectedOrder),task+' raw order/count differs');
  for(const round of planned){
   const pair=forTask.filter(a=>a.round===round);
   const p=pair[0]?.oracle,q=pair[1]?.oracle;
   check(pair.length===2 && p?.pass && q?.pass && p.digest===q.digest && [p,q].every(o=>o.digest===sha(JSON.stringify(o.projection))),task+' round '+round+' oracle differs');
  }
  for(const metric of names){
   const side={};
   for(const label of ['rc6','candidate']){
    const vals=forTask.filter(a=>a.round>=0&&a.label===label).map(a=>a.times?.[metric]);
    check(vals.length===protocol.pairs&&vals.every(v=>v>0&&Number.isFinite(v)),task+'/'+metric+' '+label+' observations incomplete');
    side[label]=stats(vals.filter(Number.isFinite));
   }
   const medianRatio=side.candidate.median/side.rc6.median,p95Ratio=side.candidate.p95/side.rc6.p95;
   const pass=medianRatio<=protocol.medianRatio && p95Ratio<=protocol.p95Ratio;
   metrics[task+'/'+metric]={...side,medianRatio,p95Ratio,pass};
   check(pass,task+'/'+metric+' exceeds a frozen threshold');
  }
 }
 check(!r.error,'Harness error retained');
 const status=errors.length?'FAIL':'PASS';
 summary.cohorts[name]={rawSha256:sha(readFileSync(rowsFile)),runId:r.runId,affinity:r.environment.affinity,started:arms[0]?.timestamp,lastArmStarted:arms.at(-1)?.timestamp,rows:arms.length,failedRows:arms.filter(a=>!a.oracle?.pass).length,harnessStatus:r.status,recountStatus:status,errors,metrics};
}
summary.status=Object.values(summary.cohorts).every(c=>c.recountStatus==='PASS'&&c.harnessStatus==='PASS')?'PASS':'FAIL';
writeFileSync(join(base,'cohort-recount.json'),JSON.stringify(summary,null,2)+'\n');
console.log(summary.status);
for(const [k,v] of Object.entries(summary.cohorts))console.log(k,v.recountStatus,JSON.stringify(v.errors));
