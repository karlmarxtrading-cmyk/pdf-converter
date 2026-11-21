/**
 * Penyusun dokumen penuh dari Snapshot + RenderedBody (PF-024…028, HTM-03/04).
 * - transformasi struktural per templat (hanya kelas/pembungkus/label pembicara; teks isi tidak diubah)
 * - Mermaid → SVG inline lewat import malas; gagal → sumber terlihat + issue
 * - sampul, TOC <nav>, landmark semantik, lang, metadata judul/penulis
 * Membutuhkan DOMParser (peramban, atau jsdom pada tes).
 */
import type { Issue, RenderedBody, Snapshot, TocEntry } from '../core/contracts';
import { sha256Hex } from '../core/hash';
import { validateSettings, validateKit } from '../core/schema';
import { assetDataUrl } from '../core/assets';
import { APP_VERSION } from '../core/contracts';
import { BASE_CSS, continuationCss, HLJS_CSS, INK_SAVER_CSS, pageCss, templateCss, variablesCss } from './css';
import { docLabels, type DocLabels } from './labels';
import { getTemplate, resolveStyle } from './templates';
import { escapeHtml } from './util';

export type ComposeMode = 'screen' | 'print';

export interface PreparedBody {
  /** HTML isi setelah transformasi templat + Mermaid; masih tanpa sampul/TOC */ html: string;
  toc: TocEntry[]; issues: Issue[]; labels: DocLabels;
  stats: { tables: number; wideTables: number; mermaidRendered: number; mermaidFailed: number; externalImagesBlocked: number; messages: number };
}

export interface PrepareOptions {
  mode: ComposeMode;
  /** true = render Mermaid dengan import('mermaid') (perlu DOM tata letak nyata) */ renderMermaid: boolean;
  /** izinkan <img src="https:"> (hanya profil publikasi "online") */ allowExternalImages: boolean;
}

const parser = (): DOMParser => {
  const P = (globalThis as { DOMParser?: typeof DOMParser }).DOMParser;
  if (!P) throw new Error('DOMParser tidak tersedia: modul render dokumen butuh lingkungan DOM.');
  return new P();
};

const CALLOUT_RE = /^(konsep|definisi|teorema|contoh(?: soal)?|latihan|soal|catatan|rangkuman|ringkasan|tujuan(?: belajar)?|concept|definition|theorem|example|exercise|practice|note|summary|goals?|objectives?)\b/i;
const calloutKind = (label: string): string => {
  const l = label.toLowerCase();
  if (/^(contoh|example)/.test(l)) return 'example';
  if (/^(latihan|soal|exercise|practice)/.test(l)) return 'exercise';
  if (/^(catatan|note)/.test(l)) return 'note';
  if (/^(rangkuman|ringkasan|summary)/.test(l)) return 'summary';
  return 'concept';
};
const SUMMARY_RE = /^(ringkasan(?: eksekutif)?|ikhtisar(?: eksekutif)?|executive summary|summary)\s*[:.]?$/i;
const METRICS_RE = /^(metrik(?: utama)?|angka kunci|indikator utama|key (?:metrics|figures)|metrics|highlights)\s*[:.]?$/i;

const headingLevel = (el: Element): number => (/^H[1-6]$/.test(el.tagName) ? Number(el.tagName[1]) : 0);

/** Transformasi struktural; mengembalikan issue. Tidak pernah mengubah teks isi. */
export function transformBody(root: HTMLElement, snapshot: Snapshot, opts: PrepareOptions, labels: DocLabels): { issues: Issue[]; stats: PreparedBody['stats'] } {
  const doc = root.ownerDocument;
  const t = snapshot.settings.template;
  const cap = getTemplate(t).capabilities;
  const issues: Issue[] = [];
  const stats = { tables: 0, wideTables: 0, mermaidRendered: 0, mermaidFailed: 0, externalImagesBlocked: 0, messages: 0 };

  // Tabel: wadah gulir berlabel (layar) — HTM-03
  root.querySelectorAll('table').forEach((table) => {
    stats.tables++;
    let wrap = table.parentElement;
    if (!wrap || !wrap.classList.contains('pf-table-wrap')) {
      wrap = doc.createElement('div'); wrap.className = 'pf-table-wrap';
      table.replaceWith(wrap); wrap.appendChild(table);
    }
    const cols = Math.max(0, ...[...table.rows].map((r) => [...r.cells].reduce((n, c) => n + (Number(c.getAttribute('colspan')) || 1), 0)));
    wrap.setAttribute('data-cols', String(cols));
    if (opts.mode === 'screen') {
      wrap.setAttribute('role', 'region'); wrap.setAttribute('tabindex', '0');
      wrap.setAttribute('aria-label', labels.table(stats.tables, table.caption?.textContent?.trim() || undefined));
    }
    if (cols >= 7) stats.wideTables++;
    // baris pertama berisi <th> tanpa <thead> → tetap dibiarkan; header berulang hanya untuk <thead> nyata
  });
  // Kode: gulir lokal yang dapat dicapai keyboard
  root.querySelectorAll('pre').forEach((pre) => {
    if (pre.classList.contains('pf-mermaid')) return;
    const code = pre.querySelector('code');
    const lang = pre.getAttribute('data-lang') ?? /(?:^|\s)language-([\w+#.-]+)/.exec(code?.className ?? '')?.[1];
    if (lang && !pre.hasAttribute('data-lang') && lang !== 'text' && lang !== 'plaintext') pre.setAttribute('data-lang', lang);
    if (opts.mode === 'screen') { pre.setAttribute('tabindex', '0'); if (!pre.hasAttribute('aria-label')) pre.setAttribute('aria-label', lang ? `${labels.code} ${lang}` : labels.code); }
  });
  // Rumus display: wadah dengan gulir lokal
  root.querySelectorAll('.katex-display').forEach((k) => {
    let box = k.parentElement;
    if (!box || !box.classList.contains('pf-math-block')) {
      box = doc.createElement('div'); box.className = 'pf-math-block'; k.replaceWith(box); box.appendChild(k);
    }
    if (opts.mode === 'screen') { box.setAttribute('tabindex', '0'); box.setAttribute('role', 'region'); box.setAttribute('aria-label', labels.math); }
  });
  // Gambar eksternal pada keluaran luring
  root.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src') ?? '';
    if (/^(data:|blob:)/i.test(src)) { img.setAttribute('decoding', 'sync'); return; }
    if (opts.allowExternalImages && /^https:\/\//i.test(src)) { img.setAttribute('referrerpolicy', 'no-referrer'); img.setAttribute('loading', opts.mode === 'screen' ? 'lazy' : 'eager'); return; }
    stats.externalImagesBlocked++;
    const alt = img.getAttribute('alt') ?? '';
    const ph = doc.createElement('span'); ph.className = 'pf-missing-asset'; ph.setAttribute('role', 'img');
    ph.setAttribute('data-pf-generated', ''); ph.textContent = labels.externalImage(alt);
    img.replaceWith(ph);
  });
  if (stats.externalImagesBlocked) issues.push({ id: 'render-external-images', code: 'EXTERNAL_IMAGE_EXCLUDED', severity: 'warning', scope: 'asset', message: `${stats.externalImagesBlocked} gambar eksternal tidak disertakan karena keluaran ini luring/mandiri. Unggah salinan gambar atau pilih profil publikasi "online".` });

  // Pesan percakapan: label pembicara selalu tertulis (CON-01 dan templat lain)
  const msgs = new Map((snapshot.conversation?.messages ?? []).map((m) => [m.id, m]));
  root.querySelectorAll('section.pf-msg').forEach((sec) => {
    stats.messages++;
    const role = (sec.getAttribute('data-role') ?? 'unknown') as keyof DocLabels['role'];
    const converted = sec.hasAttribute('data-published');
    const m = converted ? undefined : msgs.get(sec.getAttribute('data-message-id') ?? '');
    const c = snapshot.conversation;
    const visible = converted ? sec.getAttribute('data-show-roles') === 'true' : !c || c.showRoles || c.outputMode === 'transcript' || c.outputMode === 'source-appendix';
    // label dari core (header.pf-msg-label > .pf-msg-role) diutamakan; bila tidak ada, ditulis di sini
    let head = sec.querySelector(':scope > .pf-msg-speaker, :scope > header.pf-msg-label');
    const coreLabel = head?.querySelector('.pf-msg-role')?.textContent?.trim();
    const label = coreLabel || (converted && head?.textContent?.trim()) || m?.speakerLabel?.trim() || labels.role[role] || labels.role.unknown;
    if (visible) sec.setAttribute('data-speaker', label);
    else sec.removeAttribute('data-speaker');
    if (m) sec.setAttribute('data-role-confidence', m.roleConfidence);
    if (!sec.hasAttribute('aria-label')) sec.setAttribute('aria-label', label);
    if (head && !head.classList.contains('pf-msg-speaker')) {
      head.classList.add('pf-msg-speaker');
      head.querySelector('.pf-msg-time')?.classList.add('pf-msg-meta');
      if (m && (m.roleConfidence === 'low' || m.roleConfidence === 'unknown') && !head.querySelector('.pf-msg-unconfirmed')) {
        const s = doc.createElement('span'); s.className = 'pf-msg-meta pf-msg-unconfirmed'; s.setAttribute('data-pf-generated', ''); s.textContent = labels.roleUnconfirmed; head.appendChild(s);
      }
    }
    if (visible && !head) {
      head = doc.createElement('header'); head.className = 'pf-msg-speaker'; head.setAttribute('data-pf-generated', '');
      head.textContent = label;
      const meta: string[] = [];
      if (m?.timestamp) meta.push(m.timestamp); // hanya bila ada di sumber
      if (m && (m.roleConfidence === 'low' || m.roleConfidence === 'unknown')) meta.push(labels.roleUnconfirmed);
      if (meta.length) { const s = doc.createElement('span'); s.className = 'pf-msg-meta'; s.textContent = meta.join(' · '); head.appendChild(s); }
      sec.insertBefore(head, sec.firstChild);
    }
    let bodyEl = sec.querySelector(':scope > .pf-msg-body');
    if (!bodyEl) {
      bodyEl = doc.createElement('div'); bodyEl.className = 'pf-msg-body';
      for (const n of [...sec.childNodes]) if (n !== head) bodyEl.appendChild(n);
      sec.appendChild(bodyEl);
    }
    if (visible && cap.speakerGutter) {
      for (const child of [...bodyEl.children]) {
        const isTable = child.classList.contains('pf-table-wrap') && Number(child.getAttribute('data-cols')) >= 4;
        const isCode = child.tagName === 'PRE' && (child.textContent ?? '').split('\n').some((l) => l.length > 62);
        if (isTable || isCode) { child.classList.add('pf-wide'); child.setAttribute('data-speaker-note', `${label} · ${isTable ? labels.wideTable : labels.wideCode}`); }
      }
    }
  });

  // EDU-01: callout HANYA dari penandaan pengguna (blockquote berlabel tebal / heading berlabel)
  if (cap.callouts) {
    root.querySelectorAll('blockquote').forEach((bq) => {
      const first = bq.firstElementChild;
      const strong = first?.tagName === 'P' ? first.firstElementChild : null;
      if (!strong || !/^(STRONG|B)$/.test(strong.tagName) || first!.firstChild !== strong) return;
      const m = CALLOUT_RE.exec((strong.textContent ?? '').trim());
      if (!m) return;
      bq.classList.add('pf-callout', `pf-callout-${calloutKind(m[1]!)}`);
      strong.classList.add('pf-callout-label');
    });
    root.querySelectorAll('h3, h4, h5').forEach((h) => {
      const m = CALLOUT_RE.exec((h.textContent ?? '').trim());
      if (m) h.classList.add('pf-label-heading', `pf-kind-${calloutKind(m[1]!)}`);
    });
  }
  // BUS-01: panel ringkasan (heading berlabel) + kartu metrik dari daftar bertanda — tanpa memindah urutan isi
  if (cap.summaryPanel) {
    const h = [...root.querySelectorAll('h1, h2')].find((e) => SUMMARY_RE.test((e.textContent ?? '').trim()));
    if (h && h.parentElement) {
      const lvl = headingLevel(h);
      const sec = doc.createElement('section'); sec.className = 'pf-summary';
      if (h.id) sec.setAttribute('aria-labelledby', h.id);
      h.before(sec);
      let n: Element | null = h;
      while (n) { const next: Element | null = n.nextElementSibling; sec.appendChild(n); if (!next || (headingLevel(next) && headingLevel(next) <= lvl)) break; n = next; }
    }
  }
  if (cap.metricCards) {
    root.querySelectorAll('ul').forEach((ul) => {
      const prev = ul.previousElementSibling;
      if (!prev || !METRICS_RE.test((prev.textContent ?? '').trim())) return;
      const items = [...ul.children];
      if (items.length < 2 || items.length > 6) return;
      const ok = items.every((li) => { const f = li.firstElementChild?.tagName === 'P' ? li.firstElementChild.firstElementChild : li.firstElementChild; return !!f && /^(STRONG|B)$/.test(f.tagName) && (f.parentElement!.firstChild === f); });
      if (ok) ul.classList.add('pf-metrics');
    });
  }
  // EDT-01: indentasi paragraf lanjutan sebagai kelas (selektor saudara "p + p" tidak andal setelah Paged.js)
  if (cap.chapterOpeners) root.querySelectorAll('p').forEach((p) => { if (p.previousElementSibling?.tagName === 'P' && p.parentElement?.tagName !== 'LI') p.classList.add('pf-indent'); });
  // Bab: pembuka bab (EDT-01) dan pemutus bab (semua templat bila dipilih)
  const h1s = [...root.querySelectorAll('h1')].filter((h) => !h.closest('.pf-msg'));
  h1s.forEach((h, i) => {
    if (cap.chapterOpeners) {
      h.classList.add('pf-chapter-opener');
      const p = h.nextElementSibling; if (p?.tagName === 'P') p.classList.add('pf-chapter-first');
    }
    if (snapshot.settings.chapterBreak && i > 0) h.classList.add('pf-ch-break');
  });
  return { issues, stats };
}

/** Mermaid → SVG inline. Gagal/tidak tersedia → sumber tetap terlihat + issue (tidak pernah gambar kosong). */
export async function renderMermaid(root: HTMLElement, opts: { enabled: boolean; labels: DocLabels; idPrefix?: string }): Promise<{ issues: Issue[]; rendered: number; failed: number }> {
  const blocks = [...root.querySelectorAll('pre.pf-mermaid')];
  const issues: Issue[] = [];
  let rendered = 0, failed = 0;
  if (!blocks.length) return { issues, rendered, failed };
  const doc = root.ownerDocument;
  type MermaidApi = { initialize(c: object): void; render(id: string, src: string): Promise<{ svg: string }> };
  let mermaid: MermaidApi | null = null; let loadError = '';
  if (opts.enabled) {
    try {
      mermaid = ((await import('mermaid')) as unknown as { default: MermaidApi }).default;
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral', htmlLabels: false, flowchart: { htmlLabels: false }, fontFamily: 'Inter, Arial, sans-serif', deterministicIds: true, deterministicIDSeed: opts.idPrefix ?? 'pf' });
    } catch (e) { loadError = (e as Error).message; }
  }
  let i = 0;
  for (const pre of blocks) {
    i++;
    const src = pre.getAttribute('data-src') ?? pre.textContent ?? '';
    const fig = doc.createElement('figure');
    fig.setAttribute('data-pf-mermaid', String(i));
    let ok = false; let reason = loadError || (opts.enabled ? '' : 'renderer tidak aktif di lingkungan ini');
    if (mermaid) {
      try {
        const { svg } = await mermaid.render(`${opts.idPrefix ?? 'pf'}-mmd-${i}`, src);
        if (!/<svg[\s>]/.test(svg)) throw new Error('SVG kosong');
        fig.className = 'pf-mermaid pf-mermaid-ok';
        fig.innerHTML = svg;
        const svgEl = fig.querySelector('svg');
        svgEl?.setAttribute('role', 'img');
        svgEl?.removeAttribute('style'); // max-width inline Mermaid diganti CSS dokumen (rasio dipertahankan)
        ok = true; rendered++;
      } catch (e) { reason = (e as Error).message.split('\n')[0]!.slice(0, 200); }
      doc.querySelectorAll(`#d${opts.idPrefix ?? 'pf'}-mmd-${i}, #${opts.idPrefix ?? 'pf'}-mmd-${i}`).forEach((n) => { if (!fig.contains(n)) n.remove(); });
    }
    if (!ok) {
      failed++;
      fig.className = 'pf-mermaid pf-mermaid-failed';
      const cap = doc.createElement('figcaption'); cap.setAttribute('data-pf-generated', '');
      cap.textContent = opts.enabled ? opts.labels.diagramFailed : opts.labels.diagramNotRendered;
      const p = doc.createElement('pre'); p.className = 'pf-mermaid-source'; p.setAttribute('data-lang', 'mermaid');
      const c = doc.createElement('code'); c.textContent = src; p.appendChild(c);
      fig.append(cap, p);
      issues.push({ id: `mermaid-${i}`, code: opts.enabled ? 'MERMAID_RENDER_FAILED' : 'MERMAID_NOT_RENDERED', severity: 'warning', scope: 'structure', blockId: pre.getAttribute('data-block-id') ?? undefined, message: `Diagram Mermaid #${i} ditampilkan sebagai sumber (${reason}). Hasil visual yang diinginkan belum terpenuhi.` });
    }
    pre.replaceWith(fig);
  }
  return { issues, rendered, failed };
}

/** Add transcript layout to the exact composition addressed by the provenance map.
 * All text and figures come from the rendered editor source. Editing it invalidates old offsets.
 */
async function groupPublishedMessages(root: HTMLElement, snapshot: Snapshot, body: RenderedBody): Promise<void> {
  const pub = snapshot.conversation?.publication;
  if (!pub || !['transcript', 'selected-messages', 'source-appendix'].includes(pub.mode) ||
      pub.sourceLength !== snapshot.source.length || await sha256Hex(snapshot.source) !== pub.sourceHash) return;
  const blocks = new Map(body.blocks.map(b => [b.id, b]));
  let index = 0;
  let section: HTMLElement | undefined;
  for (const node of [...root.childNodes]) {
    if (node.nodeType !== 1) {
      if (node.textContent?.trim()) section = undefined;
      continue;
    }
    const child = node as Element;
    const offset = blocks.get(child.getAttribute('data-block-id') ?? '')?.sourceRef?.start;
    if (offset === undefined) { section = undefined; continue; }
    while (index < pub.spans.length && pub.spans[index]!.outEnd <= offset) index++;
    const span = pub.spans[index];
    if (!span?.messageId || !span.role || (span.kind !== 'label' && span.kind !== 'message')) { section = undefined; continue; }
    if (!section || section.dataset.messageId !== span.messageId) {
      section = root.ownerDocument.createElement('section');
      section.className = 'pf-msg';
      section.dataset.published = '';
      section.dataset.messageId = span.messageId;
      section.dataset.role = span.role;
      if (span.roleConfidence) section.dataset.roleConfidence = span.roleConfidence;
      section.dataset.showRoles = String(span.kind === 'label');
      child.before(section);
    }
    if (span.kind === 'label') {
      child.classList.add('pf-msg-speaker');
      section.setAttribute('aria-label', child.textContent?.trim() ?? span.role);
    }
    section.appendChild(child);
  }
}

export async function prepareBody(snapshot: Snapshot, body: RenderedBody, opts: PrepareOptions): Promise<PreparedBody> {
  const labels = docLabels(snapshot.settings.contentLang);
  const doc = parser().parseFromString(`<!doctype html><html><body><div id="pf-root">${body.html}</div></body></html>`, 'text/html');
  const root = doc.getElementById('pf-root') as HTMLElement;
  await groupPublishedMessages(root, snapshot, body);
  const m = await renderMermaid(root, { enabled: opts.renderMermaid, labels, idPrefix: `pf${snapshot.revision}x${Math.random().toString(36).slice(2, 8)}` }); // EN-007: ID unik per job (pratinjau dan cetak dapat berjalan bersamaan)
  const t = transformBody(root, snapshot, opts, labels);
  return { html: root.innerHTML, toc: body.toc, issues: [...m.issues, ...t.issues], labels, stats: { ...t.stats, mermaidRendered: m.rendered, mermaidFailed: m.failed } };
}

/* ------------------------------ kerangka dokumen ------------------------------ */

let katexCssCache: string | null = null;
/** CSS KaTeX tanpa @font-face (font didaftarkan oleh resolver, hanya yang diperlukan). */
export async function katexCss(): Promise<string> {
  if (katexCssCache !== null) return katexCssCache;
  const raw = ((await import('katex/dist/katex.min.css?raw')) as { default: string }).default;
  katexCssCache = raw.replace(/@font-face\{[^}]*\}/g, '');
  return katexCssCache;
}

export function logoDataUrl(snapshot: Snapshot): string | undefined {
  const id = snapshot.brandKit?.logoAssetId;
  const a = id ? snapshot.assets.find((x) => x.id === id) : undefined;
  if (!a || !/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(a.mime)) return undefined;
  return assetDataUrl(a);
}

export function tocEntries(toc: TocEntry[], depth: number): TocEntry[] {
  const list = toc.filter((e) => e.level <= depth);
  return list.length >= 2 ? list : [];
}

export function tocHtml(toc: TocEntry[], depth: number, mode: ComposeMode, labels: DocLabels): string {
  const list = tocEntries(toc, depth);
  if (!list.length) return '';
  const min = Math.min(...list.map((e) => e.level));
  const items = list.map((e) => `<li class="pf-toc-l${e.level - min + 1}"><a href="#${escapeHtml(e.id)}"><span class="pf-toc-text">${escapeHtml(e.text)}</span>${mode === 'print' ? `<span class="pf-toc-dots" aria-hidden="true"></span><span class="pf-toc-page" data-target="${escapeHtml(e.id)}"></span>` : ''}</a></li>`).join('');
  if (mode === 'screen') return `<nav class="pf-toc pf-screen-nav" aria-labelledby="pf-toc-title" data-pf-generated=""><details class="pf-nav" open><summary id="pf-toc-title">${escapeHtml(labels.toc)}</summary><ol>${items}</ol></details></nav>`;
  return `<nav class="pf-toc" aria-labelledby="pf-toc-title" data-pf-generated=""><h2 id="pf-toc-title" class="pf-toc-title">${escapeHtml(labels.toc)}</h2><ol>${items}</ol></nav>`;
}

function coverHtml(snapshot: Snapshot, labels: DocLabels, logo?: string): string {
  const s = snapshot.settings; const st = resolveStyle(s, snapshot.brandKit);
  if (!s.cover) return '';
  const by = [s.author].filter(Boolean).map((x) => `<span>${escapeHtml(x!)}</span>`).join('');
  return `<header class="pf-cover" data-pf-generated="" aria-label="${escapeHtml(labels.cover)}"><div class="pf-cover-inner">`
    + (st.orgName ? `<p class="pf-cover-kind">${escapeHtml(st.orgName)}</p>` : '')
    + `<p class="pf-cover-title" role="heading" aria-level="1">${escapeHtml(s.title || '')}</p>`
    + (s.subtitle ? `<p class="pf-cover-subtitle">${escapeHtml(s.subtitle)}</p>` : '')
    + (by ? `<div class="pf-cover-by">${by}</div>` : '')
    + (s.dateText ? `<p class="pf-cover-date">${escapeHtml(s.dateText)}</p>` : '')
    + (logo ? `<div class="pf-cover-foot"><img class="pf-logo" src="${logo}" alt="${escapeHtml(st.orgName ?? st.brandName ?? '')}"></div>` : '')
    + `</div></header>`;
}

function titleBlockHtml(snapshot: Snapshot, bodyHtml: string, logo?: string): string {
  const s = snapshot.settings; const st = resolveStyle(s, snapshot.brandKit);
  if (s.cover) return '';
  // judul tidak diulang bila isi sudah dibuka dengan H1 yang sama (mencegah judul/sampul ganda)
  const firstH1 = /^\s*(?:<[^>]+>\s*)*?<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(bodyHtml);
  const norm = (x: string) => x.replace(/<[^>]+>/g, '').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const showTitle = !!s.title && !(firstH1 && norm(firstH1[1]!) === norm(escapeHtml(s.title)));
  const brand = logo || st.orgName ? `<p class="pf-brandline">${logo ? `<img class="pf-logo" src="${logo}" alt="${escapeHtml(st.orgName ?? st.brandName ?? '')}">` : ''}${st.orgName ? `<span>${escapeHtml(st.orgName)}</span>` : ''}</p>` : '';
  const by = [s.author, s.dateText].filter(Boolean).map((x) => escapeHtml(x!)).join(' · ');
  const parts = [brand, showTitle ? `<p class="pf-titleblock-title" role="heading" aria-level="1">${escapeHtml(s.title)}</p>` : '', s.subtitle ? `<p class="pf-titleblock-sub">${escapeHtml(s.subtitle)}</p>` : '', by ? `<p class="pf-titleblock-by">${by}</p>` : ''].filter(Boolean);
  return parts.length ? `<header class="pf-titleblock" data-pf-generated="">${parts.join('')}</header>` : '';
}

export interface Styles { css: string[]; inline: string }
/** Lembar gaya dokumen berurutan (tanpa font). */
export async function documentStyles(snapshot: Snapshot, mode: ComposeMode, withKatex: boolean): Promise<string[]> {
  validateSettings(snapshot.settings);
  if (snapshot.brandKit) validateKit(snapshot.brandKit, snapshot.assets);
  const s = snapshot.settings;
  const labels = docLabels(s.contentLang);
  const out = [BASE_CSS, HLJS_CSS, templateCss(s.template), variablesCss({ settings: s, brandKit: snapshot.brandKit, mode, uiLabels: { cont: labels.cont } })];
  if (withKatex) out.unshift(await katexCss());
  if (s.inkSaver) out.push(INK_SAVER_CSS);
  if (mode === 'print') out.push(pageCss(s, snapshot.brandKit), continuationCss(labels.cont));
  out.push(`.pf-cover{font-family:var(--pf-body-font);color:var(--pf-ink);}.pf-screen .pf-cover{font-size:clamp(1rem,calc(.96rem + .3vw),1.125rem);line-height:var(--pf-leading);}.pf-screen .pf-toc{font-family:var(--pf-body-font);}`);
  return out;
}

export interface ComposeOptions {
  mode: ComposeMode; prepared: PreparedBody; fontCss: string;
  /** body class tambahan (pf-adaptive untuk ekspor layar) */ adaptive?: boolean;
  csp?: string; extraHead?: string; script?: string;
  /** halaman gaya eksternal (zip/publikasi) alih-alih <style> inline */ stylesheetHref?: string; fontStylesheetHref?: string;
}

export interface ComposedDocument { html: string; styles: string[]; bodyInner: string; bodyClass: string; lang: string; title: string }

export async function composeDocument(snapshot: Snapshot, o: ComposeOptions): Promise<ComposedDocument> {
  const s = snapshot.settings; const labels = o.prepared.labels;
  const withKatex = /class="[^"]*\bkatex\b/.test(o.prepared.html);
  const styles = await documentStyles(snapshot, o.mode, withKatex);
  const logo = logoDataUrl(snapshot);
  const lang = escapeHtml(s.contentLang || 'id');
  const title = s.title || (o.prepared.toc[0]?.text ?? 'PaperForma');
  const tpl = getTemplate(s.template);
  const toc = s.toc ? tocHtml(o.prepared.toc, s.tocDepth, o.mode, labels) : '';
  const st = resolveStyle(s, snapshot.brandKit);
  const foot = o.mode === 'screen' && (st.footerText || s.footer.trim()) ? `<footer class="pf-docfoot" data-pf-generated="">${logo ? `<img class="pf-logo" src="${logo}" alt="">` : ''}<span>${escapeHtml((s.footer.trim() || st.footerText || '').replace(/\{(title|chapter|author|org|date)\}/g, (_m, k: string) => (k === 'title' ? s.title : k === 'author' ? s.author ?? '' : k === 'org' ? st.orgName ?? '' : k === 'date' ? s.dateText ?? '' : '')))}</span></footer>` : '';
  const bodyClass = ['pf-body', o.mode === 'print' ? 'pf-print' : 'pf-screen', o.adaptive ? 'pf-adaptive' : '', s.inkSaver ? 'pf-ink-saver' : ''].filter(Boolean).join(' ');
  const bodyInner = (o.mode === 'screen' ? `<a class="pf-skip" href="#pf-content">${escapeHtml(labels.skip)}</a>\n` : '')
    + `<main class="pf-main pf-tmain-${s.template}">\n${coverHtml(snapshot, labels, logo)}\n`
    + `<article class="pf-doc pf-t-${s.template}" id="pf-content" data-template="${s.template}" tabindex="-1">\n${titleBlockHtml(snapshot, o.prepared.html, logo)}\n${toc}\n${o.prepared.html}\n</article>\n${foot}\n</main>`;
  const meta = [
    `<meta charset="utf-8">`, `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    o.csp ? `<meta http-equiv="Content-Security-Policy" content="${o.csp.replace(/[&"<>]/g, "")}">` : '',
    `<title>${escapeHtml(title)}</title>`,
    s.author ? `<meta name="author" content="${escapeHtml(s.author)}">` : '',
    `<meta name="generator" content="PaperForma ${APP_VERSION} (${tpl.id} v${tpl.version}, rev ${snapshot.revision})">`,
    `<meta name="color-scheme" content="${o.adaptive ? 'light dark' : 'light'}">`,
    o.extraHead ?? '',
  ].filter(Boolean).join('\n');
  const rawStyle = (css: string) => css.replace(/</g, '\\3c ');
  const styleTags = o.stylesheetHref
    ? `${o.fontStylesheetHref ? `<link rel="stylesheet" href="${o.fontStylesheetHref}">` : ''}<link rel="stylesheet" href="${o.stylesheetHref}">`
    : `<style data-pf="fonts">${rawStyle(o.fontCss)}</style>\n${styles.map((c, i) => `<style data-pf="s${i}">${rawStyle(c)}</style>`).join('\n')}`;
  const html = `<!doctype html>\n<html lang="${lang}">\n<head>\n${meta}\n${styleTags}\n</head>\n<body class="${bodyClass}">\n${bodyInner}\n${o.script ? `<script data-pf-enhancement="copy-code">${o.script}</script>` : ''}\n</body>\n</html>\n`;
  return { html, styles, bodyInner, bodyClass, lang, title };
}
