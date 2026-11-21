/**
 * Deteksi pembungkus ```markdown luar & perbaikan reversibel (IMP-02, OUTER_FENCE baseline).
 * Pembungkus HANYA dilepas lewat unwrapWrapper() atas keputusan eksplisit pengguna.
 */
import { createTwoFilesPatch } from 'diff';

export type WrapperDetection =
  | { kind: 'none' }
  | { kind: 'single' | 'ambiguous'; openLine: number; closeLine: number; info: string; fence: string; reason: string; reasonEn: string;
      /** ada fence dalam yang menutup pembungkus lebih awal menurut CommonMark (tampilan sekarang rusak) */
      innerClosesEarly: boolean };

const OPEN_RE = /^ {0,3}(`{3,}|~{3,})[ \t]*([^`\s]*)[^`]*$/;

function splitLines(s: string): string[] { return s.split(/\r\n|\r|\n/); }

export function detectWrapper(source: string): WrapperDetection {
  const lines = splitLines(source);
  let first = 0; while (first < lines.length && lines[first]!.trim() === '') first++;
  let last = lines.length - 1; while (last >= 0 && lines[last]!.trim() === '') last--;
  if (first >= lines.length || last <= first) return { kind: 'none' };
  // cari fence pembuka bertanda markdown dalam 3 baris pertama non-kosong
  let open = -1;
  for (let i = first; i < lines.length && i <= first + 3; i++) {
    const m = OPEN_RE.exec(lines[i]!);
    if (m) { open = i; break; }
    if (lines[i]!.trim() !== '' && i > first + 2) break;
  }
  if (open < 0) return { kind: 'none' };
  const m = OPEN_RE.exec(lines[open]!)!;
  const fence = m[1]!; const info = (m[2] ?? '').toLowerCase();
  if (!['markdown', 'md', 'gfm', ''].includes(info)) return { kind: 'none' };
  // penutup: baris fence polos dengan karakter sama & panjang >= pembuka, dekat akhir
  let close = -1;
  for (let i = last; i > open && i >= last - 3; i--) {
    const t = lines[i]!.trim();
    if (t.length >= fence.length && t === fence[0]!.repeat(t.length)) { close = i; break; }
  }
  if (close < 0) return { kind: 'none' };
  const inner = lines.slice(open + 1, close);
  // CommonMark: di dalam fence, baris fence POLOS dengan karakter sama dan panjang >= pembuka menutup blok.
  const innerClosesEarly = inner.some((l) => { const t = l.trim(); return /^ {0,3}(`{3,}|~{3,})\s*$/.test(l) && t[0] === fence[0] && t.length >= fence.length; });
  const body = inner.join('\n');
  const looksMd = /^(#{1,6}\s|\s*[-*+]\s|\s*\d+[.)]\s|\|.*\||>\s|\$\$|```|~~~)/m.test(body);
  const base = { openLine: open + 1, closeLine: close + 1, info, fence, innerClosesEarly };
  if (open > first || close < last) {
    return { kind: 'ambiguous', ...base, reason: 'Ada teks di luar blok kode pembungkus, sehingga tidak dapat dipastikan apakah blok itu pembungkus naskah atau contoh kode.', reasonEn: 'There is text outside the wrapping code block, so it is unclear whether it wraps the document or is a code example.' };
  }
  if (info === '' && !looksMd) {
    return { kind: 'ambiguous', ...base, reason: 'Blok kode tidak bertanda "markdown" dan isinya tidak jelas berupa Markdown.', reasonEn: 'The code block is not labelled "markdown" and its content is not clearly Markdown.' };
  }
  return { kind: 'single', ...base, reason: '', reasonEn: '' };
}

/** Operasi sumber yang dapat dibatalkan; `diff` = unified diff untuk ditinjau pengguna. */
export interface ReversibleEdit {
  id: string; label: string; labelEn: string; before: string; after: string; diff: string;
  apply(current: string): { ok: true; text: string } | { ok: false; code: 'SOURCE_CHANGED' };
  undo(current: string): { ok: true; text: string } | { ok: false; code: 'SOURCE_CHANGED' };
}

export function makeEdit(id: string, label: string, labelEn: string, before: string, after: string): ReversibleEdit {
  return {
    id, label, labelEn, before, after,
    diff: createTwoFilesPatch('sebelum.md', 'sesudah.md', before, after, '', '', { context: 2 }),
    apply: (cur) => (cur === before ? { ok: true, text: after } : { ok: false, code: 'SOURCE_CHANGED' }),
    undo: (cur) => (cur === after ? { ok: true, text: before } : { ok: false, code: 'SOURCE_CHANGED' }),
  };
}

/**
 * Melepas pembungkus (keputusan eksplisit). Hanya baris pembuka & penutup yang dihapus;
 * fence dalam, kode, dan seluruh isi lain tidak disentuh. Pemisah baris asli (CRLF/LF) dipertahankan.
 */
export function unwrapWrapper(source: string, det: WrapperDetection): ReversibleEdit | null {
  if (det.kind === 'none') return null;
  const parts = source.split(/(\r\n|\r|\n)/); // [line, sep, line, sep, ...]
  const lineIdx = (n: number) => (n - 1) * 2;
  const drop = new Set([lineIdx(det.openLine), lineIdx(det.openLine) + 1, lineIdx(det.closeLine), lineIdx(det.closeLine) + 1]);
  const after = parts.filter((_, i) => !drop.has(i)).join('');
  return makeEdit('unwrap-fence', 'Lepas blok kode pembungkus', 'Remove wrapping code block', source, after);
}
