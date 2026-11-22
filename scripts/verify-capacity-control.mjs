// Synthetic contract exercise for U06 only. No latency, browser or heap
// measurement in this record is evidence of product performance or capacity.
import { readFileSync,mkdirSync,writeFileSync } from 'node:fs';
import { capacityControls } from './large-policy.mjs';
import { evidence,acceptance } from './release-paths.mjs';

const start=JSON.parse(readFileSync(acceptance+'/start.json')),state=start.identity;
const protocol=JSON.parse(readFileSync('tests/bench/performance-protocol.json'));
const candidate={candidateSha256:state.candidateSha256,distTreeSha256:state.distTreeSha256};
const binding={candidate,qa:candidate,protocol:state.settingsSha256};
const run={layoutWallMs:10,progressEvents:[{text:'start',ms:5}],layoutStatus:'done',errors:[],blocking:[],printSessionAfterCancel:null,
  pages:2,verification:'pass',previewMs:15,reeditPreviewMs:20,cancelToIdleMs:5,printReadyMs:60,firstProgressMs:5,maxProgressGapMs:5,
  cancelOutcome:'cancelled',maxEventLoopGapMs:{preview:10,layout:10,reedit:10},heapSamples:[{tMs:0,bytes:100},{tMs:200,bytes:110}],
  maximumSampledTargetHeapBytes:110,heapAfterGcBytes:100,closedProjectHeapAfterGcBytes:100,pdfBytes:200,timestamp:new Date().toISOString()};
const capacity={status:'PASS',before:binding,after:binding,protocol:protocol.capacity,
  rows:protocol.capacity.sections.map(sections=>({sections,closedProjectHeapDriftBytes:0,
    runs:Array.from({length:protocol.capacity.reps},(_,i)=>({...run,rep:i+1,sections}))}))};
capacityControls(capacity,protocol,state);
const folder=evidence+'/accounting';
mkdirSync(folder,{recursive:true});
writeFileSync(folder+'/capacity-validator-control.json',JSON.stringify({
  schema:1,kind:'synthetic-positive-control-for-U06-only',runId:start.runId,capacity
},null,2)+'\n');
