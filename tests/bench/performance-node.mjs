// Run from the candidate root: node tests/bench/performance-node.mjs ../rc6 1
import { fork } from 'node:child_process';
import { realpath,mkdtemp,mkdir,rm } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import { outputDir,bindings,environment,protocol,atomic,load,summarize } from './performance-binding.mjs';
const baseline=await realpath(resolve(process.argv[2])),cohort=Number(process.argv[3]),calibrate=process.argv[3]==='calibrate',diagnose=process.argv[3]==='diagnose',pilot=calibrate||diagnose;
if(!pilot&&![1,2].includes(cohort))throw Error('Expected cohort 1/2 or calibrate');
const root=process.cwd(),dest=pilot?resolve(diagnose?'diagnostic-node.json':'../work8/perf-calibrate-node.json'):join(outputDir,'node-'+cohort+'.json');
const temp=await mkdtemp(join(root,'.benchmark-')),children={};await mkdir(outputDir,{recursive:true});
const out={schema:1,runId:crypto.randomUUID(),pid:process.pid,cohort,before:bindings(baseline,root,calibrate),environment:environment(),protocol,runs:[],status:'RUNNING'};
let sequence=0;
try{
  for(const label of ['rc6','candidate']){
    const child=fork(join(root,'tests/bench/performance-worker.mjs'),[join(temp,label+'.mjs'),join(root,'examples/reference-rc6/RUMUS TRIGONOMETRI 1.html')],{cwd:label==='rc6'||calibrate?baseline:root,stdio:['ignore','inherit','inherit','ipc'],execArgv:['--expose-gc']});
    children[label]=child; await new Promise((ok,fail)=>{child.once('message',m=>m.ready?ok():fail(Error('Startup')));child.once('exit',c=>fail(Error('Startup exit '+c)));child.once('error',fail);});
  }
  for(const task of Object.keys(protocol.nodeFlows).filter(t=>!pilot||!process.argv[4]||t===process.argv[4])){
    for(let round=-1;round<(pilot?1:protocol.pairs);round++){
      const order=(round+(cohort===2?1:0))%2?['candidate','rc6']:['rc6','candidate'];
      for(const label of order){
        let row;const child=children[label],at=load(),id=++sequence;
        try{row=await new Promise((ok,fail)=>{
          const onExit=c=>{child.off('message',onReply);fail(Error('Worker exit '+c));};
          const onReply=msg=>{child.off('exit',onExit);if(msg.id!==id||msg.error)fail(Error(msg.error??'Mismatched response'));else ok(msg.result);};
          child.once('exit',onExit);child.once('message',onReply);child.send({id,task});
        });}catch(e){row={times:{},oracle:{pass:false},error:String(e.message)};}
        out.runs.push({task,round,label,...row,timestamp:at.at,load:at.loadavg});atomic(dest,out);
        if(row.error)throw Error(JSON.stringify(row));
      }
      if(round%5===0)console.log(task,round);
    }
  }
  out.after=bindings(baseline,root,calibrate);if(JSON.stringify(out.before)!==JSON.stringify(out.after))throw Error('Candidate changed during measurement');
  Object.assign(out,summarize(out,protocol.nodeFlows));if(pilot)out.status=calibrate?'CALIBRATED':'DIAGNOSTIC_COMPLETE';
}catch(e){out.status='FAIL';out.error=String(e.stack);console.error(out.error);}
finally{for(const child of Object.values(children))child.kill();await rm(temp,{recursive:true,force:true});atomic(dest,out);}
if(!['PASS','CALIBRATED','DIAGNOSTIC_COMPLETE'].includes(out.status))process.exitCode=1;
