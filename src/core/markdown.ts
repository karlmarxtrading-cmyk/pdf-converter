/**
 * Parser Markdown bersama (remark-parse + GFM + math) di atas salinan parse yang dilindungi
 * mata uang. Posisi mdast = indeks UTF-16 pada sumber ASLI (panjang salinan sama).
 * Juga menyediakan model blok sumber untuk pemeriksa integritas (urutan token, sel, rumus, kode, tautan).
 */
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import type { Root, RootContent, Nodes as MdNodes } from 'mdast';
import type { SourceFormula } from './formula-integrity';
import { scanMath, restorerFor, type MathScan, type MathAdaptation } from './math';
import { fnv1a, imageRefKey, orderedTokens } from './util';
import { sourceRawHtmlSignature, type RawHtmlProjection } from './raw-html-integrity';
import { assertTreeBudget } from './limits';

declare module 'mdast' {
  interface Data {
    pfSourceTex?: string; pfMathAdaptations?: MathAdaptation[];
    pfMathSourceStart?: number; pfMathSourceEnd?: number; pfMathSyntax?: 'math-fence' | 'github-inline';
  }
}

export interface Frontmatter { raw: string; startLine: number; endLine: number; data: Record<string, string>; valid: boolean }
export interface ParsedMarkdown { tree: Root; scan: MathScan; source: string; frontmatter?: Frontmatter }

/** Frontmatter YAML sederhana di awal naskah (`---` … `---`/`...`). Hanya pasangan `kunci: nilai` dibaca; sisanya tetap di `raw`. */
export function detectFrontmatter(src: string): Frontmatter | undefined {
  const m = /^\uFEFF?---[ \t]*\r?\n/.exec(src);
  if (!m) return undefined;
  const lines = src.split('\n');
  for (let i = 1; i < Math.min(lines.length, 200); i++) {
    const t = lines[i]!.replace(/\r$/, '');
    if (t === '---' || t === '...') {
      const body = lines.slice(1, i);
      const data: Record<string, string> = {};
      let valid = true;
      for (const l of body) {
        const t2 = l.replace(/\r$/, '');
        if (!t2.trim() || t2.trimStart().startsWith('#')) continue;
        const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(t2);
        if (kv) data[kv[1]!] = kv[2]!.replace(/^["']|["']$/g, '');
        else if (!/^\s+/.test(t2)) valid = false;
      }
      return { raw: lines.slice(0, i + 1).join('\n'), startLine: 1, endLine: i + 1, data, valid };
    }
  }
  return undefined;
}

const processor = unified().use(remarkParse).use(remarkGfm).use(remarkMath, { singleDollarTextMath: true });

export function parseMarkdown(source: string): ParsedMarkdown {
  const fm = detectFrontmatter(source);
  // frontmatter diganti spasi pada salinan parse (panjang & baris tetap) — sumber asli tidak diubah
  const masked = fm ? fm.raw.replace(/[^\n]/g, ' ') + source.slice(fm.raw.length) : source;
  const scan = scanMath(masked);
  const tree = processor.runSync(processor.parse(scan.parseCopy)) as Root;
  assertTreeBudget(tree);
  restoreLiteralNodes(tree, masked, scan);
  promoteExplicitMathFences(tree);
  applyCopiedMath(tree, scan);
  promoteDisplayMath(tree, scan);
  return fm ? { tree, scan, source, frontmatter: fm } : { tree, scan, source };
}

/** RC6-M01: the rendering tree uses an adapted payload while retaining original TeX and source offsets.
 * Only actual math nodes are adapted: CommonMark code, link destinations and raw HTML are not rewritten.
 */
function applyCopiedMath(tree: Root, scan: MathScan): void {
  const at = new Map<number, MathScan['spans'][number]>();
  for (const span of scan.spans) if (span.adaptations?.length || span.syntax || (span.delim === '\\(' && /^\s|\s$/u.test(span.tex))) {
    at.set(span.start + (span.delim === '\\(' ? (span.openerLength ?? 2) - 1 : 0), span);
  }
  if (!at.size) return;
  const visit = (n: MdNodes): void => {
    if (n.type === 'math' || n.type === 'inlineMath') {
      const span = at.get(n.position?.start.offset ?? -1);
      if (span) {
        n.value = span.renderTex ?? span.tex;
        const data = { ...n.data, pfSourceTex: span.tex, pfMathAdaptations: span.adaptations,
          pfMathSourceStart: span.start, pfMathSourceEnd: span.end, ...(span.syntax ? { pfMathSyntax: span.syntax } : {}) };
        n.data = data;
      }
    }
    if ('children' in n) n.children.forEach(visit);
  };
  visit(tree);
}

/** GitHub-style explicitly labelled `math` fences are equations. `tex`/`latex` examples remain code. */
function promoteExplicitMathFences(tree: Root): void {
  const visit = (parent: { children: MdNodes[] }): void => {
    parent.children = parent.children.map(n => {
      if (n.type === 'code' && n.lang?.toLowerCase() === 'math') {
        return { type: 'math', value: n.value, position: n.position,
          data: { ...n.data, pfSourceTex: n.value, pfMathSyntax: 'math-fence' as const,
            pfMathSourceStart: n.position?.start.offset, pfMathSourceEnd: n.position?.end.offset } };
      }
      if ('children' in n) visit(n as { children: MdNodes[] });
      return n;
    });
  };
  visit(tree as { children: MdNodes[] });
}

/** RC4-M05: CommonMark decides which indented/list blocks are code. Restore their values from an unmasked
 * parse only when math masking touched one; the scanner must not silently rewrite literal code or HTML.
 * Ordinary prose, math and fenced-code documents stay on the single-parse path.
 */
function restoreLiteralNodes(tree: Root, source: string, scan: MathScan): void {
  const restore = restorerFor(scan);
  type ResourceNode = Extract<MdNodes, { type: 'image' | 'link' | 'definition' }>;
  type LiteralNode = Extract<MdNodes, { type: 'code' | 'html' }>;
  const changed: (ResourceNode | LiteralNode)[] = [];
  const literalRanges: [number, number][] = [];
  const collect = (n: MdNodes): void => {
    if (n.type === 'math' || n.type === 'inlineMath') n.value = restore(n.value);
    if (n.type === 'code' || n.type === 'html' || n.type === 'link' || n.type === 'image' || n.type === 'definition') {
      const start = n.position?.start.offset ?? 0, end = n.position?.end.offset ?? 0;
      if (n.type === 'code' || n.type === 'html') {
        if (scan.issues.length) literalRanges.push([start, end]);
        if (source.slice(start, end) !== scan.parseCopy.slice(start, end)) changed.push(n);
      } else if (/[\\$\uE000-\uF8FF]/.test(n.url + (n.title ?? '') + (n.type === 'image' ? n.alt ?? '' : ''))) {
        if (source.slice(start, end) !== scan.parseCopy.slice(start, end)) changed.push(n);
      }
    }
    if ('children' in n) n.children.forEach(collect);
  };
  collect(tree);
  if (literalRanges.length) {
    let range = 0;
    scan.issues = scan.issues.filter(issue => {
      if (issue.offset === undefined) return true;
      while (range < literalRanges.length && literalRanges[range]![1] <= issue.offset) range++;
      return range === literalRanges.length || issue.offset < literalRanges[range]![0];
    });
  }
  if (!changed.length) return;
  const original = processor.parse(source) as Root;
  assertTreeBudget(original);
  const byPosition = new Map<string, ResourceNode | LiteralNode>();
  const key = (n: MdNodes) => `${n.type}:${n.position?.start.offset}:${n.position?.end.offset}`;
  const index = (n: MdNodes): void => {
    if (n.type === 'code' || n.type === 'html' || n.type === 'link' || n.type === 'image' || n.type === 'definition') byPosition.set(key(n), n);
    if ('children' in n) n.children.forEach(index);
  };
  index(original);
  for (const n of changed) {
    const orig = byPosition.get(key(n));
    if (!orig) continue;
    if ('value' in n && 'value' in orig) n.value = orig.value;
    if ('url' in n && 'url' in orig) {
      n.url = orig.url;
      n.title = orig.title;
      if (n.type === 'image' && orig.type === 'image') n.alt = orig.alt;
    }
  }
}

/**
 * \[…\] dan $$…$$ dalam SATU baris dibaca remark-math sebagai inlineMath (matematika teks). Mode display ditentukan
 * pemindai (scanMath) dari delimiter sumber: rumus display yang sendirian di paragrafnya menjadi blok `math`; yang berada
 * di tengah kalimat ditandai `data.pfDisplay` (dirender display di dalam paragraf). Dipakai bersama oleh render, model
 * keutuhan dan Worker sehingga semua jalur sepakat.
 */
function promoteDisplayMath(tree: Root, scan: { spans: { start: number; display: boolean }[] }): void {
  const displayAt = new Set(scan.spans.filter((s) => s.display).map((s) => s.start));
  if (!displayAt.size) return;
  const isDisplay = (n: { type: string; position?: { start: { offset?: number } } }) => n.type === 'inlineMath' && displayAt.has(n.position?.start.offset ?? -1);
  const visit = (parent: { children: unknown[] }): void => {
    parent.children = parent.children.map((c) => {
      const n = c as { type: string; children?: unknown[]; value?: string; position?: { start: { offset?: number } }; data?: Record<string, unknown> };
      if (n.type === 'paragraph' && n.children) {
        const meaningful = n.children.filter((k) => { const x = k as { type: string; value?: string }; return !(x.type === 'break' || (x.type === 'text' && !x.value?.trim())); });
        if (meaningful.length === 1 && isDisplay(meaningful[0] as never)) {
          const m = meaningful[0] as { value: string; position?: unknown; data?: Record<string, unknown> };
          return { type: 'math', value: m.value, position: n.position ?? m.position, data: { ...n.data, ...m.data } };
        }
        for (const k of n.children) if (isDisplay(k as never)) { const x = k as { data?: Record<string, unknown> }; x.data = { ...x.data, pfDisplay: true }; }
        visit(n as { children: unknown[] });
        return n;
      }
      // RC4-M04: table cells, links and emphasis also contain phrasing math nodes.
      if (isDisplay(n)) n.data = { ...n.data, pfDisplay: true };
      if (n.children) visit(n as { children: unknown[] });
      return n;
    });
  };
  visit(tree as unknown as { children: unknown[] });
}

/* ---------------- token berurutan ---------------- */
export { orderedTokens } from './util';

/* ---------------- model blok ---------------- */
export type BlockKind = 'heading' | 'paragraph' | 'list' | 'blockquote' | 'code' | 'mermaid' | 'math' | 'table' | 'thematicBreak' | 'html' | 'footnoteDefinition' | 'definition' | 'other';

export interface BlockModel {
  id: string; kind: BlockKind; line: number; endLine: number; start: number; end: number;
  /** teks rata dengan penanda ⟦math:…⟧ ⟦img:…⟧ ⟦fn:…⟧ */
  text: string; tokens: string[];
  depth?: number; ordered?: boolean; start1?: number | null;
  code?: string; lang?: string; math?: string[]; formulas?: SourceFormula[]; rawTableHtml?: string; rawHtml?: RawHtmlProjection;
  cells?: string[][]; referenceLabels?: string[]; links: string[]; images: string[]; fnRefs: string[]; fnLabel?: string;
}

export function kindOf(n: RootContent): BlockKind {
  switch (n.type) {
    case 'heading': return 'heading';
    case 'paragraph': return 'paragraph';
    case 'list': return 'list';
    case 'blockquote': return 'blockquote';
    case 'code': return (n.lang ?? '').toLowerCase() === 'mermaid' ? 'mermaid' : 'code';
    case 'math': return 'math';
    case 'table': return 'table';
    case 'thematicBreak': return 'thematicBreak';
    case 'html': return 'html';
    case 'footnoteDefinition': return 'footnoteDefinition';
    case 'definition': return 'definition';
    default: return 'other';
  }
}

interface Acc { parts: string[]; formulas?: SourceFormula[]; referenceLabels?: string[]; links: string[]; images: string[]; fnRefs: string[]; math: string[]; restore: (s: string) => string }

const identity = (s: string) => s;

function flatten(n: MdNodes, acc: Acc): void {
  const restore = acc.restore;
  switch (n.type) {
    case 'text': acc.parts.push(restore(n.value)); return;
    case 'inlineCode': acc.parts.push(n.value); return;
    case 'inlineMath':
    case 'math': {
      const tex = restore(n.value);
      (acc.formulas ??= []).push({ tex, raw: n.data?.pfSourceTex ?? tex, display: n.type === 'math' || !!(n.data as {pfDisplay?: boolean})?.pfDisplay });
      acc.parts.push(` ⟦math:${tex}⟧ `); acc.math.push(tex); return;
    }
    case 'image': {
      const k = imageRefKey(restore(n.url));
      acc.parts.push(` ⟦img:${k}⟧ `); acc.images.push(k);
      (acc.referenceLabels ??= []).push(JSON.stringify(['image', restore(n.alt ?? ''), n.title ? restore(n.title) : null]));
      return;
    }
    case 'imageReference': acc.parts.push(` ⟦imgref:${n.identifier}⟧ `); return;
    case 'footnoteReference': acc.parts.push(` ⟦fn:${n.label ?? n.identifier}⟧ `); acc.fnRefs.push(n.label ?? n.identifier); return;
    case 'break': acc.parts.push(' '); return;
    case 'html': return; // HTML mentah dinilai oleh laporan sanitasi, bukan pemeriksa token
    case 'code': acc.parts.push(` ${n.value} `); return;
    case 'link':
      acc.links.push(restore(n.url));
      (acc.referenceLabels ??= []).push(JSON.stringify(['link', n.title ? restore(n.title) : null]));
      break;
    default: break;
  }
  if ('children' in n) {
    for (const c of n.children as MdNodes[]) {
      flatten(c, acc);
      if (c.type === 'paragraph' || c.type === 'listItem' || c.type === 'heading' || c.type === 'tableCell') acc.parts.push(' ');
    }
  }
}

/** `restore` memulihkan sentinel milik pemindaian yang menghasilkan pohon ini (lihat math.ts). */
export function flattenNode(n: MdNodes, restore: (s: string) => string = identity): Omit<Acc, 'restore'> & { text: string } {
  const acc: Acc = { parts: [], links: [], images: [], fnRefs: [], math: [], restore };
  flatten(n, acc);
  const { restore: _r, ...rest } = acc; void _r;
  return { ...rest, text: acc.parts.join('').replace(/\s+/g, ' ').trim() };
}

/** id blok stabil: berbasis jenis + isi (+ urutan kemunculan bila sama), bukan posisi. */
export class BlockIdAllocator {
  private seen = new Map<string, number>();
  constructor(private prefix: string) {}
  next(kind: string, text: string): string {
    const base = `${this.prefix}b-${fnv1a(kind + '\u0000' + text)}`;
    const k = (this.seen.get(base) ?? 0) + 1;
    this.seen.set(base, k);
    return k === 1 ? base : `${base}-${k}`;
  }
}

export function blockModels(parsed: ParsedMarkdown, idPrefix = ''): BlockModel[] {
  const alloc = new BlockIdAllocator(idPrefix);
  const out: BlockModel[] = [];
  const restore = restorerFor(parsed.scan);
  for (const n of parsed.tree.children) out.push(blockModelOf(n, alloc, restore));
  return out;
}

export function blockModelOf(n: RootContent, alloc: BlockIdAllocator, restore: (s: string) => string = identity): BlockModel {
  const kind = kindOf(n);
  const f = flattenNode(n, restore);
  const pos = n.position;
  const m: BlockModel = {
    id: '', kind, line: pos?.start.line ?? 0, endLine: pos?.end.line ?? 0, start: pos?.start.offset ?? 0, end: pos?.end.offset ?? 0,
    text: f.text, tokens: orderedTokens(f.text), links: f.links, images: f.images, fnRefs: f.fnRefs, math: f.math,
  };
  if (f.formulas) m.formulas = f.formulas;
  if (f.referenceLabels) m.referenceLabels = f.referenceLabels;
  if (n.type === 'html' && /^\s*<table(?:\s|>)/i.test(n.value) && /<\/table>\s*$/i.test(n.value) && (n.value.match(/<table(?:\s|>)/gi) ?? []).length === 1) {
    m.rawTableHtml = restore(n.value);
  } else if (n.type === 'html') {
    m.rawHtml = sourceRawHtmlSignature(restore(n.value));
  }
  if (n.type === 'html' && /[\\$]|data-(?:tex|latex|pf-formula)|<math|mjx-container/i.test(n.value)) {
    const projection = m.rawHtml ?? sourceRawHtmlSignature(restore(n.value));
    if (projection?.counts.math) {
      const events: string[][] = JSON.parse(projection.signature);
      m.formulas = events.filter(event => event[0] === 'math').map(([, mode, tex, raw]) => ({tex, raw, display: mode === 'display'}));
    }
  }
  if (n.type === 'heading') m.depth = n.depth;
  if (n.type === 'list') { m.ordered = !!n.ordered; m.start1 = n.ordered ? (n.start ?? 1) : null; }
  if (n.type === 'code') { m.code = n.value; m.lang = n.lang ?? ''; m.tokens = []; m.text = n.value; }
  if (n.type === 'math') { m.text = n.value; m.tokens = []; m.math = [n.value]; }
  if (n.type === 'table') {
    m.cells = n.children.map((r) => r.children.map((c) => flattenNode(c, restore).text));
  }
  if (n.type === 'footnoteDefinition') m.fnLabel = n.label ?? n.identifier;
  m.id = alloc.next(kind, kind === 'code' || kind === 'mermaid' || kind === 'math' ? m.text : m.text + (m.cells ? JSON.stringify(m.cells) : ''));
  return m;
}
