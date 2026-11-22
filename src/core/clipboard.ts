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
import { defaultHandlers, type Handle } from 'hast-util-to-mdast';
import type { Root as MRoot, RootContent as MContent, Parent as MParent, PhrasingContent } from 'mdast';
import { clipboardMathInventory, clipboardMathMatches } from './clipboard-fidelity';
import { scanMath, type MathSpan } from './math';
import { recoverHtmlLiteralMath } from './html-math';
import { readHtmlMathSource, recoverMixedMathChild, isMathPresentationBranch, isHtmlMathContainer, hasSeparateMathContent, hasHtmlMathAnnotation, findHtmlMathAnnotation } from './html-math-source';
import type { Element, Root as HRoot, RootContent as HContent, Properties } from 'hast';
import type { Limits } from './contracts';
import { LIMITS, checkTextBudget, BudgetError, type BudgetResult } from './limits';
import { parseHtmlWithinBudget, parseHtmlDocumentBody } from './html';
import { classifyUrl, DROP_WITH_CONTENT, ALLOWED_TAGS } from './sanitize';
import { orderedTokens } from './markdown';
import { escapeHtml, mkIssue, numberIssues, type CoreIssue } from './util';

export interface ConversionChange { kind: 'removed-element' | 'removed-attribute' | 'math-from-annotation' | 'math-from-alttext' | 'math-from-source-attribute' | 'math-from-mathjax-script' | 'math-literal-delimiters' | 'math-adjacent-delimiters' | 'math-recovered-copy' | 'math-no-tex' | 'merged-table-as-html' | 'structured-table-as-html' | 'formula-block-as-html' | 'unsafe-link' | 'remote-image-reference' | 'unwrapped'; detail: string; count: number }

export type ClipboardResult =
  | { ok: true; markdown: string; changes: ConversionChange[]; issues: CoreIssue[]; stats: { inputBytes: number; outputChars: number; tables: number; math: number; mergedTables: number } }
  | { ok: false; code: 'CLIPBOARD_INTEGRITY'; message: string; messageEn: string }
  | { ok: false; code: 'BUDGET_EXCEEDED'; budget: BudgetResult; message: string; messageEn: string };

const ORDERED_LIST_TYPES = new Set(['1', 'a', 'A', 'i', 'I']);
const INERT_CLIPBOARD_TAGS = new Set<string>(ALLOWED_TAGS.filter(tag => tag !== 'input'));

function cls(el: Element): string[] { const c: unknown = el.properties?.className; return Array.isArray(c) ? c.map(String) : typeof c === 'string' ? c.split(/\s+/) : []; }

const CODE_TAGS = new Set(['pre', 'code', 'kbd', 'samp']);
/** MathJax 2 places its optional preview and rendered element immediately before a TeX script.
 * Only discard that representation; another complete equation can share the same paragraph. */
function mathJaxDuplicates(children: HContent[]): Set<HContent> {
  const duplicates = new Set<HContent>();
  for (let i = 0; i < children.length; i++) {
    const script = children[i]!;
    if (script.type !== 'element' || script.tagName !== 'script' || !/^math\/tex\b/i.test(String(script.properties.type ?? ''))) continue;
    const tex = script.children.map(c => c.type === 'text' ? c.value : '').join('').trim();
    let visualFound = false;
    for (let j = i - 1; j >= 0; j--) {
      const sibling = children[j]!;
      if (sibling.type === 'comment' || (sibling.type === 'text' && !sibling.value.trim())) continue;
      if (sibling.type !== 'element') break;
      const classes = cls(sibling);
      if (classes.includes('MathJax_Preview')) {
        if (!hasSeparateMathContent(sibling) && !hasHtmlMathAnnotation(sibling)) duplicates.add(sibling);
        break;
      }
      if (visualFound || !(sibling.tagName === 'mjx-container' || classes.some(c => /^(MathJax|MJX)(?:$|[-_])/.test(c)))) break;
      const source = readHtmlMathSource(sibling);
      if (!source && (hasSeparateMathContent(sibling) || hasHtmlMathAnnotation(sibling))) break;
      if (source && source.tex.trim() !== tex) break;
      duplicates.add(sibling);
      visualFound = true;
    }
  }
  return duplicates;
}

/** Penanda rumus internal: span (inline) / div (display) agar spasi di sekitarnya tidak hilang saat minifikasi whitespace. */
function mathNode(tex: string, display: boolean): Element {
  // A non-whitespace placeholder keeps surrounding prose spaces independent of whitespace inside TeX.
  const properties: Properties = { dataPfMath: display ? 'display' : 'inline', dataTex: tex };
  // Whitespace, backticks and dollar signs each have special meanings in dollar-delimited Markdown.
  if (!display && /^\s|\s$|[`$]/u.test(tex)) properties.dataPfLiteral = inlineLiteral(tex);
  return { type: 'element', tagName: display ? 'div' : 'span', properties, children: [{ type: 'text', value: 'x' }] };
}
/** Explicit boundaries distinguish literal annotation text from author-entered GitHub math. */
function inlineLiteral(tex: string): string {
  return tex.includes('\\)') ? `<code data-pf-formula="inline">${escapeHtml(tex)}</code>` : '\\(' + tex + '\\)';
}
const isMathNode = (n: HContent | Element): n is Element => n.type === 'element' && typeof n.properties?.dataPfMath === 'string';

function hasMerge(el: Element): boolean {
  let m = false;
  const walk = (n: Element) => { for (const c of n.children) if (c.type === 'element') { const rs = Number(c.properties?.rowSpan ?? 1); const cs = Number(c.properties?.colSpan ?? 1); if (rs === 0 || rs > 1 || cs > 1) m = true; walk(c); } };
  walk(el); return m;
}

function cleanRichHtml(el: Element, fragments: WeakMap<Element, Element>): Element {
  const keep: Properties = {};
  const p = el.properties ?? {};
  if (p.rowSpan !== undefined) keep.rowSpan = p.rowSpan;
  if (p.colSpan !== undefined) keep.colSpan = p.colSpan;
  if (p.align !== undefined) keep.align = p.align;
  if (p.scope !== undefined) keep.scope = p.scope;
  if (el.tagName === 'th' && typeof p.abbr === 'string') keep.abbr = p.abbr;
  if ((el.tagName === 'colgroup' || el.tagName === 'col') && p.span !== undefined) keep.span = p.span;
  if ((el.tagName === 'th' || el.tagName === 'td') && p.headers !== undefined) keep.headers = p.headers;
  if (typeof p.title === 'string') keep.title = p.title;
  if (el.tagName === 'details' && p.open === true) keep.open = true;
  if (el.tagName === 'ol' && typeof p.type === 'string' && ORDERED_LIST_TYPES.has(p.type)) keep.type = p.type;
  if ((el.tagName === 'li' || el.tagName === 'ul') && typeof p.type === 'string') keep.type = p.type;
  if (el.tagName === 'ol' && p.reversed === true) keep.reversed = true;
  if (el.tagName === 'li' && /^-?\d+$/.test(String(p.value))) keep.value = p.value;
  if (el.tagName === 'ol' && p.start !== undefined) keep.start = p.start;
  for (const key of ['dir', 'lang', 'id']) if (typeof p[key] === 'string') keep[key] = p[key];
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
    const fragment = fragments.get(ce);
    if (fragment) return [fragment];
    if (!INERT_CLIPBOARD_TAGS.has(ce.tagName)) return cleanRichHtml({ ...ce, tagName: 'span' }, fragments).children;
    return [cleanRichHtml(ce, fragments)];
  });
  return { type: 'element', tagName: el.tagName, properties: keep, children };
}

/** GFM has no subscript/superscript token. Retain those two inert tag names
 * around converted content, so a displayed exponent cannot turn into a normal digit. */
const keepScriptPosition: Handle = (state, node) => [
  { type: 'html', value: `<${node.tagName}>` }, ...state.all(node),
  { type: 'html', value: `</${node.tagName}>` },
];

type ClipboardOptions = { plain?: string; limits?: Limits; wholeDocument?: boolean };

export function htmlToMarkdown(html: string, opts: ClipboardOptions = {}): ClipboardResult {
  try {
    return convertHtml(html, opts, false);
  } catch (error) {
    if (!(error instanceof BudgetError)) throw error;
    return {ok:false,code:'BUDGET_EXCEEDED',budget:error.result,message:error.result.message,messageEn:error.result.messageEn};
  }
}

function convertHtml(html: string, opts: ClipboardOptions, keepMathBlocks: boolean): ClipboardResult {
  const budget = checkTextBudget('pasteHtml', html, opts.limits ?? LIMITS);
  if (!budget.ok) return { ok: false, code: 'BUDGET_EXCEEDED', budget, message: `${budget.message} Gunakan impor berkas atau tempel teks biasa.`, messageEn: `${budget.messageEn} Use file import or paste plain text.` };
  const parsed = opts.wholeDocument ? parseHtmlDocumentBody(html, opts.limits ?? LIMITS) : parseHtmlWithinBudget(html, opts.limits ?? LIMITS);
  if (!parsed.ok) return { ok: false, code: 'BUDGET_EXCEEDED', budget: parsed.budget, message: parsed.budget.message, messageEn: parsed.budget.messageEn };
  const tree = parsed.tree;
  const fragments = new WeakMap<Element, Element>();
  const originalFragments = new WeakMap<Element, Element>();
  const richFragment = (node: Element): Element => {
    const clean = cleanRichHtml(node, fragments);
    // Blank lines terminate Markdown HTML blocks; HTML character references preserve the text.
    const dataHtml = unified().use(rehypeStringify).stringify({type: 'root', children: [clean]}).replace(/\n/g, '&#10;');
    const marker: Element = {type: 'element', tagName: 'pf-rawtable', properties: {dataHtml}, children: []};
    fragments.set(marker, clean);
    originalFragments.set(marker, node);
    return marker;
  };
  const changes = new Map<string, ConversionChange>();
  const note = (kind: ConversionChange['kind'], detail: string) => { const k = `${kind}|${detail}`; const c = changes.get(k); if (c) c.count++; else changes.set(k, { kind, detail, count: 1 }); };
  const issues: CoreIssue[] = [];
  let math = 0, tables = 0, merged = 0, htmlLiteralMath = 0, hasHardBreak = false;
  const recovered: MathSpan[] = [];
  const recordAdaptation = (span?: MathSpan) => { if (span?.adaptations?.length) recovered.push(span); };

  const containsFormulaOrBreak = (n: HContent): boolean => n.type === 'element' && (n.tagName === 'br' || typeof n.properties.dataPfMath === 'string' || n.children.some(containsFormulaOrBreak));
  const walk = (parent: HRoot | Element, inCode = false): void => {
    inCode ||= parent.type === 'element' && CODE_TAGS.has(parent.tagName);
    const out: HContent[] = [];
    const pairedVisuals = inCode ? undefined : mathJaxDuplicates(parent.children as HContent[]);
    let katexDuplicate: Element | undefined;
    if (!inCode && parent.type === 'element' && cls(parent).includes('katex')) {
      const branches = parent.children.filter((child): child is Element => child.type === 'element');
      const assistive = branches.find(child => cls(child).includes('katex-mathml'));
      const visual = branches.find(child => cls(child).includes('katex-html'));
      if (assistive && visual && isMathPresentationBranch(assistive) && isMathPresentationBranch(visual)) {
        if (findHtmlMathAnnotation(assistive) !== null) katexDuplicate = visual;
        else if (!hasHtmlMathAnnotation(assistive) && toText(visual).trim()) katexDuplicate = assistive;
      }
    }
    for (const n of parent.children as HContent[]) {
      if (n.type === 'comment' || n.type === 'doctype') continue;
      if (n.type !== 'element') { out.push(n); continue; }
      const tag = n.tagName.toLowerCase();
      if (tag === 'br') hasHardBreak = true;
      const literalCode = inCode || CODE_TAGS.has(tag);
      // Internal conversion nodes can only be created below, never supplied by the clipboard.
      if (tag === 'pf-rawtable' || typeof n.properties?.dataPfMath === 'string') { delete n.properties.dataPfMath; delete n.properties.dataTex; }
      delete n.properties.dataPfLiteral;
      if (tag === 'pf-rawtable') { walk(n, inCode); out.push(...n.children); continue; }
      const c = cls(n);
      // MathJax v2: <script type="math/tex[; mode=display]"> menyimpan sumber TeX (data, tidak dijalankan)
      if (!literalCode && tag === 'script' && /^math\/tex\b/i.test(String(n.properties?.type ?? ''))) {
        const tex = n.children.map((x) => (x.type === 'text' ? x.value : '')).join('');
        math++; note('math-from-mathjax-script', 'LaTeX diambil dari skrip data MathJax (tidak dijalankan)');
        out.push(mathNode(tex.trim(), /mode\s*=\s*display/i.test(String(n.properties?.type))));
        continue;
      }
      // tampilan visual MathJax v2/v3 bila sumber TeX tersedia sebagai saudara (skrip math/tex) → jangan diduplikasi
      if (pairedVisuals?.has(n) || n === katexDuplicate) continue;
      const mathSource = !literalCode ? readHtmlMathSource(n) : null;
      const ambiguous = !literalCode && isHtmlMathContainer(n) && !mathSource && hasSeparateMathContent(n);
      if (!literalCode && isHtmlMathContainer(n)) {
        if (mathSource) {
          math++;
          if (mathSource.origin === 'annotation') note('math-from-annotation', 'LaTeX diambil dari anotasi; tampilan visual & MathML tidak diduplikasi');
          else if (mathSource.origin === 'source-attribute') note('math-from-source-attribute', 'LaTeX diambil dari atribut sumber data-latex/data-tex; tampilan visual tidak diduplikasi');
          else note('math-from-alttext', 'LaTeX diambil dari atribut alttext MathML');
          recordAdaptation(mathSource.span);
          const marker = mathNode(mathSource.tex, mathSource.display);
          originalFragments.set(marker, n); // Independently re-read the original annotation in the round-trip check.
          out.push(marker);
          continue;
        }
        if (ambiguous) {
          recoverMixedMathChild(n);
          issues.push(mkIssue('CLIPBOARD_MATH_MIXED_SOURCE', 'warning', 'math', {
            id: 'Atribut TeX berada pada pembungkus yang juga memuat isi lain. Teks dan rumus di dalamnya dipertahankan. Bandingkan dengan HTML asli.',
            en: 'A TeX attribute is attached to a wrapper containing other content. The inner text and equations were retained. Compare with the original HTML.',
          }, {line: n.position?.start.line, detail: { tag, sourceAttribute: String(n.properties.dataLatex ?? n.properties.dataTex ?? '').slice(0,300) }}));
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
        if (tag === 'mjx-container' || c.some(c => /^MathJax(?:$|_)/.test(c))) {
          note('math-no-tex', 'MathJax tanpa sumber LaTeX: representasi teks dipertahankan');
          issues.push(mkIssue('CLIPBOARD_MATH_NO_TEX', 'warning', 'math', { id: 'Rumus MathJax tanpa sumber LaTeX; tampilan teks dipertahankan dan perlu diperiksa. Salin sumber Markdown/LaTeX untuk pemulihan yang tepat.', en: 'MathJax formula without LaTeX source; its text representation was kept and needs review. Copy the Markdown/LaTeX source for exact recovery.' }));
        }
      }
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
      // Known presentation components copied from AI answers become semantic blocks;
      // their props are never executed or interpreted as application code.
      if (!literalCode && (tag === 'box' || tag === 'text')) {
        note('unwrapped', `<${tag}> menjadi blok teks; atribut presentasi tidak dijalankan`);
        n.tagName = tag === 'text' ? 'p' : 'div';
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
        const needsRawMath = (el: Element): boolean => (isMathNode(el) && (el.properties.dataPfMath === 'display' || /[|\n]/.test(String(el.properties.dataTex)))) || el.children.some(c => c.type === 'element' && needsRawMath(c));
        const structured = sections.some(s => s.tagName === 'caption' || s.tagName === 'tfoot' ||
          (s.tagName === 'thead' && s.children.filter(c => c.type === 'element' && c.tagName === 'tr').length > 1)) ||
          sections.filter(s => s.tagName === 'tbody').length > 1 || needsRawMath(n) || keepMathBlocks;
        if (mergedCells || structured) {
          if (mergedCells) merged++;
          if (mergedCells) {
            note('merged-table-as-html', 'tabel dengan rowspan/colspan dipertahankan sebagai blok HTML tabel');
            issues.push(mkIssue('TABLE_MERGED_CELLS_HTML', 'warning', 'table', { id: 'Tabel dengan sel gabungan (rowspan/colspan) tidak dapat diwakili tabel Markdown; dipertahankan sebagai blok HTML tabel tersanitasi. Periksa sebelum ekspor.', en: 'A table with merged cells (rowspan/colspan) cannot be represented as a Markdown table; it was kept as a sanitized HTML table block. Review before export.' }, { detail: { kind: 'merged-cells' } }));
          } else {
            note('structured-table-as-html', 'Struktur tabel dan rumus yang tidak dapat diwakili tabel Markdown disimpan dalam HTML.');
          }
          out.push(richFragment(n));
          continue;
        }
        out.push(n); continue;
      }
      const needsListHtml = (el: Element): boolean =>
        (el.tagName === 'ol' && (el.properties.reversed === true || ORDERED_LIST_TYPES.has(String(el.properties.type)))) ||
        (el.tagName === 'ul' && typeof el.properties.type === 'string') ||
        (el.tagName === 'li' && (el.properties.value !== undefined || typeof el.properties.type === 'string')) ||
        el.children.some(child => child.type === 'element' && needsListHtml(child));
      const richList = (tag === 'ol' || tag === 'ul') && needsListHtml(n);
      walk(n, inCode);
      if (richList) out.push(richFragment(n));
      else if (keepMathBlocks && /^(?:p|pre|div|h[1-6]|blockquote|ol|ul|section)$/.test(n.tagName) && containsFormulaOrBreak(n)) {
        out.push(richFragment(n));
        note('formula-block-as-html', 'Rumus dan teks pendamping dipertahankan dalam HTML aman.');
      }
      else if (ambiguous && (tag === 'div' || tag === 'span')) out.push(richFragment(n));
      else out.push(n);
    }
    parent.children = out as typeof parent.children;
    if (!inCode) htmlLiteralMath += recoverHtmlLiteralMath(parent, (span, source) => {
      recordAdaptation(span);
      const node = mathNode(span.renderTex ?? span.tex, span.display);
      const literal = source.slice(span.start, span.end);
      // Markdown fences discard the delimiter-line newline on either side of
      // the equation. Use a data-only block for this literal only.
      node.properties.dataPfLiteral = span.display && literal.startsWith('$$') && /^\s|\s$/u.test(span.tex)
        ? '<div><code data-pf-formula="display">' + escapeHtml(String(node.properties.dataTex)).replace(/\n/g,'&#10;') + '</code></div>'
        : literal;
      return node;
    }, isMathNode);
    // RC6-CLIP09: `$a$$b$` is ambiguous with display delimiters. Preserve adjacent
    // equations separately without inserting whitespace into the user's content.
    const inlineMath = (n: HContent | undefined): n is Element => !!n && isMathNode(n) && n.properties.dataPfMath === 'inline';
    for (let i = 0; i < parent.children.length; i++) {
      const n = parent.children[i];
      if (!inlineMath(n) || !(inlineMath(parent.children[i - 1]) || inlineMath(parent.children[i + 1]))) continue;
      const tex = String(n.properties.dataTex ?? '');
      const literal = inlineLiteral(tex);
      if (n.properties.dataPfLiteral !== literal) {
        n.properties.dataPfLiteral = literal;
        note('math-adjacent-delimiters', 'Rumus inline berdampingan memakai pembatas yang tidak ambigu, tanpa menambah spasi');
      }
    }
  };
  walk(tree);
  // A clipboard fragment may start with inline siblings instead of a paragraph.
  if (keepMathBlocks && tree.children.some(containsFormulaOrBreak)) {
    const wrapped: Element = {type:'element', tagName:'div', properties:{}, children:tree.children.filter(n=>n.type !== 'doctype')};
    tree.children = [richFragment(wrapped)];
    note('formula-block-as-html', 'Rumus dan teks pendamping dipertahankan dalam HTML aman.');
  }

  if (recovered.length) {
    const bodyChanges = recovered.filter(s => s.renderTex !== undefined && s.renderTex !== s.tex);
    const sample = (bodyChanges.length ? bodyChanges : recovered).slice(0, 3);
    const adaptations = [...new Set(recovered.flatMap(s => s.adaptations ?? []))];
    note('math-recovered-copy', `${recovered.length} rumus salinan dipulihkan; ${bodyChanges.length} memerlukan penyesuaian TeX`);
    issues.push(mkIssue('CLIPBOARD_MATH_RECOVERED', bodyChanges.length ? 'warning' : 'info', 'math', {
      id: bodyChanges.length ? `${recovered.length} rumus dari clipboard dipulihkan; ${bodyChanges.length} memuat escape salinan pada isi TeX yang ditafsirkan ulang. Periksa rumus hasilnya; HTML asli tetap tersedia pada masukan proyek.` : `${recovered.length} pembatas rumus ber-escape dari clipboard dikenali kembali. Isi TeX dipertahankan.`,
      en: bodyChanges.length ? `${recovered.length} clipboard formulas recovered; ${bodyChanges.length} contain copied TeX escapes that were reinterpreted. Review the formulas; the original HTML remains in the project input.` : `${recovered.length} copied escaped math delimiters were recognized. The TeX body was preserved.`,
    }, { detail: { count: recovered.length, bodyChanges: bodyChanges.length, adaptations, raw: sample.map(s => s.tex.slice(0, 300)), rendered: sample.map(s => (s.renderTex ?? s.tex).slice(0, 300)) } }));
  }

  // Snapshot annotations and their containing cells before either stringifier can change them.
  const expected = math || htmlLiteralMath || tables || hasHardBreak ? clipboardMathInventory(tree, originalFragments) : undefined;
  hoistDisplayMath(tree);
  const mdast = unified().use(rehypeRemark, {
    handlers: {
      sub: keepScriptPosition,
      sup: keepScriptPosition,
      span: (state, node: Element) => (isMathNode(node) ? (typeof node.properties.dataPfLiteral === 'string' ? { type: 'html', value: node.properties.dataPfLiteral } : { type: 'inlineMath', value: String(node.properties.dataTex ?? '') }) : defaultHandlers.span!(state, node)),
      div: (state, node: Element) => (isMathNode(node) ? (typeof node.properties.dataPfLiteral === 'string' ? { type: 'html', value: node.properties.dataPfLiteral } : { type: 'math', value: String(node.properties.dataTex ?? '') }) : defaultHandlers.div!(state, node)),
      'pf-rawtable': (_state, node: Element) => ({ type: 'html', value: String(node.properties?.dataHtml ?? '') }),
    },
  }).runSync(tree) as MRoot;
  const literal = htmlLiteralMath + protectLiteralMath(mdast);
  if (literal) { math += literal; note('math-literal-delimiters', 'Delimiter rumus di teks (\\(…\\), \\[…\\], $…$, $$…$$) dipertahankan apa adanya, tidak di-escape'); }
  const markdown = unified().use(remarkGfm).use(remarkMath).use(remarkStringify, { bullet: '-', fences: true, rule: '-', emphasis: '*', strong: '*', listItemIndent: 'one' })
    .stringify(mdast as never) as unknown as string;

  if (expected && !clipboardMathMatches(expected, markdown)) {
    // Markdown delimiters also depend on adjacent text (e.g. a digit after a
    // dollar closer). Retry from the original input, retaining the affected blocks.
    if (!keepMathBlocks) return convertHtml(html,opts,true);
    return { ok: false, code: 'CLIPBOARD_INTEGRITY',
      message: 'Konversi mengubah rumus, pemisah teks atau isi sel. HTML asli tetap tersedia. Impor HTML atau tinjau teks biasa.',
      messageEn: 'Conversion changed a formula, text boundary or table cell. The original HTML is preserved. Review the plain text or the HTML.' };
  }
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
  // A delimiter left over after HTML math recovery can straddle a link or a
  // subscript. Encoding its literal slash prevents a later Markdown parse from
  // consuming the link destination or the markup itself as TeX.
  const appendLiteral = (out: MContent[], value: string) => {
    let start = 0;
    for (const match of value.matchAll(/\\+(?=[()[\]])/g)) {
      if (match.index! > start) out.push({ type: 'text', value: value.slice(start, match.index) });
      out.push({ type: 'html', value: '&#92;'.repeat(match[0].length) });
      start = match.index! + match[0].length;
    }
    if (start < value.length) out.push({ type: 'text', value: value.slice(start) });
  };
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
      if (!spans.length) {
        for (const node of kids.slice(i, j)) {
          if (node.type === 'text' && node.value.includes('\\')) appendLiteral(out, node.value);
          else out.push(node);
        }
        i = j; continue;
      }
      let pos = 0;
      const pushText = (t: string) => { t.split('\n').forEach((part, idx) => { if (idx) out.push({ type: 'break' }); if (part) appendLiteral(out, part); }); };
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
