import {fork} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const local=dirname(fileURLToPath(import.meta.url)),root=resolve(local,'../..'),[label='before',candidate='rc9f',repeats='2']=process.argv.slice(2);
const src=readFileSync(resolve(root,'rc10/tests/bench/performance-worker.mjs'),'utf8').replace("'./performance-oracle.mjs'",JSON.stringify(resolve(root,'rc10/tests/bench/performance-oracle.mjs'))).replace("'../../scripts/generate-stress.mjs'",JSON.stringify(resolve(root,'rc10/scripts/generate-stress.mjs'))).replace('let doc = await clock', 'let doc = await clock');
writeFileSync(resolve(local,'pilot-worker.mjs'),src);
const entries=[];
for(const [side,repo] of [['baseline','rc6'],['candidate',candidate]]){
  const child=fork(resolve(local,'pilot-worker.mjs'),[resolve(local,label+'-'+side+'.mjs'),resolve(root,'rc10/examples/reference-rc6/RUMUS TRIGONOMETRI 1.html')],{cwd:resolve(root,repo),execArgv:['--expose-gc'],stdio:['ignore','inherit','inherit','ipc']});
  const wait=()=>new Promise((yes,no)=>{child.once('message',yes);child.once('error',no)});
  await wait();
  for(let j=0;j<Number(repeats);j++)for(const task of ['small-edit','empty-core','trigonometry']){
    const pending=wait();child.send({id:entries.length,task});const out=await pending;
    if(out.error)throw Error(out.error);
    entries.push({side,repo,task,round:j,times:out.result.times,digest:out.result.oracle.digest});writeFileSync(resolve(local,label+'.json'),JSON.stringify(entries,null,2));
    console.log(label,side,j,task,JSON.stringify(out.result.times));
  }child.kill();
}
