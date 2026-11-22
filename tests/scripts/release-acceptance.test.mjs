// These records exist only inside a temporary synthetic project. They test the
// decision mechanism; they cannot serve as PDF, hosting or production receipts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import { allGates } from '../../scripts/verify-all-gates.mjs';
import { attachments } from '../../scripts/external-artifacts.mjs';
import { referenceInputs } from '../../scripts/release-paths.mjs';
import { treeHash } from '../../scripts/fingerprint.mjs';
import { baseline, requirements, evaluatePairs, validateBrowserBlocks } from '../../scripts/acceptance-policy.mjs';

const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const sha=b=>createHash('sha256').update(b).digest('hex');
const script=join(repo,'scripts/acceptance.mjs');
const e='evidence/rc12/synthetic';
const a='evidence/rc12/acceptance';

function series(flows,cohort) {
  const runs=[];
  for(const [task,metrics] of Object.entries(flows)){
    for(let round=-1;round<40;round++){
      const first=((round+cohort-1)%2===0)?'rc6':'candidate';
      for(const label of [first,first==='rc6'?'candidate':'rc6']){
        const times=Object.fromEntries(metrics.map(m=>[m,10]));
        runs.push({task,round,label,times,timestamp:new Date().toISOString(),load:[1,1,1],oracle:{pass:true,digest:sha(task)}});
      }
    }
  }
  return runs;
}

// Independent construction of the scheduled rows in the immutable browser driver.
function browserSeries(flows,cohort) {
  const runs=[];
  for (const [task,metrics] of Object.entries(flows)) {
    for (let block=0;block<10;block++) {
      const rounds=[-1-block*100,...[0,1,2,3].map(j=>block*4+j)];
      for(const round of rounds){
        const order=(round+cohort-1)%2===0?['rc6','candidate']:['candidate','rc6'];
        for(const label of order) runs.push({task,label,round,block,warmup:round<0,
          times:Object.fromEntries(metrics.map(m=>[m,10])),timestamp:new Date().toISOString(),
          load:[1,1,1],oracle:{pass:true,digest:sha(task)}});
      }
    }
  }
  return runs;
}

test('one synthetic release, real files and processes, mutation rejection', async t=>{
  const root=mkdtempSync(join(tmpdir(),'pf-aggregate-control-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const file=p=>join(root,p);
  const write=(p,v)=>{mkdirSync(dirname(file(p)),{recursive:true});writeFileSync(file(p),typeof v==='string'||Buffer.isBuffer(v)?v:JSON.stringify(v));};
  const json=p=>JSON.parse(readFileSync(file(p)));
  const copy=name=>{mkdirSync(dirname(file(name)),{recursive:true});cpSync(join(repo,name),file(name),{recursive:true});};
  const invoke=(...args)=>spawnSync(process.execPath,[script,...args],{cwd:root,encoding:'utf8',timeout:120000});
  const success=(...cmd)=>{const p=invoke(...cmd);assert.equal(p.status,0,p.stderr || p.stdout);return p;};
  for(const path of ['scripts/acceptance-formulas.py','scripts/verify-trigonometry.py','fixtures/rc6','examples/reference-rc6','tests/bench/performance-protocol.json','docs/verification-tools/browser-recovery-protocol.json','docs/verification-tools/performance-browser-recovery.mjs'])copy(path);
  for (const name of ['clipboard-source.html','mixed-formula.html','diagram.md']) copy('evidence/rc12/browser/'+name);
  for (const name of referenceInputs) copy(name);
  write('tests/e2e/perf-matrix.mjs', "import{copyFileSync}from'node:fs';copyFileSync('inputs-for-synthetic-control/capacity.json','evidence/rc12/synthetic/u-capacity.json');");
  // Tiny fixture executables establish expected process provenance inside this isolated synthetic root.
  const adapters=['external-acceptance','verify-http','verify-deployment-math','preview-export'];
  for(const name of adapters) write('scripts/'+name+'.mjs', "import{cpSync}from'node:fs';cpSync(process.argv[2],process.argv[3],{recursive:true});");
  // A control suite should also work before an application build exists.
  const ref=readFileSync(file('examples/reference-rc6/RUMUS TRIGONOMETRI 1.html'),'utf8');
  for (const [,b64] of ref.matchAll(/data:font\/woff2;base64,([A-Za-z0-9+/=]+)/g)) {
    const bytes=Buffer.from(b64,'base64');write('dist/assets/'+sha(bytes)+'.woff2',bytes);
  }
  write('package.json',{name:'synthetic-test-only',version:'0.0.0-test-control'});write('package-lock.json','{}');
  write('dist/index.html','Synthetic acceptance test fixture');write('src/fixture.txt','synthetic');
  const candidateSha256=treeHash(['package.json','package-lock.json','src','scripts','tests','fixtures'],root).sha256;
  const distTreeSha256=treeHash(['dist'],root).sha256;
  const state={candidateSha256,distTreeSha256};
  write('dist.build-manifest.json',{...state,profile:'production',version:'0.0.0-test-control',app:'synthetic-test-only'});
  const protocol=json('tests/bench/performance-protocol.json');
  const start=JSON.parse(success('start').stdout);
  const out='inputs-for-synthetic-control';
  write(out+'/generic.json',{label:'SYNTHETIC UNIT TEST ONLY'});
  write(out+'/aggregate.json',{schema:1,pass:true,exitCode:0,checks:Object.fromEntries(requirements.G11.map(k=>[k,true]))});
  const wrapped={...Object.fromEntries(requirements.G04.map(k=>[k,true])),cases:['raw','clipboard'].map(route=>({route,name:'section',words:'KEEP-INDEPENDENT-CONTENT',expected:'KEEP-INDEPENDENT-CONTENT',tex:['x'],expectedTex:['x'],structure:[true],pass:true}))};
  write(out+'/wrapper.json',wrapped);
  const keys=['emptyFormula','visual','mathML','annotation','mathMLToken','visualMinus','canonical','raw','mode','equationOrder','htmlAndPrint','fallback','rootText','untrackedNode','foreignId','duplicateId','nestedId','order','spoofedDecoration','spoofedTOC','digit','cell','link','codeWhitespace','generatedControls','cssAndFonts','mutatedArticle'];
  const routes=Object.fromEntries(['standalone','zip','publication','print'].flatMap(k=>['emptyFormula','untrackedNode'].map(x=>[x+k,true])));
  write(out+'/pdf-coverage.json',Object.fromEntries([...requirements.G07,...requirements.G08].map(k=>[k,true])));
  write(out+'/integrity.json',{cases:{...Object.fromEntries(keys.map(k=>[k,true])),routes}});
  for(const [kind,flows] of Object.entries({browser:protocol.browserFlows,node:protocol.nodeFlows})){
    for(const cohort of [1,2]){
      const measured=start.identity;
      const pair={rc6:baseline,candidate:state,fixture:measured.trigSourceSha256,oracle:measured.oracleSha256,acceptedReference:measured.referenceHtmlSha256,settings:measured.settingsSha256,harness:measured.benchmarkHarnessSha256};
      const lifecycle=kind==='browser' ? {revision:'fixed-block-lifecycle/1',incidents:[],driverSha256:measured.browserDriverSha256,procedureSha256:measured.browserProcedureSha256,recovery:json('docs/verification-tools/browser-recovery-protocol.json')} : {};
      write(out+'/'+kind+cohort+'.json',{schema:1,runId:randomUUID(),pid:cohort,environment:{nodeExecutableSha256:sha('test node'),browserExecutableSha256:sha('test browser')},protocol,cohort,status:'PASS',before:pair,after:pair,...lifecycle,runs:kind==='browser'?browserSeries(flows,cohort):series(flows,cohort)});
    }
  }
  const samples={layoutWallMs:10,progressEvents:[{text:'start',ms:5}],layoutStatus:'done',errors:[],blocking:[],printSessionAfterCancel:null,pages:12,verification:'pass',previewMs:15,reeditPreviewMs:20,cancelToIdleMs:5,printReadyMs:60,firstProgressMs:5,maxProgressGapMs:5,cancelOutcome:'cancelled',maxEventLoopGapMs:{preview:10,layout:10,reedit:10},heapSamples:[{tMs:0,bytes:100},{tMs:200,bytes:110}],maximumSampledTargetHeapBytes:110,heapAfterGcBytes:100,closedProjectHeapAfterGcBytes:100,pdfBytes:200,timestamp:new Date().toISOString()};
  const capIdentity={candidate:state,qa:state,protocol:start.identity.settingsSha256};
  write(out+'/capacity.json',{status:'PASS',before:capIdentity,after:capIdentity,protocol:protocol.capacity,rows:protocol.capacity.sections.map(sections=>({sections,closedProjectHeapDriftBytes:0,runs:Array.from({length:5},(_,i)=>({...samples,rep:i+1,sections}))}))});
  const templates=['BUS-01','EDU-01','EDT-01','CON-01'];
  for(const template of templates)write(out+'/'+template+'.html',ref.replace('PaperForma 3.0.0-rc.6 (BUS-01','PaperForma 0.0.0-test-control ('+template).replace('data-template="BUS-01"','data-template="'+template+'"'));
  const pdf=await PDFDocument.create();pdf.addPage().drawText('SYNTHETIC ACCEPTANCE TEST');
  write(out+'/native.pdf',Buffer.from(await pdf.save()));
  const extract=spawnSync('pdftotext',['-layout',file(out+'/native.pdf'),'-']);
  assert.equal(extract.status,0);
  for(const gate of Object.keys(attachments)){
    const prefix=out+'/operator/'+gate;
    for(const name of attachments[gate])write(prefix+'/'+name,'synthetic-only '+name);
    write(prefix+'/operator.json',{gate,...state,runId:start.runId,artifacts:Object.fromEntries(attachments[gate].map(name=>[name,sha('synthetic-only '+name)]))});
  }
  const measuredReport={...state,url:'https://synthetic.test',pass:true};
  write(out+'/http/http.json',{...measuredReport,tool:'scripts/verify-http.mjs',results:[{pass:true}],filesCompared:1,expectedFiles:1});
  write(out+'/math/report.json',{...measuredReport,tool:'scripts/verify-deployment-math.mjs'});
  write(out+'/export/download.html','synthetic-download');write(out+'/export/print.pdf','synthetic-print');
  write(out+'/export/report.json',{...measuredReport,tool:'scripts/preview-export.mjs',htmlSha256:sha('synthetic-download'),pdfSha256:sha('synthetic-print')});
  const groups=['operator','http','math','export'];
  for(const [index,group] of groups.entries()){
    success('observe','synthetic-'+group,'--out',e+'/'+group,'--',process.execPath,'scripts/'+adapters[index]+'.mjs',out+'/'+group,e+'/'+group);
  }
  success('observe','synthetic','--out',e,'--',process.execPath,'-e',
    "const fs=require('node:fs');fs.cpSync('inputs-for-synthetic-control','evidence/rc12/synthetic',{recursive:true});console.log('synthetic test fixture only')");
  const obs=a+'/observations/synthetic.json';
  const extras={
    G03:{html:templates.map(x=>e+'/'+x+'.html')},G07:{pdfs:[e+'/native.pdf']},G08:{pdfs:[e+'/native.pdf']},
    G09:{browser:[1,2].map(x=>e+'/browser'+x+'.json'),node:[1,2].map(x=>e+'/node'+x+'.json')},
    G10:{capacity:e+'/capacity.json'},G13:{method:'native-browser-save-dialog',cancelObserved:true,retryObserved:true,platform:'synthetic',browser:'synthetic',pdf:e+'/native.pdf',pages:1,extractedTextSha256:sha(extract.stdout)},
    G15:{url:'https://synthetic.test',httpReport:e+'/http/http.json',mathReport:e+'/math/report.json',exportReport:e+'/export/report.json'},G16:{previewUrl:'https://synthetic.test',rollbackId:'synthetic',authorizationRef:'synthetic-test-only'},
  };
  const names=Object.keys(requirements);
  for(const id of names){
    const f={checks:Object.fromEntries(requirements[id].map(k=>[k,{pass:true,evidence:e+'/generic.json'}])),observations:['synthetic'],...extras[id]};
    if(Object.hasOwn(attachments,id)){
      f.operatorReport=e+'/operator/'+id+'/operator.json';f.observations.push('synthetic-operator');
      if(id==='G15')f.observations.push('synthetic-http','synthetic-math','synthetic-export');
    }
    if(['G07','G08'].includes(id)) for(const c of Object.values(f.checks)) c.evidence=e+'/pdf-coverage.json';
    if(id==='G11') for(const c of Object.values(f.checks)) c.evidence=e+'/aggregate.json';
    if(id==='G04') for(const c of Object.values(f.checks)) c.evidence=e+'/wrapper.json';
    if(['G05','G06'].includes(id)) for(const c of Object.values(f.checks)) c.evidence=e+'/integrity.json';
    write(e+'/'+id+'.json',f);success('record',id,'PASS',e+'/'+id+'.json');
  }
  const pathFor=id=>a+'/receipts/'+id+'.json';
  // Simulate an observer that really did produce modified output. Re-bind the
  // altered bytes and receipt hashes, so semantic failures cannot be explained
  // solely by a stale top-level checksum.
  function amendObserved(p,transform) {
    const changed=transform(readFileSync(file(p)));write(p,changed);
    const o=json(obs);o.artifacts[p]=sha(readFileSync(file(p)));write(obs,o);
    for(const id of names){const r=json(pathFor(id));r.observationHashes.synthetic=sha(readFileSync(file(obs)));write(pathFor(id),r);}
  }
  const originals=new Map();
  for (const path of [obs,...names.map(pathFor),e+'/browser1.json',e+'/capacity.json',e+'/BUS-01.html',e+'/generic.json','dist/index.html','docs/verification-tools/performance-browser-recovery.mjs','docs/verification-tools/browser-recovery-protocol.json']) originals.set(path,readFileSync(file(path)));
  const restore=()=>{for(const [p,bytes] of originals)write(p,bytes);};
  const rejected=id=>{
    const p=invoke('verify');assert.equal(p.status,1,p.stdout);const d=JSON.parse(p.stdout);assert.equal(d.decision,'NO_GO');
    assert.notEqual(d.gates.find(g=>g.id===id).status,'PASS');
  };
  await t.test('all sixteen complete synthetic controls yield exit 0',()=>{assert.equal(JSON.parse(success('verify').stdout).decision,'PRODUCTION_READY');});
  await t.test('three attached input mutations invalidate sealed receipts and recording',()=>{
  for (const name of ['clipboard-source.html','mixed-formula.html','diagram.md']) {
    const fixture='evidence/rc12/browser/'+name, bytes=readFileSync(file(fixture));
    write(fixture,Buffer.concat([bytes,Buffer.from(' ')]));
    const stale=invoke('verify');
    assert.notEqual(stale.status,0); assert.match(stale.stderr,/stale acceptance run/i);
    assert.notEqual(invoke('record','G01','PASS',e+'/G01.json').status,0);
    write(fixture,bytes);
  }
  });
  await t.test('U06 positive, fully rebound invalid raw capacity, stale run and aggregate after G FAIL',()=>{
    const ufile=e+'/u-capacity.json', fact=e+'/U06.json', upath=a+'/receipts/U06.json', opath=a+'/observations/unit-capacity.json';
    success('observe','unit-capacity','--out',ufile,'--',process.execPath,'tests/e2e/perf-matrix.mjs');
    write(fact,{observations:['unit-capacity'],files:{capacity:ufile}});
    success('record','U06','PASS',fact);
    let rows=allGates(root).gates;assert.equal(rows.length,24);assert.equal(rows.find(r=>r.id==='U06').status,'PASS');
    const originalReceipt=json(upath), stale={...originalReceipt,runId:randomUUID()};write(upath,stale);
    assert.match(allGates(root).gates.find(r=>r.id==='U06').reason,/stale/i);write(upath,originalReceipt);
    const changed=json(ufile);changed.rows[0].runs[0].errors=['real browser error'];write(ufile,changed);
    const observation=json(opath);observation.artifacts[ufile]=sha(readFileSync(file(ufile)));write(opath,observation);
    const receipt=json(upath);receipt.observationHashes['unit-capacity']=sha(readFileSync(file(opath)));write(upath,receipt);
    success('record','G01','FAIL','--reason','Synthetic G failure for aggregation');
    rows=allGates(root).gates;assert.equal(rows.length,24);assert.equal(rows.find(r=>r.id==='G01').status,'FAIL');
    assert.match(rows.find(r=>r.id==='U06').reason,/Layout, integrity or browser/);
    assert.notEqual(invoke('record','U06','PASS',fact).status,0);
    restore();
  });
  await t.test('six capacity contradictions fail after receipt rebinding and at record time',()=>{
    for(const delta of [{layoutStatus:'failed'},{blocking:['integrity']},{errors:['browser']},{progressEvents:[]},
      {progressEvents:[{text:'first',ms:7000}]},{printSessionAfterCancel:{status:'running'}}]){
      amendObserved(e+'/capacity.json',raw=>{const d=JSON.parse(raw);Object.assign(d.rows[0].runs[0],delta);return d;});
      rejected('G10');
      assert.notEqual(invoke('record','G10','PASS',e+'/G10.json').status,0);
      restore();
    }
  });
  await t.test('median mutation rejects promotion even with coherent byte hashes',()=>{
    amendObserved(e+'/browser1.json',raw=>{const d=JSON.parse(raw);for(const r of d.runs.filter(x=>x.round>=0 && x.task==='trig' && x.label==='candidate'))r.times.previewMs=10.6;return d;});rejected('G09');restore();
  });
  await t.test('p95 mutation rejects, but one slow sample alone does not',()=>{
    const change=(n)=>amendObserved(e+'/browser1.json',raw=>{const d=JSON.parse(raw);const rs=d.runs.filter(x=>x.round>=0 && x.task==='trig' && x.label==='candidate').slice(0,n);for(const r of rs)r.times.htmlExportMs=12;return d;});
    change(1);success('verify');restore();change(3);rejected('G09');restore();
  });
  await t.test('one modified production byte rejects before any receipt',()=>{
    write('dist/index.html','Synthetic acceptance test fixturE');const p=invoke('verify');assert.equal(p.status,1);assert.match(p.stderr,/Stale build manifest/);restore();
  });
  await t.test('operator mutation at constant formula count fails independent HTML oracle',()=>{
    amendObserved(e+'/BUS-01.html',raw=>{const s=raw.toString('utf8'), changed=s.replace('<mo>=</mo>','<mo>−</mo>');assert.notEqual(s,changed);return changed;});rejected('G03');restore();
  });
  await t.test('missing receipt rejects promotion',()=>{rmSync(file(pathFor('G14')));assert.ok(!existsSync(file(pathFor('G14'))));rejected('G14');restore();});
  await t.test('old run ID rejects otherwise identical receipt',()=>{const r=json(pathFor('G08'));r.runId=start.runId+'-old';write(pathFor('G08'),r);rejected('G08');restore();});
  await t.test('short cohort rejects promotion',()=>{
    amendObserved(e+'/browser1.json',raw=>{const d=JSON.parse(raw);d.runs=d.runs.filter(x=>x.task!=='long' || x.round!==39);return d;});rejected('G09');restore();
  });
  await t.test('changed immutable browser driver or procedure rejects before any receipt',()=>{
    for (const path of ['docs/verification-tools/performance-browser-recovery.mjs','docs/verification-tools/browser-recovery-protocol.json']) {
      write(path,readFileSync(file(path),'utf8')+'\n');const p=invoke('verify');assert.equal(p.status,1);assert.match(p.stderr,/lifecycle bytes differ/);restore();
    }
  });
  await t.test('forged driver identity and dropped failed block reject even after rebinding evidence',()=>{
    amendObserved(e+'/browser1.json',raw=>{const d=JSON.parse(raw);d.driverSha256=sha('other driver');return d;});rejected('G09');restore();
    amendObserved(e+'/browser1.json',raw=>{const d=JSON.parse(raw);d.incidents=[{event:'targetError'}];return d;});rejected('G09');restore();
    amendObserved(e+'/browser1.json',raw=>{const d=JSON.parse(raw);d.recovery.cdpTimeoutMs=123;return d;});rejected('G09');restore();
    amendObserved(e+'/browser1.json',raw=>{const d=JSON.parse(raw);d.environment.browserExecutableSha256=sha('changed browser');return d;});rejected('G09');restore();
    amendObserved(e+'/browser1.json',raw=>{const d=JSON.parse(raw);const rows=d.runs.filter(x=>x.block===4 && x.warmup && x.task==='trig');rows.forEach(r=>{r.round=-301;r.block=3;});return d;});rejected('G09');restore();
  });
  await t.test('native-save BLOCKED blocks production',()=>{success('record','G13','BLOCKED','--reason','Synthetic missing native dialog');rejected('G13');restore();});
  await t.test('failed check, altered evidence and missing observations each reject',()=>{
    write(e+'/generic.json','changed');rejected('G01');restore();
    const r=json(pathFor('G04'));r.schema=0;write(pathFor('G04'),r);rejected('G04');restore();
    rmSync(file(obs));rejected('G05');restore();
  });
});

test('wrong AB order, missing warmup, or mismatched same-count formula oracle cannot pass',()=>{
  const flows={trig:['previewMs']};
  const data=()=>series(flows,1);
  let r=data();[r[2],r[3]]=[r[3],r[2]];
  assert.throws(()=>evaluatePairs(r,flows.trig,1,'trig'),/order/);
  r=data().filter(x=>x.round>=0);assert.throws(()=>evaluatePairs(r,flows.trig,1,'trig'),/warmup/);
  r=data();r[3].oracle.digest=sha('operator changed');assert.throws(()=>evaluatePairs(r,flows.trig,1,'trig'),/inequivalent/);
});


test('each flow requires ten consecutive four-pair blocks with paired, equivalent warmups',()=>{
  const protocol=JSON.parse(readFileSync(join(repo,'tests/bench/performance-protocol.json')));
  const metrics=protocol.browserFlows.trig;
  for(const cohort of [1,2]){
    const sample=()=>browserSeries({trig:metrics},cohort);
    const verify=rows=>validateBrowserBlocks(rows,metrics,cohort,'trig',protocol);
    assert.doesNotThrow(()=>verify(sample()));
    const sequences=[
      rows=>rows.filter(r=>!(r.block===5 && r.warmup && r.label==='candidate')),
      rows=>{rows[30].warmup=false;return rows;},
      rows=>{rows[30].block=9;return rows;},
      rows=>{rows[31].oracle.digest=sha('mutated warmup operator');return rows;},
      rows=>{[rows[42],rows[43]]=[rows[43],rows[42]];return rows;},
      rows=>{rows[52].error='timeout';return rows;},
      rows=>{rows[72].times.previewMs=0;return rows;},
    ];
    for(const mutate of sequences)assert.throws(()=>verify(mutate(sample())));
  }
});
