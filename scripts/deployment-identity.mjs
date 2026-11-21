import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { candidateSha256, treeHash } from './fingerprint.mjs';

/** Bind the evidence to the production build, including stale builds of the same version. */
export function deploymentIdentity(dist, pkg) {
  const manifest = JSON.parse(readFileSync(dist + '.build-manifest.json', 'utf8'));
  const candidate = candidateSha256();
  const output = treeHash([basename(dist)], dirname(dist)).sha256;
  if (manifest.profile !== 'production' || manifest.app !== pkg.name || manifest.version !== pkg.version ||
      manifest.candidateSha256 !== candidate || manifest.distTreeSha256 !== output) {
    throw Error('Manifest produksi tidak cocok dengan source/dist saat ini. Jalankan npm run build.');
  }
  return {
    version: pkg.version, candidateSha256: candidate, distTreeSha256: output,
    indexSha256: createHash('sha256').update(readFileSync(join(dist, 'index.html'))).digest('hex'),
  };
}
