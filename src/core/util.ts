/**
 * Utilitas bersama core: Issue bilingual, FNV hash ringkas, escape HTML.
 * Tidak ada akses jaringan dan tidak ada state global selain yang disebut eksplisit.
 */
import type { Issue, Severity, SourceRef } from './contracts';

/** Issue dengan pesan Inggris tambahan (kontrak Issue.message = Indonesia). */
export interface CoreIssue extends Issue {
  messageEn?: string;
  /** data terstruktur untuk UI (tanpa isi dokumen panjang) */
  detail?: Record<string, string | number | boolean | string[]>;
}

export interface Bilingual { id: string; en: string }

export function mkIssue(
  code: string,
  severity: Severity,
  scope: Issue['scope'],
  msg: Bilingual,
  extra: Partial<Pick<CoreIssue, 'line' | 'blockId' | 'blocking' | 'sourceRef' | 'detail'>> = {},
): CoreIssue {
  const out: CoreIssue = { id: '', code, severity, scope, message: msg.id, messageEn: msg.en };
  if (extra.line !== undefined) out.line = extra.line;
  if (extra.blockId !== undefined) out.blockId = extra.blockId;
  if (extra.blocking !== undefined) out.blocking = extra.blocking;
  if (extra.sourceRef !== undefined) out.sourceRef = extra.sourceRef as SourceRef;
  if (extra.detail !== undefined) out.detail = extra.detail;
  return out;
}

/** Memberi id berurutan yang stabil (issue-001…) dengan prefix opsional. */
export function numberIssues<T extends Issue>(issues: T[], prefix = 'issue'): T[] {
  issues.forEach((it, i) => { it.id = `${prefix}-${String(i + 1).padStart(3, '0')}`; });
  return issues;
}

/** FNV-1a 32-bit atas unit UTF-16 → 8 hex. Hanya untuk id blok, BUKAN untuk integritas. */
export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / 1048576).toFixed(2)} MiB`;
}

/** Nomor baris (1-based) untuk indeks UTF-16 pada teks. */
export function lineOf(text: string, index: number): number {
  let line = 1;
  const end = Math.min(index, text.length);
  for (let i = 0; i < end; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

/** Jendela inert untuk DOM (browser atau jsdom). Melempar bila tidak ada DOM. */
export function requireDom(): Window & typeof globalThis {
  const w = (globalThis as { window?: Window & typeof globalThis }).window;
  if (!w || !w.document || typeof w.DOMParser === 'undefined') {
    throw new Error('CORE_DOM_REQUIRED: fungsi ini memerlukan DOM (browser atau jsdom).');
  }
  return w;
}

/** Dokumen inert: tidak memuat sumber daya dan tidak menjalankan skrip. */
export function parseInert(html: string): Document {
  const w = requireDom();
  return new w.DOMParser().parseFromString(`<!doctype html><html><body>${html}</body></html>`, 'text/html');
}

export function nowIso(): string { return new Date().toISOString(); }

let idCounter = 0;
/** ID acak (bukan untuk keamanan kriptografis bila crypto tidak tersedia). */
export function randomId(prefix: string): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return `${prefix}-${c.randomUUID()}`;
  idCounter++;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Identitas rujukan gambar untuk pemeriksaan keutuhan: URL data: diringkas (hash + panjang) di kedua sisi agar base64 tidak diduplikasi di HTML. */
export function imageRefKey(url: string): string {
  return /^data:/i.test(url) ? `data:#${fnv1a(url)}:${url.length}` : url;
}
