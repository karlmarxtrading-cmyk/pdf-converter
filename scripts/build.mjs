// Build situs statis: SBOM/notice → vite build → verifikasi rilis statis → build-manifest.json.
// `--qa` membangun ke dist-qa dengan kait QA (VITE_PF_QA=1); build produksi tidak memuat kait itu.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { candidateSha256, distTreeSha256, root } from './fingerprint.mjs';

const qa = process.argv.includes('--qa');
const outDir = qa ? 'dist-qa' : 'dist';
const env = { ...process.env, ...(qa ? { VITE_PF_QA: '1' } : { VITE_PF_QA: '0' }), PF_OUT_DIR: outDir };
const run = (...args) => execFileSync(process.execPath, args, { cwd: root, stdio: 'inherit', env });

run('scripts/sbom.mjs');
const start = candidateSha256();
run('node_modules/vite/bin/vite.js', 'build', '--outDir', outDir, '--emptyOutDir');
run('scripts/verify-static-release.mjs', outDir, ...(qa ? ['--qa'] : []));
if (start !== candidateSha256()) throw Error('Source berubah selama build. Jalankan build lagi pada kandidat yang stabil.');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const manifest = { app: pkg.name, version: pkg.version, profile: qa ? 'qa' : 'production', candidateSha256: start, distTreeSha256: distTreeSha256(outDir), node: process.version, engines: pkg.engines };
// manifest ditulis di samping dist (bukan di dalamnya) agar hash pohon dist tetap stabil
writeFileSync(join(root, `${outDir}.build-manifest.json`), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Build ${manifest.profile} OK · candidate ${start} · dist ${manifest.distTreeSha256}`);
