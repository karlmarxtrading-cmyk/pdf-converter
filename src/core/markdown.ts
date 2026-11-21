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
import { scanMath, restorerFor, type MathScan } from './math';
import { fnv1a, imageRefKey } from './util';

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
  return fm ? { tree, scan, source, frontmatter: fm } : { tree, scan, source };
}

/* ---------------- token berurutan ---------------- */
const TOKEN_RE = /⟦[^⟧]*⟧|\p{L}[\p{L}\p{M}]*|\p{N}+(?:[.,:]\p{N}+)*|[^\s\p{L}\p{N}]/gu;

/** Token berurutan: kata, angka (dengan pemisah desimal/ribuan), dan SETIAP simbol (+ − - = % $ …) sebagai token sendiri. */
export function orderedTokens(s: string): string[] {
  return s.normalize('NFC').match(TOKEN_RE) ?? [];
}

/* ---------------- model blok ---------------- */
export type BlockKind = 'heading' | 'paragraph' | 'list' | 'blockquote' | 'code' | 'mermaid' | 'math' | 'table' | 'thematicBreak' | 'html' | 'footnoteDefinition' | 'definition' | 'other';

export interface BlockModel {
  id: string; kind: BlockKind; line: number; endLine: number; start: number; end: number;
  /** teks rata dengan penanda ⟦math:…⟧ ⟦img:…⟧ ⟦fn:…⟧ */
  text: string; tokens: string[];
  depth?: number; ordered?: boolean; start1?: number | null;
  code?: string; lang?: string; math?: string[]; rawTableHtml?: string;
  cells?: string[][]; links: string[]; images: string[]; fnRefs: string[]; fnLabel?: string;
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

interface Acc { parts: string[]; links: string[]; images: string[]; fnRefs: string[]; math: string[]; restore: (s: string) => string }

const identity = (s: string) => s;

function flatten(n: MdNodes, acc: Acc): void {
  const restore = acc.restore;
  switch (n.type) {
    case 'text': acc.parts.push(restore(n.value)); return;
    case 'inlineCode': acc.parts.push(n.value); return;
    case 'inlineMath': acc.parts.push(` ⟦math:${n.value}⟧ `); acc.math.push(n.value); return;
    case 'math': acc.parts.push(` ⟦math:${n.value}⟧ `); acc.math.push(n.value); return;
    case 'image': { const k = imageRefKey(restore(n.url)); acc.parts.push(` ⟦img:${k}⟧ `); acc.images.push(k); return; }
    case 'imageReference': acc.parts.push(` ⟦imgref:${n.identifier}⟧ `); return;
    case 'footnoteReference': acc.parts.push(` ⟦fn:${n.label ?? n.identifier}⟧ `); acc.fnRefs.push(n.label ?? n.identifier); return;
    case 'break': acc.parts.push(' '); return;
    case 'html': return; // HTML mentah dinilai oleh laporan sanitasi, bukan pemeriksa token
    case 'code': acc.parts.push(` ${n.value} `); return;
    case 'link': acc.links.push(restore(n.url)); break;
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
  if (n.type === 'html' && /^\s*<table(?:\s|>)/i.test(n.value) && /<\/table>\s*$/i.test(n.value) && (n.value.match(/<table(?:\s|>)/gi) ?? []).length === 1) {
    m.rawTableHtml = restore(n.value);
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
