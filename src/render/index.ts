/**
 * API publik modul render PaperForma 2 (lihat docs/RENDER_API.md).
 * Modul ini ringan untuk diimpor: Paged.js, Mermaid, CSS KaTeX dan berkas font hanya dimuat lewat import() dinamis
 * ketika fungsi ekspor/paginasi benar-benar dipanggil.
 */
export {
  TEMPLATES, TEMPLATE_IDS, TEMPLATE_VERSION, getTemplate, listTemplates, templateDefaultSettings, applyTemplate, resetGroup,
  customizedKeys, SETTING_GROUPS, PAPER_MM, pageSizeMm, READABILITY, resolveStyle,
} from './templates';
export type { TemplateDef, TemplateTokens, TemplateCapabilities, ApplyTemplateResult, SettingGroup, ResolvedStyle } from './templates';
export { planFonts, loadFonts, fontFaceCss, fontManifest, isCoveredByBundledFonts, scriptOf } from './fonts';
export type { FontPlan, FontFaceSpec, FontManifestEntry, FontSource, LoadedFont, MissingGlyphs } from './fonts';
export { prepareBody, composeDocument, documentStyles, tocEntries } from './document';
export type { PreparedBody, PrepareOptions, ComposeOptions, ComposedDocument, ComposeMode } from './document';
export { exportHtml, ExportGuard, StaleExportError, ExportBlockedError, REQUIRED_CHECKS, REVIEW_CHECKS, staticChecks, ENHANCEMENT_JS } from './exports';
export type { HtmlProfile, HtmlExportRequest, HtmlExportResult, RenderManifest, ExportTicket } from './exports';
export { buildPrintPayload, PrintBlockedError } from './print-payload';
export type { PrintPayloadOptions } from './print-payload';
export { paginateInFrame, printLocally, preparePrint } from './print-client';
export type { FrameOptions, FrameResult, PrintSession, PrintLifecycle } from './print-client';
export { PaginationError } from './paginate-error';
export type { PrintPayload, PaginationResult, PaginationFailure, PageDiagnostic, PrintMessage } from './print-types';
export { docLabels } from './labels';
export { localPrintManifest } from './local-manifest';
