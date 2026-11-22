/** Menyusun PrintPayload dari Snapshot + RenderedBody (berjalan di aplikasi; tidak memuat Paged.js). */
import type { RenderedBody, Snapshot } from '../core/contracts';
import { LIMITS } from '../core/limits';
import { assertPrintLowerBound, assertPrintPayload, preflightPrintDom } from './print-budget';
import { APP_VERSION } from '../core/contracts';
import { sourceCheck, finalArticleMatches } from './final-integrity';
import { hasKatexLayout } from './katex-style';
import { composeDocument, prepareBody, tocEntries } from './document';
import { fontFaceCss, fontManifest, loadFonts, planFonts, type FontSource } from './fonts';
import { pdfGlyphRestrictions } from './pdf-glyphs';
import type { PrintPayload } from './print-types';
import { verdictOf, dedupeIssues, type Verdict } from '../core/verdict';
import type { Issue } from '../core/contracts';

/** EN-012: issue penghalang (termasuk lingkup input) menghentikan persiapan cetak SEBELUM font/layout dimuat. */
export class PrintBlockedError extends Error {
  readonly code = 'PRINT_BLOCKED';
  constructor(readonly issues: Issue[], readonly verdict: Verdict) { super('Persiapan cetak diblokir: ' + verdict.block.map((i) => i.code).join(', ')); }
}
import { getTemplate, pageSizeMm } from './templates';

export interface PrintPayloadOptions {
  fontSource?: FontSource; renderMermaid?: boolean; signal?: AbortSignal;
  fontTimeoutMs?: number; imageTimeoutMs?: number; maxPasses?: number;
}

export async function buildPrintPayload(snapshot: Snapshot, body: RenderedBody, o: PrintPayloadOptions = {}): Promise<PrintPayload> {
  if (o.signal?.aborted) throw o.signal.reason instanceof Error ? o.signal.reason : new DOMException('Dibatalkan', 'AbortError');
  const s = snapshot.settings;
  const early = verdictOf(body.issues);
  if (early.status === 'blocked') throw new PrintBlockedError(dedupeIssues(body.issues), early);
  const hasDom = typeof window !== 'undefined' && typeof document !== 'undefined' && !(globalThis as { process?: unknown }).process;
  // Preparing a large input includes several independent DOM and source
  // projections. Release the event loop between completed stages so input,
  // cancellation and rendering stay responsive.
  const large = snapshot.source.length >= 1_000_000;
  const yieldLarge = async () => {
    await new Promise<void>(resolve => setTimeout(resolve,0));
    o.signal?.throwIfAborted();
  };
  if (large) await yieldLarge();
  const model = await sourceCheck(snapshot,body,large && hasDom ? o : undefined);
  if (large) await yieldLarge();
  const fallbackIssues: Issue[] = model.fallback ? [{id:'print-projection-fallback',code:'PRINT_PROJECTION_FALLBACK',scope:'layout',severity:'info',
    message:'Web Worker untuk pemeriksaan sumber tidak tersedia. Sumber diperiksa secara lokal dengan jeda antar-tahap.'}] : [];
  const prepared = await prepareBody(snapshot, body, { mode: 'print', signal: o.signal, verifyInput: root => {
    if (body.html.length > LIMITS.pdfPayloadBytes) {
      // These embedded images survive offline print. Repeated references can
      // exceed the quota even though the project stores their bytes only once.
      let imageBytes = 0;
      for (const image of root.querySelectorAll('img[src^="data:"]')) {
        imageBytes += image.getAttribute('src')!.length;
        assertPrintLowerBound(imageBytes);
      }
    }
    const report = model.check(root);
    if (!report.ok) throw new PrintBlockedError(report.issues,verdictOf(report.issues));
  }, beforeSerialize: body.html.length >= LIMITS.pdfPayloadBytes / 6 || body.mermaidPending ? root => preflightPrintDom(root, o.signal) : undefined, renderMermaid: o.renderMermaid ?? hasDom, allowExternalImages: false });
  if (o.signal?.aborted) throw o.signal.reason;
  if (large) await yieldLarge();
  assertPrintLowerBound(prepared.html.length);
  const plan = planFonts({ html: prepared.html, fontText: prepared.fontText, settings: s, mode: 'print', headingFont: snapshot.brandKit?.headingFont, brandKit: snapshot.brandKit, extraText: prepared.labels.toc + prepared.labels.cont });
  const source = o.fontSource ?? (await import('./font-assets')).browserFontSource;
  const { fonts, issues: fIssues } = await loadFonts(plan, source, { signal: o.signal, timeoutMs: o.fontTimeoutMs });
  if (o.signal?.aborted) throw o.signal.reason;
  const fontVerdict = verdictOf(fIssues);
  if (fontVerdict.status === 'blocked') throw new PrintBlockedError(fIssues, fontVerdict);
  if (large) await yieldLarge();
  const doc = await composeDocument(snapshot, { mode: 'print', sourceMath:model.hasMath, prepared, fontCss: '' });
  if (large) await yieldLarge();
  const { w, h } = pageSizeMm(s.paper, s.orientation);
  const tpl = getTemplate(s.template);
  const payload: PrintPayload = {
    version: 1, jobId: `pf-${snapshot.revision}-${snapshot.renderInputHash.slice(0, 12)}-${Date.now().toString(36)}`,
    snapshot: { projectId: snapshot.projectId, revision: snapshot.revision, rawSourceHash: snapshot.rawSourceHash, contentSnapshotHash: snapshot.contentSnapshotHash, renderInputHash: snapshot.renderInputHash, templateId: snapshot.templateId, templateVersion: snapshot.templateVersion, rendererVersion: snapshot.rendererVersion },
    settings: { template: s.template, paper: s.paper, orientation: s.orientation, margins: { ...s.margins }, pageNumbers: s.pageNumbers, pageNumberStart: s.pageNumberStart, toc: s.toc, tocDepth: s.tocDepth, cover: s.cover, contentLang: s.contentLang, inkSaver: s.inkSaver },
    page: { widthMm: w, heightMm: h, contentWidthMm: +(w - s.margins.left - s.margins.right).toFixed(2), contentHeightMm: +(h - s.margins.top - s.margins.bottom).toFixed(2), numberStart: Number.isFinite(s.pageNumberStart) ? Math.max(0, Math.trunc(s.pageNumberStart)) : 1 },
    lang: s.contentLang || 'id', title: doc.title, author: s.author, generator: `PaperForma ${APP_VERSION} (${tpl.id} v${tpl.version}, rev ${snapshot.revision})`,
    bodyClass: doc.bodyClass, bodyInner: doc.bodyInner, styles: doc.styles,
    fontCss: fontFaceCss(fonts, 'data', 'fonts/', () => ''), fonts: fontManifest(fonts),
    tocIds: s.toc ? tocEntries(prepared.toc, s.tocDepth).map((e) => e.id) : [], headingIds: prepared.toc.map((e) => e.id),
    // Semua issue diteruskan dengan identitas aslinya (tidak ada penyaringan lingkup input).
    pdfRestrictions: pdfGlyphRestrictions(plan.issues, snapshot.source),
    issues: dedupeIssues([...body.issues, ...prepared.issues, ...plan.issues, ...fIssues, ...fallbackIssues]),
    options: { fontTimeoutMs: o.fontTimeoutMs ?? 15000, imageTimeoutMs: o.imageTimeoutMs ?? 15000, maxPasses: o.maxPasses ?? 4 },
  };
  // The base64 alphabet adds exactly four unescaped JSON bytes per triple.
  const base64Bytes = fonts.reduce((sum, f) => sum + 4 * Math.ceil(f.bytes.byteLength / 3), 0);
  assertPrintPayload(payload, base64Bytes);
  const final = document.createElement('template');
  final.innerHTML = doc.bodyInner;
  if (!finalArticleMatches(final.content,{...model,articleInner:doc.articleInner}) || (model.hasMath && !doc.styles.some(hasKatexLayout))) {
    const issues: Issue[] = [{id:'print-final-content',code:'PRINT_CONTENT_CHANGED',scope:'integrity',severity:'error',blocking:true,message:'Isi artikel, rumus atau stylesheet berubah saat persiapan cetak.'}];
    throw new PrintBlockedError(issues,verdictOf(issues));
  }
  payload.fontCss = fontFaceCss(fonts, 'data');
  assertPrintPayload(payload);
  o.signal?.throwIfAborted();
  return payload;
}
