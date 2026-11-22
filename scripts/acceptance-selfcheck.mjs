// Record the aggregate's own unit controls without passing them off as product tests.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const out='evidence/rc12/aggregate-tests';
mkdirSync(out,{recursive:true});
const proc=spawnSync(process.execPath,['--test','--test-reporter=tap','tests/scripts/release-acceptance.test.mjs','tests/scripts/large-acceptance.test.mjs','tests/scripts/trace-acceptance.test.mjs'],{encoding:'utf8',maxBuffer:5*1024*1024});
const transcript=(proc.stdout || '')+(proc.stderr || '');
writeFileSync(join(out,'test.log'),transcript);
const cases={
  positiveControl:'all sixteen complete synthetic controls yield exit 0',
  thresholdMutation:'p95 mutation rejects, but one slow sample alone does not',
  distMutation:'one modified production byte rejects before any receipt',
  formulaMutation:'operator mutation at constant formula count fails independent HTML oracle',
  missingReceipt:'missing receipt rejects promotion',
  staleReceipt:'old run ID rejects otherwise identical receipt',
  shortCohort:'short cohort rejects promotion',
  attachedInputs:'three attached input mutations invalidate sealed receipts and recording',
  reboundU:'U06 positive, fully rebound invalid raw capacity, stale run and aggregate after G FAIL',
  nativeBlocked:'native-save BLOCKED blocks production',
};
const checks={};
for(const [key,title] of Object.entries(cases)){
  checks[key]=transcript.split('\n').some(line=>/^\s*ok \d+ - /.test(line) && line.endsWith(title));
}
const result={schema:1,description:'Isolated synthetic controls for the release decision; no synthetic record authorizes production.',checks,exitCode:proc.status,pass:proc.status===0 && Object.values(checks).every(Boolean)};
writeFileSync(join(out,'results.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
if(!result.pass)process.exitCode=1;
