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
import { lineOf } from './util';
import { adaptCopiedTex, looksLikeCopiedMath, type MathAdaptation } from './math-copy';
export type { MathAdaptation } from './math-copy';

/** Sentinel bawaan (dipakai bila sumber tidak memuatnya). Sentinel aktual per pemindaian ada di `MathScan.sentinels`. */
export const PUA_DOLLAR = '\uE001';
export const PUA_FILL = '\uE004';

export interface MathSpan {
  start: number; end: number; tex: string; display: boolean; delim: '$' | '$$' | '\\(' | '\\[' ; line: number;
  /** RC6-M01: original payload/offsets stay exact; only the rendering copy is adapted. */
  openerLength?: number; closerLength?: number; renderTex?: string; adaptations?: MathAdaptation[];
  syntax?: 'github-inline';
}
export interface MathScanIssue { code: 'MATH_UNTERMINATED' | 'MATH_SUSPECT_UNTERMINATED'; line: number; snippet: string; offset?: number; closer?: string }
export interface MathSentinels { dollar: string; fill: string; pipe?: string; slash?: string; boundary?: string }
export interface MathScan {
  spans: MathSpan[]; literalDollars: number[]; issues: MathScanIssue[]; parseCopy: string;
  /** true bila sumber memuat karakter Private Use (informasi; tidak lagi mematikan perlindungan mata uang). */
  puaConflict: boolean;
  /** sentinel yang dipakai pemindaian ini; null = tidak ada penyamaran (parseCopy === sumber). */
  sentinels: MathSentinels | null;
}

/** Reserve markers absent from the source. Dollar and padding have priority if the PUA is almost full. */
export function chooseSentinels(src: string): MathSentinels | null {
  const used = new Set<number>();
  for (let i = 0; i < src.length; i++) {
    const c = src.charCodeAt(i);
    if (c >= 0xE000 && c <= 0xF8FF) used.add(c);
  }
  // Entities are decoded by Markdown before restoration. Do not accidentally erase a
  // user's encoded marker, either (e.g. &#x2042; or &#xE004;).
  const encoded = new Set<number>();
  if (src.includes('&#')) for (const m of src.matchAll(/&#(?:[xX]([0-9a-fA-F]+)|([0-9]+));?/g)) {
    const point = Number.parseInt(m[1] ?? m[2]!, m[1] ? 16 : 10);
    encoded.add(point);
    if (point >= 0xE000 && point <= 0xF8FF) used.add(point);
  }
  // RC6-M05: delimiters are punctuation for CommonMark emphasis flanking. PUA padding
  // is not punctuation and breaks **Sudut&#x20;**\(x\). These non-Markdown punctuation
  // characters are reserved only when absent from the source and its numeric entities.
  const boundary = ['\u2042', '\u204B', '\u2058', '\u2059', '\u205A', '\u205B', '\u2E2E', '\u2E31']
    .find(c => !src.includes(c) && !encoded.has(c.charCodeAt(0)));
  const free: number[] = [];
  for (const preferred of [0xE001, 0xE004, 0xE005, 0xE006]) if (!used.has(preferred)) free.push(preferred);
  for (let c = 0xF8FF; c >= 0xE000 && free.length < 4; c--) {
    if (!used.has(c) && !free.includes(c)) free.push(c);
  }
  if (free.length < 2) return null;
  return {
    dollar: String.fromCharCode(free[0]!),
    fill: String.fromCharCode(free[1]!),
    pipe: free[2] === undefined ? undefined : String.fromCharCode(free[2]),
    slash: free[3] === undefined ? undefined : String.fromCharCode(free[3]),
    ...(boundary ? { boundary } : {}),
  };
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
  // RC4-P03: compute boundaries once; thousands of currency lines otherwise rescan the remaining paragraph.
  const paragraphEnds: number[] = Array.from({ length: lines.length }, () => src.length);
  let boundary = src.length;
  for (let l = lines.length - 1; l >= 0; l--) {
    paragraphEnds[l] = boundary;
    if (lines[l]!.trim() === '' || fenced.has(l)) boundary = lineStart[l]!;
  }
  const paraEnd = (pos: number): number => paragraphEnds[lineIdx(pos)]!;
  const spans: MathSpan[] = [];
  const literal: number[] = [];
  const issues: MathScanIssue[] = [];
  const n = src.length;
  // Several incomplete expressions may share the same next closing token (or have none).
  const nextClosing = new Map<string, number>();
  const nextCloser = (token: string, from: number): number => {
    const last = nextClosing.get(token);
    if (last !== undefined && (last === -1 || last >= from)) return last;
    const offset = src.indexOf(token, from);
    nextClosing.set(token, offset);
    return offset;
  };
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
    // RC4-M06: raw HTML code is literal too; rewriting delimiters here would corrupt the sample.
    if (ch === '<') {
      const open = /^<(code|pre|kbd|samp)\b(?:"[^"]*"|'[^']*'|[^'">])*>/i.exec(src.slice(i));
      if (open) {
        const close = new RegExp(`</${open[1]}\\s*>`, 'ig');
        close.lastIndex = i + open[0].length;
        const end = close.exec(src);
        i = end ? end.index + end[0].length : n;
        continue;
      }
    }
    if (ch === '<' && src.startsWith('<!--', i)) { const e = src.indexOf('-->', i + 4); i = e < 0 ? n : e + 3; continue; }
    if (ch === '\\') {
      let run = 1; while (src[i + run] === '\\') run++;
      const nx = src[i + run];
      if ((run === 1 || run === 2) && (nx === '(' || nx === '[')) {
        const width = run + 1;
        const copied = run === 2;
        const closer = '\\'.repeat(run) + (nx === '(' ? ')' : ']');
        const limit = nx === '(' ? paraEnd(i) : n;
        let p = i + width, m = -1;
        while (p < limit) {
          const t = nextCloser(closer, p);
          if (t < 0 || t >= limit || inFenced(t)) break;
          let bs = 0, r = t - 1; while (r >= 0 && src[r] === '\\') { bs++; r--; }
          if (copied ? bs !== 0 : bs % 2 === 1) p = t + 1; else { m = t; break; }
        }
        const payload = m > i + width ? src.slice(i + width, m) : '';
        if (payload && (!copied || looksLikeCopiedMath(payload))) {
          const adapted = copied ? adaptCopiedTex(payload) : undefined;
          spans.push({ start: i, end: m + width, tex: payload, display: nx === '[', delim: nx === '(' ? '\\(' : '\\[', line: lineIdx(i) + 1,
            ...(copied ? { openerLength: width, closerLength: width, adaptations: ['copied-delimiters' as const, ...adapted!.adaptations],
              ...(adapted!.tex !== payload ? { renderTex: adapted!.tex } : {}) } : {}) });
          i = m + width; continue;
        }
        // CommonMark also uses \( as a literal parenthesis. Diagnose only a definite
        // TeX command after an unmatched opener, leaving ordinary punctuation alone.
        if (m < 0 && /^\s*\\[A-Za-z]/.test(src.slice(i + width, i + width + 80))) {
          issues.push({ code: 'MATH_UNTERMINATED', line: lineIdx(i) + 1, offset: i, closer,
            snippet: lines[lineIdx(i)]!.trim().slice(0, 80) });
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
        // Mata uang: "$5 dan diskon 10$" — isi diawali angka DAN memuat kata biasa (≥ 2 huruf, dipisah spasi, bukan
        // perintah \TeX atau isi kurung kurawal) → bukan rumus. "$2x + 3y$", "$3 \times 4$" tetap rumus.
        const currencyProse = /^[0-9]/.test(body) && /(?:^|\s)[\p{L}]{2,}(?=\s|$|[.,;:!?])/u.test(body.replace(/\\[A-Za-z]+(\{[^}]*\})?/g, ' '));
        if (ok && !currencyProse && body.length > 0 && !/\n\s*\n/.test(body)) close = f;
      }
      if (close > 0) {
        const payload = src.slice(i + 1, close);
        const githubInline = /^`[^`]+`$/.test(payload);
        spans.push({ start: i, end: close + 1, tex: payload, display: false, delim: '$', line: lineIdx(i) + 1,
          ...(githubInline ? { renderTex: payload.slice(1, -1), syntax: 'github-inline' as const } : {}) });
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
  if (sentinels.slash) {
    for (const issue of issues) if (issue.offset !== undefined) arr[issue.offset] = sentinels.slash;
  }
  for (const s of spans) {
    if (s.syntax === 'github-inline') { arr[s.start + 1] = sentinels.fill; arr[s.end - 2] = sentinels.fill; }
    // GFM splits tables on bars before parsing inline math. The math tokenizer also
    // treats a dollar inside \text{…} or \$ as a delimiter. Shield the formula payload
    // after the scanner has established its boundaries; offsets and source stay intact.
    if (/[|$]/.test(s.tex)) {
      const contentStart = s.start + (s.openerLength ?? s.delim.length);
      for (let k = contentStart; k < contentStart + s.tex.length; k++) {
        if (src[k] === '$') arr[k] = sentinels.dollar;
        if (src[k] === '|' && sentinels.pipe) arr[k] = sentinels.pipe;
      }
    }
    if (s.delim === '\\(') {
      const open = s.openerLength ?? 2, close = s.closerLength ?? 2;
      const padding = sentinels.boundary ?? sentinels.fill;
      for (let k = s.start; k < s.start + open - 1; k++) arr[k] = padding;
      arr[s.start + open - 1] = '$'; arr[s.end - close] = '$';
      for (let k = s.end - close + 1; k < s.end; k++) arr[k] = padding;
    } else if (s.delim === '\\[') {
      arr[s.start] = '$'; arr[s.start + 1] = '$'; arr[s.end - 2] = '$'; arr[s.end - 1] = '$';
      // Whitespace is legal around a block math fence; padding sentinels would turn its closer into prose.
      for (let k = s.start + 2; k < s.start + (s.openerLength ?? 2); k++) arr[k] = ' ';
      for (let k = s.end - (s.closerLength ?? 2); k < s.end - 2; k++) arr[k] = ' ';
    }
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
  if (z.boundary && s.includes(z.boundary)) s = s.split(z.boundary).join('');
  if (z.slash && s.includes(z.slash)) s = s.split(z.slash).join('\\');
  if (z.pipe && s.includes(z.pipe)) s = s.split(z.pipe).join('|');
  if (s.indexOf(z.dollar) < 0 && s.indexOf(z.fill) < 0) return s;
  return s.split(z.dollar).join('$').split(z.fill).join('');
}

/** Pemulih terikat pada satu pemindaian. */
export function restorerFor(scan?: Pick<MathScan, 'sentinels'> | null): (s: string) => string {
  return (s: string) => restorePua(s, scan);
}

export { renderTex, type KatexResult } from './tex-renderer';
export { lineOf };
