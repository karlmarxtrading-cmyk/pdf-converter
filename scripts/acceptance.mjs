// Candidate-bound production acceptance. Run from the extracted project root.
import { createHash, randomUUID } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { candidateSha256, treeHash } from './fingerprint.mjs';
import { requireFact, requirements, validateChecks } from './acceptance-policy.mjs';
import { verifyGateDetails } from './acceptance-details.mjs';

import { acceptance as folder, evidence, examples, browserInputs, referenceInputs } from './release-paths.mjs';
import { largeIds, validateLargeFacts } from './large-policy.mjs';
const statuses = ['PASS','FAIL','BLOCKED','NOT_RUN'];
const hash = buf => createHash('sha256').update(buf).digest('hex');
const digestFile = f => hash(readFileSync(f));
const parseJson = f => JSON.parse(readFileSync(f, 'utf8'));
const iso = () => new Date().toISOString();
const validName = n => typeof n==='string' && /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,70}$/.test(n);
const observedName = n => `${folder}/observations/${n}.json`;

function put(file, data) {
  mkdirSync(dirname(file),{recursive:true});
  const temp=file+'.'+randomUUID()+'.tmp';
  writeFileSync(temp,JSON.stringify(data,null,2)+'\n');
  renameSync(temp,file);
}

function evidencePath(root, name) {
  requireFact(typeof name==='string' && !isAbsolute(name) && !name.includes('\\') && !name.includes(':') && !name.split('/').some(part=>!part || part==='..' || part==='.'), 'Invalid evidence path');
  requireFact(name.startsWith(evidence+'/') || name.startsWith(examples+'/'), 'Current release evidence path required: '+name);
  const file = join(root,name);
  requireFact(realpathSync(file)===file, 'Evidence path must not use a symbolic link: '+name);
  return file;
}

function readArtifact(root, name) {
  const file=evidencePath(root,name);
  requireFact(statSync(file).isFile(), 'Evidence must be a regular file');
  const data=readFileSync(file);
  requireFact(data.length>0, 'Empty evidence: '+name);
  return data;
}

function attachedHarness(root) {
  const inputs = new Set([...browserInputs,...referenceInputs]);
  const walk = (dir, include) => {
    for (const item of readdirSync(join(root,dir), {withFileTypes:true})) {
      const name=dir+'/'+item.name;
      if (item.isDirectory()) { if (item.name!=='__pycache__') walk(name,include); }
      else if (include(name)) {
        requireFact(item.isFile(), 'Non-regular harness input: '+name);
        inputs.add(name);
      }
    }
  };
  // Verification helpers can import sibling code and consume procedure/config files.
  walk('docs/verification-tools', () => true);
  walk(evidence, name => /\.(?:[cm]?js|py|sh|tsx?)$/i.test(name));
  const h=createHash('sha256');
  for (const name of [...inputs].sort()) {
    const file=join(root,name);
    requireFact(realpathSync(file)===file && statSync(file).isFile(), 'Missing/linked harness input: '+name);
    h.update(name+'\0'+digestFile(file)+'\n');
  }
  return h.digest('hex');
}

export function identity(root) {
  root=realpathSync(root);
  const raw=(paths)=>treeHash(paths,root).sha256;
  const actual={candidateSha256:candidateSha256(root),distTreeSha256:raw(['dist'])};
  const manifest=parseJson(join(root,'dist.build-manifest.json'));
  const pkg=parseJson(join(root,'package.json'));
  requireFact(manifest.app===pkg.name && manifest.profile==='production' && manifest.version===pkg.version && manifest.candidateSha256===actual.candidateSha256 && manifest.distTreeSha256===actual.distTreeSha256,'Stale build manifest: rebuild production from the frozen source');
  const lifecycle=parseJson(join(root,'tests/bench/performance-protocol.json')).officialBrowserLifecycle;
  const browserDriverSha256=digestFile(join(root,'docs/verification-tools/performance-browser-recovery.mjs'));
  const browserProcedureSha256=digestFile(join(root,'docs/verification-tools/browser-recovery-protocol.json'));
  requireFact(lifecycle?.driverSha256===browserDriverSha256 && lifecycle.procedureSha256===browserProcedureSha256,
    'Official browser lifecycle bytes differ from the frozen driver or procedure');
  return {...actual,version:manifest.version,browserDriverSha256,browserProcedureSha256,
    fixtureSha256:raw(['fixtures']),trigSourceSha256:digestFile(join(root,'fixtures/rc6/user-trigonometry.md')),attachedHarnessSha256:attachedHarness(root),benchmarkHarnessSha256:raw(['tests/bench','scripts/generate-stress.mjs','scripts/serve-dist.mjs','scripts/fingerprint.mjs','scripts/browser-path.mjs']),oracleSha256:digestFile(join(root,'fixtures/rc6/user-trigonometry.expected.json')),
    harnessSha256:raw(['scripts','tests']),settingsSha256:digestFile(join(root,'tests/bench/performance-protocol.json')),
    referenceHtmlSha256:digestFile(join(root,'examples/reference-rc6/RUMUS TRIGONOMETRI 1.html')),
    lockfileSha256:digestFile(join(root,'package-lock.json'))};
}

function machine() {
  return {platform:platform(),osRelease:release(),arch:arch(),cpu:cpus()[0]?.model || 'unknown',
    logicalCpuCount:cpus().length,node:process.version,nodeExecutableSha256:digestFile(process.execPath)};
}

function readStart(root, state) {
  const start=parseJson(join(root,folder,'start.json'));
  requireFact(start.schema===1 && typeof start.runId==='string' && Number.isFinite(Date.parse(start.at)) && isDeepStrictEqual(start.identity,state), 'Missing/stale acceptance run');
  return start;
}

function filesUnder(root,name,out) {
  const file=evidencePath(root,name);
  if (statSync(file).isFile()) {out.add(name);return;}
  for (const e of readdirSync(file,{withFileTypes:true})) {
    if (e.isDirectory() || e.isFile()) filesUnder(root,name+'/'+e.name,out);
    else throw Error('Unexpected file type in evidence directory: '+e.name);
  }
}

function executable(cmd) {
  const resolved=(isAbsolute(cmd) || cmd.includes('/') || cmd.includes('\\')) ? [resolve(cmd)] :
    (process.env.PATH||'').split(process.platform==='win32'?';':':').flatMap(p=>process.platform==='win32' ? [cmd,cmd+'.exe',cmd+'.cmd'].map(x=>join(p,x)) : [join(p,cmd)]);
  const match=resolved.find(x=>existsSync(x) && statSync(x).isFile());
  requireFact(match, 'Cannot identify command: '+cmd);
  return realpathSync(match);
}

function runCommand(root, name, outputs, command, start) {
  requireFact(validName(name) && command.length>0 && outputs.length>0,'observe NAME --out PATH [--out PATH] -- COMMAND ARGS...');
  const dir=join(root,folder,'observations');mkdirSync(dir,{recursive:true});
  requireFact(!existsSync(join(root,observedName(name))), 'Observation name already used; choose a distinct name to retain attempt history');
  const before=identity(root);
  requireFact(isDeepStrictEqual(start.identity,before),'Changed candidate before command');
  const started=iso();
  const logName=folder+'/observations/'+name+'.log', logFd=openSync(join(root,logName),'wx');
  const binary=executable(command[0]);
  const executableSha256=digestFile(binary);
  const commandFiles={},projectInputs={};
  for (const arg of command.slice(1)) {
    const path=resolve(root,arg);
    if (existsSync(path) && statSync(path).isFile()) {
      commandFiles[arg]=digestFile(path);
      const rel=relative(root,path).replaceAll('\\','/');
      if (!isAbsolute(rel) && !rel.startsWith('../') && !rel.startsWith('node_modules/')) projectInputs[rel]=commandFiles[arg];
    }
  }
  let proc;
  try {
    console.log('Measuring '+name+'; command log: '+logName);
    proc=spawnSync(binary,command.slice(1),{cwd:root,stdio:['ignore',logFd,logFd],env:process.env});
  } finally {closeSync(logFd);}
  const ended=iso(), after=identity(root), paths=new Set(), failures=[];
  for (const output of outputs) {
    requireFact(!output.startsWith(folder+'/observations') && !output.includes('/../') && output!==folder,'Cannot observe receipt storage as an output');
    if (existsSync(join(root,output))) filesUnder(root,output,paths);
    else failures.push('Missing output '+output);
  }
  const artifacts={};
  for (const p of paths) {
    const st=statSync(join(root,p));
    // Older diagnostics may share a folder. Only outputs written during this command are witnesses.
    if (st.mtimeMs+2 < Date.parse(started) || !st.size) continue;
    artifacts[p]=digestFile(join(root,p));
  }
  if (!Object.keys(artifacts).length) failures.push('No fresh nonempty output');
  if (!isDeepStrictEqual(before,after)) failures.push('Candidate changed during command');
  if (digestFile(binary)!==executableSha256 || Object.entries(commandFiles).some(([k,v])=>digestFile(resolve(root,k))!==v)) failures.push('Command bytes changed during measurement');
  const result={schema:1,runId:start.runId,name,before,after,started,ended,environment:machine(),command,
    executable:{name:basename(binary),sha256:executableSha256},commandFiles,projectInputs,log:logName,logSha256:digestFile(join(root,logName)),exitCode:proc.status,
    signal:proc.signal||null,failures,artifacts};
  if (proc.error) result.failures.push(proc.error.message);
  put(join(root,observedName(name)),result);
  return proc.status===0 && !failures.length ? 0 : 1;
}

function observationArtifacts(root, names, start) {
  requireFact(Array.isArray(names) && names.length>0 && new Set(names).size===names.length,'Missing or duplicate observations');
  const hashes={}, validArtifacts=new Map(), origins=new Map();
  for (const name of names) {
    requireFact(validName(name),'Invalid observation name');
    const path=observedName(name),bytes=readArtifact(root,path),o=JSON.parse(bytes);
    requireFact(o.schema===1 && o.name===name && o.runId===start.runId && isDeepStrictEqual(o.before,start.identity) && isDeepStrictEqual(o.after,start.identity), 'Stale or wrong observation: '+name);
    requireFact(o.exitCode===0 && o.signal===null && Array.isArray(o.failures) && !o.failures.length, 'Failed observation: '+name);
    requireFact(o.environment?.nodeExecutableSha256 && o.executable?.sha256 && Array.isArray(o.command) && o.command.length>0 && Date.parse(o.started)>=Date.parse(start.at) && Date.parse(o.ended)>=Date.parse(o.started), 'Malformed observation: '+name);
    requireFact(o.projectInputs && typeof o.projectInputs==='object','Missing harness input map');
    for (const [rel,sha] of Object.entries(o.projectInputs)) {
      requireFact(!isAbsolute(rel) && !rel.split(/[\\/]/).includes('..') && digestFile(join(root,rel))===sha,'Changed measurement input: '+rel);
    }
    // A quiet successful command may produce an empty log.
    requireFact(o.log===folder+'/observations/'+name+'.log' && digestFile(evidencePath(root,o.log))===o.logSha256,'Observation transcript changed: '+name);
    requireFact(o.artifacts && Object.keys(o.artifacts).length>0,'Missing observed artifact');
    for (const [p,sha] of Object.entries(o.artifacts)) {
      requireFact(/^[a-f0-9]{64}$/.test(sha) && (!validArtifacts.has(p) || validArtifacts.get(p)===sha),'Conflicting observed artifact: '+p);
      validArtifacts.set(p,sha);
      if (!origins.has(p)) origins.set(p,new Set());
      const [binary,main,...args]=o.command;
      const runtimeName=basename(binary.replaceAll('\\','/')).replace(/\.exe$/i,'');
      if (/^(node|nodejs|python[\d.]*)$/.test(runtimeName) && Object.hasOwn(o.projectInputs,main))
        origins.get(p).add(main);
      if (runtimeName==='node' && main==='node_modules/vitest/vitest.mjs' && args[0]==='run')
        for (const file of args.filter(arg=>arg.endsWith('.test.ts') && Object.hasOwn(o.projectInputs,arg))) origins.get(p).add(file);
    }
    hashes[name]=hash(bytes);
  }
  return {hashes,validArtifacts,origins};
}

function evaluateReceipt(root,id,r,start) {
  requireFact(r?.schema===1 && r.id===id && r.runId===start.runId && isDeepStrictEqual(r.identity,start.identity) && statuses.includes(r.status),'Missing/stale/malformed receipt: '+id);
  requireFact(Date.parse(r.at)>=Date.parse(start.at),'Receipt predates current run');
  if (r.status!=='PASS') {
    requireFact(typeof r.reason==='string' && r.reason.trim().length>0,'Reason required for '+r.status);
    return {id,status:r.status,reason:r.reason};
  }
  const factsBytes=readArtifact(root,r.facts);
  requireFact(hash(factsBytes)===r.factsSha256,'Changed facts: '+id);
  const facts=JSON.parse(factsBytes);
  const {hashes,validArtifacts,origins}=observationArtifacts(root,facts.observations,start);
  requireFact(isDeepStrictEqual(hashes,r.observationHashes),'Changed observation receipts: '+id);

  const read=p=>{
    requireFact(validArtifacts.has(p),'No receipt for artifact: '+p);
    const b=readArtifact(root,p);
    requireFact(hash(b)===validArtifacts.get(p),'Changed observed bytes: '+p); return b;
  };
  if (largeIds.includes(id)) {
    validateLargeFacts(id,facts,read,root,start.identity,start.runId,origins);
  } else {
    validateChecks(id,facts.checks,validArtifacts);
    for (const c of Object.values(facts.checks)) read(c.evidence);
    verifyGateDetails(id,facts,read,root,start.identity,origins,start.runId);
  }
  return {id,status:'PASS',facts:r.facts,observations:facts.observations};
}

export function verify(root, ids=Object.keys(requirements)) {
  const before=identity(root), start=readStart(root,before);
  const gates=ids.map(id=>{
    try {return evaluateReceipt(root,id,parseJson(join(root,folder,'receipts',id+'.json')),start);}
    catch(e){return {id,status:'FAIL',reason:e.message};}
  });
  requireFact(isDeepStrictEqual(before,identity(root)),'Candidate changed during verification');
  return {schema:1,runId:start.runId,identity:before,at:iso(),decision:gates.every(g=>g.status==='PASS')?'PRODUCTION_READY':'NO_GO',gates};
}

export function cli(root,args) {
  root=realpathSync(root);
  const [mode='verify',...tail]=args;
  const state=identity(root);
  if (mode==='start') {
    const path=join(root,folder,'start.json');
    requireFact(!existsSync(path),'A run already exists. Move its entire acceptance folder to historical storage before starting a fresh run.');
    const data={schema:1,runId:randomUUID(),at:iso(),identity:state,environment:machine()};put(path,data);console.log(JSON.stringify(data));return 0;
  }
  const start=readStart(root,state);
  if (mode==='observe') {
    const split=tail.indexOf('--');
    requireFact(split>=3,'observe NAME --out PATH -- COMMAND ...');
    const opts=tail.slice(1,split), outputs=[];
    for(let i=0;i<opts.length;i+=2){requireFact(opts[i]==='--out' && opts[i+1],'Expected --out PATH');outputs.push(opts[i+1]);}
    return runCommand(root,tail[0],outputs,tail.slice(split+1),start);
  }
  if (mode==='record') {
    const [id,status,arg,...rest]=tail;
    requireFact((Object.hasOwn(requirements,id) || largeIds.includes(id)) && statuses.includes(status),'record G01..G16 or U01..U08 PASS|FAIL|BLOCKED|NOT_RUN');
    const r={schema:1,runId:start.runId,identity:state,at:iso(),id,status};
    if(status==='PASS'){
      requireFact(rest.length===0,'record Gxx PASS facts.json');
      const data=readArtifact(root,arg), facts=JSON.parse(data);
      r.facts=arg;r.factsSha256=hash(data);
      r.observationHashes=observationArtifacts(root,facts.observations,start).hashes;
    }else{
      requireFact(arg==='--reason' && rest.length===1,'Non-passing status requires --reason TEXT');r.reason=rest[0];
    }
    const checked=evaluateReceipt(root,id,r,start);
    put(join(root,folder,'receipts',id+'.json'),r);
    console.log(JSON.stringify(checked));return 0;
  }
  requireFact(mode==='verify','Expected start, observe, record or verify');
  const decision=verify(root);
  if(tail.length){requireFact(tail.length===2 && tail[0]==='--out' && tail[1]===folder+'/decision.json','Use --out evidence/rc12/acceptance/decision.json');put(join(root,tail[1]),decision);}
  console.log(JSON.stringify(decision,null,2));return decision.decision==='PRODUCTION_READY'?0:1;
}

if (process.argv[1] && fileURLToPath(import.meta.url)===resolve(process.argv[1])) {
  try {process.exitCode=cli(process.cwd(),process.argv.slice(2));}
  catch(e){console.error('NO_GO: '+e.message);process.exitCode=1;}
}
