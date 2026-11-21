/**
 * Preflight kualitas (04 §8) dan kelengkapan aset untuk PDF (PF-014, CODE-09).
 * Empat status: Siap / Perlu diperiksa / Perlu diperbaiki / Belum diperiksa — dengan cakupan per kategori.
 * "Tidak ada masalah" TIDAK sama dengan "semua aspek diperiksa": kategori yang belum dijalankan tetap "Belum diperiksa".
 */
import type { Issue, RenderedBody, Snapshot } from './contracts';
import type { Element, Root as HtmlRoot } from 'hast';
import type { Nodes } from 'mdast';
import { DROP_WITH_CONTENT } from './sanitize';
import { structuredConversation } from './conversation';
import { parseMarkdown } from './markdown';
import { restorerFor } from './math';
import { parseHtmlWithinBudget } from './html';
import { BudgetError } from './limits';
import { resolveAsset, type AssetPreflight, type ExternalImageRef } from './assets';
import type { IntegrityReport } from './integrity';

export type PreflightStatus = 'ready' | 'review' | 'fix' | 'unchecked';
export const PREFLIGHT_LABELS: Record<PreflightStatus, { id: string; en: string }> = {
  ready: { id: 'Siap', en: 'Ready' },
  review: { id: 'Perlu diperiksa', en: 'Needs review' },
  fix: { id: 'Perlu diperbaiki', en: 'Needs fixing' },
  unchecked: { id: 'Belum diperiksa', en: 'Not checked' },
};

export type PreflightCategory = 'input' | 'math' | 'table' | 'asset' | 'structure' | 'integrity' | 'security' | 'font' | 'layout' | 'pdf';
const COVERAGE: Record<PreflightCategory, { id: string; en: string }> = {
  input: { id: 'Ukuran input, pembungkus, label percakapan', en: 'Input size, wrappers, conversation labels' },
  math: { id: 'Sintaks rumus (KaTeX); bukan kebenaran matematis', en: 'Formula syntax (KaTeX); not mathematical correctness' },
  table: { id: 'Jumlah sel per baris, ukuran tabel', en: 'Cells per row, table size' },
  asset: { id: 'Gambar dirujuk tersedia lokal; gambar eksternal', en: 'Referenced images available locally; external images' },
  structure: { id: 'Judul, catatan kaki, sitasi', en: 'Headings, footnotes, citations' },
  integrity: { id: 'Keutuhan format berurutan sumber → keluaran; bukan kebenaran fakta', en: 'Ordered format integrity source → output; not factual correctness' },
  security: { id: 'Elemen/atribut aktif yang dibuang', en: 'Active elements/attributes removed' },
  font: { id: 'Cakupan glyph font (oleh lapisan render)', en: 'Font glyph coverage (render layer)' },
  layout: { id: 'Tata halaman: potongan, overflow, TOC (oleh lapisan render)', en: 'Page layout: clipping, overflow, TOC (render layer)' },
  pdf: { id: 'Struktur PDF dan pemeriksaan visual (oleh lapisan ekspor)', en: 'PDF structure and visual checks (export layer)' },
};

export interface CategoryResult { category: PreflightCategory; status: PreflightStatus; checked: boolean; coverage: { id: string; en: string }; issues: Issue[]; counts: { error: number; warning: number; info: number } }
/**
 * Target keluaran (EN-002, statis 3.0):
 *  - 'html'  : HTML mandiri / ZIP / publikasi — butuh font diperiksa, tidak butuh layout halaman.
 *  - 'print' : Cetak / Simpan PDF lewat dialog browser — butuh font + layout (paginasi nyata) + aset lengkap.
 *              Tidak mensyaratkan kategori 'pdf' karena byte PDF dibuat dialog cetak dan tidak teramati aplikasi.
 *  - 'pdf'   : berkas PDF berbasis byte — hanya untuk mesin yang benar-benar menghasilkan byte; tidak dipakai UI statis.
 */
export type PreflightTarget = 'html' | 'print' | 'pdf';
export interface ReportIdentity { projectId: string; revision: number; renderInputHash: string; layoutJobId?: string }
export interface PreflightReport { status: PreflightStatus; label: { id: string; en: string }; categories: CategoryResult[]; stale: boolean; target: PreflightTarget; assets: AssetPreflight; identity?: ReportIdentity }

export interface PreflightOptions {
  target?: PreflightTarget;
  /** identitas revisi yang diperiksa; disalin ke laporan agar status "Siap" terikat revisi/target */
  identity?: ReportIdentity;
  integrity?: IntegrityReport;
  /** hasil pemeriksaan lapisan lain (font/layout/pdf); kategori tanpa hasil = Belum diperiksa */
  external?: Partial<Record<'font' | 'layout' | 'pdf', Issue[]>>;
  /** renderInputHash saat renderedBody dihasilkan; berbeda dengan snapshot → usang */
  renderedForHash?: string;
}

interface ImageRef { url: string; alt: string; line: number }

function imageReferences(source: string): ImageRef[] {
  const parsed = parseMarkdown(source);
  const tree = parsed.tree;
  const restore = restorerFor(parsed.scan);
  const definitions = new Map<string, string>();
  const collect = (n: Nodes) => {
    if (n.type === 'definition' && !definitions.has(n.identifier)) definitions.set(n.identifier, restore(n.url));
    if ('children' in n) n.children.forEach(collect);
  };
  collect(tree);
  const images: ImageRef[] = [];
  const visit = (n: Nodes) => {
    const line = n.position?.start.line ?? 0;
    if (n.type === 'image') images.push({ url: restore(n.url), alt: restore(n.alt ?? ''), line });
    if (n.type === 'imageReference') {
      const url = definitions.get(n.identifier);
      if (url !== undefined) images.push({ url, alt: restore(n.alt ?? ''), line });
    }
    if (n.type === 'html' && /<img\b/i.test(n.value)) {
      const parsedHtml = parseHtmlWithinBudget(restore(n.value));
      if (!parsedHtml.ok) throw new BudgetError(parsedHtml.budget);
      const html = parsedHtml.tree;
      const raw = (parent: HtmlRoot | Element) => {
        for (const el of parent.children) {
          if (el.type !== 'element' || DROP_WITH_CONTENT.has(el.tagName)) continue;
          if (el.tagName === 'img') images.push({ url: String(el.properties.src ?? ''), alt: String(el.properties.alt ?? ''), line: line + (el.position?.start.line ?? 1) - 1 });
          else raw(el);
        }
      };
      raw(html);
    }
    if ('children' in n) n.children.forEach(visit);
  };
  visit(tree);
  return images;
}

export function listExternalImages(source: string, assets: Snapshot['assets'] = []): ExternalImageRef[] {
  return imageReferences(source).filter(ref => /^https?:\/\//i.test(ref.url)).map(ref => ({
    ...ref, resolvedAssetId: resolveAsset(assets, ref.url)?.id,
  }));
}

export function assetPreflight(snapshot: Pick<Snapshot, 'source' | 'sourcePath' | 'assets' | 'conversation'>): AssetPreflight {
  const conv = structuredConversation(snapshot.source, snapshot.conversation);
  const sources = conv && conv.outputMode !== 'answer'
    ? [...(conv.outputMode === 'source-appendix' ? [snapshot.source] : []), ...conv.messages.filter(m => m.selected).map(m => m.markdown)]
    : [snapshot.source];
  const resolved: string[] = []; const missing: { path: string; line: number }[] = []; let total = 0;
  const external: ExternalImageRef[] = [];
  for (const src of sources) {
    for (const ref of imageReferences(src)) {
      const asset = resolveAsset(snapshot.assets, ref.url, snapshot.sourcePath);
      if (/^https?:\/\//i.test(ref.url)) external.push({ ...ref, resolvedAssetId: asset?.id });
      else if (!/^data:/i.test(ref.url)) {
        total++;
        if (asset) resolved.push(ref.url);
        else missing.push({ path: ref.url, line: ref.line });
      }
    }
  }
  total += external.length;
  const unresolvedExternal = external.filter((e) => !e.resolvedAssetId);
  const complete = missing.length === 0 && unresolvedExternal.length === 0;
  return {
    complete, total, resolved: [...resolved, ...external.filter((e) => e.resolvedAssetId).map((e) => e.url)], missing, external, unresolvedExternal,
    message: complete ? `Semua ${total} gambar tersedia secara lokal.` : `${missing.length} gambar lokal belum diunggah dan ${unresolvedExternal.length} gambar eksternal belum memiliki salinan; PDF tidak boleh dinyatakan lengkap.`,
    messageEn: complete ? `All ${total} images are available locally.` : `${missing.length} local images are not uploaded and ${unresolvedExternal.length} external images have no copy; the PDF must not be reported complete.`,
  };
}

/**
 * Memetakan issue ke empat status. Kategori core (input/math/table/asset/structure/security) dianggap diperiksa
 * oleh renderBody; integrity diperiksa hanya bila laporan diberikan; font/layout/pdf hanya bila hasil eksternal diberikan.
 */
export function preflight(snapshot: Pick<Snapshot, 'source' | 'sourcePath' | 'assets' | 'conversation' | 'renderInputHash'>, rendered: Pick<RenderedBody, 'issues'> | null, opts: PreflightOptions & { assets?: AssetPreflight } = {}): PreflightReport {
  const target = opts.target ?? 'pdf';
  const stale = !rendered || (opts.renderedForHash !== undefined && opts.renderedForHash !== snapshot.renderInputHash);
  // daftar rujukan gambar dapat dihitung di Worker (MESIN-36) untuk snapshot yang sama
  const assets = opts.assets ?? assetPreflight(snapshot);
  const all: Issue[] = [...(rendered?.issues ?? []), ...(opts.integrity?.issues ?? [])];
  for (const k of ['font', 'layout', 'pdf'] as const) all.push(...(opts.external?.[k] ?? []));
  const paged = target === 'pdf' || target === 'print';
  if (paged && !assets.complete && !all.some((i) => i.code === 'IMAGE_MISSING_ASSET') ) {
    all.push({ id: 'preflight-assets', code: 'PDF_ASSETS_INCOMPLETE', severity: 'error', scope: 'asset', message: assets.message, blocking: true });
  }
  if (paged) for (const e of assets.unresolvedExternal) all.push({ id: `preflight-ext-${e.line}`, code: 'PDF_EXTERNAL_IMAGE_NOT_EMBEDDED', severity: 'error', scope: 'asset', message: `Gambar eksternal ${e.url} (baris ${e.line}) tidak akan masuk hasil cetak sampai salinannya diunggah/disematkan.`, line: e.line, blocking: true });
  const cats: PreflightCategory[] = ['input', 'math', 'table', 'asset', 'structure', 'integrity', 'security', 'font', 'layout', 'pdf'];
  const checkedBy = (c: PreflightCategory): boolean => {
    if (stale) return false;
    if (c === 'integrity') return !!opts.integrity;
    if (c === 'font' || c === 'layout' || c === 'pdf') return opts.external?.[c] !== undefined;
    return true;
  };
  const required = (c: PreflightCategory) => (target === 'pdf' ? true : target === 'print' ? c !== 'pdf' : c !== 'pdf' && c !== 'layout');
  const categories: CategoryResult[] = cats.filter(required).map((c) => {
    const issues = all.filter((i) => i.scope === c);
    const counts = { error: issues.filter((i) => i.severity === 'error').length, warning: issues.filter((i) => i.severity === 'warning').length, info: issues.filter((i) => i.severity === 'info').length };
    const checked = checkedBy(c);
    const status: PreflightStatus = counts.error ? 'fix' : !checked ? 'unchecked' : counts.warning ? 'review' : 'ready';
    return { category: c, status, checked, coverage: COVERAGE[c], issues, counts };
  });
  const status: PreflightStatus = categories.some((c) => c.status === 'fix') ? 'fix' : categories.some((c) => c.status === 'unchecked') ? 'unchecked' : categories.some((c) => c.status === 'review') ? 'review' : 'ready';
  return { status, label: PREFLIGHT_LABELS[status], categories, stale, target, assets, ...(opts.identity ? { identity: opts.identity } : {}) };
}
