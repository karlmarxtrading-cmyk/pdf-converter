/**
 * Pemeriksa keutuhan FORMAT berurutan (PF-016, CODE-04, SEM-01/02/04, IMP-10).
 * Membandingkan model sumber dengan keluaran ter-render PER BLOK dan BERURUTAN:
 * token (termasuk tanda +/−/-, operator, eksponen, desimal, persen, mata uang), matriks sel tabel,
 * sumber rumus, teks kode persis, graf catatan kaki, tautan, aset, dan urutan blok.
 *
 * Cakupan jujur: ini memeriksa bahwa ISI SUMBER TERSAJI UTUH dan BERURUTAN di keluaran.
 * Ini TIDAK memeriksa kebenaran fakta atau kebenaran matematis isi.
 */
import { structuredConversation } from './conversation';
import { DROP_WITH_CONTENT } from './sanitize';
import type { RenderedBody } from './contracts';
import { parseMarkdown, blockModels, orderedTokens, type BlockModel } from './markdown';
import { mkIssue, numberIssues, parseInert, type CoreIssue } from './util';

export const INTEGRITY_SCOPE = {
  id: 'Memeriksa keutuhan format: semua blok sumber tersaji berurutan dengan token, tanda, angka, sel tabel, rumus, kode, tautan, aset, dan catatan kaki yang sama. TIDAK memeriksa kebenaran fakta atau matematika.',
  en: 'Checks format integrity: every source block is present in order with identical tokens, signs, numbers, table cells, formulas, code, links, assets and footnotes. Does NOT check factual or mathematical correctness.',
};

export interface TokenDiff { equal: boolean; index: number; expected?: string; actual?: string; expectedContext: string; actualContext: string }

/** Perbandingan token berurutan (bukan multiset): `A + B = C` ≠ `A - B = C`, `-5` ≠ `5`, `A membayar B` ≠ `B membayar A`. */
export function compareTokens(a: string[], b: string[]): TokenDiff {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) {
      const ctx = (t: string[]) => t.slice(Math.max(0, i - 4), i + 5).join(' ');
      const d: TokenDiff = { equal: false, index: i, expectedContext: ctx(a), actualContext: ctx(b) };
      if (a[i] !== undefined) d.expected = a[i]!;
      if (b[i] !== undefined) d.actual = b[i]!;
      return d;
    }
  }
  return { equal: true, index: -1, expectedContext: '', actualContext: '' };
}

export function compareText(expected: string, actual: string): TokenDiff {
  return compareTokens(orderedTokens(expected), orderedTokens(actual));
}

/* ---------------- model dari keluaran ---------------- */
export interface RenderedBlock {
  id: string; tag: string; text: string; tokens: string[]; code?: string; math: string[]; cells?: string[][];
  rawTableSignature?: string; links: string[]; images: string[]; fnRefs: string[]; fnLabel?: string; start1?: number | null;
}

/** Canonical cell structure for a raw HTML table, including section, text, caption and merged cells. */
function rawTableSignature(table: HTMLTableElement): string {
  const text = (el: Element) => {
    const clone = el.cloneNode(true) as Element;
    for (const formula of clone.querySelectorAll('code[data-pf-formula], .pf-math[data-tex]')) {
      const tex = formula.getAttribute('data-tex') ?? formula.textContent ?? '';
      const mode = formula.getAttribute('data-pf-formula') ?? (formula.classList.contains('pf-math-display') ? 'display' : 'inline');
      formula.replaceWith(JSON.stringify(['TeX', mode, tex]));
    }
    clone.querySelectorAll([...DROP_WITH_CONTENT, '.pf-img-placeholder', 'img'].join(',')).forEach(n => n.remove());
    return (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
  };
  return JSON.stringify({
    caption: table.caption ? text(table.caption) : null,
    sections: [table.tHead, ...table.tBodies, table.tFoot].filter(s => s !== null).map(s => [
      s.tagName, [...s.rows].map(row => [...row.cells].map(cell => [cell.tagName, cell.scope, cell.colSpan, cell.rowSpan, text(cell)]))
    ]),
  });
}

function flattenDom(node: Node, acc: { parts: string[]; links: string[]; images: string[]; fnRefs: string[]; math: string[] }): void {
  if (node.nodeType === 3) { acc.parts.push(node.nodeValue ?? ''); return; }
  if (node.nodeType !== 1) return;
  const el = node as Element;
  const cls = el.classList;
  if (cls.contains('pf-ui-label') || el.tagName === 'INPUT') return;
  if (el.hasAttribute('data-footnote-backref')) return;
  if (cls.contains('pf-math') && el.hasAttribute('data-tex')) { const t = el.getAttribute('data-tex')!; acc.parts.push(` ⟦math:${t}⟧ `); acc.math.push(t); return; }
  if (el.tagName === 'IMG' || cls.contains('pf-img-placeholder')) {
    const u = el.getAttribute('data-src-path') ?? el.getAttribute('data-src') ?? el.getAttribute('data-blocked-src') ?? el.getAttribute('src') ?? '';
    acc.parts.push(` ⟦img:${u}⟧ `); acc.images.push(u); return;
  }
  if (el.hasAttribute('data-footnote-ref')) { const l = el.getAttribute('data-fn-label') ?? ''; acc.parts.push(` ⟦fn:${l}⟧ `); acc.fnRefs.push(l); return; }
  if (el.tagName === 'BR') { acc.parts.push(' '); return; }
  if (el.tagName === 'A') { const h = el.getAttribute('data-source-href') ?? el.getAttribute('href') ?? el.getAttribute('data-blocked-href'); if (h !== null) acc.links.push(h); }
  if (el.tagName === 'PRE' && el.classList.contains('pf-code')) { acc.parts.push(` ${el.textContent ?? ''} `); return; }
  const block = /^(P|LI|H[1-6]|TD|TH|TR|BLOCKQUOTE|DIV|PRE)$/.test(el.tagName);
  for (const c of Array.from(el.childNodes)) flattenDom(c, acc);
  if (block) acc.parts.push(' ');
}

export function extractRenderedBlocks(html: string | Document | Element): RenderedBlock[] {
  const root: ParentNode = typeof html === 'string' ? parseInert(html).body : html;
  const out: RenderedBlock[] = [];
  for (const el of Array.from(root.querySelectorAll('[data-block-id]'))) {
    // blok bersarang (mis. data-block-id di dalam data-block-id) tidak diharapkan; ambil yang terluar
    if (el.parentElement?.closest('[data-block-id]')) continue;
    const acc = { parts: [] as string[], links: [] as string[], images: [] as string[], fnRefs: [] as string[], math: [] as string[] };
    const rb: RenderedBlock = { id: el.getAttribute('data-block-id')!, tag: el.tagName.toLowerCase(), text: '', tokens: [], math: [], links: [], images: [], fnRefs: [] };
    if (el.tagName === 'PRE' && el.classList.contains('pf-mermaid')) { rb.code = el.getAttribute('data-src') ?? ''; rb.text = rb.code; out.push(rb); continue; }
    if (el.tagName === 'PRE') { rb.code = el.querySelector('code')?.textContent ?? el.textContent ?? ''; rb.text = rb.code; out.push(rb); continue; }
    if (el.classList.contains('pf-math') && el.hasAttribute('data-tex')) { rb.math = [el.getAttribute('data-tex')!]; rb.text = rb.math[0]!; out.push(rb); continue; }
    if (el.tagName === 'TABLE') {
      if (el.hasAttribute('data-pf-raw-table')) rb.rawTableSignature = rawTableSignature(el as HTMLTableElement);
      rb.cells = Array.from(el.querySelectorAll('tr')).map((tr) => Array.from(tr.querySelectorAll('th,td')).filter((c) => !c.classList.contains('pf-cell-missing')).map((c) => {
        const a = { parts: [] as string[], links: rb.links, images: rb.images, fnRefs: rb.fnRefs, math: rb.math }; flattenDom(c, a); return a.parts.join('').replace(/\s+/g, ' ').trim();
      }));
    }
    if (el.tagName === 'OL') rb.start1 = el.hasAttribute('start') ? Number(el.getAttribute('start')) : 1;
    if (el.tagName === 'UL') rb.start1 = null;
    if (el.hasAttribute('data-fn-label') && el.tagName === 'LI') rb.fnLabel = el.getAttribute('data-fn-label')!;
    flattenDom(el, acc);
    rb.text = acc.parts.join('').replace(/\s+/g, ' ').trim();
    rb.tokens = orderedTokens(rb.text);
    if (!rb.cells) { rb.links = acc.links; rb.images = acc.images; rb.fnRefs = acc.fnRefs; rb.math = acc.math; }
    out.push(rb);
  }
  return out;
}

export interface IntegrityReport {
  scope: typeof INTEGRITY_SCOPE;
  ok: boolean; checkedBlocks: number; skippedBlocks: { id: string; kind: string; reason: string }[];
  coverage: { blocks: number; tokens: number; tables: number; cells: number; math: number; code: number; links: number; images: number; footnoteRefs: number; footnoteDefs: number };
  issues: CoreIssue[];
}

const SKIP: Record<string, string> = { html: 'HTML mentah dinilai oleh laporan sanitasi', definition: 'definisi tautan tidak menghasilkan blok', thematicBreak: 'garis pemisah tanpa isi' };

/**
 * Bandingkan model sumber (dari Markdown) dengan HTML keluaran (string, Document, atau elemen,
 * mis. DOM hasil paginasi) yang memuat atribut data-block-id. idPrefix harus sama dengan saat render.
 */
export function checkIntegrity(source: string, rendered: RenderedBody | string | Element | Document, opts: { idPrefix?: string } = {}): IntegrityReport {
  const expected = blockModels(parseMarkdown(source), opts.idPrefix ?? '');
  const html = typeof rendered === 'object' && 'html' in rendered && typeof (rendered as RenderedBody).html === 'string' ? (rendered as RenderedBody).html : (rendered as string | Element | Document);
  const actual = extractRenderedBlocks(html);
  return compareBlockModels(expected, actual);
}

export function compareBlockModels(expected: BlockModel[], actual: RenderedBlock[]): IntegrityReport {
  const issues: CoreIssue[] = [];
  const skipped: IntegrityReport['skippedBlocks'] = [];
  const cov = { blocks: 0, tokens: 0, tables: 0, cells: 0, math: 0, code: 0, links: 0, images: 0, footnoteRefs: 0, footnoteDefs: 0 };
  const actById = new Map(actual.map((a) => [a.id, a]));
  const exp = expected.filter((m) => { if (SKIP[m.kind] && !m.rawTableHtml) { skipped.push({ id: m.id, kind: m.kind, reason: SKIP[m.kind]! }); return false; } return true; });
  const body = exp.filter((m) => m.kind !== 'footnoteDefinition');
  const defs = exp.filter((m) => m.kind === 'footnoteDefinition');
  // urutan blok
  const actOrder = actual.map((a) => a.id).filter((id) => body.some((m) => m.id === id));
  const expOrder = body.map((m) => m.id).filter((id) => actById.has(id));
  const ord = compareTokens(expOrder, actOrder);
  if (!ord.equal) issues.push(mkIssue('INTEGRITY_BLOCK_ORDER', 'error', 'integrity', { id: `Urutan blok keluaran berbeda dari sumber mulai blok ke-${ord.index + 1}.`, en: `Output block order differs from the source starting at block ${ord.index + 1}.` }, { blocking: true, ...(ord.expected ? { blockId: ord.expected } : {}) }));
  for (const a of actual) if (!expected.some((m) => m.id === a.id)) issues.push(mkIssue('INTEGRITY_BLOCK_UNEXPECTED', 'warning', 'integrity', { id: `Keluaran memuat blok ${a.id} yang tidak ada di sumber.`, en: `Output contains block ${a.id} that is not in the source.` }, { blockId: a.id }));
  for (const m of exp) {
    const a = actById.get(m.id);
    const where = { line: m.line, blockId: m.id };
    if (!a) {
      issues.push(mkIssue('INTEGRITY_BLOCK_MISSING', 'error', 'integrity', { id: `Blok sumber di baris ${m.line} (${m.kind}) tidak ditemukan di keluaran.`, en: `Source block at line ${m.line} (${m.kind}) was not found in the output.` }, { ...where, blocking: true }));
      continue;
    }
    cov.blocks++;
    if (m.rawTableHtml) {
      const template = document.createElement('template');
      template.innerHTML = m.rawTableHtml;
      const table = template.content.querySelector('table');
      cov.tables++;
      if (table) cov.cells += [...table.rows].reduce((sum, row) => sum + row.cells.length, 0);
      if (!table || a.rawTableSignature !== rawTableSignature(table)) {
        issues.push(mkIssue('INTEGRITY_RAW_TABLE_CHANGED', 'error', 'integrity', {
          id: `Struktur atau isi tabel HTML di baris ${m.line} berubah; periksa judul, sel gabungan dan total.`,
          en: `HTML table structure or content changed at line ${m.line}; review the caption, merged cells and totals.`,
        }, { ...where, blocking: true }));
      }
      continue;
    }
    if (m.kind === 'code' || m.kind === 'mermaid') {
      cov.code++;
      if (a.code !== m.code) issues.push(mkIssue('INTEGRITY_CODE_CHANGED', 'error', 'integrity', { id: `Teks kode di baris ${m.line} berbeda dari sumber (whitespace/karakter).`, en: `Code text at line ${m.line} differs from the source (whitespace/characters).` }, { ...where, blocking: true }));
      continue;
    }
    if (m.kind === 'math') {
      cov.math++;
      if ((a.math[0] ?? a.text) !== m.text) issues.push(mkIssue('INTEGRITY_MATH_CHANGED', 'error', 'integrity', { id: `Sumber rumus di baris ${m.line} berbeda di keluaran.`, en: `Formula source at line ${m.line} differs in the output.` }, { ...where, blocking: true }));
      continue;
    }
    if (m.kind === 'table') {
      cov.tables++;
      const e = m.cells ?? []; const g = a.cells ?? [];
      if (e.length !== g.length) issues.push(mkIssue('INTEGRITY_TABLE_ROWS', 'error', 'integrity', { id: `Tabel di baris ${m.line}: ${e.length} baris di sumber, ${g.length} di keluaran.`, en: `Table at line ${m.line}: ${e.length} rows in source, ${g.length} in output.` }, { ...where, blocking: true }));
      for (let r = 0; r < Math.min(e.length, g.length); r++) {
        if (e[r]!.length !== g[r]!.length) issues.push(mkIssue('INTEGRITY_TABLE_CELLS', 'error', 'integrity', { id: `Tabel di baris ${m.line}, baris ke-${r + 1}: ${e[r]!.length} sel di sumber, ${g[r]!.length} di keluaran.`, en: `Table at line ${m.line}, row ${r + 1}: ${e[r]!.length} cells in source, ${g[r]!.length} in output.` }, { ...where, blocking: true }));
        for (let c = 0; c < Math.min(e[r]!.length, g[r]!.length); c++) {
          cov.cells++;
          const d = compareText(e[r]![c]!, g[r]![c]!);
          if (!d.equal) issues.push(mkIssue('INTEGRITY_TABLE_CELL', 'error', 'integrity', { id: `Sel tabel (baris ${r + 1}, kolom ${c + 1}) di baris ${m.line} berbeda: "${e[r]![c]}" → "${g[r]![c]}".`, en: `Table cell (row ${r + 1}, col ${c + 1}) at line ${m.line} differs: "${e[r]![c]}" → "${g[r]![c]}".` }, { ...where, blocking: true, detail: { row: r + 1, col: c + 1 } }));
        }
      }
    } else {
      cov.tokens += m.tokens.length;
      const d = compareTokens(m.tokens, a.tokens);
      if (!d.equal) issues.push(mkIssue('INTEGRITY_TOKEN_CHANGED', 'error', 'integrity', {
        id: `Isi blok di baris ${m.line} berbeda dari sumber pada token ke-${d.index + 1}: "${d.expected ?? '∅'}" → "${d.actual ?? '∅'}" (konteks: "${d.expectedContext}").`,
        en: `Block content at line ${m.line} differs from the source at token ${d.index + 1}: "${d.expected ?? '∅'}" → "${d.actual ?? '∅'}" (context: "${d.expectedContext}").`,
      }, { ...where, blocking: true, detail: { index: d.index, expected: d.expected ?? '', actual: d.actual ?? '' } }));
      if (m.kind === 'list' && m.ordered && a.start1 !== m.start1) issues.push(mkIssue('INTEGRITY_LIST_START', 'warning', 'integrity', { id: `Nomor awal daftar di baris ${m.line} berbeda (${m.start1} → ${a.start1}).`, en: `List start number at line ${m.line} differs (${m.start1} → ${a.start1}).` }, where));
    }
    cov.math += m.math?.length ?? 0;
    if (m.kind !== 'table') {
      const dm = compareTokens(m.math ?? [], a.math);
      if (!dm.equal) issues.push(mkIssue('INTEGRITY_MATH_CHANGED', 'error', 'integrity', { id: `Sumber rumus inline di baris ${m.line} berbeda/hilang di keluaran.`, en: `Inline formula source at line ${m.line} differs or is missing in the output.` }, { ...where, blocking: true }));
    }
    cov.links += m.links.length; cov.images += m.images.length; cov.footnoteRefs += m.fnRefs.length;
    const dl = compareTokens(m.links, a.links);
    if (!dl.equal) issues.push(mkIssue('INTEGRITY_LINK_CHANGED', 'error', 'integrity', { id: `Tautan di baris ${m.line} berbeda: "${dl.expected ?? '∅'}" → "${dl.actual ?? '∅'}".`, en: `Link at line ${m.line} differs: "${dl.expected ?? '∅'}" → "${dl.actual ?? '∅'}".` }, { ...where, blocking: true }));
    const di = compareTokens(m.images, a.images);
    if (!di.equal) issues.push(mkIssue('INTEGRITY_ASSET_CHANGED', 'error', 'integrity', { id: `Rujukan gambar di baris ${m.line} berbeda: "${di.expected ?? '∅'}" → "${di.actual ?? '∅'}".`, en: `Image reference at line ${m.line} differs: "${di.expected ?? '∅'}" → "${di.actual ?? '∅'}".` }, { ...where, blocking: true }));
    const df = compareTokens(m.fnRefs, a.fnRefs);
    if (!df.equal) issues.push(mkIssue('INTEGRITY_FOOTNOTE_REF', 'error', 'integrity', { id: `Rujukan catatan kaki di baris ${m.line} berbeda.`, en: `Footnote references at line ${m.line} differ.` }, { ...where, blocking: true }));
  }
  // graf catatan kaki: definisi yang dirujuk harus ada (definisi tak dirujuk sudah dilaporkan renderBody)
  const referenced = new Set(body.flatMap((m) => m.fnRefs.map((r) => r.toLowerCase())));
  for (const d of defs) {
    if (!referenced.has((d.fnLabel ?? '').toLowerCase())) { skipped.push({ id: d.id, kind: d.kind, reason: 'definisi catatan kaki tidak dirujuk (FOOTNOTE_UNUSED)' }); continue; }
    cov.footnoteDefs++;
    const a = actById.get(d.id);
    if (!a) { issues.push(mkIssue('INTEGRITY_FOOTNOTE_MISSING', 'error', 'integrity', { id: `Definisi catatan kaki [^${d.fnLabel}] tidak ditemukan di keluaran.`, en: `Footnote definition [^${d.fnLabel}] was not found in the output.` }, { line: d.line, blockId: d.id, blocking: true })); continue; }
    const dd = compareTokens(d.tokens, a.tokens);
    if (!dd.equal) issues.push(mkIssue('INTEGRITY_TOKEN_CHANGED', 'error', 'integrity', { id: `Isi catatan kaki [^${d.fnLabel}] berbeda pada token ke-${dd.index + 1}.`, en: `Footnote [^${d.fnLabel}] content differs at token ${dd.index + 1}.` }, { line: d.line, blockId: d.id, blocking: true }));
  }
  return { scope: INTEGRITY_SCOPE, ok: !issues.some((i) => i.severity === 'error'), checkedBlocks: cov.blocks, skippedBlocks: skipped, coverage: cov, issues: numberIssues(issues, 'integrity') };
}

/** Model sumber yang diharapkan untuk opsi render yang sama (mode percakapan: per pesan terpilih, prefix per pesan). */
export function expectedBlocksFor(source: string, opts: { idPrefix?: string; conversation?: import('./contracts').Conversation }): BlockModel[] {
  const p = opts.idPrefix ?? '';
  const conv = structuredConversation(source, opts.conversation);
  if (!conv || conv.outputMode === 'answer') return blockModels(parseMarkdown(source), p);
  const byId = new Map(conv.messages.map((m) => [m.id, m]));
  const msgs = conv.selectedOrder.length ? conv.selectedOrder.map((id) => byId.get(id)).filter((m): m is NonNullable<typeof m> => !!m && m.selected) : conv.messages.filter((m) => m.selected);
  const out: BlockModel[] = conv.outputMode === 'source-appendix' ? blockModels(parseMarkdown(source), p) : [];
  msgs.forEach((m, i) => out.push(...blockModels(parseMarkdown(m.markdown), `${p}m${i + 1}-`)));
  return out;
}

/* ---------------- oracle independen karakter Private Use (EN-003) ---------------- */
const PUA_RE = /[\uE000-\uF8FF]/g;
/** Hitung titik kode Private Use per karakter. */
function countPua(s: string, into: Map<string, number> = new Map()): Map<string, number> {
  for (const m of s.matchAll(PUA_RE)) into.set(m[0], (into.get(m[0]) ?? 0) + 1);
  return into;
}
/**
 * Oracle konservasi yang TIDAK memakai parser/pemulih sentinel: jumlah setiap karakter Private Use pada sumber
 * mentah (tanpa komentar HTML) harus sama dengan jumlahnya pada keluaran (teks, kode, `data-tex`, `data-src`, URL, alt, title).
 * KaTeX tersaji (`.katex`) dilewati karena sumber rumusnya sudah ada di `data-tex`.
 */
/** Hitungan Private Use sumber (tanpa DOM; dapat dihitung di Worker). Kunci = karakter. */
export function privateUseCounts(sources: string[]): [string, number][] {
  const m = new Map<string, number>();
  for (const src of sources) countPua(src.replace(/<!--[\s\S]*?-->/g, ''), m);
  return [...m];
}

/** Sumber yang dibandingkan untuk opsi render (mode percakapan: pesan terpilih). */
export function integritySources(source: string, conversation?: import('./contracts').Conversation): string[] {
  const conv = structuredConversation(source, conversation);
  return !conv || conv.outputMode === 'answer' ? [source]
    : [...(conv.outputMode === 'source-appendix' ? [source] : []), ...conv.messages.filter((m) => m.selected).map((m) => m.markdown)];
}

export function privateUseConservation(sources: string[] | [string, number][], rendered: string | Element | Document, precounted = false): { ok: boolean; expected: Record<string, number>; actual: Record<string, number> } {
  const expected = precounted ? new Map(sources as [string, number][]) : new Map(privateUseCounts(sources as string[]));
  const actual = new Map<string, number>();
  if (expected.size) {
    const root: ParentNode = typeof rendered === 'string' ? parseInert(rendered).body : rendered;
    const visit = (n: Node) => {
      if (n.nodeType === 3) { countPua(n.nodeValue ?? '', actual); return; }
      if (n.nodeType !== 1) return;
      const el = n as Element;
      if (el.classList.contains('katex') || el.classList.contains('katex-display') || el.classList.contains('pf-ui-label')) {
        // sumber rumus ada di data-tex pada pembungkus .pf-math
        return;
      }
      for (const a of ['data-tex', 'data-src', 'data-source-href', 'href', 'src', 'data-src-path', 'data-blocked-href', 'data-blocked-src', 'alt', 'title']) {
        const v = el.getAttribute(a);
        if (v === null) continue;
        if (a === 'href' && el.hasAttribute('data-source-href')) continue;
        if (a === 'src' && (el.hasAttribute('data-src-path') || el.hasAttribute('data-blocked-src'))) continue;
        countPua(v, actual);
      }
      if (el.classList.contains('pf-math') && el.hasAttribute('data-tex')) return;
      if (el.tagName === 'PRE' && el.classList.contains('pf-mermaid') && el.hasAttribute('data-src')) return;
      for (const c of Array.from(el.childNodes)) visit(c);
    };
    for (const c of Array.from((root as Element).childNodes ?? [])) visit(c);
  }
  const keys = new Set([...expected.keys(), ...actual.keys()]);
  const ok = [...keys].every((k) => (expected.get(k) ?? 0) === (actual.get(k) ?? 0));
  const hex = (m: Map<string, number>) => Object.fromEntries([...m].map(([k, v]) => ['U+' + k.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'), v]));
  return { ok, expected: hex(expected), actual: hex(actual) };
}

/** Pemeriksaan keutuhan dengan opsi render (mendukung mode percakapan). */
/** Model sumber yang dihitung terpisah dari render (di Worker bila tersedia). */
export interface IntegrityExpectation { blocks: BlockModel[]; pua: [string, number][] }

export function integrityExpectation(source: string, opts: { idPrefix?: string; conversation?: import('./contracts').Conversation } = {}): IntegrityExpectation {
  return { blocks: expectedBlocksFor(source, opts), pua: privateUseCounts(integritySources(source, opts.conversation)) };
}

export function checkRenderIntegrity(source: string, rendered: RenderedBody | string | Element | Document, opts: { idPrefix?: string; conversation?: import('./contracts').Conversation; expected?: IntegrityExpectation } = {}): IntegrityReport {
  const html = typeof rendered === 'object' && 'html' in rendered && typeof (rendered as RenderedBody).html === 'string' ? (rendered as RenderedBody).html : (rendered as string | Element | Document);
  const exp = opts.expected ?? integrityExpectation(source, opts);
  const report = compareBlockModels(exp.blocks, extractRenderedBlocks(html));
  const pua = privateUseConservation(exp.pua, html, true);
  if (!pua.ok) {
    report.issues = numberIssues([...report.issues, mkIssue('INTEGRITY_PRIVATE_USE_CHANGED', 'error', 'integrity', {
      id: `Karakter Private Use berubah di keluaran (sumber ${JSON.stringify(pua.expected)}, keluaran ${JSON.stringify(pua.actual)}).`,
      en: `Private Use characters changed in the output (source ${JSON.stringify(pua.expected)}, output ${JSON.stringify(pua.actual)}).`,
    }, { blocking: true, detail: { expected: JSON.stringify(pua.expected), actual: JSON.stringify(pua.actual) } })], 'integrity');
    report.ok = false;
  }
  return report;
}
