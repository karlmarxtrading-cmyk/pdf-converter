// Synthetic records exercise the acceptance mechanism, never product evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync,cpSync } from 'node:fs';
import { join,dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { PDFDocument } from 'pdf-lib';
import { largeIds,capacityControls,validateLargeFacts,isolatedFormulas,digest,privateSource } from '../../scripts/large-policy.mjs';
import { verifyBook } from '../../scripts/large-observations.mjs';
import { allGates } from '../../scripts/verify-all-gates.mjs';
import { evidence,examples } from '../../scripts/release-paths.mjs';

const d=digest(Buffer.from('unit control'));
const state={candidateSha256:d,distTreeSha256:d};
const success={
  schemaVersion:1,status:'PASS',route:'print-book',platform:'test',browser:'Chromium test',case:'original-default',toc:'default',settings:{toc:false},
  events:['import','editor-verified','standalone-request','standalone-downloaded','prepare-book','book-downloaded','product-print-requested',
    'product-document-bound','pdf-saved','offline-reopened','physical-reopened'].map((phase,elapsedMs)=>({phase,elapsedMs})),
  startedAt:'2026-01-01T00:00:00Z',finishedAt:'2026-01-01T00:00:02Z',sourceSha256:privateSource,sourceEditorSha256:privateSource,
  bookHtmlSha256:d,receiptSha256:d,printResponseSha256:d,htmlSha256:d,pdfSha256:d,savedPdfSha256:d,pdfBytes:300,
  pageErrorHashes:[],offline:{scripts:0,networkRequests:[],sourceBlocks:31073,anchors:0,valid:0,firstAnchorNavigates:true,
    selectionReadable:true,fonts:2,fontsLoaded:2,images:0,imagesLoaded:0,expectedTextSha256:d,actualTextSha256:d,expectedStructureSha256:d,actualStructureSha256:d},
  physical:{sourceSha256:privateSource,pdfBytes:300,pdfSha256:d,pass:true,pages:1,differences:[],endMatches:true,sourceBlocks:31073,
    visitedBlocks:31073,confirmedTextBlocks:30039,sourceTextBlocks:30039,confirmedEmptyMarkers:19,expectedEmptyMarkers:19,sourceTables:1,
    sourceRows:2,sourceCells:4,sourceHeadings:4,confirmedHeadings:4,expectedFooterPages:1,verifiedFooterPages:1,expectedTocLinks:0,
    resolvedTocLinks:0,expectedBodySha256:d,actualBodySha256:d,expectedBodyCharacters:120,actualBodyCharacters:120,expectedCoverPages:0,
    visibleEmptyMarkers:19,titleSettingMatchesSource:true,pdfDocumentTitleMatchesSource:true,actualCoverHeaders:0,targetSequenceMatches:true,standaloneTocMatchesSource:true,bookTocMatchesSource:true,
    geometry:{fontObjects:1,embeddedOrType3Fonts:1,footerFailures:[],headerFailures:[],unexpectedMediaBoxes:[],nulCharacters:0,
      replacementCharacters:0,outsideMediaBoxGlyphs:0,unpaintedTextLayerGlyphs:0,missingGlyphCodepoints:{},blankPages:[]},
    negativeControls:{validAccepted:true,addedTextRejected:true,missingEndRejected:true,changedCaseRejected:true,missingListMarkerRejected:true}}
};
function rebind(value,mutate) {
  const copy=structuredClone(value); mutate(copy);
  const bytes=Buffer.from(JSON.stringify(copy)), receipt={sha256:digest(bytes)};
  assert.equal(digest(bytes),receipt.sha256);return JSON.parse(bytes);
}
test('U01 and U04 reject failed one-shot, external assembly, partial and stale production artifacts with coherent hashes',()=>{
  for(const physical of [false,true]) {
    assert.doesNotThrow(()=>verifyBook(success,physical));
    for(const edit of [r=>r.status='FAIL',r=>r.route='standalone-corrected',r=>r.route='external-assembly',
      r=>r.events.splice(6,1),r=>r.pdfSha256=digest('other PDF'),r=>r.offline.actualStructureSha256=digest('added content')])
      assert.throws(()=>verifyBook(rebind(success,edit),physical));
  }
  for (const edit of [r=>r.physical.visitedBlocks--,r=>r.physical.confirmedEmptyMarkers--,r=>r.physical.geometry.unpaintedTextLayerGlyphs++,
    r=>r.physical.actualBodySha256=digest('extra'),r=>r.physical.verifiedFooterPages--,r=>r.physical.expectedTocLinks++])
    assert.throws(()=>verifyBook(rebind(success,edit),true));
});
test('one failed JSON cannot satisfy any of eight claimed PASS rows; aggregate always reports 24 dispositions',t=>{
  const root=mkdtempSync(join(tmpdir(),'pf-invalid-run-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const bad='one-shot.json', raw=Buffer.from(JSON.stringify({status:'FAIL',route:'external-assembly'}));
  const files=Object.fromEntries(['browser','control','large','list','interleaved','capacity','navigation','trig','privateHtml'].map(k=>[k,bad]));
  files.books={};files.html={};
  const provenance=new Map([[bad,new Set(['docs/verification-tools/capture-product-book.mjs','docs/verification-tools/cancel-stages.mjs',
    'docs/verification-tools/client-timing.mjs','docs/verification-tools/verify-accounting.mjs','docs/verification-tools/repair-browser.mjs',
    'docs/verification-tools/offline-navigation.mjs',evidence+'/browser/verify-trig.py','tests/e2e/perf-matrix.mjs',
    'docs/verification-tools/interleaved.test.ts','tests/e2e/ordered-list-proof.mjs'])]]);
  for (const id of largeIds) assert.throws(()=>validateLargeFacts(id,{files},()=>raw,process.cwd(),state,'run',provenance));
  const result=allGates(root);
  assert.equal(result.decision,'NO_GO');assert.equal(new Set(result.gates.map(r=>r.id)).size,24);
  assert.ok(result.gates.every(r=>r.status==='FAIL' && r.reason));
});
test('U06 positive capacity control, repeated observation and altered heap after coherently rebinding',()=>{
  const protocol=JSON.parse(readFileSync('tests/bench/performance-protocol.json'));
  const current={...state,settingsSha256:d},binding={candidate:state,qa:state,protocol:d};
  const run={layoutWallMs:10,progressEvents:[{text:'start',ms:5}],layoutStatus:'done',errors:[],blocking:[],printSessionAfterCancel:null,
    pages:2,verification:'pass',previewMs:15,reeditPreviewMs:20,cancelToIdleMs:5,printReadyMs:60,firstProgressMs:5,maxProgressGapMs:5,
    cancelOutcome:'cancelled',maxEventLoopGapMs:{preview:10,layout:10,reedit:10},heapSamples:[{tMs:0,bytes:100},{tMs:200,bytes:110}],
    maximumSampledTargetHeapBytes:110,heapAfterGcBytes:100,closedProjectHeapAfterGcBytes:100,pdfBytes:200,timestamp:new Date().toISOString()};
  const input={status:'PASS',before:binding,after:binding,protocol:protocol.capacity,
    rows:protocol.capacity.sections.map(sections=>({sections,closedProjectHeapDriftBytes:0,runs:Array.from({length:5},(_,i)=>({...run,rep:i+1,sections}))}))};
  capacityControls(input,protocol,current);
  for(const edit of [r=>r.rows[0].runs[3].rep=1,r=>r.rows[0].runs[0].heapSamples[1].bytes=990])
    assert.throws(()=>capacityControls(rebind(input,edit),protocol,current));
});
test('U07 independent A/B TeX, modes and eighteen same-count mutations',()=>{
  const ab=[[{tex:'x-2',mode:'inline'},{tex:'a+7',mode:'display'}],[{tex:'z+9',mode:'inline'}]];
  const outputs=[0,1,0,1].map((i,n)=>({document:i?'B':'A',route:n===0||n===3?'standalone':'print',formulas:ab[i]}));
  const trials=['visual','mathml','annotation','provenance','tex','mode'].flatMap(mutation=>['Document','Element','string']
    .map(form=>({mutation,form,beforeCount:2,afterCount:2,accepted:false})));
  const report={evictionKeys:160,outputs,trials};isolatedFormulas(report);
  for(const edit of [r=>r.outputs[1].formulas[0].tex='x+9',r=>r.trials[17].accepted=true,r=>r.trials.splice(0,1)])
    assert.throws(()=>isolatedFormulas(rebind(report,edit)));
});
test('U08 reopens physical ordered markers and both HTML routes; rebound empty PDF label and native paste discrepancy reject',async t=>{
  const root=mkdtempSync(join(tmpdir(),'pf-lists-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  for(const file of ['fixtures/rc10/ordered-markers.md','fixtures/rc10/ordered-markers.json','docs/verification-tools/text_boundaries.py','scripts/large-html-oracle.py']){
    mkdirSync(dirname(join(root,file)),{recursive:true});cpSync(file,join(root,file));
  }
  const expectedMarkers=JSON.parse(readFileSync('fixtures/rc10/ordered-markers.json')),
    raw=readFileSync('fixtures/rc10/ordered-markers.md'),html=Buffer.from('<html><article id="pf-content">'+raw+'</article></html>');
  async function makePdf(list) {
    const doc=await PDFDocument.create();
    for(let offset=0;offset<list.length;offset+=25) {
      const page=doc.addPage([600,700]);
      list.slice(offset,offset+25).forEach(([marker,label],i)=>page.drawText((marker+' '+label).trim(),{x:20,y:650-i*22,size:12}));
    }
    return Buffer.from(await doc.save());
  }
  const pdf=await makePdf(expectedMarkers),report={status:'PASS',...state,sourceSha256:digest(raw),expectedMarkers,routes:{}};
  const read=p=>readFileSync(join(root,p)), reportFile=evidence+'/ordered-lists/result.json';
  const validate=()=>validateLargeFacts('U08',{files:{list:reportFile}},read,root,state,'unit',new Map([[reportFile,new Set(['tests/e2e/ordered-list-proof.mjs'])]]));
  const save=()=>writeFileSync(join(root,reportFile),JSON.stringify(report));
  for(const route of ['raw','clipboard']){
    const dir=join(root,evidence,'ordered-lists',route);mkdirSync(dir,{recursive:true});
    for(const f of ['standalone.html','print-payload-body.html']) writeFileSync(join(dir,f),html);
    writeFileSync(join(dir,'markers.pdf'),pdf);
    report.routes[route]={status:'PASS',pages:1,htmlSha256:digest(html),payloadBodySha256:digest(html),pdfSha256:digest(pdf),
      trustedCopy:true,trustedPaste:true,clipboardBackupSha256:digest(raw)};
  }
  save();validate();report.routes.clipboard.trustedPaste=false;save();assert.throws(validate,/clipboard/);
  report.routes.clipboard.trustedPaste=true;
  const changed=await makePdf(expectedMarkers.filter(([,label])=>label));writeFileSync(join(root,evidence,'ordered-lists/clipboard/markers.pdf'),changed);
  report.routes.clipboard.pdfSha256=digest(changed);save();assert.throws(validate,/Physical list glyphs/);
});
test('U05 full offline control and same-digest rebound mutations of source text, requests and link counts',t=>{
  const root=mkdtempSync(join(tmpdir(),'pf-offline-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const write=(name,value)=>{mkdirSync(dirname(join(root,name)),{recursive:true});writeFileSync(join(root,name),typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value));};
  const read=name=>readFileSync(join(root,name));
  for(const name of ['docs/verification-tools/text_boundaries.py','scripts/large-html-oracle.py','scripts/verify-trigonometry.py','scripts/acceptance-formulas.py',
    'fixtures/rc6/user-trigonometry.expected.json','examples/reference-rc6/RUMUS TRIGONOMETRI 1.html']) write(name,readFileSync(name));
  write('package.json',{version:'0.0.0-test'});
  const ref=read('examples/reference-rc6/RUMUS TRIGONOMETRI 1.html').toString();
  for(const [,base64] of ref.matchAll(/data:font\/woff2;base64,([A-Za-z0-9+/=]+)/g)) {
    const bytes=Buffer.from(base64,'base64');write('dist/assets/'+digest(bytes)+'.woff2',bytes);
  }
  const files={navigation:'navigation',trig:'trig',privateHtml:'private',html:{}};
  const trig={status:'PASS',distTree:d,input:d,engine:'Chromium',records:[]};
  for(const template of ['BUS-01','EDU-01','EDT-01','CON-01']){
    const file=examples+'/html/'+template+'.html';
    write(file,ref.replace('PaperForma 3.0.0-rc.6 (BUS-01','PaperForma 0.0.0-test ('+template)
      .replace('data-template="BUS-01"','data-template="'+template+'"'));
    const bytes=read(file);trig.records.push({template,sha256:digest(bytes),bytes:bytes.length,externalRequests:[],
      offline:{count:231,visibleMath:231,mathml:231,scripts:0,broken:0,errorMarkers:0,fontFaces:10,fontsLoaded:10,styled:true}});
  }
  write('trig',trig);
  const nav=[];
  for(const name of ['headings-on','long-table-off','paragraphs-off','paragraphs-on','single-paragraph-off','private-original']){
    const isPrivate=name==='private-original';
    if(!isPrivate){
      const raw='# Heading\n\nDocument text.\n'; write('fixtures/rc9/'+name.slice(0,name.lastIndexOf('-'))+'-217850.md',raw);
      files.html[name]=examples+'/'+name+'.html';write(files.html[name],'<html><article><h1 data-block-id="a">Heading</h1><p data-block-id="b">Document text.</p></article></html>');
    }
    nav.push({name,sha256:isPrivate?d:digest(read(files.html[name])),sourceBlocks:isPrivate?31073:2,anchors:0,valid:0,firstAnchorNavigates:true,
      selectionReadable:true,noScript:true,requests:[],fonts:[['Test','loaded']],lastBlockId:'b'});
  }
  write('navigation',nav);write('private',{sourceSha256:privateSource,...state,htmlSha256:d,offline:success.offline});
  const origins=new Map([['private',new Set(['docs/verification-tools/capture-product-book.mjs'])],
    ['navigation',new Set(['docs/verification-tools/offline-navigation.mjs'])],['trig',new Set([evidence+'/browser/verify-trig.py'])]]);
  const verify=()=>validateLargeFacts('U05',{files},read,root,{...state,trigSourceSha256:d},'synthetic',origins);
  verify();
  for (const edit of [n=>n[0].requests.push('font'),n=>n[0].anchors++]) {
    write('navigation',rebind(nav,edit));assert.throws(verify,/navigation/);
  }
  const altered=files.html['headings-on'];write(altered,read(altered).toString().replace('Document text.','Document text.X'));
  nav[0].sha256=digest(read(altered));write('navigation',nav);assert.throws(verify,/Offline text\/order differs/);
});
