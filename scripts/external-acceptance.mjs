// Observe external acceptance from the target's public test files. Nothing here performs a rollback.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { identity, cli as acceptanceCli } from './acceptance.mjs';
import { requireHttpsPreview, requirements } from './acceptance-policy.mjs';
import { acceptance, evidence } from './release-paths.mjs';
import { candidateInputs, root } from './fingerprint.mjs';

const script = 'scripts/external-acceptance.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = path => JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''));
const write = (path,value) => writeFileSync(path,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const requiredText = (value,label) => {assert.ok(typeof value==='string' && value.trim().length>0, 'Missing '+label);return value;};
import { attachments } from './external-artifacts.mjs';
const defaults = {
  G12:{provider:'',copyMethod:'',browserMimeTypes:[]}, G13:{originalPdfASha256:'',nativeActions:[]}, G14:{screenReader:''},
  G15:{url:'',deploymentId:'',branch:'',sourceCommit:'',deploymentCommit:'',evidenceCommit:''},
  G16:{previewUrl:'',productionUrl:'',fromDeployment:'',rollbackId:'',restoredDeployment:'',expectedRestoredIndexSha256:'',
    actualRestoredIndexSha256:'',rollbackAuthorizationRef:'',authorizationRef:''}
};
function numberedFacts(session) {
  for (const key of requirements[session.gate]) requiredText(session.notes?.[key], 'observed result for '+key);
}
export function assertSession(s,start) {
  assert.ok(Object.hasOwn(attachments,s.gate),'Unknown external gate');
  for(const key of ['candidateSha256','distTreeSha256']) assert.equal(s[key],start.identity[key],'Wrong '+key);
  assert.equal(s.runId,start.runId,'Wrong runId');
  const time=Date.parse(s.observedAt);
  assert.ok(time>=Date.parse(start.at) && time<=Date.now()+300000,'Measurement is outside this run');
  requiredText(s.operator,'operator identifier');requiredText(s.platform,'platform');requiredText(s.browser,'browser/version');
  if(['G12','G13','G14'].includes(s.gate)) assert.match(s.platform,/Windows/i,'Windows target required');
  if(s.gate==='G13') {
    assert.match(s.originalPdfASha256||'',/^[a-f0-9]{64}$/,'Record first PDF hash before Retry');
    assert.deepEqual(s.nativeActions?.map(row=>row.action),['Save A','Cancel','Retry and save B']);
    let time=Date.parse(start.at);
    for(const step of s.nativeActions){const at=Date.parse(step.at);assert.ok(at>=time && at<=Date.parse(s.observedAt));time=at;requiredText(step.observed,'native dialog observation');}
  }
  if(s.gate==='G14') requiredText(s.screenReader,'screen reader/version');
  numberedFacts(s);
}

// Header IDs may be safely remapped by the sanitizer; compare the referenced cells by position.
export function tablesFromArticle(article) {
  return [...article.querySelectorAll('table')].map(table=>{
    const rows=[...table.rows];
    const locations=new Map(rows.flatMap((row,i)=>[...row.cells].filter(cell=>cell.id).map(cell=>[cell.id,[i,cell.cellIndex]])));
    return {caption:table.caption?.textContent??null, rows:rows.map(row=>[...row.cells].map(cell=>{
      const content=cell.cloneNode(true);
      for(const formula of content.querySelectorAll('.pf-math')){
        formula.replaceWith(formula.ownerDocument.createTextNode(formula.getAttribute('data-tex')));
      }
      for(const br of content.querySelectorAll('br'))br.replaceWith(br.ownerDocument.createTextNode('\n'));
      return { tag:cell.tagName,scope:cell.getAttribute('scope'),text:content.textContent,
        rowSpan:cell.rowSpan,colSpan:cell.colSpan,headers:cell.headers.split(/\s+/).filter(Boolean).map(id=>{
          assert.ok(locations.has(id),'Missing associated table header');return locations.get(id);
        }) };
    }))};
  });
}
function verifyClipboard(files,session) {
  requiredText(session.provider,'provider');requiredText(session.copyMethod,'copy method');
  assert.ok(['text/html','text/plain'].every(x=>session.browserMimeTypes.includes(x)),'Browser must offer both MIME types');
  const capture=JSON.parse(files['capture.json']);
  for(const key of ['runId','candidateSha256','distTreeSha256']) assert.equal(capture[key],session[key]);
  assert.equal(capture.method,'Windows Forms IDataObject, without format auto-conversion');
  assert.ok(['HTML Format','UnicodeText'].every(x=>capture.nativeFormats.includes(x)));
  for(const key of ['htmlTextUtf8Sha256','plainTextUtf8Sha256']) assert.match(capture[key],/^[a-f0-9]{64}$/);
  assert.ok(Date.parse(capture.recordedUtc)>=Date.parse(json(join(root,acceptance,'start.json')).at) && Date.parse(capture.recordedUtc)<=Date.parse(session.observedAt));
  const readable=new JSDOM(files['clipboard.html'].toString()).window.document.body.textContent;
  const plain=files['clipboard.txt'].toString();
  const dom=new JSDOM(files['download.html'].toString()).window.document;
  const article=dom.querySelector('article');assert.ok(article);assert.equal(dom.scripts.length,0);
  const oracle=JSON.parse(files['oracle.json']); // entered from the original provider response before comparing the export
  for(const key of ['formulas','tables','orderedProse']) assert.ok(Array.isArray(oracle[key]) && oracle[key].length,'Empty original '+key);
  assert.deepEqual([...article.querySelectorAll('.pf-math')].map(el=>({tex:el.dataset.tex,display:!!el.querySelector('.katex-display')})),oracle.formulas);
  for(const mode of [true,false]) assert.ok(oracle.formulas.some(item=>item.display===mode),'Both original math modes required');
  assert.deepEqual(tablesFromArticle(article),oracle.tables);
  assert.equal(article.querySelectorAll('br').length,oracle.breaks);
  assert.equal(article.querySelectorAll('li').length,oracle.listItems);
  for(const text of [article.textContent,readable,plain]){
    let end=0;
    for(const part of oracle.orderedProse){requiredText(part,'original prose');const at=text.indexOf(part,end);assert.ok(at>=0,'Missing original prose');end=at+part.length;}
  }
}
function verifyPdf(files,s,folder){
  const metadata={};
  for (const revision of ['A','B']){
    const name='saved-'+revision+'.pdf', data=files[name];
    assert.equal(data.subarray(0,5).toString(),'%PDF-');assert.ok(data.subarray(-2048).includes('%%EOF'));
    const path=join(folder,name);
    const text=execFileSync('pdftotext',['-layout',path,'-']);
    const info=execFileSync('pdfinfo',[path],{encoding:'utf8'});
    const pages=Number(/^Pages:\s+(\d+)/m.exec(info)?.[1]);assert.ok(pages>0);
    for (const marker of ['PF-MULAI-31415','ALFA','BETA','akhir kode','PF-AKHIR-92653']) assert.ok(text.includes(marker),marker);
    assert.equal(text.includes('REVISION-B'),revision==='B');
    metadata[revision]={sha256:sha(data),textSha256:sha(text),pages};
  }
  assert.notEqual(metadata.A.sha256,metadata.B.sha256);
  assert.equal(s.originalPdfASha256,metadata.A.sha256,'Earlier output A changed after Retry');
  return metadata;
}
export function verifyHostingSession(meta,buildLog,provider) {
  requireHttpsPreview(meta.url);
  for(const k of ['branch','deploymentId']) requiredText(meta[k],k);
  assert.notEqual(meta.branch,'main');
  for(const k of ['sourceCommit','deploymentCommit']) assert.match(meta[k],/^[0-9a-f]{40}$/,k);
  if(meta.evidenceCommit) assert.match(meta.evidenceCommit,/^[0-9a-f]{40}$/);
  const matches=[...buildLog.matchAll(/PAPERFORMA_PAGES_BUILD (\{[^\r\n]*\})/g)].map(m=>JSON.parse(m[1]));
  assert.ok(matches.some(r=>r.mode==='preview' && r.commit===meta.deploymentCommit && r.branch===meta.branch &&
    r.url===new URL(meta.url).origin && r.candidateSha256===meta.candidateSha256 && r.distTreeSha256===meta.distTreeSha256),
    'No matching genuine preview build record');
  const host=new URL(meta.url);
  assert.equal(host.href,host.origin+'/','Use the immutable deployment origin');
  assert.match(host.hostname,/^[a-z0-9-]+\.[a-z0-9-]+\.pages\.dev$/,'Use the immutable Pages deployment URL');
  assert.equal(provider.environment,'preview');
  assert.equal(provider.id,meta.deploymentId);
  assert.equal(new URL(provider.url).origin,host.origin);
  assert.equal(provider.project_name,host.hostname.split('.')[1]);
  assert.equal(provider.deployment_trigger?.metadata?.branch,meta.branch);
  assert.equal(provider.deployment_trigger?.metadata?.commit_hash,meta.deploymentCommit);
  assert.equal(meta.evidenceCommit || meta.sourceCommit,meta.deploymentCommit);
}
function checkRollback(s) {
  requireHttpsPreview(s.previewUrl); requireHttpsPreview(s.productionUrl);
  assert.notEqual(new URL(s.previewUrl).origin,new URL(s.productionUrl).origin);
  for(const key of ['fromDeployment','rollbackId','restoredDeployment','authorizationRef','rollbackAuthorizationRef']) requiredText(s[key],key);
  assert.notEqual(s.fromDeployment,s.rollbackId);assert.equal(s.rollbackId,s.restoredDeployment);
  assert.match(s.expectedRestoredIndexSha256,/^[a-f0-9]{64}$/);assert.equal(s.expectedRestoredIndexSha256,s.actualRestoredIndexSha256);
}
function ingest(gate,source,dest,start) {
  const session=json(join(source,'operator.json'));assert.equal(session.gate,gate);assertSession(session,start);
  const folder=join(root,dest);mkdirSync(folder,{recursive:true});const files={};
  for(const name of attachments[gate]){
    const path=join(source,name);
    assert.ok(lstatSync(path).isFile() && realpathSync(path)===path,'Expected regular reviewed file '+name);
    const bytes=readFileSync(path);assert.ok(bytes.length>0,'Empty '+name);
    files[name]=bytes;writeFileSync(join(folder,name),bytes,{flag:'wx'});
  }
  let pdf=null;
  if(gate==='G12') verifyClipboard(files,session);
  if(gate==='G13') pdf=verifyPdf(files,session,folder);
  if(gate==='G14') assert.equal(files['roundtrip.pfproj'].subarray(0,2).toString(),'PK');
  if(gate==='G15'){
    verifyHostingSession(session,files['pages-build.log'].toString(),JSON.parse(files['pages-deployment.json']));
    if(session.sourceCommit!==session.deploymentCommit){
      execFileSync('git',['merge-base','--is-ancestor',session.sourceCommit,session.deploymentCommit],{cwd:root});
      execFileSync('git',['diff','--quiet',session.sourceCommit,session.deploymentCommit,'--',...candidateInputs,'docs/verification-tools'],{cwd:root});
    }
  }
  if(gate==='G16'){
    checkRollback(session);
    assert.equal(sha(files['restored-index.html']),session.expectedRestoredIndexSha256);
    const exported=new JSDOM(files['restored-export.html'].toString()).window.document;
    assert.equal(exported.scripts.length,0);
    assert.ok(exported.querySelector('article')?.textContent.includes('PF-AKHIR-92653'));
  }
  write(join(folder,'operator.json'),{...session,verifiedPdf:pdf,artifacts:Object.fromEntries(Object.entries(files).map(([key,value])=>[key,sha(value)]))});
}
function main(){
  const [mode,gate,userDirectory,output]=process.argv.slice(2);
  assert.ok(['init','collect','ingest'].includes(mode) && Object.hasOwn(attachments,gate) && userDirectory,
    'Usage: node scripts/external-acceptance.mjs init|collect G12|G13|G14|G15|G16 <public-test-folder>');
  const input=resolve(userDirectory);
  const start=json(join(root,acceptance,'start.json'));
  assert.deepEqual(start.identity,identity(root));
  if(mode==='init'){
    assert.ok(!existsSync(input),'Choose an unused folder');
    mkdirSync(input,{recursive:true});
    write(join(input,'operator.json'),{gate,runId:start.runId,candidateSha256:start.identity.candidateSha256,distTreeSha256:start.identity.distTreeSha256,
      operator:'',observedAt:'',platform:'',browser:'',...defaults[gate],notes:Object.fromEntries(requirements[gate].map(k=>[k,'']))});
    if(gate==='G12') write(join(input,'oracle.json'),{formulas:[],tables:[],orderedProse:[],breaks:null,listItems:null});
    console.log('Attach reviewed public test files: '+attachments[gate].join(', '));return;
  }
  if(mode==='ingest') {
    assert.match(output,new RegExp('^'+evidence+'/external/g1[2-6]-[a-f0-9-]+/device(?:-[0-9]+)?$'));
    ingest(gate,realpathSync(input),output,start);return;
  }
  const tag=gate.toLowerCase()+'-'+randomUUID(), dest=evidence+'/external/'+tag;
  const measurements=[];
  function measure(name,path,command){
    const obs=tag+'-'+name;
    const rc=acceptanceCli(root,['observe',obs,'--out',path,'--',process.execPath,...command]);
    assert.equal(rc,0,'Failed measurement. The attempt is retained: '+obs);measurements.push(obs);
  }
  const operator=dest+'/device';
  measure('operator',operator,[script,'ingest',gate,input,operator]);
  const operatorReports=[operator+'/operator.json'];
  if (gate==='G12') for(const [index,source] of process.argv.slice(5).entries()){
    const path=dest+'/device-'+(index+2);
    measure('operator-'+(index+2),path,[script,'ingest',gate,resolve(source),path]);
    operatorReports.push(path+'/operator.json');
  }
  const info=json(join(root,operator,'operator.json'));
  const checks=Object.fromEntries(requirements[gate].map(k=>[k,{pass:true,evidence:operator+'/operator.json'}]));
  const facts={checks,observations:measurements,operatorReport:operator+'/operator.json',operatorReports};
  if(gate==='G13') Object.assign(facts,{method:'native-browser-save-dialog',cancelObserved:true,retryObserved:true,platform:info.platform,browser:info.browser,
    pdf:operator+'/saved-B.pdf',pages:info.verifiedPdf.B.pages,extractedTextSha256:info.verifiedPdf.B.textSha256});
  if(gate==='G16') Object.assign(facts,{previewUrl:info.previewUrl,rollbackId:info.rollbackId,authorizationRef:info.authorizationRef});
  if(gate==='G15'){
    const http=dest+'/http.json', math=dest+'/math', exported=dest+'/export';
    measure('http',http,['scripts/verify-http.mjs',info.url,'dist',http]);
    measure('math',math,['scripts/verify-deployment-math.mjs',info.url,math]);
    measure('export',exported,['scripts/preview-export.mjs',info.url,exported]);
    for(const k of ['files','mimeCspCache'])checks[k].evidence=http;
    for(const k of ['workersFonts','printRoute','exportOnHost'])checks[k].evidence=exported+'/results.json';
    checks.sourceIdentity.evidence=math+'/results.json';
    Object.assign(facts,{url:info.url,httpReport:http,exportReport:exported+'/results.json',mathReport:math+'/results.json'});
  }
  const factPath=dest+'/facts.json';write(join(root,factPath),facts);
  const rc=acceptanceCli(root,['record',gate,'PASS',factPath]); assert.equal(rc,0);
}
if(fileURLToPath(import.meta.url)===resolve(process.argv[1]||'.')){
  try{main();}catch(error){console.error(error.message);process.exitCode=1;}
}
