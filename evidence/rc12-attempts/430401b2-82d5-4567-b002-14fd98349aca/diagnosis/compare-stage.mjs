import {fork} from 'node:child_process';
import {join,resolve} from 'node:path';
import {readFileSync,writeFileSync} from 'node:fs';
import {once} from 'node:events';
const [folderA,folderB,destination,pairsArg='80']=process.argv.slice(2);
const roots=[resolve(folderA),resolve(folderB)],children=[],records=[];
const pairs=Number(pairsArg);
let id=0;
try {
  for (const root of roots) {
    const worker=fork(join(root,'tests/bench/diagnostic-empty-stage.mjs'),[join(root,'diagnostic-bundle.mjs'),join(root,'examples/reference-rc6/RUMUS TRIGONOMETRI 1.html')],{cwd:root,execArgv:['--expose-gc'],stdio:['ignore','inherit','inherit','ipc']});
    children.push(worker);
    const [ready]=await once(worker,'message');
    if(!ready.ready)throw Error('worker not ready');
  }
  for(let p=-5;p<pairs;p++){
    for(const label of Math.abs(p)%2?[0,1]:[1,0]){
      const child=children[label],job=++id;
      const reply=once(child,'message');
      child.send({id:job,task:'empty-core'});
      const [msg]=await reply;
      if(msg.id!==job||msg.error||msg.result.oracle.pass!==true)throw Error(msg.error??'invalid output');
      const {timings,oracle}=msg.result;
      records.push({pair:p,label,oracle:oracle.digest,html:msg.result.info.fullPreviewHtmlSha256,times:msg.result.times});
    }
    if(records.at(-1).oracle!==records.at(-2).oracle || records.at(-1).html!==records.at(-2).html)throw Error('Output mismatch');
  }
}finally{
  for(const child of children){child.kill();}
  writeFileSync(destination,JSON.stringify({purpose:'Diagnostic independent stage times for blank document, compared to the same RC12. This is outside official G09 observations.',pairs,roots:roots.map(p=>p.split('/').at(-1)),records},null,2)+'\n');
}
for(const k of ['refreshMs','snapshot','analyze','finish','integrity','prepare','compose']){
 const data=children.map((_,i)=>records.filter(r=>r.label===i&&r.pair>=0).map(r=>r.times[k]).sort((a,b)=>a-b));
 console.log(k,data.map(x=>({median:(x[(pairs>>1)-1]+x[pairs>>1])/2,p95:x[Math.ceil(.95*pairs)-1]})));
}
