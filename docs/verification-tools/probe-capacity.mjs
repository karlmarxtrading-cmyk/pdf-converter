// Independent read-only probes. Run: node acceptance-consistency-probes.mjs /path/to/extracted-rc8
// Every mutation is an in-memory clone; this script never edits the candidate or its evidence.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const root=resolve(process.argv[2]??'../source_original');
const {verifyCapacity}=await import(pathToFileURL(resolve(root,'scripts/acceptance-details.mjs')).href);
const {requiresPromotionEvidence}=await import(pathToFileURL(resolve(root,'scripts/pages-build.mjs')).href);
const json=p=>JSON.parse(readFileSync(resolve(root,p),'utf8'));
const state=json('evidence/rc12/acceptance/start.json').identity;
const protocol=json('tests/bench/performance-protocol.json');
const capacity=json('evidence/rc12/performance/capacity.json');
const probes={
  control:()=>{},
  layout_failed:d=>{d.rows[0].runs[0].layoutStatus='failed';},
  blocking_integrity_error:d=>{d.rows[0].runs[0].blocking=['CONTENT_INTEGRITY_FAILED'];},
  browser_error:d=>{d.rows[0].runs[0].errors=['AUDIT: synthetic uncaught browser error'];},
  no_progress_observations:d=>{d.rows[0].runs[0].progressEvents=[];},
  raw_progress_exceeds_sla:d=>{d.rows[0].runs[0].progressEvents=[{text:'AUDIT: first physical progress',ms:7000}];},
  unfinished_print_session_after_cancel:d=>{d.rows[0].runs[0].printSessionAfterCancel={status:'running',token:'audit-only'};},
  real_numeric_threshold_control:d=>{d.rows[0].runs[0].printReadyMs=protocol.capacity.printReadyMs+1;},
  inconsistent_heap_control:d=>{d.rows[0].runs[0].heapSamples[0].bytes=d.rows[0].runs[0].maximumSampledTargetHeapBytes+1;},
};
const results=[];
for(const [name,mutate] of Object.entries(probes)){
  const copy=structuredClone(capacity);mutate(copy);
  try{verifyCapacity(copy,protocol,state);results.push({name,accepted:true});}
  catch(error){results.push({name,accepted:false,reason:error.message});}
}
const branches=[];
for(const [name,env] of Object.entries({local:{},preview:{CF_PAGES:'1',CF_PAGES_BRANCH:'rc8-preview'},production:{CF_PAGES:'1',CF_PAGES_BRANCH:'main'},custom:{CF_PAGES:'1',CF_PAGES_BRANCH:'release',PAPERFORMA_PRODUCTION_BRANCH:'release'},missing:{CF_PAGES:'1'}})){
  try{branches.push({name,requiresPromotionEvidence:requiresPromotionEvidence(env)});}
  catch(error){branches.push({name,rejected:true,reason:error.message});}
}
console.log(JSON.stringify({schema:1,method:'Only exported validator functions and in-memory evidence copies; no build, browser, deployment, app mutation, or receipt mutation.',capacity:results,branches},null,2));
