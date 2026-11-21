// ST-QA-31: gerbang rilis harus GAGAL bila dist dirusak (backend, harga, kait QA, _worker.js, functions/, berkas wajib hilang).
// Menyalin dist/ ke direktori sementara di dalam repo, menyuntik satu kerusakan per kasus, menjalankan verifier.
import { cpSync, rmSync, writeFileSync, appendFileSync, readdirSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { candidateSha256 } from '../../scripts/fingerprint.mjs';

const tmp = '.gate-tmp';
const js = () => join(tmp, 'assets', readdirSync(join(tmp, 'assets')).find((f) => /^main-.*\.js$/.test(f)));
const cases = [
  ['bersih (kontrol)', () => {}, true],
  ['panggilan backend /api/pdf', () => appendFileSync(js(), '\nfetch("/api/pdf/jobs");'), false],
  ['teks harga di HTML', () => appendFileSync(join(tmp, 'index.html'), '<p>Pro Rp 49.000/bulan</p>'), false],
  ['kait QA di build produksi', () => appendFileSync(js(), '\nwindow.__pf={};'), false],
  ['_worker.js', () => writeFileSync(join(tmp, '_worker.js'), 'export default {}'), false],
  ['functions/', () => { mkdirSync(join(tmp, 'functions'), { recursive: true }); writeFileSync(join(tmp, 'functions', 'api.js'), 'x'); }, false],
  ['print.html hilang', () => rmSync(join(tmp, 'print.html')), false],
  ['_headers tanpa CSP', () => writeFileSync(join(tmp, '_headers'), '/*\n  X-Content-Type-Options: nosniff\n'), false],
  ['Worker analisis hilang', () => { for (const f of readdirSync(join(tmp, 'assets')).filter((f) => f.startsWith('engine.worker-'))) rmSync(join(tmp, 'assets', f)); }, false],
  ['sumber daya eksternal', () => appendFileSync(join(tmp, 'index.html'), '<script src="https://cdn.example/x.js"></script>'), false],
];
const results = [];
for (const [name, inject, expectPass] of cases) {
  rmSync(tmp, { recursive: true, force: true });
  cpSync('dist', tmp, { recursive: true });
  inject();
  let passed = true;
  try { execFileSync(process.execPath, ['scripts/verify-static-release.mjs', tmp], { stdio: 'pipe' }); } catch { passed = false; }
  const ok = passed === expectPass;
  results.push({ case: name, verifierPassed: passed, expected: expectPass ? 'pass' : 'fail', ok });
  console.log(`${ok ? '✓' : '✗'} ${name}: verifier ${passed ? 'lulus' : 'gagal'}`);
}
rmSync(tmp, { recursive: true, force: true });
const out = { tool: 'tests/e2e/release-gate.mjs', candidateSha256: candidateSha256(), at: new Date().toISOString(), pass: results.every((r) => r.ok), results };
writeFileSync('evidence/release-gate.json', JSON.stringify(out, null, 2));
process.exit(out.pass ? 0 : 1);
