// Independent reconstruction from raw monotonic events, including attempts
// that the engine discarded. No timing claim relies on a self-declared PASS.
import assert from 'node:assert/strict';
const phases=['startup-ready','fonts','images','paginate','heading-check','diagnostics','flatten','inventory','inventory-reopen','geometry','verified-pages'];
const count=(events,phase,event)=>events.filter(e=>e.phase===phase&&e.event===event);
const integer=n=>Number.isSafeInteger(n)&&n>=0;
const finite=n=>Number.isFinite(n)&&n>=0;
function spans(events){
  assert.ok(events.length>=3,'Empty trace');
  const open=new Map(), sums={}, id=events[0].jobId;
  let last=0,engines=0,passes=0;
  for(const [i,e] of events.entries()){
    assert.ok(e.jobId===id&&typeof id==='string'&&id.length&&e.seq===i+1&&integer(e.ms)&&e.ms>=last,'Job sequence or clock regressed');
    assert.ok([e.attempt,e.pass,e.pages,e.globalPass,e.engineCalls].every(integer),'Invalid counters');
    last=e.ms;
    if(e.phase==='engine'&&e.event==='start')engines++;
    if(e.phase==='pass'&&e.event==='start')passes++;
    assert.equal(e.engineCalls,engines,'Engine invocation counter');
    assert.equal(e.globalPass,passes,'Logical pass counter');
    if(e.event==='start'){assert.ok(!open.has(e.phase),'Overlapping '+e.phase);open.set(e.phase,e);}
    else if(e.event==='end'){
      const start=open.get(e.phase);
      assert.ok(start&&e.durationMs===e.ms-start.ms,'Missing or inconsistent span '+e.phase);
      open.delete(e.phase);sums[e.phase]=(sums[e.phase]||0)+e.durationMs;
    }else assert.equal(e.event,'point');
  }
  assert.equal(open.size,0,'Open spans after terminal event');
  assert.equal(events[0].phase,'job');assert.equal(events.at(-1).phase,'cleanup');
  return {engines,passes,sums};
}
function successful(row,isBrowser){
  const {events}=row, {engines,passes,sums}=spans(events);
  const repairs=row.repairs??row.repairCount;
  const expectedPasses=(isBrowser?row.timings.globalPasses:row.stabilizesAfter*(repairs+1));
  assert.equal(passes,expectedPasses);
  const attempts=count(events,'attempt','end');
  assert.deepEqual(attempts.map(e=>[e.attempt,e.detail]),Array.from({length:repairs+1},(_,i)=>[i+1,i<repairs?'discarded':'accepted']));
  assert.equal(count(events,'repair','point').length,repairs);
  for(const attempt of attempts){
    const local=count(events,'pass','end').filter(e=>e.attempt===attempt.attempt);
    assert.ok(local.length>0);
    assert.deepEqual(local.map(e=>e.pass),local.map((_,i)=>i+1));
    if(row.toc)assert.ok(local.length>=2,'TOC needs a verifying pass');
    if(row.toc)assert.equal(events.filter(e=>e.attempt===attempt.attempt&&e.phase==='toc'&&e.detail==='stable').length,1);
  }
  assert.equal(count(events,'error','point').length+count(events,'abort','point').length,0);
  for(const name of ['fonts','images','prelayout','load-engine','split-batches','engine','page-map','heading-check','diagnostics','flatten','inventory','verify-reopen','measure-bytes'])
    assert.ok(count(events,name,'end').length>0,'Missing successful phase '+name);
  if(isBrowser){
    for(const name of ['reopen-load','reopen-fonts','inventory-reopen','verify-structure','geometry'])
      assert.ok(count(events,name,'end').length>0,'Missing browser phase '+name);
    assert.equal(row.status,'ok');assert.equal(row.verification,'pass');
    assert.equal(engines,row.timings.totalPreviewCalls);assert.equal(engines,row.timings.enginePreviewCalls);
    assert.equal(sums.pass,row.timings.paginatePasses);assert.equal(sums.job,row.timings.total);
    for(const [phase,ms] of Object.entries(sums))assert.equal(ms,row.timings['phaseMs.'+phase]);
  }else{
    assert.equal(engines,row.actualPreviewCalls);assert.equal(engines,row.enginePreviewCalls);
    assert.equal(sums.pass,row.returnedPaginatePassesMs);assert.equal(passes,row.returnedPasses);
  }
}
export function verifyTrace(browser,control){
  assert.equal(browser.rows.length,6);assert.equal(control.rows.length,6);
  assert.deepEqual(browser.rows.map(r=>[r.repairs,r.toc]).sort(),[0,1,6].flatMap(n=>[false,true].map(t=>[n,t])).sort());
  assert.deepEqual(control.rows.map(r=>[r.toc,r.stabilizesAfter,r.repairCount]).sort(),[[false,1,0],[true,2,0],[false,1,1],[false,1,6],[true,2,6],[true,4,6]].sort());
  for(const row of browser.rows)successful(row,true);
  for(const row of control.rows)successful(row,false);
  successful(control.singleRepairToc,false);
  successful(control.cache,false);
  const hits=count(control.cache.events,'cache','point');
  assert.ok(hits.length&&hits.every(e=>e.detail==='reuse'&&integer(e.units)&&e.units>0));
  assert.equal(hits.reduce((a,e)=>a+e.units,0),control.cache.cachedPages);
  assert.equal(control.cache.actualPreviewCalls,2);
  assert.deepEqual(control.failures.map(r=>r.inject).sort(),['abort','engine-error']);
  for(const row of control.failures){
    spans(row.events);
    assert.equal(row.code,row.inject==='abort'?'ABORTED':'PAGINATION_FAILED');
    const event=count(row.events,row.inject==='abort'?'abort':'error','point');
    assert.equal(event.length,1);assert.equal(event[0].detail,row.code);
  }
  return true;
}
export function verifyLifecycle(browser,control){
  assert.match(browser.source,/^[a-f0-9]{64}$/);
  assert.deepEqual(browser.rows.map(r=>r.phase).sort(),[...phases].sort());
  for(const r of browser.rows){
    assert.equal(r.source,browser.source);assert.equal(r.cross?.phase,r.phase);
    assert.ok(r.cancelled&&r.frames===0&&!r.error&&r.idle>0&&r.elapsed===r.idle-r.cross.ms&&finite(r.elapsed)&&r.elapsed<=2000,'Cancelled job must reach idle in 2 seconds');
    assert.ok(r.loop.length>=2&&r.loop[0]===0&&r.loop.at(-1)===r.idle,'Missing event loop samples');
    assert.ok(r.loop.slice(1).every((n,i)=>finite(n-r.loop[i])&&n-r.loop[i]<=1000),'Main-thread event loop gap exceeded 1 second');
    assert.ok(r.progress.length&&r.progress[0].ms<=2000,'First progress exceeded 2 seconds');
    const limit=browser.large?90000:5000;
    assert.ok(r.progress.every((p,i)=>finite(p.ms)&&(!i||(p.ms>=r.progress[i-1].ms&&p.ms-r.progress[i-1].ms<=limit))),'Progress gap exceeded budget');
    assert.ok(r.heapBefore>0&&r.heapAfter>0&&r.heapAfter-r.heapBefore<=8388608,'Retained target heap exceeds budget');
  }
  for(const [kind,expected] of [['no-ready','FRAME_STARTUP_TIMEOUT'],['repeat','FRAME_STALLED'],['total','FRAME_DEADLINE'],['stale','official'],['near','official']]){
    const rows=control.rows.filter(r=>r.kind===kind);assert.equal(rows.length,1);
    const r=rows[0];assert.equal(r.code||r.result,expected);assert.equal(r.remainingFrames,0);
  }
  assert.deepEqual(control.visibility?.map(e=>e.state),['visible','hidden','visible'],'Missing observed background/foreground transition');
  assert.equal(control.backgroundOutcome,'official','Background job did not resume or finish');
  return true;
}
