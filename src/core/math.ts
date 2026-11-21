/**
 * Pemindai rumus dengan perlindungan mata uang (SEM-01) — mengikuti aturan baseline 1.0.0:
 *  - `$…$` hanya rumus bila pembuka tidak diikuti spasi, penutup tidak didahului spasi dan
 *    tidak diikuti angka, isi tidak kosong dan tidak melewati baris kosong;
 *  - `\$` adalah literal; isi code fence / inline code / komentar HTML dilewati;
 *  - `$$…$$`, `\(…\)`, `\[…\]` didukung.
 * Hasilnya `parseCopy`: salinan sumber dengan PANJANG UTF-16 SAMA (offset tetap valid) di mana
 * `$` literal diganti sentinel dan `\(`/`\)` dijadikan `$` + pengisi, sehingga remark-math
 * hanya melihat pasangan yang tervalidasi.
 *
 * EN-003 (statis 3.0): sentinel dipilih PER PEMINDAIAN dari blok Private Use (U+E000–U+F8FF) yang
 * TIDAK muncul di sumber. Karena itu karakter Private Use literal milik pengguna (mis. U+E001/U+E004)
 * tidak pernah ditafsirkan sebagai sentinel, dan pemulihan (`restorePua(s, scan)`) hanya mengganti
 * karakter yang memang dibuat pemindaian tersebut. Bila tidak ada pasangan bebas (sumber memuat
 * seluruh 6.400 titik kode PUA), penyamaran dimatikan dan pemulihan menjadi identitas.
 */
import katex from 'katex';
import { LIMITS } from './limits';
import { escapeHtml, lineOf } from './util';

/** Sentinel bawaan (dipakai bila sumber tidak memuatnya). Sentinel aktual per pemindaian ada di `MathScan.sentinels`. */
export const PUA_DOLLAR = '\uE001';
export const PUA_FILL = '\uE004';

export interface MathSpan { start: number; end: number; tex: string; display: boolean; delim: '$' | '$$' | '\\(' | '\\[' ; line: number }
export interface MathScanIssue { code: 'MATH_UNTERMINATED' | 'MATH_SUSPECT_UNTERMINATED'; line: number; snippet: string }
export interface MathSentinels { dollar: string; fill: string }
export interface MathScan {
  spans: MathSpan[]; literalDollars: number[]; issues: MathScanIssue[]; parseCopy: string;
  /** true bila sumber memuat karakter Private Use (informasi; tidak lagi mematikan perlindungan mata uang). */
  puaConflict: boolean;
  /** sentinel yang dipakai pemindaian ini; null = tidak ada penyamaran (parseCopy === sumber). */
  sentinels: MathSentinels | null;
}

/** Pilih dua titik kode Private Use yang tidak ada di `src`. */
export function chooseSentinels(src: string): MathSentinels | null {
  const preferred = [0xE001, 0xE004];
  const used = new Set<number>();
  for (let i = 0; i < src.length; i++) { const c = src.charCodeAt(i); if (c >= 0xE000 && c <= 0xF8FF) used.add(c); }
  if (!used.has(preferred[0]!) && !used.has(preferred[1]!)) return { dollar: String.fromCharCode(preferred[0]!), fill: String.fromCharCode(preferred[1]!) };
  const free: number[] = [];
  for (let c = 0xF8FF; c >= 0xE000 && free.length < 2; c--) if (!used.has(c)) free.push(c);
  return free.length === 2 ? { dollar: String.fromCharCode(free[0]!), fill: String.fromCharCode(free[1]!) } : null;
}

function fencedLines(lines: string[]): Set<number> {
  const inFence = new Set<number>();
  let fence: { ch: string; len: number } | null = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!.replace(/^(?:\s{0,3}>\s?)*/, '');
    const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(l);
    if (fence) {
      inFence.add(i);
      if (m && m[1]![0] === fence.ch && m[1]!.length >= fence.len && m[2]!.trim() === '') fence = null;
    } else if (m && !(m[1]![0] === '`' && m[2]!.includes('`'))) {
      fence = { ch: m[1]![0]!, len: m[1]!.length };
      inFence.add(i);
    }
  }
  return inFence;
}

export function scanMath(src: string): MathScan {
  const lines = src.split('\n');
  const lineStart: number[] = [];
  { let o = 0; for (const l of lines) { lineStart.push(o); o += l.length + 1; } }
  const fenced = fencedLines(lines);
  const lineIdx = (pos: number): number => { let lo = 0, hi = lineStart.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStart[mid]! <= pos) lo = mid; else hi = mid - 1; } return lo; };
  const inFenced = (pos: number) => fenced.has(lineIdx(pos));
  /** akhir paragraf: posisi awal baris kosong berikutnya */
  const paraEnd = (pos: number): number => {
    let i = lineIdx(pos) + 1;
    while (i < lines.length && lines[i]!.trim() !== '' && !fenced.has(i)) i++;
    return i < lines.length ? lineStart[i]! : src.length;
  };
  const spans: MathSpan[] = [];
  const literal: number[] = [];
  const issues: MathScanIssue[] = [];
  const n = src.length;
  let i = 0;
  while (i < n) {
    if (inFenced(i)) { const nl = src.indexOf('\n', i); i = nl < 0 ? n : nl + 1; continue; }
    const ch = src[i];
    if (ch === '`') {
      let j = i; while (src[j] === '`') j++;
      const run = j - i; const end = paraEnd(i);
      let k = j, close = -1;
      while (k < end) {
        const t = src.indexOf('`'.repeat(run), k);
        if (t < 0 || t >= end) break;
        let u = t; while (src[u] === '`') u++;
        if (u - t === run) { close = u; break; }
        k = u;
      }
      i = close > 0 ? close : j; continue;
    }
    if (ch === '<' && src.startsWith('<code data-pf-formula="', i)) {
      const open = /^<code data-pf-formula="(?:inline|display)">/.exec(src.slice(i, i + 40));
      const end = open ? src.indexOf('</code>', i + open[0].length) : -1;
      if (end >= 0) { i = end + 7; continue; }
    }
    if (ch === '<' && src.startsWith('<!--', i)) { const e = src.indexOf('-->', i + 4); i = e < 0 ? n : e + 3; continue; }
    if (ch === '\\') {
      const nx = src[i + 1];
      if (nx === '(' || nx === '[') {
        const closer = nx === '(' ? '\\)' : '\\]';
        const limit = nx === '(' ? paraEnd(i) : n;
        let p = i + 2, m = -1;
        while (p < limit) {
          const t = src.indexOf(closer, p);
          if (t < 0 || t >= limit || inFenced(t)) break;
          let bs = 0, r = t - 1; while (r >= 0 && src[r] === '\\') { bs++; r--; }
          if (bs % 2 === 1) p = t + 1; else { m = t; break; }
        }
        if (m > i + 2) {
          spans.push({ start: i, end: m + 2, tex: src.slice(i + 2, m), display: nx === '[', delim: nx === '(' ? '\\(' : '\\[', line: lineIdx(i) + 1 });
          i = m + 2; continue;
        }
      }
      i += 2; continue;
    }
    if (ch === '$') {
      if (src[i + 1] === '$') {
        let p = i + 2, s = -1;
        while (p < n) {
          const t = src.indexOf('$$', p);
          if (t < 0 || inFenced(t)) break;
          if (src[t - 1] === '\\') p = t + 2; else { s = t; break; }
        }
        if (s > 0 && src.slice(i + 2, s).trim() !== '') {
          spans.push({ start: i, end: s + 2, tex: src.slice(i + 2, s), display: true, delim: '$$', line: lineIdx(i) + 1 });
          i = s + 2; continue;
        }
        if (s < 0) issues.push({ code: 'MATH_UNTERMINATED', line: lineIdx(i) + 1, snippet: lines[lineIdx(i)]!.trim().slice(0, 80) });
        literal.push(i, i + 1); i += 2; continue;
      }
      const nx = src[i + 1];
      if (nx === undefined || /\s/.test(nx)) { literal.push(i); i++; continue; }
      const end = paraEnd(i);
      let f = i + 1, close = -1;
      for (;;) {
        f = src.indexOf('$', f);
        if (f < 0 || f >= end) { f = -1; break; }
        if (src[f - 1] === '\\') { f++; continue; }
        break;
      }
      if (f > 0 && src[f + 1] !== '$') {
        const before = src[f - 1]!; const after = src[f + 1];
        const ok = !/\s/.test(before) && !(after !== undefined && /[0-9]/.test(after));
        const body = src.slice(i + 1, f);
        if (ok && body.length > 0 && !/\n\s*\n/.test(body)) close = f;
      }
      if (close > 0) {
        spans.push({ start: i, end: close + 1, tex: src.slice(i + 1, close), display: false, delim: '$', line: lineIdx(i) + 1 });
        i = close + 1; continue;
      }
      if (nx === '\\' && /^\\[a-zA-Z]+/.test(src.slice(i + 1, i + 20))) {
        issues.push({ code: 'MATH_SUSPECT_UNTERMINATED', line: lineIdx(i) + 1, snippet: src.slice(i, Math.min(end, i + 60)).split('\n')[0]! });
      }
      literal.push(i); i++; continue;
    }
    i++;
  }
  // salinan parse dengan panjang sama; sentinel dijamin tidak ada di sumber
  const puaConflict = /[\uE000-\uF8FF]/.test(src);
  const sentinels = chooseSentinels(src);
  if (!sentinels) return { spans, literalDollars: literal, issues, parseCopy: src, puaConflict, sentinels: null };
  const arr = src.split('');
  for (const p of literal) arr[p] = sentinels.dollar;
  for (const s of spans) {
    if (s.delim === '\\(') { arr[s.start] = sentinels.fill; arr[s.start + 1] = '$'; arr[s.end - 2] = '$'; arr[s.end - 1] = sentinels.fill; }
    else if (s.delim === '\\[') { arr[s.start] = '$'; arr[s.start + 1] = '$'; arr[s.end - 2] = '$'; arr[s.end - 1] = '$'; }
  }
  return { spans, literalDollars: literal, issues, parseCopy: arr.join(''), puaConflict, sentinels };
}

/**
 * Memulihkan HANYA sentinel yang dibuat oleh pemindaian `scan` (bukan karakter PUA milik pengguna).
 * Tanpa `scan` atau tanpa sentinel: identitas — tidak ada transformasi global tanpa konteks.
 */
export function restorePua(s: string, scan?: Pick<MathScan, 'sentinels'> | null): string {
  const z = scan?.sentinels;
  if (!z) return s;
  if (s.indexOf(z.dollar) < 0 && s.indexOf(z.fill) < 0) return s;
  return s.split(z.dollar).join('$').split(z.fill).join('');
}

/** Pemulih terikat pada satu pemindaian. */
export function restorerFor(scan?: Pick<MathScan, 'sentinels'> | null): (s: string) => string {
  return (s: string) => restorePua(s, scan);
}

export interface KatexResult { ok: boolean; html: string; error?: string }

/** KaTeX dengan trust:false, maxExpand terbatas; kegagalan → fallback terlihat berisi sumber. */
export function renderTex(tex: string, display: boolean): KatexResult {
  if (tex.length > LIMITS.mathChars) {
    return { ok: false, error: `MATH_TOO_LONG:${tex.length}`, html: fallbackHtml(tex, display) };
  }
  try {
    const html = katex.renderToString(tex, { displayMode: display, throwOnError: true, output: 'htmlAndMathml', trust: false, strict: 'ignore', maxExpand: 1000, maxSize: 50 });
    return { ok: true, html };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e).slice(0, 300), html: fallbackHtml(tex, display) };
  }
}

function fallbackHtml(tex: string, display: boolean): string {
  const d = display ? '$$' : '$';
  return `<code class="pf-math-src">${escapeHtml(d + tex + d)}</code>`;
}

export { lineOf };
