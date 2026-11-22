/**
 * Resolver font dokumen (PF-029, CODE-07/08, SEM-11).
 * Dari teks isi + templat + fitur yang dipakai → himpunan minimal subset woff2 (unicode-range ∩ cmap nyata),
 * deteksi glyph yang tidak tercakup font bundel (Arab, CJK, emoji, …) sebagai issue `font` eksplisit,
 * dan manifest font (family, weight, style, subset, bytes, sha256, lisensi OFL-1.1).
 * Murni (tanpa DOM/jaringan); pemuatan bytes melalui FontSource yang disuntikkan.
 */
import type { BrandKit, Issue, Settings } from '../core/contracts';
import { EMOJI_FONT, FONT_COVERAGE, KATEX_FONT_INFO, KATEX_SYMBOL_COVERAGE, type Range } from './font-coverage.generated';
import { getTemplate } from './templates';
import { assertWoff2 } from './woff2';
import { bytesToBase64, sha256Hex } from './util';

export type FamilyKey = 'inter' | 'source-serif-4' | 'jetbrains-mono';
export interface FontFaceSpec {
  /** nama berkas woff2 di paket asal, mis. inter-latin-400-normal.woff2 / KaTeX_Main-Regular.woff2 */
  file: string; family: string; weight: number; style: 'normal' | 'italic'; subset: string;
  unicodeRange?: string; pkg: string; version: string; license: 'OFL-1.1';
}
export interface MissingGlyphs { script: string; count: number; sample: string; codepoints: string[] }
export interface FontPlan { faces: FontFaceSpec[]; missing: MissingGlyphs[]; issues: Issue[]; distinctCodepoints: number }
export interface FontManifestEntry {
  family: string; weight: number; style: 'normal' | 'italic'; subset: string; file: string;
  bytes: number; sha256: string; license: 'OFL-1.1'; pkg: string; version: string;
}
export interface LoadedFont { spec: FontFaceSpec; bytes: Uint8Array; sha256: string }
/** Mengembalikan bytes woff2 untuk nama berkas paket (lihat font-assets.ts untuk peramban). */
export type FontSource = (spec: FontFaceSpec) => Promise<Uint8Array>;

const PREFIX: Record<FamilyKey, string> = { inter: 'inter', 'source-serif-4': 'source-serif-4', 'jetbrains-mono': 'jetbrains-mono' };
const inRanges = (c: number, rs: Range[]): boolean => {
  let lo = 0, hi = rs.length - 1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; const r = rs[mid]!; if (c < r[0]) hi = mid - 1; else if (c > r[1]) lo = mid + 1; else return true; }
  return false;
};
const hx = (n: number) => n.toString(16).toUpperCase().padStart(4, '0');
const rangeCss = (rs: Range[]): string => rs.map(([a, b]) => (a === b ? `U+${hx(a)}` : `U+${hx(a)}-${hx(b)}`)).join(',');

/** Titik kode yang tidak membutuhkan glyph (spasi, kontrol, penggabung, selektor variasi, BOM). */
const isIgnorable = (c: number): boolean =>
  c < 0x21 || (c >= 0x7f && c <= 0xa0) || c === 0xad || (c >= 0x200b && c <= 0x200f) || (c >= 0x2028 && c <= 0x202f) ||
  (c >= 0x2060 && c <= 0x206f) || (c >= 0xfe00 && c <= 0xfe0f) || c === 0xfeff || (c >= 0xe0100 && c <= 0xe01ef);

const SCRIPT_RANGES: [string, number, number][] = [
  ['Arabic', 0x0600, 0x06ff], ['Arabic', 0x0750, 0x077f], ['Arabic', 0x08a0, 0x08ff], ['Arabic', 0xfb50, 0xfdff], ['Arabic', 0xfe70, 0xfeff],
  ['Hebrew', 0x0590, 0x05ff], ['Devanagari', 0x0900, 0x097f], ['Bengali', 0x0980, 0x09ff], ['Thai', 0x0e00, 0x0e7f],
  ['Hangul', 0xac00, 0xd7af], ['Hangul', 0x1100, 0x11ff], ['Kana', 0x3040, 0x30ff], ['CJK', 0x3000, 0x303f], ['CJK', 0x3400, 0x4dbf],
  ['CJK', 0x4e00, 0x9fff], ['CJK', 0xf900, 0xfaff], ['CJK', 0xff00, 0xffef], ['CJK', 0x20000, 0x2ffff],
  ['Emoji', 0x1f000, 0x1faff], ['Emoji', 0x2600, 0x27bf], ['Math symbols', 0x2200, 0x22ff], ['Math symbols', 0x27c0, 0x27ef],
  ['Math symbols', 0x2980, 0x2aff], ['Math alphanumerics', 0x1d400, 0x1d7ff], ['Arrows', 0x2190, 0x21ff], ['Box/geometric', 0x2500, 0x25ff],
];
export const scriptOf = (c: number): string => SCRIPT_RANGES.find(([, a, b]) => c >= a && c <= b)?.[0] ?? 'Other';

const coveredWithoutEmoji = (c: number): boolean =>
  isIgnorable(c) ||
  (Object.keys(FONT_COVERAGE) as FamilyKey[]).some((f) => Object.values(FONT_COVERAGE[f].subsets).some((s) => inRanges(c, s.covered))) ||
  Object.values(KATEX_SYMBOL_COVERAGE).some((rs) => inRanges(c, rs));

export const isCoveredByBundledFonts = (c: number): boolean => coveredWithoutEmoji(c) || inRanges(c, EMOJI_FONT.covered);

export interface FontFeatures {
  headings: boolean; strong: boolean; em: boolean; strongEm: boolean; code: boolean; math: boolean; messages: boolean;
  /** kelas KaTeX terdeteksi (untuk memilih font simbol yang benar-benar dirujuk) */ katexClasses: Set<string>;
}

/** Deteksi fitur yang menentukan weight/style dari HTML isi (bukan dari teks pengguna mentah). */
export function detectFeatures(html: string): FontFeatures {
  const katexClasses = new Set<string>();
  if (/class="[^"]*\bkatex\b/.test(html)) {
    for (const m of html.matchAll(/class="([^"]*)"/g)) for (const c of m[1]!.split(/\s+/)) if (c) katexClasses.add(c);
  }
  return {
    headings: /<h[1-6][\s>]/i.test(html), strong: /<(strong|b|th)[\s>]/i.test(html), em: /<(em|i|cite)[\s>]/i.test(html),
    strongEm: /<(em|i)[\s>][^<]*<(strong|b)[\s>]|<(strong|b)[\s>][^<]*<(em|i)[\s>]/i.test(html),
    code: /<(pre|code|kbd|samp)[\s>]/i.test(html), math: katexClasses.has('katex'), messages: /class="[^"]*\bpf-msg\b/.test(html), katexClasses,
  };
}

const PRIVATE_GLYPHS = /[\uE000-\uF8FF\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]/gu;
function fontTextFromDom(root: Element, html: string): string {
  const fallback = [...(html.includes('_fallback') ? root.querySelectorAll('.katex [class*="_fallback"]') : [])].map(node => node.textContent ?? '').join(' ');
  const mathCharacters: string[] = [];
  // KaTeX may render an author-specified \char in a normal .mord, without
  // an *_fallback class. Only inspect authored formulas; assembly glyphs
  // for ordinary TeX operators already have their own bundled KaTeX font.
  if (html.includes('pf-math') && /\\char\b|[\uE000-\uF8FF\u{1F000}-\u{1FAFF}\u{F0000}-\u{10FFFD}]/u.test(html)) {
    for (const math of root.querySelectorAll('.pf-math[data-tex]')) {
      const tex = math.getAttribute('data-tex') ?? '';
      if (!/\\char\b|[\uE000-\uF8FF\u{1F000}-\u{1FAFF}\u{F0000}-\u{10FFFD}]/u.test(tex)) continue;
      const semantic = math.querySelector('.katex-mathml math semantics > :first-child')?.textContent ?? '';
      mathCharacters.push(...semantic.match(PRIVATE_GLYPHS) ?? [], ...semantic.match(/[\u{1F000}-\u{1FAFF}]/gu) ?? []);
    }
  }
  // Skip entire KaTeX trees. Removing them from a detached document still
  // triggers mutation bookkeeping across every descendant in several DOMs.
  const prose: string[] = [], labels: string[] = [];
  const walker = root.ownerDocument.createTreeWalker(root, 5, {acceptNode(node) {
    if (node.nodeType === 3) return 1;
    const el = node as Element;
    if (el.classList.contains('katex') || ['script','style','template','annotation'].includes(el.localName)) return 2;
    return 1;
  }});
  while (walker.nextNode()) {
    const n = walker.currentNode;
    if (n.nodeType === 3) { prose.push(n.nodeValue ?? ''); continue; }
    const el = n as Element;
    if (el.hasAttribute('alt') || el.hasAttribute('title') || el.hasAttribute('aria-label') || el.hasAttribute('data-lang')) labels.push(
      `${el.getAttribute('alt') ?? ''} ${el.getAttribute('title') ?? ''} ${el.getAttribute('aria-label') ?? ''} ${el.getAttribute('data-lang') ?? ''}`);
  }
  return fallback + ' ' + mathCharacters.join('') + ' ' + prose.join('') + ' ' + labels.join(' ');
}

/** Serialize first, then reuse the detached composition tree for the font planner. */
export function serializeForFonts(root: Element): { html: string; fontText: string } {
  const html = root.innerHTML;
  return { html, fontText: fontTextFromDom(root, html) };
}

/** Visible source text and metadata that must be covered by document fonts. */
export function textForFonts(html: string): string {
  const P = (globalThis as { DOMParser?: typeof DOMParser }).DOMParser;
  if (P) return fontTextFromDom(new P().parseFromString(`<!doctype html><body>${html}`, 'text/html').body, html);
  return html.replace(/<math[\s\S]*?<\/math>/g, ' ').replace(/<annotation[\s\S]*?<\/annotation>/g, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => (e[0] === '#' ? String.fromCodePoint(parseInt(e[1] === 'x' || e[1] === 'X' ? e.slice(2) : e.slice(1), e[1] === 'x' || e[1] === 'X' ? 16 : 10)) : ({ amp: '&', lt: '<', gt: '>', quot: '"', nbsp: ' ', apos: "'" } as Record<string, string>)[e] ?? m));
}

type FaceReq = { fam: FamilyKey; weight: number; style: 'normal' | 'italic' };
const KATEX_STYLE: Record<string, { family: string; weight: number; style: 'normal' | 'italic' }> = {
  'KaTeX_Main-Regular': { family: 'KaTeX_Main', weight: 400, style: 'normal' }, 'KaTeX_Main-Bold': { family: 'KaTeX_Main', weight: 700, style: 'normal' },
  'KaTeX_Main-Italic': { family: 'KaTeX_Main', weight: 400, style: 'italic' }, 'KaTeX_Main-BoldItalic': { family: 'KaTeX_Main', weight: 700, style: 'italic' },
  'KaTeX_Math-Italic': { family: 'KaTeX_Math', weight: 400, style: 'italic' }, 'KaTeX_Math-BoldItalic': { family: 'KaTeX_Math', weight: 700, style: 'italic' },
  'KaTeX_AMS-Regular': { family: 'KaTeX_AMS', weight: 400, style: 'normal' }, 'KaTeX_Caligraphic-Regular': { family: 'KaTeX_Caligraphic', weight: 400, style: 'normal' },
  'KaTeX_Caligraphic-Bold': { family: 'KaTeX_Caligraphic', weight: 700, style: 'normal' }, 'KaTeX_Fraktur-Regular': { family: 'KaTeX_Fraktur', weight: 400, style: 'normal' },
  'KaTeX_Fraktur-Bold': { family: 'KaTeX_Fraktur', weight: 700, style: 'normal' }, 'KaTeX_SansSerif-Regular': { family: 'KaTeX_SansSerif', weight: 400, style: 'normal' },
  'KaTeX_SansSerif-Bold': { family: 'KaTeX_SansSerif', weight: 700, style: 'normal' }, 'KaTeX_SansSerif-Italic': { family: 'KaTeX_SansSerif', weight: 400, style: 'italic' },
  'KaTeX_Script-Regular': { family: 'KaTeX_Script', weight: 400, style: 'normal' }, 'KaTeX_Typewriter-Regular': { family: 'KaTeX_Typewriter', weight: 400, style: 'normal' },
  'KaTeX_Size1-Regular': { family: 'KaTeX_Size1', weight: 400, style: 'normal' }, 'KaTeX_Size2-Regular': { family: 'KaTeX_Size2', weight: 400, style: 'normal' },
  'KaTeX_Size3-Regular': { family: 'KaTeX_Size3', weight: 400, style: 'normal' }, 'KaTeX_Size4-Regular': { family: 'KaTeX_Size4', weight: 400, style: 'normal' },
};

function katexFiles(f: FontFeatures, textCps: Set<number>): string[] {
  const k = f.katexClasses; const out = new Set<string>();
  if (f.math) {
    out.add('KaTeX_Main-Regular'); out.add('KaTeX_Math-Italic');
    const has = (...cs: string[]) => cs.some((c) => k.has(c));
    if (has('mathbf', 'textbf', 'boldsymbol', 'mathboldsf')) out.add('KaTeX_Main-Bold');
    if (has('boldsymbol')) out.add('KaTeX_Math-BoldItalic');
    if (has('textit', 'mathit')) out.add('KaTeX_Main-Italic');
    if (has('textbf') && has('textit')) out.add('KaTeX_Main-BoldItalic');
    if (has('amsrm', 'mathbb', 'textbb')) out.add('KaTeX_AMS-Regular');
    if (has('mathcal')) out.add('KaTeX_Caligraphic-Regular');
    if (has('mathfrak', 'textfrak')) out.add('KaTeX_Fraktur-Regular');
    if (has('mathboldfrak', 'textboldfrak')) out.add('KaTeX_Fraktur-Bold');
    if (has('mathscr', 'textscr')) out.add('KaTeX_Script-Regular');
    if (has('mathsf', 'textsf')) out.add('KaTeX_SansSerif-Regular');
    if (has('mathboldsf', 'textboldsf') || (has('textsf') && has('textbf'))) out.add('KaTeX_SansSerif-Bold');
    if (has('mathsfit', 'mathitsf', 'textitsf') || (has('textsf') && has('textit'))) out.add('KaTeX_SansSerif-Italic');
    if (has('mathtt', 'texttt')) out.add('KaTeX_Typewriter-Regular');
    if (has('size1', 'small-op')) out.add('KaTeX_Size1-Regular');
    if (has('size2', 'large-op')) out.add('KaTeX_Size2-Regular');
    if (has('size3')) out.add('KaTeX_Size3-Regular');
    if (has('size4', 'delimsizing')) { out.add('KaTeX_Size3-Regular'); out.add('KaTeX_Size4-Regular'); }
    if (has('delimsizing', 'sqrt')) { out.add('KaTeX_Size1-Regular'); out.add('KaTeX_Size2-Regular'); }
    if (has('mult', 'mtight') && has('amsrm')) out.add('KaTeX_AMS-Regular');
  }
  // simbol di teks biasa yang hanya tercakup KaTeX_Main/AMS (→ ≤ ≈ √ ✓ …) memakai fallback di tumpukan font
  const textFonts = (c: number) => (Object.keys(FONT_COVERAGE) as FamilyKey[]).some((fm) => Object.values(FONT_COVERAGE[fm].subsets).some((s) => inRanges(c, s.covered)));
  for (const c of textCps) {
    if (isIgnorable(c) || textFonts(c)) continue;
    if (inRanges(c, KATEX_SYMBOL_COVERAGE['KaTeX_Main-Regular'] ?? [])) out.add('KaTeX_Main-Regular');
    else if (inRanges(c, KATEX_SYMBOL_COVERAGE['KaTeX_AMS-Regular'] ?? [])) out.add('KaTeX_AMS-Regular');
  }
  return [...out].sort();
}

export interface PlanInput {
  /** Optional text projection from the same prepared and serialized document. */
  fontText?: string;
  html: string; settings: Settings; extraText?: string; mode: 'screen' | 'print';
  headingFont?: 'inter' | 'source-serif-4'; bodyFont?: 'inter' | 'source-serif-4'; cover?: boolean;
  /** PF-R4-02: generated brand/header/footer text is part of the output too. */
  brandKit?: BrandKit;
}

/** Rencana font minimal; tidak menyentuh jaringan. */
export function planFonts(input: PlanInput): FontPlan {
  const { settings } = input;
  const tpl = getTemplate(settings.template).tokens;
  const body: FamilyKey = input.bodyFont ?? settings.bodyFont;
  const head: FamilyKey = input.headingFont ?? tpl.headingFont;
  const f = detectFeatures(input.html);
  const text = (input.fontText ?? textForFonts(input.html)) + ' ' + [settings.title, settings.subtitle, settings.author, settings.dateText, settings.header, settings.footer, input.brandKit?.orgName, input.brandKit?.footerText, input.brandKit?.name, input.extraText].filter(Boolean).join(' ') + ' 0123456789';
  const cps = new Set<number>();
  for (const ch of text) cps.add(ch.codePointAt(0)!);

  const req: FaceReq[] = [{ fam: body, weight: 400, style: 'normal' }];
  if (f.em || settings.template === 'EDT-01') req.push({ fam: body, weight: 400, style: 'italic' });
  // tebal isi dipakai juga oleh th, TOC level 1, label — selalu disertakan agar tidak ada tebal sintetis (Type 3)
  req.push({ fam: body, weight: tpl.strongWeight, style: 'normal' });
  if (f.strongEm) req.push({ fam: body, weight: tpl.strongWeight, style: 'italic' });
  if (f.headings || settings.title || settings.toc || settings.cover) req.push({ fam: head, weight: tpl.headingWeight, style: 'normal' });
  if ((settings.template === 'EDT-01' && f.headings) || /<h6[\s>]/i.test(input.html)) req.push({ fam: head, weight: tpl.headingWeight, style: 'italic' });
  // label UI dokumen (header/footer, label kode, pembicara, nomor TOC) memakai Inter
  req.push({ fam: 'inter', weight: 400, style: 'normal' }, { fam: 'inter', weight: 600, style: 'normal' });
  if (settings.template === 'EDU-01' || (settings.template === 'CON-01' && f.messages)) req.push({ fam: 'inter', weight: 700, style: 'normal' });
  if (f.code) req.push({ fam: 'jetbrains-mono', weight: 400, style: 'normal' });

  const seen = new Set<string>(); const faces: FontFaceSpec[] = [];
  for (const r of req) {
    const key = `${r.fam}|${r.weight}|${r.style}`; if (seen.has(key)) continue; seen.add(key);
    const cov = FONT_COVERAGE[r.fam];
    for (const [subset, s] of Object.entries(cov.subsets)) {
      let used = false; for (const c of cps) if (inRanges(c, s.covered)) { used = true; break; }
      if (!used) continue;
      faces.push({ file: `${PREFIX[r.fam]}-${subset}-${r.weight}-${r.style}.woff2`, family: cov.family, weight: r.weight, style: r.style, subset, unicodeRange: rangeCss(s.range), pkg: cov.pkg, version: cov.version, license: 'OFL-1.1' });
    }
  }
  for (const k of katexFiles(f, cps)) {
    const st = KATEX_STYLE[k]!;
    faces.push({ file: `${k}.woff2`, family: st.family, weight: st.weight, style: st.style, subset: 'katex', pkg: 'katex', version: KATEX_FONT_INFO.version, license: 'OFL-1.1' });
  }

  // Plan text fallback and diagnostics in one pass through distinct code points.
  let needsEmoji = cps.has(0x20e3) || cps.has(0xfe0f);
  const missingMap = new Map<string, number[]>();
  for (const c of cps) {
    if (coveredWithoutEmoji(c)) continue;
    if (inRanges(c, EMOJI_FONT.covered)) { needsEmoji = true; continue; }
    const script = scriptOf(c);
    const list = missingMap.get(script) ?? [];
    list.push(c);
    missingMap.set(script, list);
  }
  if (needsEmoji) {
    faces.push({ file: EMOJI_FONT.file, family: 'Noto Emoji', weight: 400, style: 'normal', subset: 'emoji',
      pkg: '@fontsource/noto-emoji', version: EMOJI_FONT.version, license: 'OFL-1.1' });
  }
  const missing: MissingGlyphs[] = [...missingMap.entries()].map(([script, list]) => ({
    script, count: list.length, sample: list.slice(0, 8).map((c) => String.fromCodePoint(c)).join(' '),
    codepoints: list.slice(0, 32).map((c) => `U+${c.toString(16).toUpperCase().padStart(4, '0')}`),
  }));
  const issues: Issue[] = missing.length ? [{
    id: 'font-missing-glyphs', code: 'FONT_GLYPH_NOT_BUNDLED', severity: 'warning', scope: 'font',
    message: `Ada ${missing.reduce((n, m) => n + m.count, 0)} karakter (${missing.map((m) => m.script).join(', ')}) yang tidak tercakup font bawaan PaperForma. Karakter ini tidak didukung resmi: hasilnya bergantung pada font perangkat/renderer dan dapat tampil sebagai kotak. Contoh: ${missing.map((m) => m.codepoints.slice(0, 4).join(' ')).join('; ')}.`,
  }] : [];
  // A private character has no universal appearance. This check uses the visible
  // document plus generated labels, excluding construction glyphs inside KaTeX.
  let privateCount = 0;
  for (const c of cps) {
    if ((c < 0xe000 || c > 0xf8ff) && (c < 0xf0000 || c > 0xffffd) && (c < 0x100000 || c > 0x10fffd)) continue;
    if (++privateCount > 16) continue;
    const point = 'U+' + hx(c);
    issues.push({ id: 'private-glyph-' + point, code: 'PDF_PRIVATE_GLYPH', severity: 'warning', scope: 'font',
      message: `PDF memerlukan font atau pemetaan asal untuk ${point}. Simpan sumber/proyek atau ekspor HTML. Jika mengetahui maknanya, ubah salinan teks sebelum mencetak.` });
  }
  if (privateCount > 16) issues.push({ id: 'private-glyph-overflow', code: 'PDF_PRIVATE_GLYPH', severity: 'warning', scope: 'font',
    message: `Ada ${privateCount - 16} karakter privat berbeda lainnya. Simpan sumber utuh sebelum mengubah salinan teks.` });
  return { faces, missing, issues, distinctCodepoints: cps.size };
}

export interface FontLoadOptions { signal?: AbortSignal; timeoutMs?: number }

// Applications reuse the bundled WOFF2 buffers for HTML and print. A FontSource
// can also supply mutable views, so object identity alone cannot authenticate
// cached hashes or embedded bytes.
interface FontEncoding {
  original: Uint8Array;
  digest?: Promise<string>;
  base64?: string;
}
const fontEncodings = new WeakMap<Uint8Array, FontEncoding>();

function sameFontBytes(current: Uint8Array, original: Uint8Array): boolean {
  if (current.byteLength !== original.byteLength) return false;
  const a = new DataView(current.buffer, current.byteOffset, current.byteLength);
  const b = new DataView(original.buffer, original.byteOffset, original.byteLength);
  let i = 0;
  for (; i + 4 <= current.length; i += 4) if (a.getUint32(i) !== b.getUint32(i)) return false;
  for (; i < current.length; i++) if (current[i] !== original[i]) return false;
  return true;
}

function encodingFor(bytes: Uint8Array): FontEncoding {
  const previous = fontEncodings.get(bytes);
  if (previous && sameFontBytes(bytes, previous.original)) return previous;
  const fresh = { original: new Uint8Array(bytes) };
  fontEncodings.set(bytes, fresh);
  return fresh;
}

function encodedFont(bytes: Uint8Array): string {
  const entry = encodingFor(bytes);
  return entry.base64 ??= bytesToBase64(entry.original);
}

/** PF-R4-04: stop waiting on a hung source on cancellation or deadline. No final bytes are delivered. */
export async function loadFonts(plan: FontPlan, source: FontSource, options: FontLoadOptions = {}): Promise<{ fonts: LoadedFont[]; issues: Issue[] }> {
  const issues: Issue[] = []; const fonts: LoadedFont[] = [];
  const signal = options.signal;
  const abortReason = () => signal?.reason instanceof Error ? signal.reason : new DOMException('Dibatalkan', 'AbortError');
  if (signal?.aborted) throw abortReason();
  const timeoutMs = options.timeoutMs ?? 15000;
  const bounded = <T,>(job: () => Promise<T>): Promise<T> => new Promise((resolve, reject) => {
    let done = false;
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); };
    const finish = (run: () => void) => { if (done) return; done = true; cleanup(); run(); };
    const onAbort = () => finish(() => reject(abortReason()));
    const timer = setTimeout(() => finish(() => reject(new Error(`batas waktu font ${timeoutMs} ms`))), timeoutMs);
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) { onAbort(); return; }
    Promise.resolve().then(job).then(value => finish(() => resolve(value)), error => finish(() => reject(error)));
  });
  await Promise.all(plan.faces.map(async (spec) => {
    try {
      const bytes = await bounded(() => source(spec));
      if (signal?.aborted) throw abortReason();
      assertWoff2(bytes);
      const entry = encodingFor(bytes);
      const sha256 = await (entry.digest ??= sha256Hex(entry.original).catch(error => {
        delete entry.digest;
        throw error;
      }));
      if (signal?.aborted) throw abortReason();
      fonts.push({ spec, bytes, sha256 });
    } catch (e) {
      if (signal?.aborted) throw abortReason();
      issues.push({ id: `font-load-${spec.file}`, code: 'FONT_LOAD_FAILED', severity: 'error', scope: 'font', blocking: true, message: `Font ${spec.family} ${spec.weight} ${spec.style} (${spec.subset}) gagal dimuat: ${(e as Error).message}` });
    }
  }));
  fonts.sort((a, b) => plan.faces.indexOf(a.spec) - plan.faces.indexOf(b.spec));
  return { fonts, issues };
}

/** @font-face. `data` = tersemat sebagai data: URL; `relative` = url(<prefix><file>) untuk ekspor folder/ZIP. */
export function fontFaceCss(fonts: LoadedFont[], mode: 'data' | 'relative', prefix = 'fonts/', encode = encodedFont): string {
  return fonts.map(({ spec, bytes }) => {
    const src = mode === 'data' ? `data:font/woff2;base64,${encode(bytes)}` : `${prefix}${spec.file}`;
    return `@font-face{font-family:'${spec.family}';font-style:${spec.style};font-weight:${spec.weight};font-display:block;src:url(${src}) format('woff2');${spec.unicodeRange ? `unicode-range:${spec.unicodeRange};` : ''}}`;
  }).join('\n');
}

export function fontManifest(fonts: LoadedFont[]): FontManifestEntry[] {
  return fonts.map(({ spec, bytes, sha256 }) => ({ family: spec.family, weight: spec.weight, style: spec.style, subset: spec.subset, file: spec.file, bytes: bytes.length, sha256, license: spec.license, pkg: spec.pkg, version: spec.version }));
}

/** Tunggu font siap dengan batas waktu (PDF-10). Hanya untuk lingkungan DOM. */
export async function waitForFonts(doc: Document, fonts: LoadedFont[], timeoutMs: number): Promise<Issue[]> {
  const set = doc.fonts;
  if (!set) return [];
  const timedOut = await Promise.race([set.ready.then(() => false), new Promise<boolean>((r) => setTimeout(() => r(true), timeoutMs))]);
  const issues: Issue[] = [];
  if (timedOut) issues.push({ id: 'font-timeout', code: 'FONT_TIMEOUT', severity: 'error', scope: 'font', blocking: true, message: `Font belum siap setelah ${timeoutMs} ms; paginasi dihentikan agar tidak menghasilkan PDF dengan font pengganti.` });
  const failed = [...set].filter((f) => f.status === 'error');
  for (const f of failed) issues.push({ id: `font-error-${f.family}-${f.weight}-${f.style}`, code: 'FONT_LOAD_FAILED', severity: 'error', scope: 'font', blocking: true, message: `Font ${f.family} ${f.weight} ${f.style} gagal didekode peramban.` });
  void fonts;
  return issues;
}
