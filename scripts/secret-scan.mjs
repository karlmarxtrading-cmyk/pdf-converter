// SEC-08: pemindaian rahasia sederhana pada source dan build statis (tanpa node_modules).
// Nilai uji yang memang tertulis di tests/ (berlabel "test"/"not-for-production") dilaporkan terpisah dan
// HARUS tidak muncul di dist/ atau dist-worker/.
import { root as sourceRoot, candidateSha256 } from './fingerprint.mjs';
const evidencePath = (...p) => join(sourceRoot, 'evidence', ...p);
const candidate = () => candidateSha256();
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
const root = sourceRoot;
const SKIP = new Set(['node_modules', '.git', 'evidence', 'fixtures']);
// Catatan: aturan generik "string 40 karakter + kata token" dihapus — menandai pengenal biasa di kode minifikasi
// (false positive pada Mermaid/ELK), bukan rahasia. Token Cloudflare tetap tertangkap oleh 'assigned-secret' bila ditugaskan.
const RULES = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/],
  ['aws-access-key', /\bAKIA[0-9A-Z]{16}\b/],
  ['github-token', /\bgh[pousr]_[A-Za-z0-9]{36,}\b/],
  ['slack-token', /\bxox[abpr]-[A-Za-z0-9-]{10,}/],
  ['jwt', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['assigned-secret', /(?:SESSION_SECRET|ADMIN_TOKEN|CLOUDFLARE_API_TOKEN|CF_API_TOKEN|API_KEY)\s*[:=]\s*['"][^'"\s]{16,}['"]/],
];
const TEST_VALUES = ['test-session-secret-0123456789abcdef-not-for-production', 'test-admin-token-0123456789abcdef-0123456789'];
const findings = []; let files = 0;
function walk(d) { for (const n of readdirSync(d)) { if (SKIP.has(n)) continue; const p = join(d, n); const st = statSync(p); if (st.isDirectory()) walk(p); else if (st.size < 8_000_000 && !/\.(png|jpe?g|gif|webp|woff2?|pdf|zip|pfproj)$/i.test(n)) scan(p); } }
function scan(p) {
  files++; const t = readFileSync(p, 'utf8'); const r = relative(root, p);
  for (const [id, re] of RULES) { const m = re.exec(t); if (m) findings.push({ file: r, rule: id }); }
  for (const v of TEST_VALUES) if (t.includes(v)) findings.push({ file: r, rule: 'test-secret-value' });
}
mkdirSync(evidencePath(), { recursive: true });
walk(root);
const inBuild = findings.filter((f) => /^dist(-worker)?\//.test(f.file));
const testOnly = findings.filter((f) => (f.file.startsWith('tests/') || f.file === 'scripts/secret-scan.mjs') && (f.rule === 'test-secret-value' || /not-for-production|test-(session|admin)/.test(readFileSync(join(root, f.file), 'utf8'))));
const other = findings.filter((f) => !inBuild.includes(f) && !testOnly.includes(f));
const out = { candidate: candidate(), id: 'SEC-08', ranAt: new Date().toISOString(), filesScanned: files, findingsInBuild: inBuild, findingsOther: other, testFixtureValues: testOnly.map((f) => f.file), status: inBuild.length || other.length ? 'FAIL' : 'PASS' };
writeFileSync(evidencePath('secret-scan.json'), JSON.stringify(out, null, 1));
console.log(out.status, 'files', files, 'build findings', inBuild.length, 'other', other.length, 'test-only values in', testOnly.length, 'file(s)');
for (const f of [...inBuild, ...other]) console.log(' ', f.rule, f.file);

process.exitCode = out.status === 'PASS' ? 0 : 1;
