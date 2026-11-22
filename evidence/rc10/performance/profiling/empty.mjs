import {fork} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=process.cwd(),test='rc10/tests/bench/performance-worker.mjs',children={},rows=[];
for(const side of ['rc6','rc10']){
 const child=fork(resolve(test),[resolve('work10/perf/empty-'+side+'.mjs'),resolve('rc10/examples/reference-rc6/RUMUS TRIGONOMETRI 1.html')],{cwd:resolve(side),execArgv:['--expose-gc'],stdio:['ignore','inherit','inherit','ipc']});
 children[side]=child;await new Promise(r=>child.once('message',r));
}
try{for(let i=-1;i<20;i++)for(const side of i%2?['rc10','rc6']:['rc6','rc10']){
 const child=children[side],task='empty-core';const msg=await new Promise(ok=>{child.once('message',ok);child.send({id:rows.length,task});});
 rows.push({i,side,times:msg.result?.times,oracle:msg.result?.oracle,error:msg.error});writeFileSync('work10/perf/empty-diagnostic.json',JSON.stringify(rows,null,2));
}}finally{for(const c of Object.values(children))c.kill();}
