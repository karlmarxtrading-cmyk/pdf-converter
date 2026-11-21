/**
 * Impor ZIP aman (PF-033, CODE-05, CODE-17, AST-05/06/07/08).
 * Central directory DIPERIKSA SEBELUM inflate: jumlah entri, ukuran deklarasi, rasio, kedalaman,
 * total ukuran terekstrak, path (traversal, absolut, backslash, duplikat kanonik, symlink, terenkripsi, ZIP64).
 * Saat inflate, batas keras streaming tetap ditegakkan (ukuran deklarasi tidak dipercaya).
 * SEMUA naskah Markdown dikembalikan untuk dipilih eksplisit (tanpa batas 6; tanpa pilihan diam-diam bila >1).
 */
import { Inflate } from 'fflate';
import type { AssetRecord, Limits } from './contracts';
import { LIMITS, checkBudget, decodeUtf8Strict, type BudgetResult } from './limits';
import { createAssetRecord, IMAGE_EXT } from './assets';

export interface ZipEntryInfo {
  name: string; crc32: number; method: number; flags: number; compressedSize: number; uncompressedSize: number;
  localHeaderOffset: number; externalAttrs: number; versionMadeBy: number; isDir: boolean;
}

export type ZipRejectCode =
  | 'ZIP_NOT_ZIP' | 'ZIP_TOO_LARGE' | 'ZIP_TOO_MANY_ENTRIES' | 'ZIP_UNPACKED_TOO_LARGE' | 'ZIP_RATIO' | 'ZIP_DEPTH'
  | 'ZIP_PATH_TRAVERSAL' | 'ZIP_ABSOLUTE_PATH' | 'ZIP_BACKSLASH' | 'ZIP_DUPLICATE_PATH' | 'ZIP_SYMLINK' | 'ZIP_ENCRYPTED'
  | 'ZIP_ZIP64_UNSUPPORTED' | 'ZIP_METHOD_UNSUPPORTED' | 'ZIP_ENTRY_TOO_LARGE' | 'ZIP_CORRUPT' | 'ZIP_SIZE_MISMATCH' | 'ZIP_BAD_NAME' | 'ZIP_CRC_MISMATCH';

export interface ZipProblem { path: string; code: ZipRejectCode | 'UNSUPPORTED_FILE' | 'INVALID_UTF8' | 'ASSET_REJECTED'; message: string; messageEn: string }

export type ZipImportResult =
  | { ok: true; markdown: { path: string; text: string; bytes: number }[]; assets: AssetRecord[]; unsupported: ZipProblem[]; rejected: ZipProblem[];
      /** true bila >1 naskah: UI WAJIB meminta pilihan eksplisit */ needsSelection: boolean; totalUnpacked: number; entries: number }
  | { ok: false; fatal: ZipProblem; budget?: BudgetResult };

const u16 = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);
const u32 = (b: Uint8Array, o: number) => (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;

const MSG: Record<string, [string, string]> = {
  ZIP_NOT_ZIP: ['Berkas bukan arsip ZIP yang valid.', 'The file is not a valid ZIP archive.'],
  ZIP_TOO_MANY_ENTRIES: ['Arsip memiliki terlalu banyak entri.', 'The archive has too many entries.'],
  ZIP_UNPACKED_TOO_LARGE: ['Ukuran total setelah ekstraksi melebihi batas.', 'The total unpacked size exceeds the limit.'],
  ZIP_RATIO: ['Rasio kompresi entri melebihi batas (indikasi ZIP bomb).', 'An entry compression ratio exceeds the limit (possible ZIP bomb).'],
  ZIP_DEPTH: ['Kedalaman folder melebihi batas.', 'Folder depth exceeds the limit.'],
  ZIP_PATH_TRAVERSAL: ['Path memuat "..", keluar dari folder proyek.', 'Path contains "..", escaping the project folder.'],
  ZIP_ABSOLUTE_PATH: ['Path absolut tidak diizinkan.', 'Absolute paths are not allowed.'],
  ZIP_BACKSLASH: ['Path memakai backslash (\\) yang ambigu.', 'Path uses an ambiguous backslash (\\).'],
  ZIP_DUPLICATE_PATH: ['Dua entri mengarah ke path yang sama setelah normalisasi.', 'Two entries map to the same path after normalisation.'],
  ZIP_SYMLINK: ['Symlink tidak diizinkan.', 'Symlinks are not allowed.'],
  ZIP_ENCRYPTED: ['Entri terenkripsi tidak didukung.', 'Encrypted entries are not supported.'],
  ZIP_ZIP64_UNSUPPORTED: ['Arsip ZIP64 tidak didukung.', 'ZIP64 archives are not supported.'],
  ZIP_METHOD_UNSUPPORTED: ['Metode kompresi tidak didukung.', 'Compression method not supported.'],
  ZIP_ENTRY_TOO_LARGE: ['Satu berkas melebihi batas ukuran per berkas.', 'A file exceeds the per-file size limit.'],
  ZIP_CRC_MISMATCH: ['Checksum ZIP tidak cocok. Gunakan salinan arsip yang utuh.', 'ZIP checksum mismatch. Restore an intact copy of the archive.'],
  ZIP_CORRUPT: ['Arsip rusak.', 'The archive is corrupt.'],
  ZIP_SIZE_MISMATCH: ['Ukuran hasil ekstraksi tidak sesuai deklarasi.', 'The unpacked size does not match the declared size.'],
  ZIP_BAD_NAME: ['Nama entri tidak valid.', 'Invalid entry name.'],
};
const problem = (path: string, code: ZipRejectCode, extra = ''): ZipProblem => ({ path, code, message: `${MSG[code]![0]}${extra ? ' ' + extra : ''} (${path})`, messageEn: `${MSG[code]![1]}${extra ? ' ' + extra : ''} (${path})` });

/** Membaca central directory tanpa inflate. */
export function readCentralDirectory(b: Uint8Array): { ok: true; entries: ZipEntryInfo[] } | { ok: false; code: ZipRejectCode } {
  if (b.length < 22) return { ok: false, code: 'ZIP_NOT_ZIP' };
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) if (u32(b, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return { ok: false, code: 'ZIP_NOT_ZIP' };
  const count = u16(b, eocd + 10);
  const cdSize = u32(b, eocd + 12);
  const cdOff = u32(b, eocd + 16);
  if (count === 0xffff || cdOff === 0xffffffff || cdSize === 0xffffffff) return { ok: false, code: 'ZIP_ZIP64_UNSUPPORTED' };
  if (cdOff + cdSize > eocd) return { ok: false, code: 'ZIP_CORRUPT' };
  const entries: ZipEntryInfo[] = [];
  let p = cdOff;
  for (let i = 0; i < count; i++) {
    if (p + 46 > b.length || u32(b, p) !== 0x02014b50) return { ok: false, code: 'ZIP_CORRUPT' };
    const versionMadeBy = u16(b, p + 4); const flags = u16(b, p + 8); const method = u16(b, p + 10);
    const csize = u32(b, p + 20); const usize = u32(b, p + 24);
    const nlen = u16(b, p + 28); const xlen = u16(b, p + 30); const clen = u16(b, p + 32);
    const ext = u32(b, p + 38); const lho = u32(b, p + 42);
    if (csize === 0xffffffff || usize === 0xffffffff || lho === 0xffffffff) return { ok: false, code: 'ZIP_ZIP64_UNSUPPORTED' };
    if (p + 46 + nlen + xlen + clen > cdOff + cdSize) return { ok: false, code: 'ZIP_CORRUPT' };
    const raw = b.subarray(p + 46, p + 46 + nlen);
    const decoded = decodeUtf8Strict(raw);
    if ((flags & 0x800) && !decoded.ok) return { ok: false, code: 'ZIP_BAD_NAME' };
    const name = decoded.ok ? decoded.text : Array.from(raw, x => String.fromCharCode(x)).join('');
    entries.push({ name, crc32: u32(b, p + 16), method, flags, compressedSize: csize, uncompressedSize: usize, localHeaderOffset: lho, externalAttrs: ext, versionMadeBy, isDir: name.endsWith('/') });
    p += 46 + nlen + xlen + clen;
  }
  return { ok: true, entries };
}

/** Validasi path entri; mengembalikan path kanonik (NFC) atau kode penolakan. */
export function canonicalZipPath(name: string, maxDepth: number): { ok: true; path: string } | { ok: false; code: ZipRejectCode } {
  if (!name || name.includes('\u0000')) return { ok: false, code: 'ZIP_BAD_NAME' };
  if (name.includes('\\')) return { ok: false, code: 'ZIP_BACKSLASH' };
  if (name.startsWith('/') || /^[a-zA-Z]:/.test(name)) return { ok: false, code: 'ZIP_ABSOLUTE_PATH' };
  const segs = name.replace(/\/$/, '').split('/');
  if (segs.some((s) => s === '..')) return { ok: false, code: 'ZIP_PATH_TRAVERSAL' };
  const clean = segs.filter((s) => s !== '' && s !== '.');
  if (!clean.length) return { ok: false, code: 'ZIP_BAD_NAME' };
  if (clean.length > maxDepth) return { ok: false, code: 'ZIP_DEPTH' };
  return { ok: true, path: clean.join('/').normalize('NFC') };
}

/** Inflate dengan batas keras streaming; melempar bila melebihi cap. */
function inflateCapped(data: Uint8Array, cap: number): Uint8Array {
  const chunks: Uint8Array[] = []; let total = 0; let over = false;
  const inf = new Inflate((chunk) => {
    total += chunk.length;
    if (total > cap) { over = true; throw new Error('ZIP_STREAM_CAP'); }
    chunks.push(chunk);
  });
  const STEP = 4 * 1024;
  try {
    for (let i = 0; i < data.length; i += STEP) inf.push(data.subarray(i, Math.min(data.length, i + STEP)), i + STEP >= data.length);
    if (data.length === 0) inf.push(new Uint8Array(0), true);
  } catch (e) { if (over || (e as Error).message === 'ZIP_STREAM_CAP') throw new Error('ZIP_STREAM_CAP'); throw new Error('ZIP_CORRUPT'); }
  const out = new Uint8Array(total); let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

function entryData(b: Uint8Array, e: ZipEntryInfo): Uint8Array {
  const p = e.localHeaderOffset;
  if (p + 30 > b.length || u32(b, p) !== 0x04034b50) throw new Error('ZIP_CORRUPT');
  if (u16(b, p + 8) !== e.method || u16(b, p + 6) !== e.flags) throw new Error('ZIP_CORRUPT');
  if (!(e.flags & 8) && u32(b, p + 14) !== e.crc32) throw new Error('ZIP_CRC_MISMATCH');
  const start = p + 30 + u16(b, p + 26) + u16(b, p + 28);
  if (start + e.compressedSize > b.length) throw new Error('ZIP_CORRUPT');
  return b.subarray(start, start + e.compressedSize);
}

export interface ZipImportOptions {
  limits?: Limits;
  /** byte proyek yang sudah ada (untuk anggaran kumulatif AST-08) */ existingProjectBytes?: number;
  /** jenis berkas teks tambahan yang dikembalikan sebagai naskah */ markdownExt?: RegExp;
}

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) value = (value >>> 8) ^ crcTable[(value ^ byte) & 255]!;
  return (value ^ 0xffffffff) >>> 0;
}

type ExtractedZip = Extract<ZipImportResult, { ok: false }> |
  { ok: true; files: Map<string, Uint8Array>; totalUnpacked: number; entries: number };

/** One bounded extraction pass for ordinary ZIP and portable project imports. */
export function extractZipFiles(bytes: Uint8Array, limits = LIMITS, existingProjectBytes = 0, profile: 'documents' | 'project' = 'documents', markdownExt = /\.(md|markdown|txt)$/i): ExtractedZip {
  const size = checkBudget('zip', bytes.byteLength, limits);
  if (!size.ok) return { ok: false, fatal: { path: '', code: 'ZIP_TOO_LARGE', message: size.message, messageEn: size.messageEn }, budget: size };
  const cd = readCentralDirectory(bytes);
  if (!cd.ok) return { ok: false, fatal: problem('', cd.code) };
  const entries = cd.entries;
  const cnt = checkBudget('zipEntries', entries.length, limits);
  if (!cnt.ok) return { ok: false, fatal: { path: '', code: 'ZIP_TOO_MANY_ENTRIES', message: cnt.message, messageEn: cnt.messageEn }, budget: cnt };
  // --- pemeriksaan sebelum inflate ---
  let declaredTotal = 0;
  const seen = new Map<string, string>();
  const files: { e: ZipEntryInfo; path: string }[] = [];
  for (const e of entries) {
    const cp = canonicalZipPath(e.name, limits.zipMaxDepth);
    if (!cp.ok) return { ok: false, fatal: problem(e.name, cp.code) };
    const unixMode = (e.versionMadeBy >> 8) === 3 ? (e.externalAttrs >>> 16) : 0;
    if ((unixMode & 0o170000) === 0o120000) return { ok: false, fatal: problem(e.name, 'ZIP_SYMLINK') };
    if (e.isDir) {
      if (e.uncompressedSize !== 0 || e.crc32 !== 0) return { ok: false, fatal: problem(e.name, 'ZIP_CORRUPT') };
      continue;
    }
    if (e.flags & 0x1) return { ok: false, fatal: problem(e.name, 'ZIP_ENCRYPTED') };
    if (e.method !== 0 && e.method !== 8) return { ok: false, fatal: problem(e.name, 'ZIP_METHOD_UNSUPPORTED') };
    const key = cp.path.toLowerCase();
    if (seen.has(key)) return { ok: false, fatal: problem(e.name, 'ZIP_DUPLICATE_PATH', `↔ ${seen.get(key)}`) };
    seen.set(key, e.name);
    const ratio = e.compressedSize === 0 ? (e.uncompressedSize === 0 ? 0 : Infinity) : e.uncompressedSize / e.compressedSize;
    // Only known fields in the application-specific format may use higher compression.
    // A legacy project containing repetitive prose can approach DEFLATE's physical limit.
    const projectText = profile === 'project' && /^(project\.json|source\.md|inputs\/[^/]+\.(txt|html)|manifest\.json|brandkit\.json|settings\.json)$/.test(cp.path);
    const ratioLimit = projectText ? Math.max(limits.zipMaxRatio, 1100) : limits.zipMaxRatio;
    if (ratio > ratioLimit) return { ok: false, fatal: problem(e.name, 'ZIP_RATIO', `${Number.isFinite(ratio) ? ratio.toFixed(0) : '∞'}:1 > ${ratioLimit}:1.`) };
    const perFile = profile === 'project' && cp.path === 'project.json' ? limits.zipUnpackedBytes
      : profile === 'project' && cp.path.startsWith('inputs/') && cp.path.endsWith('.html') ? limits.pasteHtmlBytes
      : markdownExt.test(cp.path) ? limits.markdownBytes : limits.assetBytes;
    if (e.uncompressedSize > perFile) return { ok: false, fatal: problem(e.name, 'ZIP_ENTRY_TOO_LARGE', `${e.uncompressedSize} > ${perFile} byte.`) };
    declaredTotal += e.uncompressedSize;
    files.push({ e, path: cp.path });
  }
  const unp = checkBudget('zipUnpacked', declaredTotal, limits);
  if (!unp.ok) return { ok: false, fatal: { path: '', code: 'ZIP_UNPACKED_TOO_LARGE', message: unp.message, messageEn: unp.messageEn }, budget: unp };
  const proj = checkBudget('totalProject', declaredTotal + existingProjectBytes, limits);
  if (!proj.ok) return { ok: false, fatal: { path: '', code: 'ZIP_UNPACKED_TOO_LARGE', message: proj.message, messageEn: proj.messageEn }, budget: proj };
  // --- ekstraksi dengan batas keras ---
  const extracted = new Map<string, Uint8Array>();
  let actualTotal = 0;
  for (const { e, path } of files) {
    const cap = e.uncompressedSize;
    let data: Uint8Array;
    try {
      const raw = entryData(bytes, e);
      data = e.method === 0 ? raw : inflateCapped(raw, cap);
    } catch (err) {
      const reason = (err as Error).message;
      const code: ZipRejectCode = reason === 'ZIP_STREAM_CAP' ? 'ZIP_SIZE_MISMATCH' : reason === 'ZIP_CRC_MISMATCH' ? reason : 'ZIP_CORRUPT';
      return { ok: false, fatal: problem(path, code) };
    }
    if (data.length !== e.uncompressedSize) return { ok: false, fatal: problem(path, 'ZIP_SIZE_MISMATCH') };
    actualTotal += data.length;
    if (actualTotal > limits.zipUnpackedBytes) return { ok: false, fatal: problem(path, 'ZIP_UNPACKED_TOO_LARGE') };
    if (crc32(data) !== e.crc32) return { ok: false, fatal: problem(path, 'ZIP_CRC_MISMATCH') };
    extracted.set(path, data);
  }
  return { ok: true, files: extracted, totalUnpacked: actualTotal, entries: entries.length };
}

/** No project is modified until every entry has passed the archive integrity checks. */
export async function importZip(bytes: Uint8Array, opts: ZipImportOptions = {}): Promise<ZipImportResult> {
  const limits = opts.limits ?? LIMITS;
  const mdExt = opts.markdownExt ?? /\.(md|markdown|txt)$/i;
  const extracted = extractZipFiles(bytes, limits, opts.existingProjectBytes, 'documents', mdExt);
  if (!extracted.ok) return extracted;
  const markdown: { path: string; text: string; bytes: number }[] = [];
  const assets: AssetRecord[] = []; const unsupported: ZipProblem[] = []; const rejected: ZipProblem[] = [];
  for (const [path, data] of extracted.files) {
    const isMd = mdExt.test(path);
    if (!isMd && !IMAGE_EXT.test(path)) {
      unsupported.push({ path, code: 'UNSUPPORTED_FILE', message: `Berkas tidak didukung dan dilewati: ${path}`, messageEn: `Unsupported file skipped: ${path}` });
      continue;
    }
    if (isMd) {
      const mb = checkBudget('markdown', data.length, limits);
      if (!mb.ok) return { ok: false, fatal: { path, code: 'ZIP_ENTRY_TOO_LARGE', message: mb.message, messageEn: mb.messageEn }, budget: mb };
      const d = decodeUtf8Strict(data);
      if (!d.ok) { rejected.push({ path, code: 'INVALID_UTF8', message: `Naskah bukan UTF-8 yang valid: ${path}`, messageEn: `Document is not valid UTF-8: ${path}` }); continue; }
      markdown.push({ path, text: d.text, bytes: data.length });
    } else {
      const r = await createAssetRecord(data, path, 'zip', limits);
      if (!r.ok) rejected.push({ path, code: 'ASSET_REJECTED', message: r.message, messageEn: r.messageEn });
      else assets.push(r.asset);
    }
  }
  markdown.sort((a, b) => a.path.localeCompare(b.path));
  return { ok: true, markdown, assets, unsupported, rejected, needsSelection: markdown.length > 1, totalUnpacked: extracted.totalUnpacked, entries: extracted.entries };
}
