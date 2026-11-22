import {readFileSync,writeFileSync} from 'node:fs';
import {fork} from 'node:child_process';
import {resolve} from 'node:path';
const [repo='rc10',name='a-detail']=process.argv.slice(2);
let s=readFileSync('rc10/tests/bench/performance-worker.mjs','utf8').replace("'./performance-oracle.mjs'",JSON.stringify(resolve('rc10/tests/bench/performance-oracle.mjs'))).replace("'../../scripts/generate-stress.mjs'",JSON.stringify(resolve('rc10/scripts/generate-stress.mjs')));
s=s.replace('async function refresh() {','let ix=0;async function refresh() {const measures={};const tag=k=>{measures[k]=performance.now()-prev;prev=performance.now();};let prev=performance.now();')
 .replace('const analysis = await m.analyze', "tag('snapshot');const analysis = await m.analyze")
 .replace('const body = m.finishRender', "tag('analyze');const body = m.finishRender")
 .replace('if (!m.checkRenderIntegrity', "tag('finishRender');if (!m.checkRenderIntegrity")
 .replace('const prepared = await m.prepareBody', "tag('integrity');const prepared = await m.prepareBody")
 .replace('const page = await m.composeDocument', "tag('prepareBody');const page = await m.composeDocument")
 .replace('return { snapshot, body, phase:', "tag('compose');times[++ix===2?'editedDetails':'firstDetails']=measures;return { snapshot, body, phase:");
const path=resolve('work10/perf/detail-worker.mjs');writeFileSync(path,s);const rows=[];
const c=fork(path,[resolve('work10/perf/detail-'+repo+'.mjs'),resolve('rc10/examples/reference-rc6/RUMUS TRIGONOMETRI 1.html')],{cwd:resolve(repo),execArgv:['--expose-gc'],stdio:['ignore','inherit','inherit','ipc']});
try{
await new Promise(r=>c.once('message',r));
for(let round=-1;round<40;round++){
 const task='small-edit';const res=await new Promise(r=>{c.once('message',r);c.send({task,id:round})});
 rows.push({round,times:res.result?.times,oracle:res.result?.oracle,error:res.error});
 writeFileSync('work10/perf/'+name+'.json',JSON.stringify(rows,null,2));
}
}finally{c.kill();}
