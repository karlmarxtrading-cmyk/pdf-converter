import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { attachments } from './external-artifacts.mjs';
import { isDeepStrictEqual } from 'node:util';
import { spawnSync } from 'node:child_process';
import { requireFact, requireHttpsPreview, evaluatePairs, validateBrowserBlocks, validateIdentityPair, nativeRecord } from './acceptance-policy.mjs';

function command(root, binary, args, encoding='utf8') {
  const p=spawnSync(binary,args,{cwd:root,encoding,maxBuffer:32*1024*1024,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
  requireFact(!p.error && p.status===0, binary+' verification failed: '+String(p.error?.message || p.stderr || p.status).slice(-650));
  return p.stdout;
}

export function verifyCohort(cohort, kind, doc, protocol, state, recovery) {
  requireFact(doc.schema===1 && doc.cohort===cohort && typeof doc.runId==='string' && /^[a-f0-9-]{36}$/.test(doc.runId) && Number.isSafeInteger(doc.pid) && doc.pid>0 && Array.isArray(doc.runs),'Missing benchmark cohort identity');
  requireFact(isDeepStrictEqual(protocol,doc.protocol) && isDeepStrictEqual(doc.before,doc.after),'Protocol or measured inputs changed');
  requireFact(doc.before.fixture===state.trigSourceSha256 && doc.before.oracle===state.oracleSha256 && doc.before.acceptedReference===state.referenceHtmlSha256 && doc.before.settings===state.settingsSha256 && doc.before.harness===state.benchmarkHarnessSha256,'Unbound oracle, fixture, settings or benchmark harness');
  requireFact(/^[a-f0-9]{64}$/.test(doc.environment?.nodeExecutableSha256) && (kind!=='browser' || /^[a-f0-9]{64}$/.test(doc.environment?.browserExecutableSha256)), 'Missing runtime binary identity');
  requireFact(doc.runs.every(r=>Number.isFinite(Date.parse(r.timestamp)) && Array.isArray(r.load) && r.load.length>0 && r.load.every(x=>Number.isFinite(x) && x>=0)), 'Missing per-observation clock or host load');
  validateIdentityPair(doc.before,state);
  validateIdentityPair(doc.after,state);
  const required=kind==='browser' ? protocol.browserFlows : protocol.nodeFlows;
  if(kind==='browser'){
    requireFact(doc.revision==='fixed-block-lifecycle/1' && Array.isArray(doc.incidents) && doc.incidents.length===0 &&
      !doc.error && isDeepStrictEqual(doc.recovery,recovery) && recovery?.pairsPerBlock===4 && recovery.cdpTimeoutMs===60000,
    'Failed or unrecognized browser lifecycle');
    requireFact(doc.driverSha256===state.browserDriverSha256 && doc.procedureSha256===state.browserProcedureSha256 &&
      doc.driverSha256===protocol.officialBrowserLifecycle?.driverSha256 &&
      doc.procedureSha256===protocol.officialBrowserLifecycle?.procedureSha256, 'Browser driver or procedure identity mismatch');
    let previousTask=-1;
    let previousTime=-Infinity;
    const tasks=Object.keys(required);
    for (const row of doc.runs){
      const index=tasks.indexOf(row.task), time=Date.parse(row.timestamp);
      requireFact(index>=previousTask && time>=previousTime,'Changed browser flow order or backward observation clock');
      previousTask=index; previousTime=time;
    }
  }
  const results={};
  const unexpected=doc.runs.filter(x=>!Object.hasOwn(required,x.task));
  requireFact(unexpected.length===0,'Unexpected cohort task');
  for (const [task,metrics] of Object.entries(required)) {
    const rows=doc.runs.filter(x=>x.task===task);
    if (kind==='browser') validateBrowserBlocks(rows,metrics,cohort,task,protocol);
    results[task]=evaluatePairs(rows,metrics,cohort,kind+'/'+task);
  }
  requireFact(doc.status==='PASS','Runner returned '+doc.status);
  return results;
}

const okNum=x=>Number.isFinite(x) && x>=0;
export function verifyCapacity(doc, protocol, state) {
  requireFact(doc.before && doc.after && doc.status==='PASS' && Array.isArray(doc.rows), 'Missing or failing capacity report');
  requireFact(isDeepStrictEqual(doc.before,doc.after) && isDeepStrictEqual(doc.protocol,protocol.capacity) && doc.before.protocol===state.settingsSha256,'Stale QA evidence or changed capacity protocol');
  requireFact(doc.before.qa?.candidateSha256===state.candidateSha256 && /^[a-f0-9]{64}$/.test(doc.before.qa.distTreeSha256),'Unbound QA build');
  for (const value of [doc.before,doc.after]) {
    const measured=value.candidate ?? value;
    requireFact(measured.candidateSha256===state.candidateSha256 && measured.distTreeSha256===state.distTreeSha256,'Stale capacity identity');
  }
  const sla=protocol.capacity;
  for(const size of sla.sections){
    const match=doc.rows.filter(x=>x.sections===size);
    requireFact(match.length===1 && Array.isArray(match[0].runs) && match[0].runs.length>=sla.reps,'Missing five runs for capacity size '+size);
    const row=match[0];
    const samplesAfterClose=row.runs.map(r=>r.closedProjectHeapAfterGcBytes);
    requireFact(samplesAfterClose.every(x=>Number.isFinite(x) && x>0),'Missing post-close heap readings');
    const drift=samplesAfterClose.at(-1)-samplesAfterClose[0];
    requireFact(drift===row.closedProjectHeapDriftBytes && drift<=sla.afterCloseRetainedDriftBytes,'Unverified/exceeded post-close heap drift');
    for(const [i,r] of row.runs.entries()){
      requireFact(r.rep===i+1 && r.sections===size && Number.isFinite(Date.parse(r.timestamp)) && !r.error && r.pdfBytes>0,'Repeated, missing, or failed capacity run');

      requireFact(r.layoutStatus === 'done' && r.verification === 'pass' &&
        Array.isArray(r.blocking) && !r.blocking.length && Array.isArray(r.errors) && !r.errors.length,
        'Layout, integrity or browser errors in capacity run');
      requireFact(r.printSessionAfterCancel === null, 'Print session survived cancellation');
      const progress = r.progressEvents;
      requireFact(okNum(r.layoutWallMs) && Array.isArray(progress) && progress.length > 0 &&
        progress.every((event, index) => typeof event.text === 'string' && event.text.trim() &&
          okNum(event.ms) && event.ms <= r.layoutWallMs + 2 && (!index || event.ms >= progress[index-1].ms)),
        'Missing or unordered observed progress');
      const times = [0, ...progress.map(event => event.ms), r.layoutWallMs];
      const maxGap = Math.max(...times.slice(1).map((t,index) => Math.max(0,t-times[index])));
      requireFact(progress[0].ms === r.firstProgressMs && maxGap === r.maxProgressGapMs,
        'Progress summary disagrees with raw observations');
      requireFact(Number.isSafeInteger(r.pages) && r.pages>0 && (r.verification===true || ['pass','PASS'].includes(r.verification)), 'Unverified pages: '+size);
      for(const key of ['previewMs','reeditPreviewMs','cancelToIdleMs','printReadyMs','firstProgressMs','maxProgressGapMs']) {
        requireFact(okNum(r[key]) && r[key]<=sla[key],'Missing or exceeded capacity SLA '+key);
      }
      requireFact(typeof r.cancelOutcome==='string' && /dibatalkan|cancelled|canceled/i.test(r.cancelOutcome),'Successful cancel required');
      requireFact(r.maxEventLoopGapMs && ['preview','layout','reedit'].every(k=>okNum(r.maxEventLoopGapMs[k]) && r.maxEventLoopGapMs[k]<=sla.maxEventLoopGapMs),'Event loop SLA exceeded');
      requireFact(Array.isArray(r.heapSamples) && r.heapSamples.length>1 && r.heapSamples.every((s,i)=>okNum(s.tMs) && okNum(s.bytes) && s.bytes>0 && (!i || s.tMs>=r.heapSamples[i-1].tMs)), 'Missing target heap samples in bytes');
      requireFact(r.maximumSampledTargetHeapBytes===Math.max(...r.heapSamples.map(s=>s.bytes),r.heapAfterGcBytes,r.closedProjectHeapAfterGcBytes) && okNum(r.heapAfterGcBytes) && r.heapAfterGcBytes>0,'Heap values do not match raw observations');
    }
  }
}

export function verifyGateDetails(id,f,read,root,state,origins,runId) {
  const json=p=>JSON.parse(read(p));
  const protocol=()=>JSON.parse(readFileSync(join(root,'tests/bench/performance-protocol.json'),'utf8'));
  if (Object.hasOwn(attachments,id)) {
    const records=f.operatorReports ?? [f.operatorReport];
    requireFact(Array.isArray(records) && records.length>0 && records[0]===f.operatorReport && new Set(records).size===records.length,'Missing external session records');
    for(const path of records){
      requireFact(origins?.get(path)?.has('scripts/external-acceptance.mjs'), 'External operator record must be collected by the current adapter');
      const session=json(path);
      requireFact(session.gate===id && session.runId===runId && session.candidateSha256===state.candidateSha256 &&
        session.distTreeSha256===state.distTreeSha256, 'External session has a different identity');
      for(const name of attachments[id]){
        const bytes=read(dirname(path).replaceAll('\\','/')+'/'+name);
        requireFact(createHash('sha256').update(bytes).digest('hex')===session.artifacts[name], 'Altered external artifact: '+name);
      }
    }
  }
  switch(id) {
    case 'G01':
      requireFact(state.trigSourceSha256==='1f4b9345ef5a092c40e66290821f110cee2656a093a889c0f51800bdd54bb16f' && state.referenceHtmlSha256==='a82ecec4f37617d9730b1aeaf427c446c1e0f1acaa3ea9ffa37372f0126108ff' && state.oracleSha256==='5fc50ac50f7514df26b99583cf709521e8df67917c6ef1dc7f52336e11783c4d','Original trig input, oracle or accepted HTML differs');
      break;
    case 'G03': {
      requireFact(Array.isArray(f.html) && f.html.length===4 && new Set(f.html).size===4, 'List four actual downloads in html');
      for(const path of f.html) read(path);
      command(root,process.env.PF_PYTHON || (process.platform==='win32'?'python':'python3'),['scripts/acceptance-formulas.py',...f.html]);
      break;
    }
    case 'G04': {
      const result=json(f.checks.rawWrapper.evidence);
      for(const k of ['rawWrapper','clipboardWrapper','independentText','ambiguity','pureAndMultipleControls']) requireFact(result[k]===true,'Wrapper case failed: '+k);
      requireFact(Array.isArray(result.cases) && result.cases.length>0,'Missing independent wrapper data');
      for(const route of ['raw','clipboard']){
        const rows=result.cases.filter(r=>r.route===route);
        requireFact(rows.some(r=>r.name==='section' && r.words.includes('KEEP-INDEPENDENT-CONTENT')),'Missing independent section on '+route);
        requireFact(rows.every(r=>r.pass===true && r.words===r.expected && JSON.stringify(r.tex)===JSON.stringify(r.expectedTex) && r.structure?.every(x=>x===true)),'Independent wrapper oracle failed on '+route);
      }
      break;
    }
    case 'G05':
    case 'G06': {
      const math=id==='G05';
      const result=json(f.checks[math?'emptyFormula':'rootText'].evidence);
      const needed=math?['emptyFormula','visual','mathML','annotation','mathMLToken','visualMinus','canonical','raw','mode','equationOrder','htmlAndPrint','fallback']:['rootText','untrackedNode','foreignId','duplicateId','nestedId','order','spoofedDecoration','spoofedTOC','digit','cell','link','codeWhitespace','generatedControls'];
      for(const key of needed) requireFact(result.cases?.[key]===true,'Integrity mutation failed: '+key);
      for(const k of ['standalone','zip','publication','print']) requireFact(result.cases.routes?.[(math?'emptyFormula':'untrackedNode')+k]===true,'Missing route mutation '+k);
      if (math) {
        const final=json(f.checks.cssAndFonts.evidence);
        requireFact(final.cases?.cssAndFonts===true && final.cases.mutatedArticle===true,'Final post-composition CSS/font or article check failed');
      }
      break;
    }
    case 'G07':
    case 'G08': {
      const coverage=json(f.checks[id==='G07'?'originalMixed':'code112Lines'].evidence);
      for(const key of Object.keys(f.checks)) requireFact(coverage[key]===true,'Physical PDF coverage failed: '+key);
      requireFact(Array.isArray(f.pdfs) && f.pdfs.length>0, 'Actual PDF files required');
      for(const path of f.pdfs) {
        const pdf=read(path);
        requireFact(pdf.subarray(0,5).toString()==='%PDF-' && pdf.subarray(-2048).includes('%%EOF'),'Invalid PDF bytes: '+path);
      }
      break;
    }
    case 'G09': {
      const cfg=protocol();
      for(const kind of ['browser','node']) {
        requireFact(Array.isArray(f[kind]) && f[kind].length===2 && f[kind][0]!==f[kind][1], 'Separate cohort files required: '+kind);
        const docs=f[kind].map(json);
        requireFact(docs[0].runId!==docs[1].runId,'Duplicate benchmark run identity');
        const sameNode=docs[0].environment?.nodeExecutableSha256===docs[1].environment?.nodeExecutableSha256;
        const sameBrowser=docs[0].environment?.browserExecutableSha256===docs[1].environment?.browserExecutableSha256;
        requireFact(sameNode && (kind!=='browser' || sameBrowser),'Cohorts used different runtime binaries');
        const recovery=kind==='browser' ? JSON.parse(readFileSync(join(root,'docs/verification-tools/browser-recovery-protocol.json'),'utf8')) : undefined;
        for(const [i,doc] of docs.entries()) verifyCohort(i+1,kind,doc,cfg,state,recovery);
      }
      break;
    }
    case 'G10': verifyCapacity(json(f.capacity),protocol(),state);break;
    case 'G11': {
      const result=json(f.checks.positiveControl.evidence);
      requireFact(result.schema===1 && result.pass===true && result.exitCode===0 && Object.keys(f.checks).every(k=>result.checks?.[k]===true),'Aggregate mutation controls are incomplete or failed');
      break;
    }
    case 'G13': {
      nativeRecord(f,read);
      const info=command(root,'pdfinfo',[f.pdf]);
      requireFact(Number(/^Pages:\s+(\d+)\s*$/m.exec(info)?.[1])===f.pages,'Native PDF pages differ');
      const extracted=command(root,'pdftotext',['-layout',f.pdf,'-'],null);
      requireFact(extracted.toString('utf8').trim().length>0 && createHash('sha256').update(extracted).digest('hex')===f.extractedTextSha256,'Extracted native PDF text differs');
      break;
    }
    case 'G15': {
      requireHttpsPreview(f.url);
      for (const [path,script] of [[f.httpReport,'scripts/verify-http.mjs'],[f.mathReport,'scripts/verify-deployment-math.mjs'],[f.exportReport,'scripts/preview-export.mjs']]){
        requireFact(origins?.get(path)?.has(script),'Missing direct deployment measurement: '+script);
        const observed=json(path);
        requireFact(observed.tool===script && observed.pass===true && observed.candidateSha256===state.candidateSha256 &&
          observed.distTreeSha256===state.distTreeSha256 && new URL(observed.url || observed.base).origin===new URL(f.url).origin,
          'Unbound deployment result: '+script);
      }
      const exported=json(f.exportReport), dir=dirname(f.exportReport).replaceAll('\\','/');
      for(const [name,sha] of [['download.html',exported.htmlSha256],['print.pdf',exported.pdfSha256]]){
        requireFact(createHash('sha256').update(read(dir+'/'+name)).digest('hex')===sha,'Changed deployment download: '+name);
      }
      const report=json(f.httpReport);
      requireFact(report.tool==='scripts/verify-http.mjs' && report.pass===true && report.expectedFiles>0 && report.expectedFiles===report.filesCompared && report.results?.length>=report.expectedFiles && report.results.every(x=>x.pass===true) && report.distTreeSha256===state.distTreeSha256 && report.candidateSha256===state.candidateSha256,'Preview HTTP byte/header report missing or stale');
      requireFact(new URL(report.url || report.base).origin===new URL(f.url).origin,'Wrong origin for preview HTTP');
      break;
    }
    case 'G16': {
      requireHttpsPreview(f.previewUrl);
      requireFact(typeof f.rollbackId==='string' && f.rollbackId.length>=6 && typeof f.authorizationRef==='string' && f.authorizationRef.trim().length>0,'Preview rollback identity and explicit promotion approval required');
      break;
    }
  }
}
