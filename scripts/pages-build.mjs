// Cloudflare Pages calls this command for its existing Git-connected project.
// Preview and publication have distinct acceptance requirements.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { acceptance } from './release-paths.mjs';
import { fileURLToPath } from 'node:url';
import { root } from './fingerprint.mjs';
import { runQualified } from './toolchain/qualified-run.mjs';
import { resolve } from 'node:path';

export function requiresPromotionEvidence(env) {
  if (env.CF_PAGES !== '1') return false;
  const branch = env.CF_PAGES_BRANCH?.trim();
  if (!branch) throw new Error('Cloudflare Pages did not identify the Git branch.');
  const configured = env.PAPERFORMA_PRODUCTION_BRANCH?.trim() || 'main';
  if (branch === 'main' && configured !== 'main') {
    throw new Error('Pages main must match PAPERFORMA_PRODUCTION_BRANCH before publishing this project.');
  }
  return branch === configured;
}

// The named rehearsal branch executes the identical full verifier with actual Pages context.
export function pagesQualification(env) {
  const production = requiresPromotionEvidence(env);
  if (env.CF_PAGES !== '1') return 'local';
  if (production) return 'production';
  return env.PAPERFORMA_REHEARSAL_BRANCH?.trim() === env.CF_PAGES_BRANCH.trim() ? 'preview-rehearsal' : 'preview';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = pagesQualification(process.env);
  const started = Date.now();
  let hosting;
  if (mode !== 'local') {
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    const url = new URL(process.env.CF_PAGES_URL);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
        !/^[a-f0-9]{40}$/.test(commit) || process.env.CF_PAGES_COMMIT_SHA !== commit) {
      throw new Error('Pages URL or checked-out commit does not match the native build environment.');
    }
    hosting = { branch: process.env.CF_PAGES_BRANCH, url: url.origin, commit };
  }
  execFileSync(process.execPath, ['scripts/build.mjs'], {cwd:root,stdio:'inherit'});
  const built = JSON.parse(readFileSync(resolve(root, 'dist.build-manifest.json')));
  const evidence = { mode, ...hosting, version: built.version, candidateSha256: built.candidateSha256, distTreeSha256: built.distTreeSha256 };
  if (mode === 'production' || mode === 'preview-rehearsal') {
    runQualified();
    const report = JSON.parse(readFileSync(resolve(root, acceptance, 'all-gates.json')));
    if (report.decision !== 'PRODUCTION_READY' || report.gates.length !== 24 ||
        report.identity.candidateSha256 !== built.candidateSha256 || report.identity.distTreeSha256 !== built.distTreeSha256 ||
        !report.gates.every(gate => gate.status === 'PASS')) throw Error('Qualified run did not return 24 matching passes.');
    Object.assign(evidence, { runId: report.runId, decision: report.decision, passed: report.gates.length });
  }
  if (hosting) console.log('PAPERFORMA_PAGES_BUILD ' + JSON.stringify({ ...evidence, durationMs: Date.now() - started }));
}
