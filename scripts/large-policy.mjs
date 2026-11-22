// Typed, candidate-bound evidence for each large-document acceptance gate.
// A facts file names artifacts. Only the successful observation that produced
// those exact bytes can supply them to these independent checks.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { isDeepStrictEqual as equal } from 'node:util';
import { requireFact as check } from './acceptance-policy.mjs';
import { verifyCapacity,verifyGateDetails } from './acceptance-details.mjs';
import { evidence,examples } from './release-paths.mjs';
import { verifyBook, verifyResponsiveness, verifyWork } from './large-observations.mjs';

export const largeIds = ['U01','U02','U03','U04','U05','U06','U07','U08'];
export const publicCases = ['headings-on','long-table-off','paragraphs-off','paragraphs-on','single-paragraph-off'];
export const privateCase='original-default';
export const privateSource='88901d44a592ead82c757b65f57ce26e5f0003598a7a74064d6921439dbd0454';
export const digest = bytes=>createHash('sha256').update(bytes).digest('hex');
const json=bytes=>JSON.parse(bytes);
const needHash=(value,label)=>check(typeof value==='string' && /^[a-f0-9]{64}$/.test(value),label+' needs SHA-256');
const fixture=name=>'fixtures/rc9/'+name.slice(0,name.lastIndexOf('-'))+'-217850.md';
const readLocal=(root,name)=>readFileSync(join(root,name));
const python=(root,...args)=>execFileSync(process.env.PF_PYTHON || (process.platform === 'win32' ? 'python' : 'python3'),args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:4<<20,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
const positive=value=>Number.isSafeInteger(value) && value>0;

function validateBooks(physical,f,read,root,state,runId) {
  const names=[...publicCases,privateCase];
  check(f.books && equal(Object.keys(f.books).sort(),[...names].sort()),'All five predeclared large cases and original manuscript required');
  for (const name of names) {
    const rel=f.books[name], row=json(read(rel)), priv=name===privateCase;
    const source=priv ? null : readLocal(root,fixture(name));
    check(row.case===name && row.sourceSha256===(priv?privateSource:digest(source)) &&
      row.sourceBytes===(priv?1659854:source.length),'Wrong case/source bytes: '+name);
    check(row.runId===runId && row.candidateSha256===state.candidateSha256 &&
      row.distTreeSha256===state.distTreeSha256,'Stale book run: '+name);
    verifyBook(row,physical);
    if (!priv) {
      const base=examples+'/book/'+name+'/';
      for (const [file,field] of [['dokumen.html','htmlSha256'],['buku.html','bookHtmlSha256'],['dokumen.pdf','pdfSha256']]) {
        const bytes=read(base+file);
        check(digest(bytes)===row[field],'Unbound or swapped product output: '+file);
        if (file.endsWith('.pdf')) {
          check(bytes.length===row.pdfBytes && bytes.subarray(0,5).toString()==='%PDF-' && bytes.subarray(-2048).includes('%%EOF'),'Truncated product PDF');
          if (physical) {
            const info=execFileSync('pdfinfo',[join(root,base+file)],{encoding:'utf8'});
            check(Number(info.match(/^Pages:\s+(\d+)/m)?.[1])===row.physical.pages,'Physical page count differs');
          }
        } else check(/<html\b/i.test(bytes.toString('utf8')),'Missing actual HTML');
      }
      if (physical) {
        const replay=json(python(root,'docs/verification-tools/verify-product-book.py',fixture(name),base+'dokumen.html',
          base+'buku.html',base+'dokumen.pdf',JSON.stringify(row.settings)));
        // Tool versions can differ in a clean environment. Compare measured content and geometry.
        for (const key of ['sourceSha256','pdfSha256','pages','expectedBodySha256','actualBodySha256','sourceBlocks',
          'confirmedTextBlocks','confirmedEmptyMarkers','sourceCells','confirmedHeadings','verifiedFooterPages',
          'resolvedTocLinks','endMatches','differences','negativeControls','pass']) {
          check(equal(replay[key],row.physical[key]),'Independent PDF replay disagrees: '+name+' / '+key);
        }
      }
    }
  }
}

function validateOffline(f,read,root,state) {
  const navigation=json(read(f.navigation)), trig=json(read(f.trig));
  check(trig.status==='PASS' && trig.distTree===state.distTreeSha256 && trig.input===state.trigSourceSha256 &&
    typeof trig.engine==='string' && trig.engine.length>0,'Stale or failed trigonometry download');
  const templates=['BUS-01','CON-01','EDT-01','EDU-01'];
  check(Array.isArray(trig.records) && equal(trig.records.map(r=>r.template).sort(),templates),'Four actual trig templates required');
  const html=[];
  for (const r of trig.records) {
    const file=examples+'/html/'+r.template+'.html', bytes=read(file), off=r.offline;
    check(digest(bytes)===r.sha256 && bytes.length===r.bytes && Array.isArray(r.externalRequests) &&
      !r.externalRequests.length && off?.count===231 && off.visibleMath===231 && off.mathml===231 &&
      off.scripts===0 && off.broken===0 && off.errorMarkers===0 && off.fontFaces>0 &&
      off.fontsLoaded===off.fontFaces && off.styled===true,'Trigonometry offline behavior or digest differs on '+r.template);
    html.push(file);
  }
  verifyGateDetails('G03',{html},read,root,state);
  check(Array.isArray(navigation) && navigation.length===new Set(navigation.map(r=>r.name)).size,'Missing/duplicate offline observations');
  for (const name of [...publicCases,'private-original']) {
    const r=navigation.find(x=>x.name===name);
    check(r && positive(r.sourceBlocks) && Number.isSafeInteger(r.anchors) && r.anchors>=0 &&
      r.valid===r.anchors && r.firstAnchorNavigates===true && r.selectionReadable===true && r.noScript===true &&
      Array.isArray(r.requests) && r.requests.length===0 && r.fonts?.length &&
      r.fonts.every(([family,status])=>family && status==='loaded') && r.lastBlockId,'Offline navigation, font, selection or network mismatch: '+name);
    needHash(r.sha256,'Offline '+name);
    if (name==='private-original') {
      const row=json(read(f.privateHtml));
      check(row.sourceSha256===privateSource && row.candidateSha256===state.candidateSha256 &&
        row.distTreeSha256===state.distTreeSha256 && row.htmlSha256===r.sha256 && r.sourceBlocks===31073,
        'Unbound private standalone HTML');
      const off=row.offline;
      check(off && off.expectedTextSha256===off.actualTextSha256 && off.expectedStructureSha256===off.actualStructureSha256,'Private HTML text/structure differs from source');
      needHash(off.expectedTextSha256,'Source text');needHash(off.expectedStructureSha256,'Source structure');
    } else {
      const file=f.html?.[name], bytes=read(file);
      check(digest(bytes)===r.sha256,'Changed large standalone HTML: '+name);
      python(root,'scripts/large-html-oracle.py','offline',fixture(name),file);
    }
  }
}

export function capacityControls(capacity,protocol,state) {
  verifyCapacity(capacity,protocol,state);
  const probes={
    failedLayout:r=>r.layoutStatus='failed',
    blockingIntegrity:r=>r.blocking=['CONTENT_INTEGRITY_FAILED'],
    browserError:r=>r.errors=['browser error'],
    missingProgress:r=>r.progressEvents=[],
    progressSummary:r=>r.firstProgressMs=r.firstProgressMs+1,
    rawProgress:r=>r.progressEvents[0].ms=protocol.capacity.firstProgressMs+1,
    unfinishedCancel:r=>r.printSessionAfterCancel={status:'running'},
    exceededMetric:r=>r.printReadyMs=protocol.capacity.printReadyMs+1,
    heapContradiction:r=>r.heapSamples[0].bytes=r.maximumSampledTargetHeapBytes+1
  };
  for (const [name,mutate] of Object.entries(probes)) {
    const copy=structuredClone(capacity);
    mutate(copy.rows[0].runs[0]);
    let reason;
    try {verifyCapacity(copy,protocol,state);} catch (error) {reason=error.message;}
    check(typeof reason==='string' && reason.length>0,'Capacity contradiction was accepted: '+name);
  }
}

export function isolatedFormulas(report) {
  const a=[{tex:'x-2',mode:'inline'},{tex:'a+7',mode:'display'}],b=[{tex:'z+9',mode:'inline'}];
  const expected=[['A','standalone',a],['B','print',b],['A','print',a],['B','standalone',b]];
  check(report.evictionKeys>=160 && equal(report.outputs?.map(r=>[r.document,r.route,r.formulas]),expected),
    'Interleaved A/B outputs disagree with literal source and modes');
  const trials=report.trials;
  check(trials?.length===18,'Missing independent corruption trials');
  for (const mutation of ['visual','mathml','annotation','provenance','tex','mode']) {
    for (const form of ['Document','Element','string']) {
      const found=trials.filter(r=>r.mutation===mutation && r.form===form);
      check(found.length===1 && found[0].accepted===false && found[0].beforeCount===2 &&
        found[0].afterCount===2,'Same-count mutation not rejected: '+mutation+' / '+form);
    }
  }
}

function validateLists(f,read,root,state) {
  const row=json(read(f.list));
  const source='fixtures/rc10/ordered-markers.md', oracle=json(readLocal(root,'fixtures/rc10/ordered-markers.json'));
  check(row.status==='PASS' && row.sourceSha256===digest(readLocal(root,source)) &&
    row.candidateSha256===state.candidateSha256 && row.distTreeSha256===state.distTreeSha256 && equal(row.expectedMarkers,oracle),
    'Stale or failed native-list evidence');
  for (const route of ['raw','clipboard']) {
    const base=evidence+'/ordered-lists/'+route+'/', measured=row.routes?.[route];
    check(measured?.status==='PASS' && measured.pages>0,'Missing ordered list route: '+route);
    if (route==='clipboard') check(measured.trustedCopy===true && measured.trustedPaste===true &&
      /^[a-f0-9]{64}$/.test(measured.clipboardBackupSha256),'Native clipboard operation or retained raw HTML missing');
    for (const [name,field] of [['standalone.html','htmlSha256'],['print-payload-body.html','payloadBodySha256'],['markers.pdf','pdfSha256']]) {
      const bytes=read(base+name);
      check(digest(bytes)===measured[field],'List artifact digest mismatch: '+name);
      if (name.endsWith('.html')) python(root,'scripts/large-html-oracle.py','list',source,base+name);
    }
    const text=execFileSync('pdftotext',['-layout','-enc','UTF-8',join(root,base+'markers.pdf'),'-'],{encoding:'utf8'});
    const labels=text.split(/[\r\n\f]+/).map(line=>line.trim().replace(/\s+/g,' ')).filter(line=>
      /^(?:[a-z]+|[A-Z]+|\d+)\.\s*/.test(line));
    check(equal(labels,oracle.map(([marker,label])=>[marker,label].filter(Boolean).join(' '))),
      'Physical list glyphs, values or order contradict the independent oracle: '+route+' '+JSON.stringify(labels));
  }
}

export function validateLargeFacts(id,facts,read,root,state,runId,origins) {
  const f=facts.files;
  check(f && typeof f==='object' && !Array.isArray(f),'Typed file roles required for '+id);
  const origin=(path,harness)=>check(origins?.get(path)?.has(harness),
    'Missing observation by '+harness+' for '+String(path));
  if (id==='U01' || id==='U04') for (const file of Object.values(f.books||{})) origin(file,'docs/verification-tools/capture-product-book.mjs');
  if (id==='U05') {
    origin(f.privateHtml,'docs/verification-tools/capture-product-book.mjs');
    origin(f.navigation,'docs/verification-tools/offline-navigation.mjs');
    origin(f.trig,evidence+'/browser/verify-trig.py');
  }
  if (id==='U02') {
    for (const file of [f.browser,f.large]) origin(file,'docs/verification-tools/cancel-stages.mjs');
    origin(f.control,'docs/verification-tools/client-timing.mjs');
  }
  if (id==='U03') {
    origin(f.browser,'docs/verification-tools/repair-browser.mjs');
    origin(f.control,'docs/verification-tools/verify-accounting.mjs');
  }
  if (id==='U06') {
    if (f.syntheticControl) origin(f.syntheticControl,'scripts/verify-capacity-control.mjs');
    else origin(f.capacity,'tests/e2e/perf-matrix.mjs');
  }
  if (id==='U07') origin(f.interleaved,'docs/verification-tools/interleaved.test.ts');
  if (id==='U08') origin(f.list,'tests/e2e/ordered-list-proof.mjs');
  switch(id) {
    case 'U01': case 'U04': return validateBooks(id==='U04',f,read,root,state,runId);
    case 'U02': return verifyResponsiveness(json(read(f.browser)),json(read(f.control)),json(read(f.large)),state,digest(readLocal(root,'fixtures/rc9/paragraphs-217850.md')));
    case 'U03': return verifyWork(json(read(f.browser)),json(read(f.control)),state);
    case 'U05': return validateOffline(f,read,root,state);
    case 'U06': {
      const doc=json(read(f.syntheticControl||f.capacity));
      if (f.syntheticControl) check(doc.schema===1 && doc.kind==='synthetic-positive-control-for-U06-only' && doc.runId===runId,
        'Missing current named synthetic U06 control');
      return capacityControls(f.syntheticControl?doc.capacity:doc,json(readLocal(root,'tests/bench/performance-protocol.json')),state);
    }
    case 'U07': return isolatedFormulas(json(read(f.interleaved)));
    case 'U08': return validateLists(f,read,root,state);
    default: throw Error('Unknown large-document gate: '+id);
  }
}
