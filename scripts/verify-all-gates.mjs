import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verify } from './acceptance.mjs';
import { requirements } from './acceptance-policy.mjs';
import { verifyLarge } from './verify-large-release.mjs';
import { largeIds } from './large-policy.mjs';
import { acceptance } from './release-paths.mjs';

export function allGates(root) {
  const gates=[], runs=[];
  for (const [ids,inspect] of [[Object.keys(requirements),verify],[largeIds,verifyLarge]]) {
    try {
      const report=inspect(root);
      runs.push({id:report.runId,identity:report.identity});
      gates.push(...report.gates);
    } catch (error) {
      gates.push(...ids.map(id=>({id,status:'FAIL',reason:error.message})));
    }
  }
  const shared=runs.length===2 && runs[0].id===runs[1].id &&
    JSON.stringify(runs[0].identity)===JSON.stringify(runs[1].identity);
  if (runs.length===2 && !shared) {
    for (const gate of gates) { gate.status='FAIL';gate.reason='Acceptance identity changed between panels'; }
  }
  return {schema:1,at:new Date().toISOString(),runId:runs[0]?.id??null,identity:runs[0]?.identity??null,
    decision:shared && gates.every(g=>g.status==='PASS')?'PRODUCTION_READY':'NO_GO',gates};
}

if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const result=allGates(process.cwd());
  const file=resolve(acceptance,'all-gates.json'), temp=file+'.'+randomUUID()+'.tmp';
  mkdirSync(dirname(file),{recursive:true});
  writeFileSync(temp,JSON.stringify(result,null,2)+'\n');renameSync(temp,file);
  console.log(JSON.stringify(result,null,2));process.exitCode=result.decision==='PRODUCTION_READY'?0:1;
}
