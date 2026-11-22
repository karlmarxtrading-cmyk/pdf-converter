import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { verify } from './acceptance.mjs';
import { largeIds } from './large-policy.mjs';

export function verifyLarge(root) { return verify(root, largeIds); }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result=verifyLarge(process.cwd());
    console.log(JSON.stringify(result,null,2));
    process.exitCode=result.decision==='PRODUCTION_READY' ? 0 : 1;
  } catch (error) { console.error('NO_GO',error.message); process.exitCode=1; }
}
