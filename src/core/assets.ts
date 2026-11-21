/**
 * Aset (PF-004, CODE-03, AST-01/02/03/04, PF-014/CODE-09):
 *  - identitas = sha256 bytes (AssetRecord.id);
 *  - MIME diendus dari magic bytes, bukan dari nama berkas; dimensi dibaca dari header;
 *  - cache data: URL dikunci oleh hash isi, berbatas ukuran dengan pembuangan LRU;
 *  - SVG disanitasi (tanpa skrip, handler, foreignObject, atau referensi eksternal).
 */
import DOMPurify from 'dompurify';
import type { AssetRecord, Limits, Project, Snapshot } from './contracts';
import { sha256Hex, sha256HexSync } from './hash';
import { IMAGE_BUDGET, LIMITS, checkBudget, type BudgetResult } from './limits';
import { fnv1a } from './util';

export type SniffedMime = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' | 'image/svg+xml';
export const SUPPORTED_IMAGE_MIME: readonly SniffedMime[] = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];
export const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg)$/i;

/** MIME berdasarkan magic bytes; null bila bukan format gambar yang didukung. */
export function sniffMime(b: Uint8Array): SniffedMime | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return 'image/gif';
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  // SVG: teks UTF-8; lewati BOM/spasi/deklarasi XML/komentar/doctype
  const head = new TextDecoder('utf-8', { fatal: false }).decode(b.subarray(0, Math.min(b.length, 4096))).replace(/^﻿/, '');
  const t = head.replace(/^\s*(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*/i, '');
  if (/^<svg[\s>]/i.test(t)) return 'image/svg+xml';
  return null;
}

/** Dimensi piksel dari header (PNG/GIF/JPEG/WebP) atau atribut SVG; undefined bila tidak terbaca. */
export function imageDimensions(b: Uint8Array, mime: string): { width: number; height: number } | undefined {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  try {
    if (mime === 'image/png' && b.length >= 24) return { width: dv.getUint32(16), height: dv.getUint32(20) };
    if (mime === 'image/gif' && b.length >= 10) return { width: dv.getUint16(6, true), height: dv.getUint16(8, true) };
    if (mime === 'image/jpeg') {
      let i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) { i++; continue; }
        const marker = b[i + 1]!;
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
        const len = dv.getUint16(i + 2);
        if ((marker >= 0xc0 && marker <= 0xcf) && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: dv.getUint16(i + 5), width: dv.getUint16(i + 7) };
        }
        i += 2 + len;
      }
      return undefined;
    }
    if (mime === 'image/webp' && b.length >= 30) {
      const fourcc = String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!);
      if (fourcc === 'VP8 ') return { width: dv.getUint16(26, true) & 0x3fff, height: dv.getUint16(28, true) & 0x3fff };
      if (fourcc === 'VP8L') { const v = dv.getUint32(21, true); return { width: (v & 0x3fff) + 1, height: ((v >> 14) & 0x3fff) + 1 }; }
      if (fourcc === 'VP8X') return { width: 1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16)), height: 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16)) };
    }
    if (mime === 'image/svg+xml') {
      const t = new TextDecoder().decode(b.subarray(0, Math.min(b.length, 8192)));
      const tag = /<svg\b[^>]*>/i.exec(t)?.[0] ?? '';
      const num = (a: string) => { const m = new RegExp(`\\b${a}\\s*=\\s*["']\\s*([0-9.]+)(px)?\\s*["']`, 'i').exec(tag); return m ? Number(m[1]) : undefined; };
      const w = num('width'), h = num('height');
      if (w && h) return { width: w, height: h };
      const vb = /\bviewBox\s*=\s*["']\s*[-0-9.]+[\s,]+[-0-9.]+[\s,]+([0-9.]+)[\s,]+([0-9.]+)\s*["']/i.exec(tag);
      if (vb) return { width: Number(vb[1]), height: Number(vb[2]) };
    }
  } catch { /* header rusak */ }
  return undefined;
}

/**
 * Normalisasi path relatif untuk resolusi gambar (AST-01): decode persen (bila valid), NFC,
 * hapus `./`, selesaikan `..` (tidak boleh keluar akar), tanpa query/fragment. Backslash ditolak (null).
 */
export function normalizeAssetPath(url: string, sourcePath?: string): string | null {
  let ref = url.trim();
  if (ref.startsWith('<') && ref.endsWith('>')) ref = ref.slice(1, -1);
  if (/^[a-z][a-z0-9+.-]*:/i.test(ref) || ref.startsWith('//')) return null;
  ref = ref.split(/[?#]/, 1)[0]!;
  if (!ref) return null;
  const parts = !ref.startsWith('/') && sourcePath ? sourcePath.split('/').slice(0, -1) : [];
  if (parts.some(p => !p || p === '.' || p === '..' || /[\\\u0000-\u001f]/u.test(p))) return null;
  for (const raw of ref.split('/')) {
    let part: string;
    try { part = decodeURIComponent(raw); } catch { return null; }
    if (/[/\\\u0000-\u001f]/u.test(part)) return null;
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!parts.length) return null;
      parts.pop();
    } else parts.push(part);
  }
  return parts.length ? parts.join('/').normalize('NFC') : null;
}

/* ---------------- sanitasi SVG ---------------- */
export interface SvgSanitizeResult { bytes: Uint8Array; removed: string[]; ok: boolean }

/** SVG aman: DOMPurify profil svg, tanpa foreignObject/skrip/handler; href hanya #fragment atau data:image raster. */
export function sanitizeSvgBytes(bytes: Uint8Array): SvgSanitizeResult {
  const text = new TextDecoder().decode(bytes);
  const w = (globalThis as { window?: Window & typeof globalThis }).window;
  if (!w?.document) {
    // Tanpa DOM: tolak konservatif bila ada pola aktif.
    const risky = /<script|\son[a-z]+\s*=|javascript:|<foreignObject|<iframe|<!ENTITY|xlink:href\s*=\s*["']\s*(?!#)|\shref\s*=\s*["']\s*(?!#|data:image\/(png|jpeg|gif|webp))/i.test(text);
    return risky ? { bytes: new Uint8Array(), removed: ['svg-unsanitizable-without-dom'], ok: false } : { bytes, removed: [], ok: true };
  }
  const purify = DOMPurify(w);
  const removed: string[] = [];
  purify.addHook('uponSanitizeAttribute', (_node, data) => {
    if ((data.attrName === 'href' || data.attrName === 'xlink:href') && !/^\s*(#|data:image\/(png|jpeg|gif|webp);)/i.test(data.attrValue)) {
      data.keepAttr = false; removed.push(`${data.attrName}=${data.attrValue.slice(0, 60)}`);
    }
  });
  const clean = purify.sanitize(text, { USE_PROFILES: { svg: true, svgFilters: true }, FORBID_TAGS: ['foreignObject', 'style'], FORBID_ATTR: ['style'] });
  for (const r of purify.removed as { element?: Element; attribute?: Attr | null }[]) {
    if (r.element) removed.push(`<${(r.element.nodeName || '').toLowerCase()}>`);
    else if (r.attribute) removed.push(`@${r.attribute.name}`);
  }
  purify.removeAllHooks();
  const out = String(clean);
  if (!/^\s*<svg[\s>]/i.test(out)) return { bytes: new Uint8Array(), removed: [...removed, 'svg-root-missing'], ok: false };
  return { bytes: new TextEncoder().encode(out), removed, ok: true };
}

/* ---------------- cache data: URL berbasis hash ---------------- */
interface CacheEntry { url: string; bytesRef: Uint8Array; fp: string; size: number }
const DATA_URL_CACHE = new Map<string, CacheEntry>();
let cacheChars = 0;
export const DATA_URL_CACHE_MAX_CHARS = 64 * 1024 * 1024;

function bytesFingerprint(b: Uint8Array): string {
  // FNV atas seluruh bytes: memverifikasi entri cache bila objek bytes berbeda (melindungi dari id basi).
  let h = 0x811c9dc5;
  for (let i = 0; i < b.length; i++) { h ^= b[i]!; h = Math.imul(h, 0x01000193); }
  return `${b.length}:${(h >>> 0).toString(16)}`;
}

export function bytesToBase64(b: Uint8Array): string {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < b.length; i += CH) s += String.fromCharCode.apply(null, Array.from(b.subarray(i, i + CH)));
  return btoa(s);
}

/**
 * data: URL aset. Cache dikunci asset.id (hash isi) DAN diverifikasi terhadap bytes
 * (objek sama atau sidik FNV sama), sehingga penggantian bytes tidak pernah mengembalikan isi lama (CODE-03/AST-02).
 * SVG disanitasi terlebih dahulu; SVG yang tidak dapat diamankan menghasilkan SVG kosong berlabel.
 */
export function assetDataUrl(asset: AssetRecord): string {
  const key = `${asset.id}|${asset.mime}`;
  const hit = DATA_URL_CACHE.get(key);
  if (hit && (hit.bytesRef === asset.bytes || hit.fp === bytesFingerprint(asset.bytes))) {
    DATA_URL_CACHE.delete(key); DATA_URL_CACHE.set(key, hit); // LRU sentuh
    return hit.url;
  }
  let bytes = asset.bytes;
  if (asset.mime === 'image/svg+xml') {
    const s = sanitizeSvgBytes(bytes);
    bytes = s.ok ? s.bytes : new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>');
  }
  const url = `data:${asset.mime};base64,${bytesToBase64(bytes)}`;
  if (hit) { cacheChars -= hit.size; DATA_URL_CACHE.delete(key); }
  const entry: CacheEntry = { url, bytesRef: asset.bytes, fp: bytesFingerprint(asset.bytes), size: url.length };
  if (url.length <= DATA_URL_CACHE_MAX_CHARS) {
    DATA_URL_CACHE.set(key, entry); cacheChars += url.length;
    while (cacheChars > DATA_URL_CACHE_MAX_CHARS && DATA_URL_CACHE.size) {
      const [k, v] = DATA_URL_CACHE.entries().next().value as [string, CacheEntry];
      DATA_URL_CACHE.delete(k); cacheChars -= v.size;
    }
  }
  return url;
}

export function dataUrlCacheStats(): { entries: number; chars: number; maxChars: number } {
  return { entries: DATA_URL_CACHE.size, chars: cacheChars, maxChars: DATA_URL_CACHE_MAX_CHARS };
}
/** Membuang seluruh cache (proyek baru / hapus data). */
export function clearDataUrlCache(): void { DATA_URL_CACHE.clear(); cacheChars = 0; }
/** Membuang entri cache untuk aset tertentu (replace/delete). */
export function evictAsset(id: string): void {
  for (const [k, v] of DATA_URL_CACHE) if (k.startsWith(`${id}|`)) { DATA_URL_CACHE.delete(k); cacheChars -= v.size; }
}

/* ---------------- AssetStore ---------------- */
export type AddAssetResult =
  | { ok: true; asset: AssetRecord; replaced?: AssetRecord; svgRemoved?: string[] }
  | { ok: false; code: 'BUDGET_EXCEEDED' | 'UNSUPPORTED_TYPE' | 'INVALID_PATH' | 'SVG_UNSAFE' | 'IMAGE_DIMENSIONS_UNREADABLE' | 'IMAGE_PIXELS_EXCEEDED'; message: string; messageEn: string; budget?: BudgetResult };

export { IMAGE_BUDGET } from './limits';

export function pixelsOf(a: Pick<AssetRecord, 'mime' | 'width' | 'height'>): number {
  return a.mime === 'image/svg+xml' || !a.width || !a.height ? 0 : a.width * a.height;
}

export type InlineImageInspection =
  | { ok: true; id: string; mime: SniffedMime; width: number; height: number; pixels: number; byteLength: number }
  | { ok: false; code: 'INLINE_IMAGE_INVALID' | 'IMAGE_PIXELS_EXCEEDED' | 'BUDGET_EXCEEDED'; message: string; messageEn: string };

/** RC4-R02: inspect data-image bytes and raster headers before an <img> can reach the DOM.
 * This is bounded resource admission, not a full image decoder or a proof that every frame is valid.
 * Encoded size is checked before atob/Uint8Array, then MIME and declared dimensions are checked.
 */
export function inspectInlineImage(url: string, limits: Limits = LIMITS): InlineImageInspection {
  const invalid = (): InlineImageInspection => ({ ok: false, code: 'INLINE_IMAGE_INVALID',
    message: 'Gambar inline memiliki base64, MIME, atau header dimensi yang tidak valid. Gambar tidak didekode; sumber asli tetap tersedia.',
    messageEn: 'The inline image has invalid base64, MIME, or dimension headers. It was not decoded; the original source is retained.' });
  const comma = url.indexOf(',');
  const header = /^data:(image\/(?:png|jpeg|gif|webp));base64$/i.exec(url.slice(0, comma).trim());
  if (comma < 0 || !header) return invalid();
  const payload = url.slice(comma + 1).replace(/[\t\n\f\r ]/g, '');
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  const estimatedBytes = Math.floor(payload.length * 3 / 4) - padding;
  const budget = checkBudget('asset', estimatedBytes, limits);
  if (!budget.ok) return { ok: false, code: 'BUDGET_EXCEEDED', message: budget.message, messageEn: budget.messageEn };
  if (!payload || payload.length % 4 === 1 || (padding && payload.length % 4 !== 0) || !/^[a-z0-9+/]+={0,2}$/i.test(payload)) return invalid();
  let bytes: Uint8Array;
  try {
    const decoded = atob(payload);
    // atob implements the forgiving base64 rules; still verify the actual decoded allocation bound.
    if (decoded.length !== estimatedBytes) return invalid();
    bytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
  } catch { return invalid(); }
  const mime = sniffMime(bytes);
  if (!mime || mime !== header[1]!.toLowerCase()) return invalid();
  // PNG dimensions are only meaningful in the mandatory first IHDR chunk.
  if (mime === 'image/png' && (bytes.length < 24 || new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(8) !== 13 || String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR')) return invalid();
  const dim = imageDimensions(bytes, mime);
  if (!dim || !Number.isFinite(dim.width) || !Number.isFinite(dim.height) || dim.width < 1 || dim.height < 1) return invalid();
  const pixels = dim.width * dim.height;
  if (dim.width > IMAGE_BUDGET.maxDimension || dim.height > IMAGE_BUDGET.maxDimension || pixels > IMAGE_BUDGET.maxPixels) return {
    ok: false, code: 'IMAGE_PIXELS_EXCEEDED',
    message: `Gambar inline terlalu besar untuk didekode (${dim.width}×${dim.height} piksel; batas ${IMAGE_BUDGET.maxDimension} per sisi dan ${IMAGE_BUDGET.maxPixels / 1e6} MP). Perkecil gambar; sumber tidak diubah.`,
    messageEn: `The inline image is too large to decode (${dim.width}×${dim.height} px; limit ${IMAGE_BUDGET.maxDimension} per side and ${IMAGE_BUDGET.maxPixels / 1e6} MP). Resize the image; the source was not changed.`,
  };
  return { ok: true, id: sha256HexSync(bytes), mime, ...dim, pixels, byteLength: bytes.byteLength };
}

function svgDeclaredSize(b: Uint8Array): { width?: number; height?: number } {
  const t = new TextDecoder().decode(b.subarray(0, Math.min(b.length, 8192)));
  const tag = /<svg\b[^>]*>/i.exec(t)?.[0] ?? '';
  const num = (a: string) => { const m = new RegExp(`\\b${a}\\s*=\\s*["']\\s*([0-9.eE+]+)(px)?\\s*["']`, 'i').exec(tag); return m ? Number(m[1]) : undefined; };
  return { width: num('width'), height: num('height') };
}

export async function createAssetRecord(bytes: Uint8Array, path: string, origin: AssetRecord['origin'], limits: Limits = LIMITS): Promise<AddAssetResult> {
  const b = checkBudget('asset', bytes.byteLength, limits);
  if (!b.ok) return { ok: false, code: 'BUDGET_EXCEEDED', message: b.message, messageEn: b.messageEn, budget: b };
  const mime = sniffMime(bytes);
  if (!mime) return { ok: false, code: 'UNSUPPORTED_TYPE', message: `Berkas "${path}" bukan gambar PNG/JPEG/GIF/WebP/SVG yang dikenali dari isinya.`, messageEn: `File "${path}" is not a PNG/JPEG/GIF/WebP/SVG image according to its content.` };
  let svgRemoved: string[] | undefined;
  if (mime === 'image/svg+xml') {
    const s = sanitizeSvgBytes(bytes);
    if (!s.ok) return { ok: false, code: 'SVG_UNSAFE', message: `SVG "${path}" tidak dapat diamankan dan ditolak.`, messageEn: `SVG "${path}" could not be made safe and was rejected.` };
    svgRemoved = s.removed;
  }
  const dim = imageDimensions(bytes, mime);
  const tooBig = { ok: false as const, code: 'IMAGE_PIXELS_EXCEEDED' as const,
    message: `Gambar "${path}" terlalu besar untuk didekode dengan aman (${dim?.width ?? '?'}×${dim?.height ?? '?'} piksel; batas ${IMAGE_BUDGET.maxDimension} piksel per sisi dan ${IMAGE_BUDGET.maxPixels / 1e6} MP). Perkecil gambar lalu unggah lagi; proyek tidak diubah.`,
    messageEn: `Image "${path}" is too large to decode safely (${dim?.width ?? '?'}×${dim?.height ?? '?'} px; limit ${IMAGE_BUDGET.maxDimension} px per side and ${IMAGE_BUDGET.maxPixels / 1e6} MP). Resize it and upload again; the project was not changed.` };
  if (mime === 'image/svg+xml') {
    const d = svgDeclaredSize(bytes);
    if ((d.width ?? 0) > IMAGE_BUDGET.maxDimension || (d.height ?? 0) > IMAGE_BUDGET.maxDimension) return tooBig;
  } else {
    if (!dim || !Number.isFinite(dim.width) || !Number.isFinite(dim.height) || dim.width < 1 || dim.height < 1) {
      return { ok: false, code: 'IMAGE_DIMENSIONS_UNREADABLE', message: `Dimensi gambar "${path}" tidak dapat dibaca dari header; berkas mungkin rusak. Gambar tidak didekode dan tidak ditambahkan.`, messageEn: `The dimensions of "${path}" cannot be read from its header; the file may be damaged. It was not decoded or added.` };
    }
    if (dim.width > IMAGE_BUDGET.maxDimension || dim.height > IMAGE_BUDGET.maxDimension || dim.width * dim.height > IMAGE_BUDGET.maxPixels) return tooBig;
  }
  const rec: AssetRecord = { id: await sha256Hex(bytes), path, mime, bytes, origin };
  if (dim) { rec.width = dim.width; rec.height = dim.height; }
  return svgRemoved && svgRemoved.length ? { ok: true, asset: rec, svgRemoved } : { ok: true, asset: rec };
}

/** Kumpulan aset proyek: path ternormalisasi → aset; anggaran total proyek dijaga (AST-08). */
export class AssetStore {
  private byPath = new Map<string, AssetRecord>();
  constructor(initial: AssetRecord[] = [], private limits: Limits = LIMITS, private otherProjectBytes = 0) {
    for (const a of initial) this.byPath.set(a.path.normalize('NFC'), a);
  }
  list(): AssetRecord[] { return [...this.byPath.values()]; }
  get(path: string): AssetRecord | undefined { return this.byPath.get(path.normalize('NFC')); }
  totalBytes(): number { let t = 0; for (const a of this.byPath.values()) t += a.bytes.byteLength; return t; }
  setOtherProjectBytes(n: number): void { this.otherProjectBytes = n; }

  /** Menambah/mengganti aset. Penggantian path yang sama dengan bytes berbeda → id baru, cache lama dibuang. */
  async add(bytes: Uint8Array, path: string, origin: AssetRecord['origin']): Promise<AddAssetResult> {
    const key = /^https?:\/\//i.test(path) && origin === 'remote-copy' ? path
      : path && !/^[a-z][a-z0-9+.-]*:|[\\\u0000-\u001f]/i.test(path)
        && path.split('/').every(part => part && part !== '..' && part !== '.') ? path.normalize('NFC') : null;
    if (!key) return { ok: false, code: 'INVALID_PATH', message: `Path aset tidak valid: "${path}".`, messageEn: `Invalid asset path: "${path}".` };
    const r = await createAssetRecord(bytes, key, origin, this.limits);
    if (!r.ok) return r;
    const prev = this.byPath.get(key);
    const newTotal = this.totalBytes() - (prev?.bytes.byteLength ?? 0) + bytes.byteLength + this.otherProjectBytes;
    const tb = checkBudget('totalProject', newTotal, this.limits);
    if (!tb.ok) return { ok: false, code: 'BUDGET_EXCEEDED', message: tb.message, messageEn: tb.messageEn, budget: tb };
    const px = [...this.byPath.values()].reduce((sum, a) => sum + pixelsOf(a), 0) - (prev ? pixelsOf(prev) : 0) + pixelsOf(r.asset);
    if (px > IMAGE_BUDGET.maxTotalPixels) return { ok: false, code: 'IMAGE_PIXELS_EXCEEDED', message: `Total piksel gambar proyek (${Math.round(px / 1e6)} MP) melewati batas ${IMAGE_BUDGET.maxTotalPixels / 1e6} MP. Perkecil atau kurangi gambar; proyek tidak diubah.`, messageEn: `Total project image pixels (${Math.round(px / 1e6)} MP) exceed the ${IMAGE_BUDGET.maxTotalPixels / 1e6} MP limit. Resize or remove images; the project was not changed.` };
    this.byPath.set(key, r.asset);
    if (prev && prev.id !== r.asset.id) evictAsset(prev.id);
    return prev ? { ...r, replaced: prev } : r;
  }

  /** Menambah banyak aset secara transaksional: semua atau tidak sama sekali (AST-08). */
  async addMany(items: { bytes: Uint8Array; path: string; origin: AssetRecord['origin'] }[]): Promise<{ ok: true; added: AssetRecord[] } | { ok: false; failed: { path: string; message: string; messageEn: string }; budget?: BudgetResult }> {
    const snapshot = new Map(this.byPath);
    const added: AssetRecord[] = [];
    for (const it of items) {
      const r = await this.add(it.bytes, it.path, it.origin);
      if (!r.ok) { this.byPath = snapshot; return r.budget ? { ok: false, failed: { path: it.path, message: r.message, messageEn: r.messageEn }, budget: r.budget } : { ok: false, failed: { path: it.path, message: r.message, messageEn: r.messageEn } }; }
      added.push(r.asset);
    }
    return { ok: true, added };
  }

  remove(path: string): boolean {
    const n = path.normalize('NFC');
    const prev = this.byPath.get(n);
    if (!prev) return false;
    this.byPath.delete(n); evictAsset(prev.id);
    return true;
  }
}

/* ---------------- gambar eksternal (PF-014, CODE-09) ---------------- */
export interface ExternalImageRef { url: string; alt: string; line: number; resolvedAssetId?: string }

/** Pencocokan path aset: tepat → normalisasi → (URL eksternal) persis. */
export function resolveAsset(assets: AssetRecord[], url: string, sourcePath?: string): AssetRecord | undefined {
  if (/^https?:\/\//i.test(url)) return assets.find(a => a.path === url);
  const path = normalizeAssetPath(url, sourcePath);
  return path ? assets.find(a => a.path.normalize('NFC') === path) : undefined;
}

/**
 * Menyimpan salinan gambar jarak jauh yang bytes-nya DIPEROLEH UI (setelah persetujuan pengguna).
 * Core tidak pernah melakukan fetch. path = URL asli sehingga renderBody memakai salinan lokal.
 */
export async function embedRemoteCopy(store: AssetStore, url: string, bytes: Uint8Array): Promise<AddAssetResult> {
  if (!/^https:\/\//i.test(url)) return { ok: false, code: 'INVALID_PATH', message: 'Hanya URL https yang dapat disalin.', messageEn: 'Only https URLs can be copied.' };
  return store.add(bytes, url, 'remote-copy');
}

export interface AssetPreflight {
  /** true hanya bila SEMUA gambar yang dirujuk tersedia secara lokal (aset). */
  complete: boolean;
  total: number; resolved: string[]; missing: { path: string; line: number }[];
  external: ExternalImageRef[]; unresolvedExternal: ExternalImageRef[];
  message: string; messageEn: string;
}

export { fnv1a };
export type { Project, Snapshot };
