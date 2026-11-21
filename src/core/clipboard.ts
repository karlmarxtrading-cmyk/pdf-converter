/**
 * Clipboard HTML → Markdown (IMP-04, SEM-07, CODE-06). Tanpa DOM (rehype-parse).
 *  - Ditolak UTUH berdasarkan byte UTF-8 SEBELUM konversi (tidak ada slice);
 *  - KaTeX/MathML: anotasi LaTeX diambil SEKALI; representasi visual/assistive tidak diduplikasi;
 *  - tabel dengan rowspan/colspan dipertahankan sebagai blok HTML tabel tersanitasi + issue (tidak diratakan diam-diam);
 *  - skrip/handler/gaya tidak pernah ikut; semua perubahan dicatat di laporan konversi.
 */
import { unified } from 'unified';
import rehypeRemark from 'rehype-remark';
import rehypeStringify from 'rehype-stringify';
import remarkStringify from 'remark-stringify';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { toText } from 'hast-util-to-text';
import { defaultHandlers } from 'hast-util-to-mdast';
import type { Root as MRoot, RootContent as MContent, Parent as MParent, PhrasingContent } from 'mdast';
import { scanMath } from './math';
import type { Element, Root as HRoot, RootContent as HContent, Properties } from 'hast';
import type { Limits } from './contracts';
import { LIMITS, checkTextBudget, type BudgetResult } from './limits';
import { parseHtmlWithinBudget } from './html';
import { classifyUrl, DROP_WITH_CONTENT } from './sanitize';
import { orderedTokens } from './markdown';
import { mkIssue, numberIssues, type CoreIssue } from './util';

export interface ConversionChange { kind: 'removed-element' | 'removed-attribute' | 'math-from-annotation' | 'math-from-alttext' | 'math-from-mathjax-script' | 'math-literal-delimiters' | 'math-no-tex' | 'merged-table-as-html' | 'structured-table-as-html' | 'unsafe-link' | 'remote-image-reference' | 'unwrapped'; detail: string; count: number }

export type ClipboardResult =
  | { ok: true; markdown: string; changes: ConversionChange[]; issues: CoreIssue[]; stats: { inputBytes: number; outputChars: number; tables: number; math: number; mergedTables: number } }
  | { ok: false; code: 'BUDGET_EXCEEDED'; budget: BudgetResult; message: string; messageEn: string };

const MERGE_TABLE_TAGS = new Set(['table', 'caption', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'colgroup', 'col', 'br', 'b', 'strong', 'i', 'em', 'code', 'sub', 'sup', 'span', 'p', 'a', 'img']);

function cls(el: Element): string[] { const c: unknown = el.properties?.className; return Array.isArray(c) ? c.map(String) : typeof c === 'string' ? c.split(/\s+/) : []; }

function findAnnotation(el: Element): string | null {
  let found: string | null = null;
  const walk = (n: Element) => {
    for (const c of n.children) {
      if (found !== null) return;
      if (c.type === 'element') {
        if (c.tagName === 'annotation' && String(c.properties?.encoding ?? '').toLowerCase() === 'application/x-tex') {
          // An annotation stores source code. Preserve its whitespace.
          const literal = (el: Element): string => el.children.map(child => {
            if (child.type === 'text') return child.value;
            return child.type === 'element' ? literal(child) : '';
          }).join('');
          found = literal(c);
          return;
        }
        walk(c);
      }
    }
  };
  walk(el);
  return found;
}

/** Penanda rumus internal: span (inline) / div (display) agar spasi di sekitarnya tidak hilang saat minifikasi whitespace. */
function mathNode(tex: string, display: boolean): Element {
  // anak teks (TeX) membuat elemen tidak kosong sehingga spasi di sekitarnya dipertahankan; handler hanya membaca dataTex
  return { type: 'element', tagName: display ? 'div' : 'span', properties: { dataPfMath: display ? 'display' : 'inline', dataTex: tex }, children: [{ type: 'text', value: tex || ' ' }] };
}
const isMathNode = (n: HContent | Element): n is Element => n.type === 'element' && typeof n.properties?.dataPfMath === 'string';

/** RC4-M01/02/03: read delimiters across harmless inline wrappers before Markdown escaping.
 * Only the matched formula loses presentation wrappers; every outside fragment keeps its original markup.
 * Code, links, images and block boundaries are never joined into a formula. Link labels are visited separately.
 */
const MATH_TEXT_WRAPPERS = new Set(['span', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'mark', 'small']);
function protectHtmlLiteralMath(parent: HRoot | Element): number {
  const textCache = new WeakMap<HContent, string | null>();
  const literal = (n: HContent): string | null => {
    if (textCache.has(n)) return textCache.get(n)!;
    if (n.type === 'text') return n.value;
    if (n.type !== 'element' || typeof n.properties?.dataPfMath === 'string') return null;
    if (n.tagName === 'br') return '\n';
    if (!MATH_TEXT_WRAPPERS.has(n.tagName)) return null;
    const parts = n.children.map(c => literal(c as HContent));
    const value = parts.some(s => s === null) ? null : parts.join('');
    textCache.set(n, value);
    return value;
  };
  const rangeCache = new WeakMap<HContent[], number[]>();
  const slice = (nodes: HContent[], start: number, end: number): HContent[] => {
    const out: HContent[] = [];
    if (start >= end) return out;
    let ends = rangeCache.get(nodes);
    if (!ends) { let total = 0; ends = nodes.map(n => total += literal(n)!.length); rangeCache.set(nodes, ends); }
    let lo = 0, hi = ends.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (ends[mid]! <= start) lo = mid + 1; else hi = mid; }
    let pos = lo ? ends[lo - 1]! : 0;
    for (let k = lo; k < nodes.length && pos < end; k++) {
      const n = nodes[k]!;
      const value = literal(n)!;
      const a = Math.max(0, start - pos), b = Math.min(value.length, end - pos);
      if (a < b) {
        if (a === 0 && b === value.length) out.push(n);
        else if (n.type === 'text') out.push({ ...n, value: value.slice(a, b) });
        else if (n.type === 'element') out.push({ ...n, children: slice(n.children as HContent[], a, b) as Element['children'] });
      }
      pos += value.length;
      if (pos >= end) break;
    }
    return out;
  };
  const out: HContent[] = [];
  const nodes = parent.children as HContent[];
  let count = 0, i = 0;
  while (i < nodes.length) {
    if (literal(nodes[i]!) === null) { out.push(nodes[i++]!); continue; }
    let j = i, value = '';
    while (j < nodes.length) { const t = literal(nodes[j]!); if (t === null) break; value += t; j++; }
    const run = nodes.slice(i, j), spans = scanMath(value).spans;
    if (!spans.length) { out.push(...run); i = j; continue; }
    let pos = 0;
    for (const span of spans) {
      out.push(...slice(run, pos, span.start));
      const node = mathNode(span.tex, span.display);
      node.properties.dataPfLiteral = value.slice(span.start, span.end);
      out.push(node); pos = span.end; count++;
    }
    out.push(...slice(run, pos, value.length));
    i = j;
  }
  parent.children = out as typeof parent.children;
  return count;
}
/** alttext MathML hanya dipakai sebagai TeX bila jelas berbentuk TeX (perintah \, ^, _ atau kurung kurawal). */
function texLike(s: string): boolean { return /\\[A-Za-z]+|[\^_{}]/.test(s); }

function hasMerge(el: Element): boolean {
  let m = false;
  const walk = (n: Element) => { for (const c of n.children) if (c.type === 'element') { const rs = Number(c.properties?.rowSpan ?? 1); const cs = Number(c.properties?.colSpan ?? 1); if (rs === 0 || rs > 1 || cs > 1) m = true; walk(c); } };
  walk(el); return m;
}

function cleanTable(el: Element): Element {
  const keep: Properties = {};
  const p = el.properties ?? {};
  if (p.rowSpan !== undefined) keep.rowSpan = p.rowSpan;
  if (p.colSpan !== undefined) keep.colSpan = p.colSpan;
  if (p.align !== undefined) keep.align = p.align;
  if (p.scope !== undefined) keep.scope = p.scope;
  if (el.tagName === 'a' && typeof p.href === 'string' && classifyUrl(p.href).ok) keep.href = p.href;
  if (el.tagName === 'img') {
    if (typeof p.src === 'string' && classifyUrl(p.src, true).ok) keep.src = p.src;
    if (typeof p.alt === 'string') keep.alt = p.alt;
  }
  const children = el.children.flatMap((c): Element['children'] => {
    if (c.type === 'text') return [c];
    if (c.type !== 'element') return [];
    // Keep TeX as escaped text in a data-only element. Its mode is the only retained attribute.
    if (isMathNode(c)) return [{ type: 'element', tagName: 'code',
      properties: { dataPfFormula: c.properties.dataPfMath === 'display' ? 'display' : 'inline' },
      children: [{ type: 'text', value: String(c.properties.dataTex) }] }];
    const ce = c as Element;
    if (!MERGE_TABLE_TAGS.has(ce.tagName)) return cleanTable({ ...ce, tagName: 'span' }).children;
    return [cleanTable(ce)];
  });
  return { type: 'element', tagName: el.tagName, properties: keep, children };
}

export function htmlToMarkdown(html: string, opts: { plain?: string; limits?: Limits } = {}): ClipboardResult {
  const budget = checkTextBudget('pasteHtml', html, opts.limits ?? LIMITS);
  if (!budget.ok) return { ok: false, code: 'BUDGET_EXCEEDED', budget, message: `${budget.message} Gunakan impor berkas atau tempel teks biasa.`, messageEn: `${budget.messageEn} Use file import or paste plain text.` };
  const parsed = parseHtmlWithinBudget(html, opts.limits ?? LIMITS);
  if (!parsed.ok) return { ok: false, code: 'BUDGET_EXCEEDED', budget: parsed.budget, message: parsed.budget.message, messageEn: parsed.budget.messageEn };
  const tree = parsed.tree;
  const changes = new Map<string, ConversionChange>();
  const note = (kind: ConversionChange['kind'], detail: string) => { const k = `${kind}|${detail}`; const c = changes.get(k); if (c) c.count++; else changes.set(k, { kind, detail, count: 1 }); };
  const issues: CoreIssue[] = [];
  let math = 0, tables = 0, merged = 0, htmlLiteralMath = 0;

  const walk = (parent: HRoot | Element, inCode = false): void => {
    inCode ||= parent.type === 'element' && ['pre', 'code', 'kbd', 'samp'].includes(parent.tagName);
    const out: HContent[] = [];
    const texScriptSibling = (parent.children as HContent[]).some((x) => x.type === 'element' && x.tagName === 'script' && /^math\/tex\b/i.test(String(x.properties?.type ?? '')));
    for (const n of parent.children as HContent[]) {
      if (n.type === 'comment' || n.type === 'doctype') continue;
      if (n.type !== 'element') { out.push(n); continue; }
      const tag = n.tagName.toLowerCase();
      // Internal conversion nodes can only be created below, never supplied by the clipboard.
      if (tag === 'pf-rawtable' || typeof n.properties?.dataPfMath === 'string') { delete n.properties.dataPfMath; delete n.properties.dataTex; }
      delete n.properties.dataPfLiteral;
      if (tag === 'pf-rawtable') { walk(n, inCode); out.push(...n.children); continue; }
      const c = cls(n);
      // MathJax v2: <script type="math/tex[; mode=display]"> menyimpan sumber TeX (data, tidak dijalankan)
      if (!inCode && tag === 'script' && /^math\/tex\b/i.test(String(n.properties?.type ?? ''))) {
        const tex = n.children.map((x) => (x.type === 'text' ? x.value : '')).join('');
        math++; note('math-from-mathjax-script', 'LaTeX diambil dari skrip data MathJax (tidak dijalankan)');
        out.push(mathNode(tex.trim(), /mode\s*=\s*display/i.test(String(n.properties?.type))));
        continue;
      }
      // tampilan visual MathJax v2/v3 bila sumber TeX tersedia sebagai saudara (skrip math/tex) → jangan diduplikasi
      if (texScriptSibling && (c.some((x) => /^(MathJax|MJX)/.test(x)) || tag === 'mjx-container')) continue;
      if (!inCode && (c.includes('katex') || c.includes('katex-display') || tag === 'math' || c.includes('MathJax'))) {
        const display = c.includes('katex-display') || String(n.properties?.display ?? '') === 'block';
        const tex = findAnnotation(n);
        if (tex !== null) {
          math++; note('math-from-annotation', 'LaTeX diambil dari anotasi; tampilan visual & MathML tidak diduplikasi');
          out.push(mathNode(tex, display));
          continue;
        }
        const alt = tag === 'math' ? String(n.properties?.alttext ?? '') : '';
        if (alt && texLike(alt)) {
          math++; note('math-from-alttext', 'LaTeX diambil dari atribut alttext MathML');
          out.push(mathNode(alt, display));
          continue;
        }
        if (c.includes('katex')) {
          note('math-no-tex', 'KaTeX tanpa anotasi LaTeX: teks visual dipertahankan');
          issues.push(mkIssue('CLIPBOARD_MATH_NO_TEX', 'warning', 'math', { id: 'Rumus KaTeX tanpa sumber LaTeX; teks tampilannya dipertahankan dan perlu diperiksa (tempel sebagai teks biasa bila sumber memuat \\(…\\)).', en: 'KaTeX formula without LaTeX source; its visible text was kept and needs review (paste as plain text if the source contains \\(…\\)).' }));
        }
        if (tag === 'math') {
          note('math-no-tex', 'MathML tanpa anotasi LaTeX: teksnya dipertahankan');
          issues.push(mkIssue('CLIPBOARD_MATH_NO_TEX', 'warning', 'math', { id: 'Rumus MathML tanpa sumber LaTeX; teks rumus dipertahankan dan perlu diperiksa.', en: 'MathML formula without LaTeX source; its text was kept and needs review.' }));
          out.push({ type: 'text', value: toText(n) });
          continue;
        }
        // KaTeX tanpa anotasi: ambil hanya sisi visual sekali (abaikan .katex-mathml)
      }
      if (c.includes('katex-mathml')) continue;
      if (DROP_WITH_CONTENT.has(tag) || tag === 'script') {
        note('removed-element', `<${tag}>`);
        issues.push(mkIssue('SECURITY_ELEMENT_REMOVED', 'warning', 'security', { id: `Elemen <${tag}> dari clipboard dibuang dan tidak dijalankan.`, en: `Clipboard element <${tag}> was removed and not executed.` }, { detail: { tag } }));
        continue;
      }
      const p = n.properties ?? {};
      for (const k of Object.keys(p)) {
        if (/^on/i.test(k)) { delete p[k]; note('removed-attribute', k.toLowerCase()); issues.push(mkIssue('SECURITY_EVENT_HANDLER', 'warning', 'security', { id: `Atribut ${k.toLowerCase()} pada <${tag}> dibuang.`, en: `Attribute ${k.toLowerCase()} on <${tag}> was removed.` })); }
        else if (k === 'style') { delete p[k]; note('removed-attribute', 'style'); }
      }
      if (tag === 'a' && p.href !== undefined) {
        const v = classifyUrl(String(p.href));
        if (!v.ok) { note('unsafe-link', `${v.scheme}:`); issues.push(mkIssue('SECURITY_UNSAFE_LINK', 'warning', 'security', { id: `Tautan "${v.scheme}:" dari clipboard dinonaktifkan; teksnya dipertahankan.`, en: `"${v.scheme}:" link from the clipboard was disabled; its text was kept.` })); delete p.href; n.tagName = 'span'; }
      }
      if (tag === 'img' && /^https?:/i.test(String(p.src ?? ''))) note('remote-image-reference', 'gambar jarak jauh disimpan sebagai rujukan, tidak diunduh');
      if (tag === 'table') {
        tables++;
        const mergedCells = hasMerge(n);
        walk(n, inCode);
        const sections = n.children.filter((c): c is Element => c.type === 'element');
        const needsRawMath = (el: Element): boolean => (isMathNode(el) && /[|\n]/.test(String(el.properties.dataTex))) || el.children.some(c => c.type === 'element' && needsRawMath(c));
        const structured = sections.some(s => s.tagName === 'caption' || s.tagName === 'tfoot' ||
          (s.tagName === 'thead' && s.children.filter(c => c.type === 'element' && c.tagName === 'tr').length > 1)) ||
          sections.filter(s => s.tagName === 'tbody').length > 1 || needsRawMath(n);
        if (mergedCells || structured) {
          if (mergedCells) merged++;
          const cleaned = cleanTable(n);
          const htmlTable = unified().use(rehypeStringify).stringify({ type: 'root', children: [cleaned] })
            // A blank line terminates a raw Markdown HTML block. Character references preserve exact cell/TeX text.
            .replace(/\n/g, '&#10;');
          if (mergedCells) {
            note('merged-table-as-html', 'tabel dengan rowspan/colspan dipertahankan sebagai blok HTML tabel');
            issues.push(mkIssue('TABLE_MERGED_CELLS_HTML', 'warning', 'table', { id: 'Tabel dengan sel gabungan (rowspan/colspan) tidak dapat diwakili tabel Markdown; dipertahankan sebagai blok HTML tabel tersanitasi. Periksa sebelum ekspor.', en: 'A table with merged cells (rowspan/colspan) cannot be represented as a Markdown table; it was kept as a sanitized HTML table block. Review before export.' }, { detail: { kind: 'merged-cells' } }));
          } else {
            note('structured-table-as-html', 'Struktur tabel dan rumus yang tidak dapat diwakili tabel Markdown disimpan dalam HTML.');
          }
          out.push({ type: 'element', tagName: 'pf-rawtable', properties: { dataHtml: htmlTable }, children: [] });
          continue;
        }
        out.push(n); continue;
      }
      walk(n, inCode);
      out.push(n);
    }
    parent.children = out as typeof parent.children;
    if (!inCode) htmlLiteralMath += protectHtmlLiteralMath(parent);
  };
  walk(tree);

  hoistDisplayMath(tree);
  const mdast = unified().use(rehypeRemark, {
    handlers: {
      span: (state, node: Element) => (isMathNode(node) ? (typeof node.properties.dataPfLiteral === 'string' ? { type: 'html', value: node.properties.dataPfLiteral } : { type: 'inlineMath', value: String(node.properties.dataTex ?? '') }) : defaultHandlers.span!(state, node)),
      div: (state, node: Element) => (isMathNode(node) ? (typeof node.properties.dataPfLiteral === 'string' ? { type: 'html', value: node.properties.dataPfLiteral } : { type: 'math', value: String(node.properties.dataTex ?? '') }) : defaultHandlers.div!(state, node)),
      'pf-rawtable': (_state, node: Element) => ({ type: 'html', value: String(node.properties?.dataHtml ?? '') }),
    },
  }).runSync(tree) as MRoot;
  const literal = htmlLiteralMath + protectLiteralMath(mdast);
  if (literal) { math += literal; note('math-literal-delimiters', 'Delimiter rumus di teks (\\(…\\), \\[…\\], $…$, $$…$$) dipertahankan apa adanya, tidak di-escape'); }
  const markdown = unified().use(remarkGfm).use(remarkMath).use(remarkStringify, { bullet: '-', fences: true, rule: '-', emphasis: '*', strong: '*', listItemIndent: 'one' })
    .stringify(mdast as never) as unknown as string;

  if (opts.plain !== undefined) {
    // cakupan teks: token alfanumerik text/plain yang tidak muncul di Markdown (indikasi kehilangan isi)
    const have = new Map<string, number>();
    for (const t of orderedTokens(markdown)) if (/[\p{L}\p{N}]/u.test(t)) have.set(t, (have.get(t) ?? 0) + 1);
    const missing: string[] = [];
    for (const t of orderedTokens(opts.plain)) if (/[\p{L}\p{N}]/u.test(t)) { const k = have.get(t) ?? 0; if (k > 0) have.set(t, k - 1); else missing.push(t); }
    if (missing.length) issues.push(mkIssue('CLIPBOARD_PLAIN_MISMATCH', 'warning', 'input', { id: `${missing.length} token di versi teks biasa tidak ditemukan di hasil konversi HTML (mis. ${missing.slice(0, 8).join(', ')}). Bandingkan sebelum memakai hasil konversi.`, en: `${missing.length} tokens from the plain-text version were not found in the HTML conversion (e.g. ${missing.slice(0, 8).join(', ')}). Compare before using the conversion.` }, { detail: { missing: missing.slice(0, 50) } }));
  }
  return { ok: true, markdown, changes: [...changes.values()], issues: numberIssues(issues, 'clip'), stats: { inputBytes: budget.actual, outputChars: markdown.length, tables, math, mergedTables: merged } };
}

/** Rumus display di dalam paragraf HTML (<p>… <span class="katex-display">) dipindah keluar sebagai blok sendiri. */
function hoistDisplayMath(root: HRoot | Element): void {
  const out: HContent[] = [];
  for (const n of root.children as HContent[]) {
    if (n.type === 'element') hoistDisplayMath(n);
    if (n.type === 'element' && (n.tagName === 'p' || n.tagName === 'span') && n.children.some((c) => isMathNode(c) && c.properties.dataPfMath === 'display')) {
      let cur: Element = { ...n, children: [] };
      for (const c of n.children) {
        if (isMathNode(c) && c.properties.dataPfMath === 'display') {
          if (cur.children.some((x) => x.type !== 'text' || x.value.trim())) out.push(cur);
          out.push(c);
          cur = { ...n, children: [] };
        } else cur.children.push(c);
      }
      if (cur.children.some((x) => x.type !== 'text' || x.value.trim())) out.push(cur);
      continue;
    }
    out.push(n);
  }
  root.children = out as typeof root.children;
}

/**
 * Akar bug "rumus tampil mentah": teks HTML yang memuat delimiter rumus literal (umum pada salinan ChatGPT) dahulu
 * diserialisasi remark-stringify dengan escape (\( → \\(, $ → \$) sehingga tidak lagi dikenali sebagai rumus.
 * Di sini setiap rangkaian teks/baris-putus dipindai dengan scanMath (aturan sama dengan jalur Markdown: mata uang,
 * kode, delimiter tak tertutup) dan rentang rumus dikeluarkan VERBATIM sebagai node html (tanpa escape).
 */
function protectLiteralMath(root: MRoot): number {
  let count = 0;
  const visit = (parent: MParent, inTable: boolean): void => {
    const kids = parent.children as MContent[];
    const out: MContent[] = [];
    let i = 0;
    while (i < kids.length) {
      const k = kids[i]!;
      if (k.type !== 'text' && k.type !== 'break') {
        if ('children' in k) visit(k as MParent, inTable || k.type === 'tableCell');
        out.push(k); i++; continue;
      }
      let j = i; let str = '';
      while (j < kids.length && (kids[j]!.type === 'text' || kids[j]!.type === 'break')) { const x = kids[j]!; str += x.type === 'text' ? x.value : '\n'; j++; }
      const scan = scanMath(str);
      const spans = scan.spans.filter((sp) => !(inTable && str.slice(sp.start, sp.end).includes('\n')));
      if (!spans.length) { out.push(...kids.slice(i, j)); i = j; continue; }
      let pos = 0;
      const pushText = (t: string) => { t.split('\n').forEach((part, idx) => { if (idx) out.push({ type: 'break' }); if (part) out.push({ type: 'text', value: part }); }); };
      for (const sp of spans) {
        pushText(str.slice(pos, sp.start));
        out.push({ type: 'html', value: str.slice(sp.start, sp.end) } as PhrasingContent);
        pos = sp.end; count++;
      }
      pushText(str.slice(pos));
      i = j;
    }
    parent.children = out as typeof parent.children;
  };
  visit(root as unknown as MParent, false);
  return count;
}
