// Menghasilkan src/render/font-coverage.generated.ts dari cmap WOFF2 yang benar-benar dibundel (PF-029, SEM-11).
// Jalankan: node src/render/tools/gen-font-coverage.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const KNOWN = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca'];

function cmapCodepoints(file) {
  const buf = readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x774f4632) throw new Error('bukan WOFF2: ' + file);
  const numTables = buf.readUInt16BE(12);
  const totalCompressed = buf.readUInt32BE(20);
  let p = 48;
  const b128 = () => { let v = 0; for (let i = 0; i < 5; i++) { const b = buf[p++]; v = (v << 7) | (b & 0x7f); if (!(b & 0x80)) return v >>> 0; } throw new Error('b128'); };
  const tables = [];
  for (let i = 0; i < numTables; i++) {
    const flags = buf[p++]; const idx = flags & 0x3f; const tv = flags >> 6;
    let tag; if (idx === 63) { tag = buf.toString('latin1', p, p + 4); p += 4; } else tag = KNOWN[idx] ?? `#${idx}`;
    const orig = b128();
    const transformed = tag === 'glyf' || tag === 'loca' ? tv === 0 : tv !== 0;
    const len = transformed ? b128() : orig;
    tables.push({ tag, len });
  }
  const data = brotliDecompressSync(buf.subarray(p, p + totalCompressed));
  let off = 0; let cmap = null;
  for (const t of tables) { if (t.tag === 'cmap') cmap = data.subarray(off, off + t.len); off += t.len; }
  if (!cmap) throw new Error('tanpa cmap: ' + file);
  const set = new Set();
  const n = cmap.readUInt16BE(2);
  for (let i = 0; i < n; i++) {
    const so = cmap.readUInt32BE(4 + i * 8 + 4);
    const fmt = cmap.readUInt16BE(so);
    if (fmt === 4) {
      const segX2 = cmap.readUInt16BE(so + 6); const endO = so + 14; const startO = endO + segX2 + 2; const deltaO = startO + segX2; const rangeO = deltaO + segX2;
      for (let s = 0; s < segX2; s += 2) {
        const end = cmap.readUInt16BE(endO + s), start = cmap.readUInt16BE(startO + s), delta = cmap.readInt16BE(deltaO + s), ro = cmap.readUInt16BE(rangeO + s);
        for (let c = start; c <= end && c !== 0xffff; c++) {
          let g; if (ro === 0) g = (c + delta) & 0xffff; else { const go = rangeO + s + ro + (c - start) * 2; g = go + 1 < cmap.length ? cmap.readUInt16BE(go) : 0; if (g) g = (g + delta) & 0xffff; }
          if (g) set.add(c);
        }
      }
    } else if (fmt === 12) {
      const ng = cmap.readUInt32BE(so + 12);
      for (let g = 0; g < ng; g++) { const s = cmap.readUInt32BE(so + 16 + g * 12), e = cmap.readUInt32BE(so + 20 + g * 12), gid = cmap.readUInt32BE(so + 24 + g * 12); for (let c = s; c <= e; c++) if (gid + (c - s)) set.add(c); }
    }
  }
  return set;
}
const parseRange = (s) => s.split(',').map((r) => { const m = r.trim().replace(/^U\+/i, '').split('-'); const a = parseInt(m[0], 16); return [a, m[1] ? parseInt(m[1], 16) : a]; });
const toRanges = (cps) => { const a = [...cps].sort((x, y) => x - y); const out = []; for (const c of a) { const l = out[out.length - 1]; if (l && l[1] === c - 1) l[1] = c; else out.push([c, c]); } return out; };

const FAMS = [
  { key: 'inter', family: 'Inter', pkg: '@fontsource/inter', prefix: 'inter' },
  { key: 'source-serif-4', family: 'Source Serif 4', pkg: '@fontsource/source-serif-4', prefix: 'source-serif-4' },
  { key: 'jetbrains-mono', family: 'JetBrains Mono', pkg: '@fontsource/jetbrains-mono', prefix: 'jetbrains-mono' },
];
const out = {};
for (const f of FAMS) {
  const dir = path.join(root, 'node_modules', f.pkg);
  const pj = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const css = readFileSync(path.join(dir, '400.css'), 'utf8');
  const subsets = {};
  for (const m of css.matchAll(/\/\* [a-z0-9-]+?-([a-z-]+)-400-normal \*\/\s*@font-face\s*\{[^}]*?unicode-range:\s*([^;]+);/g)) {
    const subset = m[1].replace(new RegExp('^.*?' + f.prefix.split('-').pop() + '-'), '');
    subsets[subset] = { range: parseRange(m[2]) };
  }
  for (const [subset, rec] of Object.entries(subsets)) {
    const cps = cmapCodepoints(path.join(dir, 'files', `${f.prefix}-${subset}-400-normal.woff2`));
    const inRange = (c) => rec.range.some(([a, b]) => c >= a && c <= b);
    rec.covered = toRanges([...cps].filter(inRange)); // cmap ∩ unicode-range = yang benar-benar dipakai peramban
  }
  out[f.key] = { family: f.family, pkg: f.pkg, version: pj.version, license: pj.license, subsets };
}
// KaTeX: cakupan tidak dipakai untuk teks biasa; hanya versi/lisensi.
const kpj = JSON.parse(readFileSync(path.join(root, 'node_modules/katex/package.json'), 'utf8'));
const katexFonts = readdirSync(path.join(root, 'node_modules/katex/dist/fonts')).filter((n) => n.endsWith('.woff2')).map((n) => n.replace('.woff2', ''));
const katexCov = {};
for (const n of ['KaTeX_Main-Regular', 'KaTeX_AMS-Regular']) katexCov[n] = toRanges(cmapCodepoints(path.join(root, 'node_modules/katex/dist/fonts', n + '.woff2')));
const ts = `// DIHASILKAN oleh src/render/tools/gen-font-coverage.mjs — jangan disunting tangan.
// covered = cmap ∩ unicode-range per subset (rentang kode Unicode inklusif) dari berkas woff2 400-normal yang terpasang.
export type Range = [number, number];
export interface SubsetCoverage { range: Range[]; covered: Range[] }
export interface FamilyCoverage { family: string; pkg: string; version: string; license: string; subsets: Record<string, SubsetCoverage> }
export const FONT_COVERAGE: Record<'inter' | 'source-serif-4' | 'jetbrains-mono', FamilyCoverage> = ${JSON.stringify(out)};
export const KATEX_FONT_INFO = ${JSON.stringify({ pkg: 'katex', version: kpj.version, license: 'OFL-1.1', files: katexFonts })};
/** cmap penuh font simbol KaTeX yang dipakai sebagai cadangan simbol matematika di teks biasa (→ ≤ ≈ √ …). */
export const KATEX_SYMBOL_COVERAGE: Record<string, Range[]> = ${JSON.stringify(katexCov)};
`;
writeFileSync(path.join(root, 'src/render/font-coverage.generated.ts'), ts);
for (const [k, v] of Object.entries(out)) console.log(k, v.version, Object.entries(v.subsets).map(([s, r]) => `${s}:${r.covered.reduce((n, [a, b]) => n + b - a + 1, 0)}`).join(' '));
