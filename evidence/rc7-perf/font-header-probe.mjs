// Run from the candidate repository root under its locked Node.js version, after the BUS-01 example exists.
// This measures only the old/new WOFF2 header check on the actual bundled font bytes. GC and loading are untimed.
import { readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { assertWoff2 } from '../../src/render/woff2.ts';
const html=await readFile('examples/rc7/RC7_TRIGONOMETRI_BUS-01.html','utf8');
const matches=html.matchAll(/data:font\/woff2;base64,([A-Za-z0-9+/=]+)/g);
const fonts=Array.from(matches,m=>Buffer.from(m[1],'base64'));
if(fonts.length!==10)throw Error('Expected 10 real BUS-01 faces');
const baseline=bytes=>{
  if(bytes.length<12 || bytes[0]!==0x77 || bytes[1]!==0x4f || bytes[2]!==0x46 || bytes[3]!==0x32)throw Error('bukan WOFF2');
};
const runs=[];
const cases={rc6:baseline,rc7:assertWoff2};
const batch=1600;
for(let i=-3;i<32;i++){
  const row={};
  for(const id of (i%2?['rc7','rc6']:['rc6','rc7'])){
    const begin=performance.now();
    for(let j=0;j<batch;j++)for(const f of fonts)cases[id](f);
    row[id]=(performance.now()-begin)/batch;
  }
  if(i>=0)runs.push(row);
}
const summary={};
for(const id of ['rc6','rc7']){
  const times=runs.map(r=>r[id]).toSorted((a,b)=>a-b);
  summary[id]={medianMs:(times[15]+times[16])/2,p95Ms:times[30]};
}
const evidence={scope:'JS time for all ten WOFF2 headers per BUS-01 document; excludes font I/O, layout, hashing, GC attribution and PDF.',unit:'milliseconds per complete ten-font group',batch,fonts:fonts.map(f=>createHash('sha256').update(f).digest('hex')),runs,summary};
await writeFile('evidence/rc7-perf/font-header-profile.json',JSON.stringify(evidence,null,2)+'\n');
console.log(summary);
