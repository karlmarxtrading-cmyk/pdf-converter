import {readFileSync,writeFileSync} from 'node:fs';
import {fork} from 'node:child_process';
import {resolve} from 'node:path';
const labels=process.argv.slice(2);if(labels.length!==2)throw Error('Two repo names required');
const children={},rows=[];
for(const name of labels){
 const c=fork(resolve('rc10/tests/bench/performance-worker.mjs'),[resolve('work10/perf/target-'+name+'.mjs'),resolve('rc10/examples/reference-rc6/RUMUS TRIGONOMETRI 1.html')],{cwd:resolve(name),execArgv:['--expose-gc'],stdio:['ignore','inherit','inherit','ipc']});
 children[name]=c;await new Promise(r=>c.once('message',r));
}
try{
 for(let round=-1;round<40;round++)for(const name of round%2?[...labels].reverse():labels){
  const c=children[name];const res=await new Promise(r=>{c.once('message',r);c.send({task:'small-edit',id:rows.length})});
  rows.push({name,round,times:res.result?.times,oracle:res.result?.oracle,error:res.error});
  writeFileSync('work10/perf/small-'+labels.join('-')+'.json',JSON.stringify(rows,null,2));
 }
}finally{for(const c of Object.values(children))c.kill();}
