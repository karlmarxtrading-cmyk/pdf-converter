// Independent corruption controls. Synthetic timings are exclusively for validator tests.
import {execFileSync} from 'node:child_process';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyTrace,verifyLifecycle} from '../../scripts/trace-acceptance.mjs';
const control=JSON.parse(execFileSync(process.execPath,['docs/verification-tools/verify-accounting.mjs','.','.'],{
  encoding:'utf8',env:{...process.env,PF_TRACE_DIST:'unit-control'},maxBuffer:2e6}));
function simulatedBrowserRow(r,repairs,toc){
  const events=r.events.map(e=>({...e}));
  const idx=events.findIndex(e=>e.phase==='verify-reopen'&&e.event==='end');
  const additions=['reopen-load','reopen-fonts','inventory-reopen','verify-structure','geometry'].flatMap(phase=>
    ['start','end'].map(event=>({...events[idx],phase,event,durationMs:0})));
  events.splice(idx,0,...additions);
  const timings={globalPasses:r.returnedPasses,totalPreviewCalls:r.enginePreviewCalls,enginePreviewCalls:r.enginePreviewCalls,
    paginatePasses:r.returnedPaginatePassesMs,total:r.returnedTotalMs};
  for(const [i,e] of events.entries()){
    e.seq=i+1;
    if(e.event==='end')timings['phaseMs.'+e.phase]=(timings['phaseMs.'+e.phase]||0)+e.durationMs;
  }
  return {events,repairs,toc,timings,status:'ok',verification:'pass'};
}
const browser={rows:[0,1,6].flatMap(repairs=>[false,true].map(toc=>{
  const row=control.rows.find(r=>r.repairCount===repairs&&r.toc===toc)??control.singleRepairToc;
  return simulatedBrowserRow(row,repairs,toc);
}))};
test('reconstructs invocation, logical pass, repair and interrupted phase accounting',()=>{
  assert.equal(verifyTrace(browser,control),true);
  for(const corrupt of [
    r=>r.rows[0].events.splice(2,1),
    r=>{r.rows[0].events[2].ms=-1;},
    r=>{r.rows[0].timings.paginatePasses++;},
    r=>{r.rows.at(-1).events.find(e=>e.phase==='attempt'&&e.detail==='discarded').detail='accepted';},
    r=>{r.rows.at(-1).events.find(e=>e.phase==='pass'&&e.event==='end').pass=999;},
  ]){const bad=structuredClone(browser);corrupt(bad);assert.throws(()=>verifyTrace(bad,control));}
  const noAbort=structuredClone(control);noAbort.failures[0].code='PAGINATION_FAILED';assert.throws(()=>verifyTrace(browser,noAbort));
  const lostCache=structuredClone(control);lostCache.cache.cachedPages++;assert.throws(()=>verifyTrace(browser,lostCache));
});
test('rejects lifecycle overruns and missing observations even when the caller reports success',()=>{
  const phases=['startup-ready','fonts','images','paginate','heading-check','diagnostics','flatten','inventory','inventory-reopen','geometry','verified-pages'];
  const source='a'.repeat(64);
  const run={source,rows:phases.map(phase=>({phase,source,cross:{phase,ms:5},elapsed:5,idle:10,cancelled:true,frames:0,
    progress:[{ms:5}],loop:[0,10],heapBefore:1234,heapAfter:4321}))};
  const timing={rows:[['no-ready','FRAME_STARTUP_TIMEOUT'],['repeat','FRAME_STALLED'],['total','FRAME_DEADLINE'],['stale','official'],['near','official']].map(([kind,result])=>({kind,result,remainingFrames:0})),
    visibility:['visible','hidden','visible'].map(state=>({state})),backgroundOutcome:'official'};
  assert.equal(verifyLifecycle(run,timing),true);
  for(const corrupt of [r=>{r.rows[0].loop=[];},r=>{r.rows[0].heapAfter=9e6;},r=>{r.rows[0].progress=[];},r=>{r.rows[0].frames=1;},
    r=>{Object.assign(r.rows[0],{idle:1200,elapsed:1195,loop:[0,1200]});}]) {
    const bad=structuredClone(run);corrupt(bad);assert.throws(()=>verifyLifecycle(bad,timing));
  }
  assert.throws(()=>verifyLifecycle(run,{...timing,visibility:[{state:'visible'}]}));
});
