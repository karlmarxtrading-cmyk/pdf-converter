/**
 * renderBody: Markdown → HTML isi tersanitasi + diagnostik (mempertahankan kemampuan 1.0.0).
 * Tidak pernah mengubah `source`. Isi adalah DATA: kode tidak dieksekusi, URL tidak dibuka,
 * gambar eksternal tidak diminta sebelum persetujuan (AST-04).
 */
import { structuredConversation } from './conversation';
import { sha256Hex } from './hash';
import { unified } from 'unified';
import rehypeRaw from 'rehype-raw';
import rehypeStringify from 'rehype-stringify';
import { toHast, defaultHandlers, type Handler, type State } from 'mdast-util-to-hast';
import { toText } from 'hast-util-to-text';
import hljs from 'highlight.js/lib/common';
import type { Element, ElementContent, Root as HRoot, RootContent as HContent, Properties, Text as HText } from 'hast';
import type { Root, RootContent, Table, FootnoteDefinition, Nodes as MdNodes } from 'mdast';
import type { AssetRecord, BlockInfo, Conversation, FootnoteEntry, Issue, Message, RenderOptions, RenderedBody, Role, Snapshot, TocEntry } from './contracts';
import { parseMarkdown, blockModelOf, BlockIdAllocator, type BlockModel, type Frontmatter } from './markdown';
import { renderTex, restorerFor } from './math';
import { classifyUrl, DROP_WITH_CONTENT, UNWRAP, USER_ATTRS, ALLOWED_TAGS, purifyToBody } from './sanitize';
import { assetDataUrl, resolveAsset } from './assets';
import { detectWrapper } from './wrapper';
import { LIMITS } from './limits';
import { docLabels, docLanguage } from '../render/labels';
import { mkIssue, numberIssues, type CoreIssue, randomId, imageRefKey } from './util';
import { analyzeChars, charIssues } from './chars';

export interface DocumentPart { id: string; startLine: number; endLine: number }

/** Opsi tambahan (superset RenderOptions; semuanya opsional). */
export interface CoreRenderOptions extends RenderOptions {
  /** inputId untuk sourceRef blok (default 'source' / conversation.inputId) */
  inputId?: string;
  /** bahasa label struktural (label pembicara, judul catatan kaki, placeholder). Default 'id'. */
  lang?: 'id' | 'en';
  /** namespace id heading per bagian dokumen gabungan (IMP-12), lihat mergeDocuments() */
  parts?: DocumentPart[];
  /** isi utama untuk mode 'source-appendix' (default: source) */
  appendixTitle?: string;
}

export function snapshotRenderOptions(snapshot: Snapshot): CoreRenderOptions {
  return { assets: snapshot.assets, sourcePath: snapshot.sourcePath, template: snapshot.settings.template,
    allowExternalImages: snapshot.settings.allowExternalImages, conversation: snapshot.conversation,
    lang: docLanguage(snapshot.settings.contentLang) };
}

export const ROLE_LABELS: Record<'id' | 'en', Record<Role, string>> = { id: docLabels('id').role, en: docLabels('en').role };

const GENERIC_LABEL = /^(user|pengguna|anda|you|kamu|saya|me|human|penanya|assistant|asisten|ai|bot|model|system|sistem|other|lainnya)$/i;
/** Label pembicara tertulis: peran terjemahan + nama asli dari sumber bila spesifik (mis. "Asisten (ChatGPT)"). Tidak mengarang nama. */
export function speakerDisplay(m: Pick<Message, 'role' | 'speakerLabel'>, lang: 'id' | 'en'): string {
  const base = ROLE_LABELS[lang][m.role];
  const l = m.speakerLabel?.trim();
  return l && !GENERIC_LABEL.test(l) ? `${base} (${l})` : base;
}

interface Slot { key: string; tex: string; display: boolean; line: number; blockId?: string; messageId?: string }

interface Ctx {
  nonce: string; prefix: string; lang: 'id' | 'en'; sourcePath?: string; assets: AssetRecord[]; allowExternal: boolean;
  issues: CoreIssue[]; slots: Slot[]; toc: TocEntry[]; footnotes: FootnoteEntry[]; blocks: BlockInfo[];
  stats: RenderedBody['stats']; headingIds: Map<string, number>; lastHeadingLevel: number;
  lineOffset: number; messageId?: string; inputId: string; offsetBase: number; parts?: DocumentPart[];
  curBlock?: string;
  usedIds: Set<string>;
  aliases: Map<string, Map<string, string>>;
  explicitIds: Map<string, Map<string, string>>;
  ariaRefs: { element: Element; scope: string; key: string; line?: number }[];
  fragments: { element: Element; scope: string; line?: number }[];
  /** atribut yang diset SETELAH sanitasi (nilai bebas, mis. `-->` di sumber mermaid/LaTeX) */
  post: Map<string, Record<string, string>>;
  /** src gambar aset diisi SETELAH sanitasi di thread utama (data: URL dibuat dari byte tersanitasi) — tahap 1 tidak butuh byte */
  assetSrc: Map<string, string>;
  frontmatter?: Frontmatter;
  /** pemulih sentinel untuk naskah yang sedang diproses (EN-003); identitas di luar renderOne */
  restore: (s: string) => string;
}

const gen = (ctx: Ctx, props: Properties = {}): Properties => ({ ...props, dataPfg: ctx.nonce });
const txt = (value: string): HText => ({ type: 'text', value });

function slugify(s: string): string {
  const out = s.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-');
  return out || 'bagian';
}

function srcLine(ctx: Ctx, n: { position?: { start: { line: number } } }): number | undefined {
  const l = n.position?.start.line;
  return l === undefined ? undefined : l + ctx.lineOffset;
}

function issueRef(ctx: Ctx, extra: { line?: number | undefined; blockId?: string | undefined } = {}): { line?: number; blockId?: string } {
  const o: { line?: number; blockId?: string } = {};
  if (extra.line !== undefined) o.line = extra.line;
  const b = extra.blockId ?? ctx.curBlock;
  if (b !== undefined) o.blockId = b;
  return o;
}

function formulaElement(ctx: Ctx, tex: string, display: boolean, line: number): Element {
  const key = `${ctx.nonce}-${ctx.slots.length}`;
  ctx.slots.push({ key, tex, display, line, blockId: ctx.curBlock, messageId: ctx.messageId });
  ctx.stats.math++;
  ctx.post.set(key, { 'data-tex': tex });
  return { type: 'element', tagName: display ? 'div' : 'span',
    properties: gen(ctx, { className: ['pf-math', display ? 'pf-math-display' : 'pf-math-inline'], dataSlot: key, dataPost: key }), children: [] };
}

/* ---------------- handler mdast → hast ---------------- */
function makeHandlers(ctx: Ctx): Record<string, Handler> {
  const mathEl = (state: State, node: MdNodes & { value: string }, display: boolean): Element => {
    const el = formulaElement(ctx, ctx.restore(node.value), display, srcLine(ctx, node) ?? 0);
    const hp = (node as { data?: { hProperties?: Properties } }).data?.hProperties;
    if (hp?.dataBlockId !== undefined) {
      el.properties.dataBlockId = hp.dataBlockId;
      el.properties.dataLine = hp.dataLine;
    }
    state.patch(node, el);
    return el;
  };
  const handlers: Record<string, Handler> = {
    inlineMath: (state, node) => mathEl(state, node, false),
    math: (state, node) => mathEl(state, node, true),
    code: (state, node) => {
      const value: string = node.value;
      const lang: string = (node.lang ?? '').trim();
      let el: Element;
      if (lang.toLowerCase() === 'mermaid') {
        ctx.stats.mermaid++;
        const key = `${ctx.nonce}-p${ctx.post.size}`;
        ctx.post.set(key, { 'data-src': value });
        el = { type: 'element', tagName: 'pre', properties: gen(ctx, { className: ['pf-mermaid'], dataPost: key }), children: [txt(value)] };
      } else {
        ctx.stats.code++;
        let children: ElementContent[] = [txt(value)];
        const known = lang && hljs.getLanguage(lang);
        if (known) {
          try { children = [{ type: 'raw', value: hljs.highlight(value, { language: lang, ignoreIllegals: true }).value } as unknown as ElementContent]; } catch { /* teks polos */ }
        }
        const codeEl: Element = { type: 'element', tagName: 'code', properties: gen(ctx, { className: ['hljs', ...(lang ? [`language-${lang.replace(/[^\w+-]/g, '')}`] : [])] }), children };
        el = { type: 'element', tagName: 'pre', properties: gen(ctx, { className: ['pf-code'], ...(lang ? { dataLang: lang } : {}) }), children: [codeEl] };
      }
      state.patch(node, el);
      return state.applyData(node, el);
    },
    link: (state, node) => {
      const props: Properties = { href: node.url };
      if (node.title) props.title = node.title;
      const el: Element = { type: 'element', tagName: 'a', properties: props, children: state.all(node) };
      state.patch(node, el);
      return state.applyData(node, el);
    },
    image: (state, node) => {
      const props: Properties = { src: node.url, alt: node.alt ?? '' };
      if (node.title) props.title = node.title;
      const el: Element = { type: 'element', tagName: 'img', properties: props, children: [] };
      state.patch(node, el);
      return state.applyData(node, el);
    },
    footnoteReference: (state, node) => {
      const r = defaultHandlers.footnoteReference(state, node) as Element;
      const a = r.children.find((c): c is Element => c.type === 'element' && c.tagName === 'a');
      if (a) a.properties = { ...a.properties, dataFnLabel: node.label ?? node.identifier };
      return r;
    },
    table: (state, node: Table) => tableHandler(ctx, state, node),
  };
  return handlers;
}

function tableHandler(ctx: Ctx, state: State, node: Table): Element {
  ctx.stats.tables++;
  const header = node.children[0];
  const hCount = header?.children.length ?? 0;
  const width = Math.max(hCount, ...node.children.map((r) => r.children.length));
  const cellsTotal = node.children.reduce((s, r) => s + r.children.length, 0);
  if (cellsTotal > LIMITS.maxTableCells) {
    ctx.issues.push(mkIssue('TABLE_TOO_LARGE', 'warning', 'table', { id: `Tabel memiliki ${cellsTotal} sel (batas ${LIMITS.maxTableCells}). Seluruh sel tetap ditampilkan; pertimbangkan memecah tabel.`, en: `Table has ${cellsTotal} cells (limit ${LIMITS.maxTableCells}). All cells are still shown; consider splitting it.` }, issueRef(ctx, { line: srcLine(ctx, node) })));
  }
  const align = node.align ?? [];
  const rows: Element[] = node.children.map((row, ri) => {
    const isHead = ri === 0;
    const line = srcLine(ctx, row);
    if (!isHead && row.children.length < hCount) {
      ctx.issues.push(mkIssue('TABLE_MISSING_CELLS', 'warning', 'table', { id: `Baris tabel di baris ${line} hanya memiliki ${row.children.length} dari ${hCount} sel. Sel kosong penanda ditambahkan pada tampilan (tidak ada nilai yang digeser). Perbaikan sumber tersedia sebagai diff.`, en: `Table row at line ${line} has ${row.children.length} of ${hCount} cells. Marked empty cells were added in the view (no value shifted). A source repair is available as a diff.` }, { ...issueRef(ctx, { line }), detail: { expected: hCount, actual: row.children.length, repair: 'table-pad' } }));
    }
    if (row.children.length > hCount) {
      ctx.issues.push(mkIssue('TABLE_EXTRA_CELLS', 'warning', 'table', { id: `Baris tabel di baris ${line} memiliki ${row.children.length} sel, melebihi ${hCount} kolom judul. Sel berlebih TETAP ditampilkan (ditandai), tidak dibuang. Perbaikan sumber tersedia sebagai diff.`, en: `Table row at line ${line} has ${row.children.length} cells, more than the ${hCount} header columns. Extra cells are still shown (marked), not dropped. A source repair is available as a diff.` }, { ...issueRef(ctx, { line }), detail: { expected: hCount, actual: row.children.length, repair: 'table-pad' } }));
    }
    const cells: Element[] = [];
    for (let ci = 0; ci < width; ci++) {
      const c = row.children[ci];
      const tag = isHead ? 'th' : 'td';
      const props: Properties = {};
      const a = align[ci];
      if (a) props.align = a;
      if (!c) { cells.push({ type: 'element', tagName: tag, properties: gen(ctx, { ...props, className: ['pf-cell-missing'], dataMissing: 'true' }), children: [] }); continue; }
      if (ci >= hCount) props.className = ['pf-cell-extra'];
      const el: Element = { type: 'element', tagName: tag, properties: props, children: state.all(c) };
      state.patch(c, el);
      cells.push(el);
    }
    const tr: Element = { type: 'element', tagName: 'tr', properties: {}, children: cells };
    state.patch(row, tr);
    return tr;
  });
  const thead: Element = { type: 'element', tagName: 'thead', properties: {}, children: rows.slice(0, 1) };
  const tbody: Element = { type: 'element', tagName: 'tbody', properties: {}, children: rows.slice(1) };
  const el: Element = { type: 'element', tagName: 'table', properties: {}, children: rows.length > 1 ? [thead, tbody] : [thead] };
  state.patch(node, el);
  return state.applyData(node, el);
}

/* ---------------- sanitasi hast + transformasi ---------------- */
function propStr(v: unknown): string { return Array.isArray(v) ? v.join(' ') : v === undefined || v === null ? '' : String(v); }

function hastAttrName(k: string): string {
  // hast memakai camelCase (dataFoo, ariaLabel, className); kembalikan ke nama HTML untuk kebijakan
  if (k === 'className') return 'class';
  if (k === 'htmlFor') return 'for';
  if (k.startsWith('data') && /[A-Z]/.test(k[4] ?? '')) return 'data-' + k.slice(4).replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()).replace(/^-/, '');
  if (k.startsWith('aria') && /[A-Z]/.test(k[4] ?? '')) return 'aria-' + k.slice(4).toLowerCase();
  return k.toLowerCase();
}

const ALLOWED_TAG_SET = new Set<string>(ALLOWED_TAGS);

function snippetOf(el: Element): string {
  try { return toText(el).replace(/\s+/g, ' ').trim().slice(0, 80); } catch { return ''; }
}

function sanitizeUserElement(ctx: Ctx, el: Element): 'keep' | 'drop' | 'unwrap' {
  const tag = el.tagName.toLowerCase();
  const line = srcLine(ctx, el);
  if (DROP_WITH_CONTENT.has(tag) || (!ALLOWED_TAG_SET.has(tag) && !UNWRAP.has(tag))) {
    const isScript = tag === 'script';
    const unknown = !DROP_WITH_CONTENT.has(tag);
    if (unknown) {
      ctx.issues.push(mkIssue('SECURITY_ELEMENT_UNWRAPPED', 'info', 'security', { id: `Elemen HTML <${tag}> tidak didukung; pembungkusnya dibuang dan isinya dipertahankan.`, en: `HTML element <${tag}> is not supported; its wrapper was removed and its content kept.` }, { ...issueRef(ctx, { line }), detail: { tag } }));
      return 'unwrap';
    }
    ctx.issues.push(mkIssue(isScript ? 'SECURITY_SCRIPT_REMOVED' : 'SECURITY_ELEMENT_REMOVED', 'warning', 'security', {
      id: `Elemen aktif <${tag}> dibuang dari keluaran dan tidak dijalankan${snippetOf(el) ? ` (isi: "${snippetOf(el)}")` : ''}. Sumber asli tetap tersimpan.`,
      en: `Active element <${tag}> was removed from the output and not executed${snippetOf(el) ? ` (content: "${snippetOf(el)}")` : ''}. The original source is kept.`,
    }, { ...issueRef(ctx, { line }), detail: { tag } }));
    return 'drop';
  }
  if (UNWRAP.has(tag)) {
    ctx.issues.push(mkIssue('SECURITY_ELEMENT_UNWRAPPED', tag === 'form' ? 'warning' : 'info', 'security', { id: `Elemen <${tag}> dibuang; isinya dipertahankan sebagai teks/elemen aman.`, en: `Element <${tag}> was removed; its content was kept as safe text/elements.` }, { ...issueRef(ctx, { line }), detail: { tag } }));
    return 'unwrap';
  }
  if (tag === 'input') {
    ctx.issues.push(mkIssue('SECURITY_ELEMENT_REMOVED', 'info', 'security', { id: 'Elemen <input> dari HTML mentah dibuang.', en: 'An <input> element from raw HTML was removed.' }, { ...issueRef(ctx, { line }), detail: { tag } }));
    return 'drop';
  }
  const props = el.properties ?? {};
  for (const k of Object.keys(props)) {
    const name = hastAttrName(k);
    if (name.startsWith('on')) {
      ctx.issues.push(mkIssue('SECURITY_EVENT_HANDLER', 'warning', 'security', { id: `Atribut ${name} pada <${tag}> dibuang; kode di dalamnya tidak dijalankan.`, en: `Attribute ${name} on <${tag}> was removed; its code was not executed.` }, { ...issueRef(ctx, { line }), detail: { tag, attribute: name } }));
      delete props[k]; continue;
    }
    if (name === 'style') {
      ctx.issues.push(mkIssue('SECURITY_INLINE_STYLE', 'info', 'security', { id: `Gaya inline pada <${tag}> dibuang (gaya mengikuti templat).`, en: `Inline style on <${tag}> was removed (styling follows the template).` }, { ...issueRef(ctx, { line }), detail: { tag } }));
      delete props[k]; continue;
    }
    if (name === 'name') {
      ctx.issues.push(mkIssue('SECURITY_DOM_CLOBBERING', 'info', 'security', { id: `Atribut name="${propStr(props[k])}" pada <${tag}> dibuang (mencegah DOM clobbering).`, en: `Attribute name="${propStr(props[k])}" on <${tag}> was removed (prevents DOM clobbering).` }, { ...issueRef(ctx, { line }), detail: { tag } }));
      delete props[k]; continue;
    }
    if (!USER_ATTRS.has(name)) {
      ctx.issues.push(mkIssue('SECURITY_ATTRIBUTE_REMOVED', 'info', 'security', { id: `Atribut ${name} pada <${tag}> tidak diizinkan dan dibuang.`, en: `Attribute ${name} on <${tag}> is not allowed and was removed.` }, { ...issueRef(ctx, { line }), detail: { tag, attribute: name } }));
      delete props[k]; continue;
    }

    if (name === 'class') {
      const cls = propStr(props[k]).split(/\s+/).filter((c) => c && !c.startsWith('pf-') && !c.startsWith('katex'));
      if (cls.length) props[k] = cls; else delete props[k];
    }
  }
  return 'keep';
}

function handleLink(ctx: Ctx, el: Element): void {
  const p = el.properties ?? (el.properties = {});
  if (p.dataFootnoteRef !== undefined || p.dataFootnoteBackref !== undefined) return;
  const href = p.href;
  if (href === undefined) return;
  const v = classifyUrl(propStr(href));
  if (!v.ok) {
    ctx.issues.push(mkIssue('SECURITY_UNSAFE_LINK', 'warning', 'security', { id: `Tautan dengan skema "${v.scheme}:" dinonaktifkan; teks tautan dipertahankan.`, en: `A link with the "${v.scheme}:" scheme was disabled; the link text was kept.` }, { ...issueRef(ctx, { line: srcLine(ctx, el) }), detail: { scheme: v.scheme } }));
    delete p.href;
    p.dataBlockedHref = propStr(href);
    p.className = [...(Array.isArray(p.className) ? (p.className as string[]) : []), 'pf-link-blocked'];
    return;
  }
  if (v.kind === 'http' || v.kind === 'https') p.rel = ['noopener', 'noreferrer'];
}

function placeholder(ctx: Ctx, cls: string, label: string, alt: string, attrs: Properties): Element {
  return {
    type: 'element', tagName: 'span',
    properties: { className: ['pf-img-placeholder', cls], role: 'img', ariaLabel: alt ? `${label}: ${alt}` : label, ...attrs },
    children: [{ type: 'element', tagName: 'span', properties: { className: ['pf-ui-label'] }, children: [txt(alt ? `${label}: ${alt}` : label)] }],
  };
}

function handleImage(ctx: Ctx, el: Element): Element {
  ctx.stats.images++;
  const p = el.properties ?? {};
  const src = propStr(p.src);
  const alt = propStr(p.alt);
  const line = srcLine(ctx, el);
  const t = docLabels(ctx.lang);
  if (!alt.trim()) ctx.issues.push(mkIssue('IMAGE_NO_ALT', 'info', 'asset', { id: `Gambar "${src}" tidak memiliki teks alternatif.`, en: `Image "${src}" has no alternative text.` }, issueRef(ctx, { line })));
  const asset = src ? resolveAsset(ctx.assets, src, ctx.sourcePath) : undefined;
  if (asset) {
    const key = `${ctx.nonce}-a${ctx.assetSrc.size}`;
    ctx.assetSrc.set(key, asset.id);
    return { type: 'element', tagName: 'img', properties: { alt, ...(p.title ? { title: p.title } : {}), dataAssetId: asset.id, dataSrcPath: src, ...(asset.width ? { width: asset.width, height: asset.height } : {}), decoding: 'async', dataPost: key }, children: [] };
  }
  const v = classifyUrl(src, true);
  if (v.ok && v.kind === 'data-image') {
    return { type: 'element', tagName: 'img', properties: { src, alt, dataSrcPath: imageRefKey(src) }, children: [] };
  }
  if (v.ok && (v.kind === 'https' || v.kind === 'http')) {
    if (ctx.allowExternal && v.kind === 'https') {
      ctx.issues.push(mkIssue('PRIVACY_EXTERNAL_IMAGES', 'warning', 'asset', { id: `Gambar eksternal ${src} dimuat setelah izin; situs tersebut dapat melihat alamat IP pembaca. PDF hanya lengkap bila salinan gambar disematkan.`, en: `External image ${src} is loaded after consent; that site can see the reader's IP address. The PDF is only complete if a copy is embedded.` }, { ...issueRef(ctx, { line }), detail: { url: src } }));
      return { type: 'element', tagName: 'img', properties: { src, alt, referrerpolicy: 'no-referrer', loading: 'lazy', dataExternal: 'true', dataSrcPath: src }, children: [] };
    }
    ctx.issues.push(mkIssue('IMAGE_EXTERNAL_BLOCKED', 'warning', 'asset', {
      id: v.kind === 'http' ? `Gambar eksternal ${src} memakai http (tidak aman) dan tidak dimuat. Unggah salinannya.` : `Gambar eksternal ${src} belum dimuat (tidak ada permintaan jaringan sebelum izin). Izinkan gambar eksternal atau unggah salinannya.`,
      en: v.kind === 'http' ? `External image ${src} uses insecure http and was not loaded. Upload a copy.` : `External image ${src} was not loaded (no network request before consent). Allow external images or upload a copy.`,
    }, { ...issueRef(ctx, { line }), detail: { url: src } }));
    return placeholder(ctx, 'pf-img-external', t.extMissing, alt, { dataSrc: src });
  }
  if (!v.ok) {
    ctx.issues.push(mkIssue('SECURITY_UNSAFE_URL', 'warning', 'security', { id: `Sumber gambar dengan skema "${v.scheme}:" diblokir.`, en: `Image source with the "${v.scheme}:" scheme was blocked.` }, issueRef(ctx, { line })));
    return placeholder(ctx, 'pf-img-blocked', t.blockedImg, alt, { dataBlockedSrc: src.slice(0, 200) });
  }
  ctx.issues.push(mkIssue('IMAGE_MISSING_ASSET', 'error', 'asset', { id: `Gambar "${src}" dirujuk tetapi belum diunggah. Unggah berkasnya; placeholder ditampilkan sampai tersedia.`, en: `Image "${src}" is referenced but not uploaded. Upload the file; a placeholder is shown until then.` }, { ...issueRef(ctx, { line }), blocking: true, detail: { path: src } }));
  return placeholder(ctx, 'pf-img-missing', t.missing, alt, { dataSrcPath: src });
}

function anchorScope(ctx: Ctx, line?: number): string {
  const part = line === undefined ? undefined : ctx.parts?.find(p => line >= p.startLine && line <= p.endLine);
  return ctx.prefix + (part ? `${part.id}-` : '');
}

function uniqueId(ctx: Ctx, base: string): string {
  let suffix = 1, id = base;
  while (ctx.usedIds.has(id)) id = `${base}-${++suffix}`;
  ctx.usedIds.add(id);
  return id;
}

function alias(map: Ctx['aliases'], scope: string, name: string, canonical: string): void {
  let names = map.get(scope);
  if (!names) { names = new Map(); map.set(scope, names); }
  if (!names.has(name)) names.set(name, canonical);
}

function resolveFragments(ctx: Ctx, root: HRoot): void {
  if (!ctx.fragments.length && !ctx.ariaRefs.length) return;
  const ids = new Set<string>();
  const collect = (parent: HRoot | Element) => {
    for (const child of parent.children) if (child.type === 'element') {
      if (typeof child.properties.id === 'string') ids.add(child.properties.id);
      collect(child);
    }
  };
  collect(root);
  const resolve = (key: string, scope: string): string | undefined => {
    const direct = ctx.explicitIds.get(scope)?.get(key) ?? ctx.aliases.get(scope)?.get(key);
    if (direct) return direct;
    if (ids.has(key)) return key;
    const matches = new Set<string>();
    for (const map of [ctx.explicitIds, ctx.aliases]) {
      for (const names of map.values()) {
        const target = names.get(key);
        if (target) matches.add(target);
      }
    }
    return matches.size === 1 ? [...matches][0] : undefined;
  };
  for (const { element, scope, key, line } of ctx.ariaRefs) {
    const original = propStr(element.properties[key]).trim().split(/\s+/);
    const targets = original.map(name => resolve(name, scope));
    if (targets.every(Boolean)) element.properties[key] = targets.join(' ');
    else {
      delete element.properties[key];
      ctx.issues.push(mkIssue('ARIA_TARGET_MISSING', 'warning', 'structure', {
        id: 'Sasaran label aksesibilitas tidak tersedia. Periksa ID rujukan.',
        en: 'The accessibility label target is unavailable. Review the referenced IDs.',
      }, { line }));
    }
  }
  for (const { element, scope, line } of ctx.fragments) {
    const href = String(element.properties.href), name = href.slice(1);
    let key: string;
    try { key = decodeURIComponent(name); } catch { key = name; }
    // Generated footnote IDs may themselves contain percent escapes.
    const target = resolve(key, scope) ?? (ids.has(name) ? name : undefined);
    if (target && ids.has(target)) {
      const url = '#' + encodeURIComponent(target);
      if (url !== href) { element.properties.href = url; element.properties.dataSourceHref = href; }
    } else {
      ctx.issues.push(mkIssue('FRAGMENT_TARGET_MISSING', 'warning', 'structure',
        { id: `Tujuan tautan ${href} tidak ditemukan atau tidak unik. Periksa rujukan sebelum ekspor.`,
          en: `Link target ${href} is missing or ambiguous. Review the reference before export.` }, { line }));
    }
  }
}

function transform(ctx: Ctx, parent: HRoot | Element): void {
  const out: HContent[] = [];
  for (const node of parent.children as HContent[]) {
    if (node.type === 'text') { node.value = ctx.restore(node.value); out.push(node); continue; }
    if (node.type === 'comment' || node.type === 'doctype') continue;
    if (node.type !== 'element') { out.push(node); continue; }
    const el = node;
    const p = el.properties ?? (el.properties = {});
    const generated = p.dataPfg === ctx.nonce;
    delete p.dataPfg;
    if (p.dataBlockId !== undefined && generated) ctx.curBlock = propStr(p.dataBlockId);
    if (!generated && el.tagName === 'code' && (p.dataPfFormula === 'display' || p.dataPfFormula === 'inline')
        && Object.keys(p).length === 1 && el.children.every(c => c.type === 'text')) {
      const tex = el.children.map(c => (c as HText).value).join('');
      const formula = formulaElement(ctx, tex, p.dataPfFormula === 'display', srcLine(ctx, el) ?? 0);
      delete formula.properties.dataPfg;
      out.push(formula);
      continue;
    }
    if (!generated) {
      // atribut internal pf tidak boleh dipalsukan oleh HTML mentah
      for (const k of Object.keys(p)) if (/^data(Pfg|Slot|Post|Tex|BlockId|SrcPath|FnLabel|FnDef|AssetId|MessageId|Role|Src|Missing|External|BlockedHref|BlockedSrc)$/.test(k)) delete p[k];
      const verdict = sanitizeUserElement(ctx, el);
      if (verdict === 'drop') continue;
      if (verdict === 'unwrap') { transform(ctx, el); out.push(...(el.children as HContent[])); continue; }
    }
    const tag = el.tagName;
    if (tag === 'a') {
      handleLink(ctx, el);
      if (typeof p.href === 'string' && p.href.startsWith('#') && p.href.length > 1)
        ctx.fragments.push({ element: el, scope: anchorScope(ctx, srcLine(ctx, el)), line: srcLine(ctx, el) });
    }
    if (tag === 'img') { out.push(handleImage(ctx, el)); continue; }
    if (/^h[1-6]$/.test(tag) && !(generated && p.id === 'footnote-label')) {
      const level = Number(tag[1]);
      const text = ctx.restore(toText(el)).replace(/\s+/g, ' ').trim();
      const line = srcLine(ctx, el);
      const scope = anchorScope(ctx, line);
      const slug = slugify(text), base = `${scope}h-${slug}`;
      const id = uniqueId(ctx, base);
      ctx.headingIds.set(base, (ctx.headingIds.get(base) ?? 0) + 1);
      if (!generated && typeof p.id === 'string') alias(ctx.explicitIds, scope, p.id, id);
      alias(ctx.aliases, scope, id.slice((scope + 'h-').length), id);
      if (!text) ctx.issues.push(mkIssue('HEADING_EMPTY', 'warning', 'structure', { id: `Judul tingkat ${level} tanpa teks di baris ${line ?? '?'}. Tidak ada teks judul yang dikarang.`, en: `Level-${level} heading without text at line ${line ?? '?'}. No heading text was invented.` }, issueRef(ctx, { line })));
      if (ctx.lastHeadingLevel > 0 && level > ctx.lastHeadingLevel + 1) ctx.issues.push(mkIssue('HEADING_LEVEL_SKIP', 'warning', 'structure', { id: `Judul melompat dari H${ctx.lastHeadingLevel} ke H${level} di baris ${line ?? '?'}.`, en: `Heading jumps from H${ctx.lastHeadingLevel} to H${level} at line ${line ?? '?'}.` }, issueRef(ctx, { line })));
      if (ctx.headingIds.get(id.replace(/-\d+$/, '')) && /-\d+$/.test(id) && (ctx.headingIds.get(id.replace(/-\d+$/, '')) ?? 0) > 1) ctx.issues.push(mkIssue('HEADING_DUPLICATE', 'info', 'structure', { id: `Judul "${text}" muncul lebih dari sekali; anchor dibuat unik (${id}).`, en: `Heading "${text}" appears more than once; the anchor was made unique (${id}).` }, issueRef(ctx, { line })));
      ctx.lastHeadingLevel = level;
      p.id = id;
      ctx.toc.push({ id, level, text });
    } else if (!generated && typeof p.id === 'string') {
      const scope = anchorScope(ctx, srcLine(ctx, el));
      const original = p.id;
      p.id = uniqueId(ctx, `${scope}u-${slugify(original)}`);
      alias(ctx.explicitIds, scope, original, p.id);
    }
    if (tag === 'li' && typeof p.id === 'string' && p.id.startsWith(`${ctx.prefix}fn-`)) p.dataFnDef = p.id.slice(`${ctx.prefix}fn-`.length);
    if (!generated) for (const key of ['ariaLabelledBy', 'ariaDescribedBy']) {
      if (p[key] !== undefined) ctx.ariaRefs.push({ element: el, scope: anchorScope(ctx, srcLine(ctx, el)), key, line: srcLine(ctx, el) });
    }
    if (p.id === 'footnote-label') p.id = `${ctx.prefix}footnote-label`;
    if (propStr(p.ariaDescribedBy) === 'footnote-label') p.ariaDescribedBy = [`${ctx.prefix}footnote-label`];
    for (const k of Object.keys(p)) {
      const v = p[k];
      if (typeof v === 'string') p[k] = ctx.restore(v);
      else if (Array.isArray(v)) p[k] = v.map((x) => typeof x === 'string' ? ctx.restore(x) : x) as typeof v;
    }
    transform(ctx, el);
    out.push(el);
  }
  parent.children = out as typeof parent.children;
}

function markGenerated(nonce: string, node: HRoot | Element): void {
  for (const c of node.children) {
    if (c.type === 'element') { c.properties = { ...c.properties, dataPfg: nonce }; markGenerated(nonce, c); }
  }
}

/* ---------------- render satu naskah ---------------- */
interface OneResult { nodes: HContent[] }

function renderOne(source: string, ctx: Ctx): OneResult {
  const parsed = parseMarkdown(source);
  const outerRestore = ctx.restore;
  ctx.restore = restorerFor(parsed.scan);
  try { return renderOneParsed(source, parsed, ctx); } finally { ctx.restore = outerRestore; }
}

function renderOneParsed(source: string, parsed: ReturnType<typeof parseMarkdown>, ctx: Ctx): OneResult {
  if (parsed.frontmatter) {
    if (!ctx.messageId && !ctx.frontmatter) ctx.frontmatter = parsed.frontmatter;
    if (!parsed.frontmatter.valid) ctx.issues.push(mkIssue('FRONTMATTER_INVALID', 'warning', 'input', { id: `Frontmatter (baris 1–${parsed.frontmatter.endLine}) memuat baris yang bukan "kunci: nilai"; baris tersebut diabaikan untuk metadata dan tetap ada di sumber.`, en: `Frontmatter (lines 1–${parsed.frontmatter.endLine}) has lines that are not "key: value"; they are ignored for metadata and kept in the source.` }, { line: 1 }));
  }
  for (const si of parsed.scan.issues) {
    ctx.issues.push(mkIssue(si.code, 'warning', 'math', si.code === 'MATH_UNTERMINATED'
      ? { id: `Pembatas rumus $$ di baris ${si.line + ctx.lineOffset} tidak ditutup; teks ditampilkan apa adanya.`, en: `Math delimiter $$ at line ${si.line + ctx.lineOffset} is not closed; text is shown as-is.` }
      : { id: `Kemungkinan rumus tidak ditutup di baris ${si.line + ctx.lineOffset}: "${si.snippet}". Teks ditampilkan apa adanya dan perlu diperiksa.`, en: `Possibly unclosed formula at line ${si.line + ctx.lineOffset}: "${si.snippet}". Text is shown as-is and needs review.` }, { line: si.line + ctx.lineOffset, detail: { snippet: si.snippet } }));
  }
  if (parsed.scan.puaConflict) ctx.issues.push(mkIssue('INPUT_PRIVATE_USE_CHARS', 'info', 'input', parsed.scan.sentinels
    ? { id: 'Naskah memuat karakter Private Use (U+E000–U+F8FF). Karakter tersebut dipertahankan apa adanya; perlindungan mata uang tetap aktif.', en: 'The text contains Private Use characters (U+E000–U+F8FF). They are kept as-is; currency protection stays on.' }
    : { id: 'Naskah memuat seluruh titik kode Private Use; perlindungan mata uang dinonaktifkan untuk naskah ini dan isinya dipertahankan apa adanya.', en: 'The text uses every Private Use code point; currency protection is disabled for it and its content is kept as-is.' }));
  // kompleksitas (LIMITS.maxNodes) — dilaporkan, tidak dipotong
  let nodeCount = 0;
  const countNodes = (n: MdNodes) => { nodeCount++; if ('children' in n) for (const c of n.children as MdNodes[]) countNodes(c); };
  countNodes(parsed.tree);
  if (nodeCount > LIMITS.maxNodes) ctx.issues.push(mkIssue('INPUT_TOO_COMPLEX', 'error', 'input', { id: `Naskah memiliki ${nodeCount} elemen (batas ${LIMITS.maxNodes}); pratinjau/ekspor dapat lambat. Pecah naskah.`, en: `The document has ${nodeCount} nodes (limit ${LIMITS.maxNodes}); preview/export may be slow. Split the document.` }, { blocking: true, detail: { nodes: nodeCount } }));
  // model blok + anotasi
  const alloc = new BlockIdAllocator(ctx.prefix);
  const models = new Map<RootContent, BlockModel>();
  const fnDefBlock = new Map<string, string>();
  const root: Root = parsed.tree;
  for (const n of root.children) {
    const m = blockModelOf(n, alloc, ctx.restore);
    models.set(n, m);
    if (m.kind === 'definition' || (m.kind === 'html' && !m.rawTableHtml)) continue;
    if (m.kind === 'footnoteDefinition') { fnDefBlock.set((n as FootnoteDefinition).identifier, m.id); }
    else {
      n.data = { ...n.data, hProperties: { ...(n.data as { hProperties?: Properties } | undefined)?.hProperties, dataBlockId: m.id, dataLine: m.line + ctx.lineOffset } } as typeof n.data;
    }
    const bi: BlockInfo = { id: m.id, type: m.kind, line: m.line + ctx.lineOffset, text: m.text, sourceRef: { inputId: ctx.inputId, start: ctx.offsetBase + m.start, end: ctx.offsetBase + m.end, unit: 'utf16' } };
    if (ctx.messageId) { bi.messageId = ctx.messageId; bi.sourceRef!.messageId = ctx.messageId; }
    ctx.blocks.push(bi);
  }
  // catatan kaki: rujukan hilang & definisi tak terpakai
  const defs = new Map<string, FootnoteDefinition>();
  const refs = new Map<string, { label: string; count: number }>();
  const visit = (n: MdNodes, inCode: boolean) => {
    if (n.type === 'footnoteDefinition') defs.set(n.identifier, n);
    if (n.type === 'footnoteReference') { const r = refs.get(n.identifier) ?? { label: n.label ?? n.identifier, count: 0 }; r.count++; refs.set(n.identifier, r); }
    if (n.type === 'text' && !inCode) {
      for (const mm of n.value.matchAll(/\[\^([^\]\s]+)\]/g)) {
        const line = srcLine(ctx, n);
        ctx.issues.push(mkIssue('FOOTNOTE_DANGLING', 'warning', 'structure', { id: `Rujukan catatan kaki [^${mm[1]}] di baris ${line ?? '?'} tidak memiliki definisi; ditampilkan sebagai teks.`, en: `Footnote reference [^${mm[1]}] at line ${line ?? '?'} has no definition; shown as text.` }, { ...(line !== undefined ? { line } : {}), detail: { label: mm[1]! } }));
        ctx.footnotes.push({ id: '', label: mm[1]!, refCount: 1, defined: false });
      }
    }
    if ('children' in n) for (const c of n.children as MdNodes[]) visit(c, inCode);
  };
  visit(root, false);
  for (const [ident, d] of defs) {
    const r = refs.get(ident);
    if (!r) ctx.issues.push(mkIssue('FOOTNOTE_UNUSED', 'warning', 'structure', { id: `Definisi catatan kaki [^${d.label ?? ident}] di baris ${srcLine(ctx, d) ?? '?'} tidak pernah dirujuk sehingga tidak tampil di keluaran.`, en: `Footnote definition [^${d.label ?? ident}] at line ${srcLine(ctx, d) ?? '?'} is never referenced, so it does not appear in the output.` }, { ...(srcLine(ctx, d) !== undefined ? { line: srcLine(ctx, d)! } : {}), detail: { label: d.label ?? ident } }));
    ctx.footnotes.push({ id: `${ctx.prefix}fn-${ident.toLowerCase()}`, label: d.label ?? ident, refCount: r?.count ?? 0, defined: true });
  }
  // sitasi AI tanpa metadata
  const citeRe = /cite([^]*)/g;
  for (const m of source.matchAll(citeRe)) {
    const line = source.slice(0, m.index).split('\n').length + ctx.lineOffset;
    ctx.issues.push(mkIssue('CITATION_UNRESOLVED', 'info', 'structure', { id: `Token sitasi AI "${m[1]}" di baris ${line} tidak membawa URL/metadata; tidak ada tautan yang dikarang. Teks asli dipertahankan.`, en: `AI citation token "${m[1]}" at line ${line} carries no URL/metadata; no link was invented. Original text kept.` }, { line, detail: { token: m[1]! } }));
  }
  const t = docLabels(ctx.lang);
  const hast = toHast(root, {
    allowDangerousHtml: true, clobberPrefix: ctx.prefix, handlers: makeHandlers(ctx),
    footnoteLabel: t.fn, footnoteBackLabel: (ri: number, rr: number) => t.back(rr > 1 ? `${ri + 1}-${rr}` : String(ri + 1)),
  }) as HRoot;
  markGenerated(ctx.nonce, hast);
  const rawTree = unified().use(rehypeRaw).runSync(hast) as HRoot;
  // definisi catatan kaki → id blok
  const tagFn = (n: HRoot | Element) => {
    for (const c of n.children) if (c.type === 'element') {
      const id = c.properties?.id;
      if (c.tagName === 'li' && typeof id === 'string' && id.startsWith(`${ctx.prefix}fn-`)) {
        const ident = [...fnDefBlock.keys()].find((k) => `${ctx.prefix}fn-${k.toLowerCase()}` === id || `${ctx.prefix}fn-${encodeURIComponent(k.toLowerCase())}` === id);
        if (ident) c.properties = { ...c.properties, dataBlockId: fnDefBlock.get(ident)!, dataFnLabel: defs.get(ident)?.label ?? ident };
      }
      tagFn(c);
    }
  };
  tagFn(rawTree);
  ctx.curBlock = undefined;
  transform(ctx, rawTree);
  // Assign trusted block IDs only after sanitizing raw user attributes.
  const rawTables = new Map([...models.values()].filter(m => m.rawTableHtml).map(m => [m.start, m]));
  for (const node of rawTree.children) {
    if (node.type !== 'element' || node.tagName !== 'table') continue;
    const model = rawTables.get(node.position?.start.offset ?? -1);
    if (model) {
      node.properties.dataPfRawTable = '1';
      node.properties.dataBlockId = model.id;
      node.properties.dataLine = model.line + ctx.lineOffset;
    }
  }
  ctx.stats.words += (source.slice(parsed.frontmatter?.raw.length ?? 0).match(/[\p{L}\p{N}]+/gu) ?? []).length;
  return { nodes: rawTree.children as HContent[] };
}

function detectScripts(s: string): string[] {
  const tests: [string, RegExp][] = [
    ['Latin', /\p{Script=Latin}/u], ['Greek', /\p{Script=Greek}/u], ['Cyrillic', /\p{Script=Cyrillic}/u], ['Arabic', /\p{Script=Arabic}/u],
    ['Hebrew', /\p{Script=Hebrew}/u], ['Han', /\p{Script=Han}/u], ['Hiragana', /\p{Script=Hiragana}/u], ['Katakana', /\p{Script=Katakana}/u],
    ['Hangul', /\p{Script=Hangul}/u], ['Thai', /\p{Script=Thai}/u], ['Devanagari', /\p{Script=Devanagari}/u], ['Emoji', /\p{Extended_Pictographic}/u],
  ];
  return tests.filter(([, re]) => re.test(s)).map(([n]) => n);
}

function newCtx(opts: CoreRenderOptions): Ctx {
  return {
    nonce: randomId('pfg').replace(/[^a-z0-9-]/gi, ''), prefix: opts.idPrefix ?? '', lang: opts.lang ?? 'id', sourcePath: opts.sourcePath, assets: opts.assets ?? [],
    allowExternal: !!opts.allowExternalImages, issues: [], slots: [], toc: [], footnotes: [], blocks: [],
    stats: { words: 0, tables: 0, math: 0, images: 0, code: 0, mermaid: 0 }, headingIds: new Map(), usedIds: new Set(), aliases: new Map(), explicitIds: new Map(), ariaRefs: [], fragments: [], lastHeadingLevel: 0,
    restore: (x: string) => x, lineOffset: 0, inputId: opts.inputId ?? (opts.conversation?.editable ? 'source' : opts.conversation?.inputId) ?? 'source', offsetBase: 0, post: new Map(), assetSrc: new Map(),
    ...(opts.parts ? { parts: opts.parts } : {}),
  };
}

function messageSection(ctx: Ctx, m: Message, index: number, showRoles: boolean, opts: CoreRenderOptions): Element {
  const base = ctx.prefix;
  ctx.prefix = `${base}m${index + 1}-`;
  ctx.messageId = m.id;
  ctx.lineOffset = 0;
  ctx.headingIds = new Map();
  ctx.offsetBase = Math.max(0, m.sourceRef.end - m.markdown.length);
  ctx.lastHeadingLevel = 0;
  const { nodes } = renderOne(m.markdown, ctx);
  ctx.prefix = base;
  delete ctx.messageId;
  const label = speakerDisplay(m, ctx.lang);
  const children: ElementContent[] = [];
  if (showRoles) {
    const hdr: ElementContent[] = [{ type: 'element', tagName: 'span', properties: { className: ['pf-msg-role'] }, children: [txt(label)] }];
    if (m.timestamp) hdr.push(txt(' '), { type: 'element', tagName: 'span', properties: { className: ['pf-msg-time'] }, children: [txt(m.timestamp)] });
    children.push({ type: 'element', tagName: 'header', properties: { className: ['pf-msg-label', 'pf-ui-label'] }, children: hdr });
  }
  children.push({ type: 'element', tagName: 'div', properties: { className: ['pf-msg-body'] }, children: nodes as ElementContent[] });
  void opts;
  return { type: 'element', tagName: 'section', properties: { className: ['pf-msg', `pf-role-${m.role}`], dataRole: m.role, dataMessageId: m.id, ariaLabel: label, id: `${base}msg-${index + 1}` }, children };
}

/** Pesan terpilih sesuai selectedOrder (fallback: urutan pesan yang selected). */
export function selectedMessages(conv: Conversation): Message[] {
  const byId = new Map(conv.messages.map((m) => [m.id, m]));
  const ordered = conv.selectedOrder.length ? conv.selectedOrder.map((id) => byId.get(id)).filter((m): m is Message => !!m && m.selected) : conv.messages.filter((m) => m.selected);
  return ordered;
}

/**
 * Render isi. Mode percakapan (opts.conversation && outputMode != 'answer'): setiap pesan terpilih
 * dalam <section class="pf-msg" data-role data-message-id> dengan label pembicara tertulis.
 * Mode 'source-appendix': naskah utama + lampiran pesan terpilih.
 */
export async function renderStage1(source: string, options: RenderOptions | CoreRenderOptions): Promise<RenderStage1> {
  const opts = options as CoreRenderOptions;
  const ctx = newCtx(opts);
  const pub = opts.conversation?.publication;
  if (!ctx.parts && pub && pub.sourceLength === source.length && await sha256Hex(source) === pub.sourceHash) {
    const parts: DocumentPart[] = [];
    const prefixes = new Map<string, string>();
    let line = 1;
    for (const span of pub.spans) {
      const startLine = line;
      for (let i = span.outStart; i < span.outEnd; i++) if (source.charCodeAt(i) === 10) line++;
      if ((span.kind === 'block' || span.kind === 'message') && span.messageId) {
        const id = prefixes.get(span.messageId) ?? `m${prefixes.size + 1}`;
        prefixes.set(span.messageId, id);
        parts.push({ id, startLine, endLine: line });
      }
    }
    ctx.parts = parts;
  }
  const conv = structuredConversation(source, opts.conversation);
  let nodes: HContent[] = [];
  const t = docLabels(ctx.lang);
  if (conv && conv.outputMode !== 'answer') {
    const msgs = selectedMessages(conv);
    if (conv.outputMode === 'source-appendix') {
      ctx.usedIds.add(`${ctx.prefix}h-appendix`);
      nodes.push(...renderOne(source, ctx).nodes);
      const secs = msgs.map((m, i) => messageSection(ctx, m, i, true, opts));
      nodes.push({ type: 'element', tagName: 'section', properties: { className: ['pf-appendix'], id: `${ctx.prefix}appendix` }, children: [
        { type: 'element', tagName: 'h2', properties: { className: ['pf-appendix-title'], id: `${ctx.prefix}h-appendix` }, children: [txt(opts.appendixTitle ?? t.appendix)] }, ...secs] });
      ctx.toc.push({ id: `${ctx.prefix}h-appendix`, level: 2, text: opts.appendixTitle ?? t.appendix });
    } else {
      nodes = msgs.map((m, i) => messageSection(ctx, m, i, conv.showRoles || conv.outputMode === 'transcript', opts));
    }
    if (!msgs.length) ctx.issues.push(mkIssue('CONVERSATION_NOTHING_SELECTED', 'error', 'input', { id: 'Tidak ada pesan yang dipilih untuk diterbitkan.', en: 'No messages are selected for publishing.' }, { blocking: true }));
  } else {
    nodes = renderOne(source, ctx).nodes;
    const w = detectWrapper(source);
    if (w.kind !== 'none') ctx.issues.push(mkIssue('OUTER_FENCE', w.kind === 'single' ? 'warning' : 'info', 'input', {
      id: w.kind === 'single' ? `Seluruh naskah tampaknya terbungkus blok \`\`\`${w.info || ''} (baris ${w.openLine}–${w.closeLine}) sehingga tampil sebagai kode. Lepas pembungkus hanya bila Anda menyetujuinya.` : `Ada blok kode pembungkus yang meragukan (baris ${w.openLine}–${w.closeLine}): ${w.reason}`,
      en: w.kind === 'single' ? `The whole text seems wrapped in a \`\`\`${w.info || ''} block (lines ${w.openLine}–${w.closeLine}), so it shows as code. Unwrap only if you approve.` : `A possibly-wrapping code block exists (lines ${w.openLine}–${w.closeLine}): ${w.reasonEn}`,
    }, { line: w.openLine, detail: { repair: 'unwrap-fence' } }));
  }
  const root: HRoot = { type: 'root', children: nodes };
  resolveFragments(ctx, root);
  const html = unified().use(rehypeStringify).stringify(root);
  // karakter kendali/tak terlihat dilaporkan (tidak diubah)
  ctx.issues.push(...charIssues(analyzeChars(source)));
  // KaTeX (trust:false) dirender di tahap 1 — murni string, aman di Worker; disisipkan setelah sanitasi di tahap 2
  const slots: RenderStage1['slots'] = ctx.slots.map((s) => { const r = renderTex(s.tex, s.display); return { key: s.key, tex: s.tex, line: s.line, ok: r.ok, html: r.html, ...(r.error ? { error: r.error } : {}), ...(s.blockId ? { blockId: s.blockId } : {}), ...(s.messageId ? { messageId: s.messageId } : {}) }; });
  const scripts = detectScripts(conv && conv.outputMode !== 'answer' ? selectedMessages(conv).map((m) => m.markdown).join('\n') + source : source);
  return {
    html, post: [...ctx.post], assetSrc: [...ctx.assetSrc], slots, inputId: ctx.inputId,
    toc: ctx.toc, footnotes: ctx.footnotes, blocks: ctx.blocks, issues: ctx.issues, stats: ctx.stats, scripts, mermaidPending: ctx.stats.mermaid > 0,
    ...(ctx.frontmatter ? { frontmatter: ctx.frontmatter } : {}),
  };
}

/** Hasil tahap 1 render (tanpa DOM, dapat diklon terstruktur antar-thread). */
export interface RenderStage1 {
  html: string; post: [string, Record<string, string>][]; assetSrc: [string, string][];
  slots: { key: string; tex: string; line: number; ok: boolean; html: string; error?: string; blockId?: string; messageId?: string }[];
  inputId: string; toc: TocEntry[]; footnotes: FootnoteEntry[]; blocks: BlockInfo[]; issues: CoreIssue[];
  stats: RenderedBody['stats']; scripts: string[]; mermaidPending: boolean; frontmatter?: Frontmatter;
}

/** Tahap 2 (thread utama, butuh DOM): sanitasi akhir DOMPurify, atribut pasca-sanitasi, src aset, sisip KaTeX. */
export function finishRender(s1: RenderStage1, assets: AssetRecord[]): RenderedBody & { issues: CoreIssue[]; frontmatter?: Frontmatter } {
  const issues: CoreIssue[] = [...s1.issues];
  const { body, report } = purifyToBody(s1.html);
  for (const r of report.removed.filter((x) => !['body', 'html', 'head', '#text'].includes(x.name))) {
    issues.push(mkIssue('SECURITY_SANITIZER_REMOVED', 'info', 'security', { id: `Lapis sanitasi akhir membuang ${r.kind === 'element' ? 'elemen' : 'atribut'} "${r.name}".`, en: `The final sanitizer removed ${r.kind} "${r.name}".` }, { detail: { name: r.name } }));
  }
  const post = new Map(s1.post);
  const assetSrc = new Map(s1.assetSrc);
  const byId = new Map(assets.map((a) => [a.id, a]));
  // atribut pasca-sanitasi (kunci bernonce; nilai di-escape oleh serializer DOM)
  for (const el of Array.from(body.querySelectorAll('[data-post]'))) {
    const key = el.getAttribute('data-post') ?? '';
    el.removeAttribute('data-post');
    const attrs = post.get(key);
    if (attrs) for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    const aid = assetSrc.get(key);
    const asset = aid ? byId.get(aid) : undefined;
    if (asset && el.tagName === 'IMG') el.setAttribute('src', assetDataUrl(asset));
  }
  // isi slot rumus dengan keluaran KaTeX (trust:false) SETELAH sanitasi
  const slotMap = new Map(s1.slots.map((s) => [s.key, s]));
  for (const el of Array.from(body.querySelectorAll('[data-slot]'))) {
    const key = el.getAttribute('data-slot') ?? '';
    const s = slotMap.get(key);
    el.removeAttribute('data-slot');
    if (!s) continue;
    el.innerHTML = s.html;
    if (!s.ok) {
      el.classList.add('pf-math-error');
      const tooLong = s.error?.startsWith('MATH_TOO_LONG');
      issues.push(mkIssue(tooLong ? 'MATH_TOO_LONG' : 'MATH_PARSE_ERROR', 'error', 'math', tooLong
        ? { id: `Rumus di baris ${s.line} terlalu panjang (${s.tex.length} karakter > ${LIMITS.mathChars}); sumber ditampilkan apa adanya.`, en: `Formula at line ${s.line} is too long (${s.tex.length} chars > ${LIMITS.mathChars}); its source is shown as-is.` }
        : { id: `Rumus di baris ${s.line} tidak dapat dirender: ${s.error}. Sumber LaTeX ditampilkan apa adanya.`, en: `Formula at line ${s.line} could not be rendered: ${s.error}. The LaTeX source is shown as-is.` },
      { line: s.line, ...(s.blockId ? { blockId: s.blockId } : {}), ...(s.messageId ? { sourceRef: { inputId: s1.inputId, messageId: s.messageId, start: 0, end: 0, unit: 'utf16' as const } } : {}), detail: { tex: s.tex.slice(0, 200) } }));
    }
  }
  return {
    html: body.innerHTML, toc: s1.toc, footnotes: s1.footnotes, blocks: s1.blocks, issues: numberIssues(issues) as CoreIssue[],
    stats: s1.stats, scripts: s1.scripts, mermaidPending: s1.mermaidPending,
    ...(s1.frontmatter ? { frontmatter: s1.frontmatter } : {}),
  };
}

/**
 * Render isi lengkap (tahap 1 + tahap 2) di satu thread. Mode percakapan: setiap pesan terpilih dalam
 * <section class="pf-msg" data-role data-message-id>; mode 'source-appendix': naskah + lampiran pesan terpilih.
 */
export async function renderBody(source: string, options: RenderOptions | CoreRenderOptions): Promise<RenderedBody & { issues: CoreIssue[]; frontmatter?: Frontmatter }> {
  return finishRender(await renderStage1(source, options), (options as CoreRenderOptions).assets ?? []);
}

export type { Issue };
