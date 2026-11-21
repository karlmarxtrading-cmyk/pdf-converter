/**
 * Clipboard HTML → Markdown (IMP-04, SEM-07, CODE-06). Tanpa DOM (rehype-parse).
 *  - Ditolak UTUH berdasarkan byte UTF-8 SEBELUM konversi (tidak ada slice);
 *  - KaTeX/MathML: anotasi LaTeX diambil SEKALI; representasi visual/assistive tidak diduplikasi;
 *  - tabel dengan rowspan/colspan dipertahankan sebagai blok HTML tabel tersanitasi + issue (tidak diratakan diam-diam);
 *  - skrip/handler/gaya tidak pernah ikut; semua perubahan dicatat di laporan konversi.
 */
import { unified } from 'unified';
import rehypeParse from 'rehype-parse';
import rehypeRemark from 'rehype-remark';
import rehypeStringify from 'rehype-stringify';
import remarkStringify from 'remark-stringify';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { toText } from 'hast-util-to-text';
import type { Element, Root as HRoot, RootContent as HContent, Properties } from 'hast';
import type { Limits } from './contracts';
import { LIMITS, checkTextBudget, type BudgetResult } from './limits';
import { classifyUrl, DROP_WITH_CONTENT } from './sanitize';
import { orderedTokens } from './markdown';
import { mkIssue, numberIssues, type CoreIssue } from './util';

export interface ConversionChange { kind: 'removed-element' | 'removed-attribute' | 'math-from-annotation' | 'math-no-tex' | 'merged-table-as-html' | 'structured-table-as-html' | 'unsafe-link' | 'remote-image-reference' | 'unwrapped'; detail: string; count: number }

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
    if (c.tagName === 'pf-math') return [{ type: 'element', tagName: 'code',
      properties: { dataPfFormula: c.properties.dataDisplay === '1' ? 'display' : 'inline' },
      children: [{ type: 'text', value: String(c.properties.dataTex) }] }];
    if (!MERGE_TABLE_TAGS.has(c.tagName)) return cleanTable({ ...c, tagName: 'span' }).children;
    return [cleanTable(c)];
  });
  return { type: 'element', tagName: el.tagName, properties: keep, children };
}

export function htmlToMarkdown(html: string, opts: { plain?: string; limits?: Limits } = {}): ClipboardResult {
  const budget = checkTextBudget('pasteHtml', html, opts.limits ?? LIMITS);
  if (!budget.ok) return { ok: false, code: 'BUDGET_EXCEEDED', budget, message: `${budget.message} Gunakan impor berkas atau tempel teks biasa.`, messageEn: `${budget.messageEn} Use file import or paste plain text.` };
  const tree = unified().use(rehypeParse, { fragment: true }).parse(html) as HRoot;
  const changes = new Map<string, ConversionChange>();
  const note = (kind: ConversionChange['kind'], detail: string) => { const k = `${kind}|${detail}`; const c = changes.get(k); if (c) c.count++; else changes.set(k, { kind, detail, count: 1 }); };
  const issues: CoreIssue[] = [];
  let math = 0, tables = 0, merged = 0;

  const walk = (parent: HRoot | Element): void => {
    const out: HContent[] = [];
    for (const n of parent.children as HContent[]) {
      if (n.type === 'comment' || n.type === 'doctype') continue;
      if (n.type !== 'element') { out.push(n); continue; }
      const tag = n.tagName.toLowerCase();
      // Internal conversion nodes can only be created below, never supplied by the clipboard.
      if (tag === 'pf-math' || tag === 'pf-rawtable') { walk(n); out.push(...n.children); continue; }
      const c = cls(n);
      if (c.includes('katex') || c.includes('katex-display') || tag === 'math' || c.includes('MathJax')) {
        const display = c.includes('katex-display') || String(n.properties?.display ?? '') === 'block';
        const tex = findAnnotation(n);
        if (tex !== null) {
          math++; note('math-from-annotation', 'LaTeX diambil dari anotasi; tampilan visual & MathML tidak diduplikasi');
          out.push({ type: 'element', tagName: 'pf-math', properties: { dataTex: tex, dataDisplay: display ? '1' : '0' }, children: [] });
          continue;
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
        const sections = n.children.filter((c): c is Element => c.type === 'element');
        const structured = sections.some(s => s.tagName === 'caption' || s.tagName === 'tfoot' ||
          (s.tagName === 'thead' && s.children.filter(c => c.type === 'element' && c.tagName === 'tr').length > 1)) ||
          sections.filter(s => s.tagName === 'tbody').length > 1;
        if (mergedCells || structured) {
          if (mergedCells) merged++;
          walk(n);
          const cleaned = cleanTable(n);
          const htmlTable = unified().use(rehypeStringify).stringify({ type: 'root', children: [cleaned] })
            // A blank line terminates a raw Markdown HTML block. Character references preserve exact cell/TeX text.
            .replace(/\n/g, '&#10;');
          if (mergedCells) {
            note('merged-table-as-html', 'tabel dengan rowspan/colspan dipertahankan sebagai blok HTML tabel');
            issues.push(mkIssue('TABLE_MERGED_CELLS_HTML', 'warning', 'table', { id: 'Tabel dengan sel gabungan (rowspan/colspan) tidak dapat diwakili tabel Markdown; dipertahankan sebagai blok HTML tabel tersanitasi. Periksa sebelum ekspor.', en: 'A table with merged cells (rowspan/colspan) cannot be represented as a Markdown table; it was kept as a sanitized HTML table block. Review before export.' }, { detail: { kind: 'merged-cells' } }));
          } else {
            note('structured-table-as-html', 'Judul, kelompok baris dan footer tabel disimpan dalam HTML.');
          }
          out.push({ type: 'element', tagName: 'pf-rawtable', properties: { dataHtml: htmlTable }, children: [] });
          continue;
        }
      }
      walk(n);
      out.push(n);
    }
    parent.children = out as typeof parent.children;
  };
  walk(tree);

  const mdast = unified().use(rehypeRemark, {
    handlers: {
      'pf-math': (_state, node: Element) => {
        const tex = String(node.properties?.dataTex ?? '');
        return node.properties?.dataDisplay === '1' ? { type: 'math', value: tex } : { type: 'inlineMath', value: tex };
      },
      'pf-rawtable': (_state, node: Element) => ({ type: 'html', value: String(node.properties?.dataHtml ?? '') }),
    },
  }).runSync(tree);
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
