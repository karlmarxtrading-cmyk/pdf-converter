// Aset (AST-02, CODE-03, PF-004) & ZIP (AST-05/06/07/08, CODE-17, PF-033)
import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { AssetStore, assetDataUrl, sniffMime, imageDimensions, clearDataUrlCache, dataUrlCacheStats, createAssetRecord, normalizeAssetPath } from '../../../src/core/assets';
import { importZip } from '../../../src/core/zip';
import { createProject, importZipIntoProject, projectBytes } from '../../../src/core/projects';
import { LIMITS } from '../../../src/core/limits';
import { fxBytes, fxSha } from './fx';

describe('Aset', () => {
  it('AST-02 CODE-03 nama/ukuran/MIME sama, isi beda → id, data URL, dan cache memakai isi terbaru [fx:pengganti_A/chart.png] [fx:pengganti_B/chart.png]', async () => {
    clearDataUrlCache();
    const A = fxBytes('pengganti_A/chart.png'), B = fxBytes('pengganti_B/chart.png');
    expect(A.length).toBe(B.length);
    const store = new AssetStore();
    const ra = await store.add(A, 'chart.png', 'upload'); if (!ra.ok) throw new Error();
    expect(ra.asset.id).toBe(fxSha('pengganti_A/chart.png'));
    const urlA = assetDataUrl(store.get('chart.png')!);
    const rb = await store.add(B, 'chart.png', 'upload'); if (!rb.ok) throw new Error();
    expect(rb.replaced!.id).toBe(ra.asset.id);
    expect(rb.asset.id).toBe(fxSha('pengganti_B/chart.png'));
    const urlB = assetDataUrl(store.get('chart.png')!);
    expect(urlB).not.toBe(urlA);
    expect(Buffer.from(urlB.split(',')[1]!, 'base64').equals(Buffer.from(B))).toBe(true);
    // id basi + bytes baru (kesalahan pemanggil) tetap tidak mengembalikan isi lama
    const stale = { ...rb.asset, id: ra.asset.id };
    expect(assetDataUrl(stale)).toBe(urlB);
    expect(store.list().length).toBe(1);
  });
  it('PF-004 MIME dari magic bytes & dimensi; ekstensi palsu ditolak [fx:assets/chart.png]', async () => {
    const png = fxBytes('assets/chart.png');
    expect(sniffMime(png)).toBe('image/png'); expect(imageDimensions(png, 'image/png')).toEqual({ width: 32, height: 32 });
    expect(sniffMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffMime(strToU8('GIF89a\x02\x00\x03\x00'))).toBe('image/gif');
    expect(imageDimensions(strToU8('GIF89a\x02\x00\x03\x00'), 'image/gif')).toEqual({ width: 2, height: 3 });
    expect(sniffMime(strToU8('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
    expect(sniffMime(strToU8('<?xml version="1.0"?>\n<svg viewBox="0 0 4 5"></svg>'))).toBe('image/svg+xml');
    const fake = await createAssetRecord(strToU8('bukan gambar'), 'x.png', 'upload');
    expect(fake.ok).toBe(false); if (!fake.ok) expect(fake.code).toBe('UNSUPPORTED_TYPE');
    expect(normalizeAssetPath('./a/../b/%C3%BC%20x.png')).toBe('b/ü x.png'); expect(normalizeAssetPath('../x.png')).toBeNull(); expect(normalizeAssetPath('a\\b.png')).toBeNull();
  });
  it('cache data URL berbatas dengan pembuangan LRU', async () => {
    clearDataUrlCache();
    const png = fxBytes('assets/chart.png');
    for (let i = 0; i < 5; i++) { const b = png.slice(); b[b.length - 1] = i; const r = await createAssetRecord(b, `a${i}.png`, 'upload'); if (r.ok) assetDataUrl(r.asset); }
    const st = dataUrlCacheStats();
    expect(st.entries).toBe(5); expect(st.chars).toBeLessThanOrEqual(st.maxChars);
  });
  it('AST-08 anggaran total proyek pada AssetStore: transaksi addMany rollback utuh', async () => {
    const png = fxBytes('assets/chart.png');
    const lim = { ...LIMITS, totalProjectBytes: png.length * 2 + 10 };
    const s = new AssetStore([], lim);
    expect((await s.add(png, 'a.png', 'upload')).ok).toBe(true);
    const b2 = png.slice(); b2[100] ^= 1; const b3 = png.slice(); b3[101] ^= 1;
    const r = await s.addMany([{ bytes: b2, path: 'b.png', origin: 'upload' }, { bytes: b3, path: 'c.png', origin: 'upload' }]);
    expect(r.ok).toBe(false); expect(s.list().map((a) => a.path)).toEqual(['a.png']);
  });
});

const z = (files: Record<string, Uint8Array | string>, level = 6) => zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, typeof v === 'string' ? strToU8(v) : v])), { level: level as 6 });

describe('ZIP', () => {
  it('AST-05 folder bertingkat, dua naskah, gambar terkait, berkas tak didukung: pemilihan eksplisit, berkas dilaporkan [fx:assets/chart.png]', async () => {
    const r = await importZip(z({ 'proyek/bab 1/naskah.md': '# Satu\n\n![g](../gambar/chart.png)', 'proyek/README.md': '# Dua', 'proyek/gambar/chart.png': fxBytes('assets/chart.png'), 'proyek/data.xlsx': 'x', 'proyek/gambar/': '' }));
    if (!r.ok) throw new Error(r.fatal.message);
    expect(r.markdown.map((m) => m.path)).toEqual(['proyek/bab 1/naskah.md', 'proyek/README.md']);
    expect(r.needsSelection).toBe(true);
    expect(r.assets.map((a) => [a.path, a.mime, a.origin])).toEqual([['proyek/gambar/chart.png', 'image/png', 'zip']]);
    expect(r.unsupported.map((u) => u.path)).toEqual(['proyek/data.xlsx']);
  });
  it('CODE-17 semua naskah dikembalikan (tidak dibatasi 6)', async () => {
    const files: Record<string, string> = {};
    for (let i = 1; i <= 50; i++) files[`n${String(i).padStart(2, '0')}.md`] = `# ${i}`;
    const r = await importZip(z(files));
    if (!r.ok) throw new Error();
    expect(r.markdown.length).toBe(50); expect(r.needsSelection).toBe(true);
  });
  it('AST-06 ../, path absolut, backslash, duplikat kanonik, symlink → ditolak dengan pesan; proyek tidak berubah', async () => {
    const cases: [Record<string, string>, string][] = [
      [{ '../evil.md': 'x' }, 'ZIP_PATH_TRAVERSAL'], [{ 'a/../../evil.md': 'x' }, 'ZIP_PATH_TRAVERSAL'], [{ '/etc/abs.md': 'x' }, 'ZIP_ABSOLUTE_PATH'],
      [{ 'C:/win.md': 'x' }, 'ZIP_ABSOLUTE_PATH'], [{ 'a\\b.md': 'x' }, 'ZIP_BACKSLASH'], [{ 'Bab.md': 'x', 'bab.md': 'y' }, 'ZIP_DUPLICATE_PATH'],
      [{ 'caf\u00e9.md': 'x', 'cafe\u0301.md': 'y' }, 'ZIP_DUPLICATE_PATH'], [{ 'a/./b.md': 'x', 'a/b.md': 'y' }, 'ZIP_DUPLICATE_PATH'],
    ];
    for (const [files, code] of cases) {
      const r = await importZip(z(files));
      expect(r.ok).toBe(false); if (!r.ok) { expect(r.fatal.code).toBe(code); expect(r.fatal.message.length).toBeGreaterThan(10); }
    }
    // symlink: set atribut eksternal unix S_IFLNK di central directory
    const bytes = z({ 'link.md': 'target' });
    const cd = bytes.findIndex((_, i) => bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 1 && bytes[i + 3] === 2);
    bytes[cd + 5] = 3; const mode = (0o120777 << 16) >>> 0; new DataView(bytes.buffer).setUint32(cd + 38, mode, true);
    const rs = await importZip(bytes); expect(rs.ok).toBe(false); if (!rs.ok) expect(rs.fatal.code).toBe('ZIP_SYMLINK');
    const p = createProject({ source: 'tetap' });
    const before = JSON.stringify(p);
    const rp = await importZipIntoProject(p, z({ '../x.png': 'x' }));
    expect(rp.ok).toBe(false); expect(JSON.stringify(rp.project)).toBe(before);
  });
  it('AST-07 ZIP bomb: rasio, jumlah entri, total terekstrak, ukuran per berkas, ukuran deklarasi palsu → dihentikan sebelum/saat inflate', async () => {
    const zeros = new Uint8Array(3 * 1024 * 1024);
    const bomb = await importZip(z({ 'bomb.md': zeros }, 9));
    expect(bomb.ok).toBe(false); if (!bomb.ok) expect(bomb.fatal.code).toBe('ZIP_RATIO');
    const many: Record<string, string> = {}; for (let i = 0; i < 12; i++) many[`f${i}.md`] = 'x';
    const rc = await importZip(z(many), { limits: { ...LIMITS, zipEntries: 10 } });
    expect(rc.ok).toBe(false); if (!rc.ok) expect(rc.fatal.code).toBe('ZIP_TOO_MANY_ENTRIES');
    const rnd = (n: number, seed: number) => { const b = new Uint8Array(n); let x = seed; for (let i = 0; i < n; i++) { x = (x * 1103515245 + 12345) >>> 0; b[i] = 97 + ((x >>> 16) % 26); } return b; };
    const ru = await importZip(z({ 'a.md': rnd(4000, 1), 'b.md': rnd(4000, 2) }), { limits: { ...LIMITS, zipUnpackedBytes: 6000 } });
    expect(ru.ok).toBe(false); if (!ru.ok) expect(ru.fatal.code).toBe('ZIP_UNPACKED_TOO_LARGE');
    const rf = await importZip(z({ 'a.md': rnd(5000, 3) }), { limits: { ...LIMITS, markdownBytes: 1000, assetBytes: 1000 } });
    expect(rf.ok).toBe(false); if (!rf.ok) expect(rf.fatal.code).toBe('ZIP_ENTRY_TOO_LARGE');
    // deklarasi ukuran palsu (kecil) → batas streaming menghentikan inflate
    const liar = z({ 'a.md': rnd(20000, 4) }, 0);
    const lz = z({ 'a.md': new Uint8Array(20000).fill(65) }, 9);
    const cdi = lz.findIndex((_, i) => lz[i] === 0x50 && lz[i + 1] === 0x4b && lz[i + 2] === 1 && lz[i + 3] === 2);
    new DataView(lz.buffer).setUint32(cdi + 24, 100, true);
    const rl = await importZip(lz);
    expect(rl.ok).toBe(false); if (!rl.ok) expect(rl.fatal.code).toBe('ZIP_SIZE_MISMATCH');
    void liar;
    const notzip = await importZip(strToU8('bukan zip sama sekali'));
    expect(notzip.ok).toBe(false);
  });
  it('AST-08 impor ZIP berulang melewati total proyek: transaksi terakhir rollback utuh, aset lama tidak rusak [fx:assets/chart.png]', async () => {
    const png = fxBytes('assets/chart.png');
    let p = createProject({ source: 'x' });
    // Admit two distinct assets plus their actual portable metadata and history.
    const example2 = png.slice(); example2[120] ^= 1;
    const first = await importZipIntoProject(p, z({ 'a.png': png }));
    if (!first.ok) throw Error(first.message);
    const second = await importZipIntoProject(first.project, z({ 'b.png': example2 }));
    if (!second.ok) throw Error(second.message);
    const lim = { ...LIMITS, totalProjectBytes: projectBytes(second.project) };
    const r1 = await importZipIntoProject(p, z({ 'a.png': png }), lim); if (!r1.ok) throw new Error(r1.message); p = r1.project;
    const png2 = png.slice(); png2[120] ^= 1;
    const r2 = await importZipIntoProject(p, z({ 'b.png': png2 }), lim); if (!r2.ok) throw new Error(r2.message); p = r2.project;
    const png3 = png.slice(); png3[121] ^= 1;
    const before = projectBytes(p);
    const r3 = await importZipIntoProject(p, z({ 'c.png': png3 }), lim);
    expect(r3.ok).toBe(false); expect(r3.project).toBe(p); expect(projectBytes(r3.project)).toBe(before);
    expect(p.assets.map((a) => a.path)).toEqual(['a.png', 'b.png']);
    expect(Buffer.from(p.assets[0]!.bytes).equals(Buffer.from(png))).toBe(true);
  });
});
