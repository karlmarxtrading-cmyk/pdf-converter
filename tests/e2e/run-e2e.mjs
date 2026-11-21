// E2E browser nyata (Chrome headless, puppeteer-core) terhadap build QA statis yang dilayani server ala Pages.
// Pemakaian: node tests/e2e/run-e2e.mjs [--only id,id] → evidence/e2e-results.json
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { launch, page, openStudio, waitReady, state, setSource, sleep, CHROME } from './lib.mjs';
import { candidateSha256, distTreeSha256 } from '../../scripts/fingerprint.mjs';
import { SCENARIOS } from './scenarios.mjs';

const only = (() => { const i = process.argv.indexOf('--only'); return i > 0 ? process.argv[i + 1].split(',') : null; })();
const env = await launch({ dir: 'dist-qa', port: 4310 });
const version = await env.browser.version();
const results = [];
const ctx = { env, page, openStudio, waitReady, state, setSource, sleep, mkdtempSync, readdirSync, readFileSync, writeFileSync, existsSync, join, tmpdir, execFileSync };
for (const sc of SCENARIOS) {
  if (only && !only.includes(sc.id)) continue;
  const t0 = Date.now();
  const rec = { id: sc.id, matrix: sc.matrix, title: sc.title, status: 'pass', ms: 0, details: {} };
  try { rec.details = (await sc.run(ctx)) ?? {}; }
  catch (e) { rec.status = 'fail'; rec.error = String(e?.stack || e).slice(0, 2000); }
  rec.ms = Date.now() - t0;
  results.push(rec);
  console.log(`${rec.status === 'pass' ? '✓' : '✗'} ${sc.id} ${sc.title} (${rec.ms} ms)${rec.error ? '\n   ' + rec.error.split('\n')[0] : ''}`);
}
await env.close();
mkdirSync('evidence', { recursive: true });
const out = { tool: 'tests/e2e/run-e2e.mjs', browser: version, chrome: CHROME, node: process.version, candidateSha256: candidateSha256(), distQaTreeSha256: distTreeSha256('dist-qa'), at: new Date().toISOString(),
  summary: { total: results.length, pass: results.filter((r) => r.status === 'pass').length, fail: results.filter((r) => r.status === 'fail').length }, results };
const file = only ? `evidence/e2e-results.partial.json` : 'evidence/e2e-results.json';
writeFileSync(file, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out.summary));
process.exit(out.summary.fail ? 1 : 0);
