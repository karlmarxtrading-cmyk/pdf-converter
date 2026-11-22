import { readFileSync,existsSync,renameSync,writeFileSync } from 'node:fs';
import { join,resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpus, totalmem, platform, release, arch, loadavg, availableParallelism } from 'node:os';
import { treeHash } from '../../scripts/fingerprint.mjs';
import { findChromium } from '../../scripts/browser-path.mjs';
export const hash = value=>createHash('sha256').update(value).digest('hex');
export const fileHash=path=>hash(readFileSync(path));
export const protocol=JSON.parse(readFileSync('tests/bench/performance-protocol.json'));
export const outputDir=resolve('evidence/rc12/performance');
export function bind(repo,profile='production'){
  const manifest=JSON.parse(readFileSync(join(repo,profile==='production'?'dist.build-manifest.json':'dist-qa.build-manifest.json')));
  const id=JSON.parse(execFileSync(process.execPath,[join(repo,'scripts/fingerprint.mjs')],{encoding:'utf8'}));
  if(profile==='qa')id.distTreeSha256=treeHash(['dist-qa'],repo).sha256;
  if(manifest.profile!==profile||manifest.candidateSha256!==id.candidateSha256||manifest.distTreeSha256!==id.distTreeSha256)throw Error('Stale '+profile+' source or dist '+repo);
  return {...id,manifestSha256:fileHash(join(repo,profile==='production'?'dist.build-manifest.json':'dist-qa.build-manifest.json')),version:manifest.version};
}
export function bindings(baseline,fixtureRoot,unchecked=false) {
  const rc6=bind(baseline);if(rc6.candidateSha256!==protocol.baselineSource||rc6.distTreeSha256!==protocol.baselineDist)throw Error('RC6 digest mismatch');
  const candidate=unchecked?bind(baseline):bind(process.cwd());
  const fixture=join(fixtureRoot,'fixtures/rc6/user-trigonometry.md'), oracle=join(fixtureRoot,'fixtures/rc6/user-trigonometry.expected.json'),reference=join(fixtureRoot,'examples/reference-rc6/RUMUS TRIGONOMETRI 1.html');
  if(fileHash(fixture)!==protocol.trigSource||fileHash(reference)!==protocol.referenceHtml)throw Error('Wrong trigonometry data');
  return {rc6,candidate,fixture:fileHash(fixture),oracle:fileHash(oracle),acceptedReference:fileHash(reference),harness:treeHash(['tests/bench','scripts/generate-stress.mjs','scripts/serve-dist.mjs','scripts/fingerprint.mjs','scripts/browser-path.mjs']).sha256,settings:fileHash('tests/bench/performance-protocol.json'),benchmarkDependencies:Object.fromEntries([['rc6',baseline],['candidate',process.cwd()]].map(([name,repo])=>[name,treeHash(['node_modules/jsdom','node_modules/esbuild','node_modules/katex','node_modules/@esbuild','node_modules/puppeteer-core','node_modules/@fontsource'],repo).sha256]))};
}
export const load = ()=>({loadavg:loadavg(),at:new Date().toISOString()});
export function environment(){const browser=findChromium();return {node:process.version,nodeExecutableSha256:fileHash(process.execPath),browserExecutableSha256:browser&&existsSync(browser)?fileHash(browser):null,os:[platform(),release(),arch()],cpus:availableParallelism(),model:cpus()[0]?.model??null,memoryBytes:totalmem(),initialLoad:load(),affinity:platform()==='linux'?readFileSync('/proc/self/status','utf8').match(/Cpus_allowed_list:\s*([^\n]+)/)?.[1]:null};}
export function atomic(path,value){writeFileSync(path+'.tmp',JSON.stringify(value,null,2)+'\n');renameSync(path+'.tmp',path);}
function stats(v){const x=v.toSorted((a,b)=>a-b);return {n:x.length,min:x[0],median:(x[Math.floor((x.length-1)/2)]+x[Math.floor(x.length/2)])/2,p95:x[Math.ceil(.95*x.length)-1],max:x.at(-1)};}
export function summarize(out,flows){
 const result={};let pass=true;
 for(const [task,metrics] of Object.entries(flows)){result[task]={};const samples=out.runs.filter(r=>r.task===task&&r.round>=0);
  for(const metric of metrics){const side={};for(const label of ['rc6','candidate']){const records=samples.filter(r=>r.label===label);let ts=records.map(r=>r.times?.[metric]);if(ts.length!==protocol.pairs||!ts.every(t=>Number.isFinite(t)&&t>0)||records.some(r=>!r.oracle?.pass))pass=false;ts=ts.filter(Number.isFinite);side[label]=stats(ts);}
   const medianRatio=side.candidate.median/side.rc6.median,p95Ratio=side.candidate.p95/side.rc6.p95;const ok=medianRatio<=protocol.medianRatio&&p95Ratio<=protocol.p95Ratio;
   pass&&=ok;result[task][metric]={...side,medianRatio,p95Ratio,ok};
  }
 }
 const equal=out.runs.every(r=>r.oracle?.pass&&out.runs.some(s=>s.task===r.task&&s.round===r.round&&s.label!==r.label&&s.oracle?.digest===r.oracle.digest));
 return {summary:result,status:pass&&equal?'PASS':'FAIL',allPairedOutputsEquivalent:equal};
}
