// Run from candidate root with the earlier benchmarked tree supplied as the argument.
// Collect the exact esbuild inputs used by the Node harness, including the actual ?raw resources.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve, dirname, relative } from 'node:path';
import { build } from 'esbuild';
import { treeHash } from '../../scripts/fingerprint.mjs';
const prior=resolve(process.argv[2]), current=process.cwd();
const harness=await readFile(join(current,'tests/bench/rc7-worker.mjs'),'utf8');
const group=harness.match(/const modules = \{([\s\S]*?)\n\};/)[1];
const selection=[...group.matchAll(/'([^']+)': '([^']+)'/g)].map(m=>({entry:m[1],names:m[2]}));
const sha=buffer=>createHash('sha256').update(buffer).digest('hex');
async function receipt(repo) {
  const require=createRequire(join(repo,'package.json'));
  const code=selection.map(({entry,names})=>'export { '+names+' } from '+JSON.stringify(join(repo,entry))).join('\n');
  const result=await build({stdin:{contents:code,resolveDir:repo,loader:'ts'},absWorkingDir:repo,bundle:true,format:'esm',platform:'node',packages:'external',write:false,metafile:true,logLevel:'silent',
    plugins:[{name:'raw-bytes',setup(b){
      b.onResolve({filter:/\?raw$/},({path,importer})=>{const clean=path.slice(0,-4);return {path:clean.startsWith('.')?resolve(dirname(importer),clean):require.resolve(clean),namespace:'raw-bytes'};});
      b.onLoad({filter:/.*/,namespace:'raw-bytes'},async({path})=>({contents:await readFile(path,'utf8'),loader:'text'}));
    }}]});
  const files={};
  for(const id of Object.keys(result.metafile.inputs).sort()){
    if(id==='<stdin>')continue;
    const path=id.startsWith('raw-bytes:')?id.slice('raw-bytes:'.length):resolve(repo,id);
    let key=relative(repo,path);
    if(key.includes('node_modules/'))key='node_modules/'+key.split('node_modules/').at(-1);
    files[key]=sha(await readFile(path));
  }
  files['package-lock.json']=sha(await readFile(join(repo,'package-lock.json')));
  return {files,fingerprint:treeHash(['src','public','package.json','package-lock.json'],repo).sha256};
}
const a=await receipt(prior), b=await receipt(current);
const changed=Array.from(new Set([...Object.keys(a.files),...Object.keys(b.files)])).filter(key=>a.files[key]!==b.files[key]);
const original=JSON.parse(await readFile('evidence/rc7-perf/compare.json'));
const identityMatches=a.fingerprint===original.roots.rc7.fingerprint.sha256;
const report={method:'The historical staged source matches the fingerprint captured by the Node runner. Esbuild traces both trees from that runner’s identical exports. Locked external dependencies and internally bundled source/css/fixtures are compared by SHA-256.',schema:1,priorFingerprint:a.fingerprint,finalFingerprint:b.fingerprint,priorMatchesMeasuredTree:identityMatches,inputs:b.files,changed,pass:identityMatches&&!changed.length};
await writeFile('evidence/rc7-perf/node-source-equivalence.json',JSON.stringify(report,null,2)+'\n');
console.log('Equal inputs:',Object.keys(b.files).length,'; differences:',changed,'; pass:',report.pass);
if(!report.pass)process.exitCode=1;
