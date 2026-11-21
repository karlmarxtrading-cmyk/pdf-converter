/**
 * InputBudget — satu konfigurasi batas untuk paste, unggah berkas, ZIP, aset, dan ekspor
 * (PF-008, CODE-05, CODE-13, IMP-13, IMP-14, AST-07, AST-08).
 * Semua ukuran = byte UTF-8. Input berlebih DITOLAK UTUH; tidak ada pemotongan.
 * Angka di sini adalah batas konfigurasi, BUKAN kapasitas yang telah diukur.
 */
import type { Limits } from './contracts';
import { formatBytes, type Bilingual } from './util';

const MiB = 1024 * 1024;

/**
 * QA-02: anggaran dekode gambar, diperiksa dari HEADER sebelum gambar pernah didekode (tidak ada <img>/bitmap/canvas).
 * Angka ini batas keselamatan memori (RGBA 4 byte/piksel): 40 MP ≈ 160 MiB per gambar; total proyek 200 MP.
 * Ini bukan kapasitas yang dijamin untuk semua perangkat; perangkat bermemori kecil dapat gagal lebih awal dan
 * kegagalan itu dilaporkan tanpa mengubah sumber.
 */
export const IMAGE_BUDGET = Object.freeze({ maxDimension: 16_384, maxPixels: 40_000_000, maxTotalPixels: 200_000_000 });

export const LIMITS: Limits = Object.freeze({
  markdownBytes: 5 * MiB,
  pasteBytes: 5 * MiB,
  pasteHtmlBytes: 5 * MiB,
  assetBytes: 10 * MiB,
  totalProjectBytes: 30 * MiB,
  zipBytes: 30 * MiB,
  zipEntries: 500,
  zipMaxDepth: 8,
  zipMaxRatio: 100,
  zipUnpackedBytes: 30 * MiB,
  mathChars: 10_000,
  maxNodes: 400_000,
  maxNesting: 256,
  maxTableCells: 50_000,
  standaloneHtmlBytes: 25 * MiB,
  pdfPayloadBytes: 45 * MiB,
});

export type BudgetKind =
  | 'markdown' | 'paste' | 'pasteHtml' | 'asset' | 'totalProject'
  | 'zip' | 'zipEntries' | 'zipDepth' | 'zipRatio' | 'zipUnpacked'
  | 'math' | 'nodes' | 'nesting' | 'tableCells' | 'standaloneHtml' | 'pdfPayload';

const KIND_TO_LIMIT: Record<BudgetKind, keyof Limits> = {
  markdown: 'markdownBytes', paste: 'pasteBytes', pasteHtml: 'pasteHtmlBytes', asset: 'assetBytes',
  totalProject: 'totalProjectBytes', zip: 'zipBytes', zipEntries: 'zipEntries', zipDepth: 'zipMaxDepth',
  zipRatio: 'zipMaxRatio', zipUnpacked: 'zipUnpackedBytes', math: 'mathChars', nodes: 'maxNodes', nesting: 'maxNesting',
  tableCells: 'maxTableCells', standaloneHtml: 'standaloneHtmlBytes', pdfPayload: 'pdfPayloadBytes',
};

const KIND_LABEL: Record<BudgetKind, Bilingual> = {
  markdown: { id: 'Naskah Markdown', en: 'Markdown source' },
  paste: { id: 'Teks tempelan', en: 'Pasted text' },
  pasteHtml: { id: 'HTML clipboard', en: 'Clipboard HTML' },
  asset: { id: 'Berkas aset', en: 'Asset file' },
  totalProject: { id: 'Total proyek', en: 'Project total' },
  zip: { id: 'Berkas ZIP', en: 'ZIP file' },
  zipEntries: { id: 'Jumlah entri ZIP', en: 'ZIP entry count' },
  zipDepth: { id: 'Kedalaman folder ZIP', en: 'ZIP folder depth' },
  zipRatio: { id: 'Rasio kompresi ZIP', en: 'ZIP compression ratio' },
  zipUnpacked: { id: 'Ukuran ZIP setelah diekstrak', en: 'ZIP unpacked size' },
  math: { id: 'Panjang rumus', en: 'Formula length' },
  nodes: { id: 'Jumlah elemen dokumen', en: 'Document node count' },
  nesting: { id: 'Kedalaman struktur dokumen', en: 'Document nesting depth' },
  tableCells: { id: 'Jumlah sel tabel', en: 'Table cell count' },
  standaloneHtml: { id: 'HTML mandiri', en: 'Standalone HTML' },
  pdfPayload: { id: 'Muatan PDF', en: 'PDF payload' },
};

const COUNT_KINDS = new Set<BudgetKind>(['zipEntries', 'zipDepth', 'zipRatio', 'math', 'nodes', 'nesting', 'tableCells']);

export interface BudgetResult {
  ok: boolean; kind: BudgetKind; limitKey: keyof Limits;
  /** nilai aktual (byte UTF-8, atau hitungan untuk batas non-byte) */
  actual: number; limit: number; unit: 'bytes' | 'count';
  code: 'OK' | 'BUDGET_EXCEEDED';
  message: string; messageEn: string;
}

const enc = new TextEncoder();

/** Scratch space contains at most 128 KiB while measuring UTF-8 and never escapes this module. */
export function utf8Length(s: string): number {
  if (!/[^\x00-\x7f]/.test(s)) return s.length;
  const sizeBuffer = new Uint8Array(Math.min(128 * 1024, 3 * s.length));
  let bytes = 0, position = 0;
  while (position < s.length) {
    const count = enc.encodeInto(position === 0 ? s : s.slice(position), sizeBuffer);
    bytes += count.written;
    position += count.read;
  }
  return bytes;
}

export function utf8Encode(s: string): Uint8Array { return enc.encode(s); }

const numberFormat = new Intl.NumberFormat('en-US');
function fmt(kind: BudgetKind, v: number): string {
  if (!COUNT_KINDS.has(kind)) return `${numberFormat.format(v)} byte (${formatBytes(v)})`;
  return numberFormat.format(v);
}

/**
 * Satu-satunya pemeriksa anggaran. `actual` = byte UTF-8 (atau hitungan).
 * Lolos bila actual <= limit (tepat di batas = diterima; satu di atas = ditolak).
 */
export function checkBudget(kind: BudgetKind, actual: number, limits: Limits = LIMITS): BudgetResult {
  const limitKey = KIND_TO_LIMIT[kind];
  const limit = limits[limitKey];
  const unit = COUNT_KINDS.has(kind) ? 'count' : 'bytes';
  const ok = Number.isFinite(actual) && actual >= 0 && actual <= limit;
  const label = KIND_LABEL[kind];
  return {
    ok, kind, limitKey, actual, limit, unit, code: ok ? 'OK' : 'BUDGET_EXCEEDED',
    message: ok
      ? `${label.id}: ${fmt(kind, actual)} dari batas ${fmt(kind, limit)}.`
      : `${label.id} melebihi batas: ${fmt(kind, actual)} > ${fmt(kind, limit)}. Input ditolak utuh; tidak ada bagian yang dipotong dan dokumen aktif tidak berubah.`,
    messageEn: ok
      ? `${label.en}: ${fmt(kind, actual)} of limit ${fmt(kind, limit)}.`
      : `${label.en} exceeds the limit: ${fmt(kind, actual)} > ${fmt(kind, limit)}. The input was rejected whole; nothing was truncated and the active document is unchanged.`,
  };
}

export class BudgetError extends Error {
  readonly code = 'BUDGET_EXCEEDED';
  constructor(public readonly result: BudgetResult) { super(result.message); this.name = 'BudgetError'; }
}

export function assertBudget(kind: BudgetKind, actual: number, limits: Limits = LIMITS): void {
  if (Number.isFinite(actual) && actual >= 0 && actual <= limits[KIND_TO_LIMIT[kind]]) return;
  throw new BudgetError(checkBudget(kind, actual, limits));
}

/** RC4-R01: iterative admission runs before recursive transforms, so deep small files cannot overflow the stack.
 * The entire input is rejected on failure; no AST subtree or source text is truncated.
 */
export function checkTreeBudget(tree: unknown, limits: Limits = LIMITS): BudgetResult | null {
  const stack: { node: unknown; depth: number }[] = [{ node: tree, depth: 0 }];
  let count = 0;
  while (stack.length) {
    const { node, depth } = stack.pop()!;
    if (++count > limits.maxNodes) return checkBudget('nodes', count, limits);
    if (depth > limits.maxNesting) return checkBudget('nesting', depth, limits);
    if (node && typeof node === 'object') {
      const children = 'children' in node ? node.children : 'childNodes' in node ? node.childNodes : undefined;
      if (Array.isArray(children)) for (const child of children) stack.push({ node: child, depth: depth + 1 });
      // HTML <template> has a separate fragment; the recursive HAST converter also visits it.
      if ('content' in node && node.content && typeof node.content === 'object') stack.push({ node: node.content, depth: depth + 1 });
    }
  }
  return null;
}

export function assertTreeBudget(tree: unknown, limits: Limits = LIMITS): void {
  const result = checkTreeBudget(tree, limits);
  if (result) throw new BudgetError(result);
}

/** Anggaran string (paste/markdown): ukuran dihitung dalam byte UTF-8, bukan jumlah karakter. */
export function checkTextBudget(kind: 'markdown' | 'paste' | 'pasteHtml', text: string, limits: Limits = LIMITS): BudgetResult {
  // Jalur cepat: panjang UTF-16 * 3 adalah batas atas byte UTF-8; panjang UTF-16 adalah batas bawah.
  const limit = limits[KIND_TO_LIMIT[kind]];
  if (text.length > limit) return checkBudget(kind, utf8Length(text), limits);
  return checkBudget(kind, text.length * 3 <= limit ? utf8Length(text) : utf8Length(text), limits);
}

/** Bentuk minimal File/Blob agar dapat diuji tanpa DOM. */
export interface FileLike { name?: string; size: number; arrayBuffer(): Promise<ArrayBuffer> }

export type ReadFileResult =
  | { ok: true; bytes: Uint8Array; budget: BudgetResult }
  | { ok: false; budget: BudgetResult };

/**
 * Membaca berkas HANYA setelah file.size lolos anggaran (CODE-05): arrayBuffer() tidak dipanggil
 * untuk berkas yang terlalu besar. Ukuran aktual diverifikasi lagi setelah dibaca.
 */
export async function readFileWithinBudget(file: FileLike, kind: 'markdown' | 'asset' | 'zip', limits: Limits = LIMITS): Promise<ReadFileResult> {
  const pre = checkBudget(kind, file.size, limits);
  if (!pre.ok) return { ok: false, budget: pre };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const post = checkBudget(kind, bytes.byteLength, limits);
  if (!post.ok) return { ok: false, budget: post };
  return { ok: true, bytes, budget: post };
}

/** Decode UTF-8 ketat; BOM dipertahankan pada hasil agar sumber mentah tidak berubah (IMP-01). */
export function decodeUtf8Strict(bytes: Uint8Array): { ok: true; text: string; hadBom: boolean } | { ok: false } {
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    return { ok: true, text, hadBom: text.charCodeAt(0) === 0xfeff };
  } catch { return { ok: false }; }
}
