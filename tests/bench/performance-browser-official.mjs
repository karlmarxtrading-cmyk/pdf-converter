// Candidate root, verified source/dist, two complementary cohorts (1 or 2).
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const protocol = JSON.parse(await readFile(new URL('./performance-protocol.json', import.meta.url), 'utf8'));
const policy = protocol.officialBrowserLifecycle;
const directory = new URL('../../docs/verification-tools/', import.meta.url);

async function verify(fileName, expected) {
  const file = new URL(fileName, directory);
  const actual = createHash('sha256').update(await readFile(file)).digest('hex');
  if (actual !== expected) throw new Error('Browser lifecycle input has changed: ' + fileName);
  return file;
}

const driver = await verify('performance-browser-recovery.mjs', policy.driverSha256);
await verify('browser-recovery-protocol.json', policy.procedureSha256);
await import(driver.href);
