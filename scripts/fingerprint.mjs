// Sidik jari kandidat (source yang menentukan build + bukti) dan pohon dist. Deterministik, tanpa waktu.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CANDIDATE = ['index.html', 'print.html', 'package.json', 'package-lock.json', '.node-version', '.npmrc', '.oxlintrc.json', 'tsconfig.json', 'vite.config.ts', 'vitest.config.ts', 'src', 'public', 'scripts', 'tests', 'fixtures'];
const SKIP = new Set(['node_modules', 'dist', 'dist-qa', '.git', 'evidence']);

function walk(dir, out) {
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (SKIP.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (e.isFile()) out.push(p);
  }
  return out;
}
export function treeHash(paths, base = root) {
  const h = createHash('sha256');
  const files = [];
  for (const p of paths) { const abs = join(base, p); if (!existsSync(abs)) continue; if (statSync(abs).isDirectory()) walk(abs, files); else files.push(abs); }
  for (const f of files.sort()) {
    const rel = relative(base, f).split('\\').join('/');
    const d = createHash('sha256').update(readFileSync(f)).digest('hex');
    h.update(`${rel}\0${d}\n`);
  }
  return { sha256: h.digest('hex'), files: files.length };
}
export const candidateSha256 = () => treeHash(CANDIDATE).sha256;
export const distTreeSha256 = (dir = 'dist') => treeHash([dir]).sha256;
export function fileList(dir) { return walk(join(root, dir), []).map((f) => relative(join(root, dir), f).split('\\').join('/')).sort(); }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify({ candidateSha256: candidateSha256(), distTreeSha256: existsSync(join(root, 'dist')) ? distTreeSha256() : null }, null, 2));
}
