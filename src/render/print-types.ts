import type { ExportManifest, Issue, Settings } from '../core/contracts';
import type { FontManifestEntry } from './fonts';

/** Payload yang dikirim aplikasi ke print.html (postMessage atau sessionStorage). Dapat di-structured-clone. */
export interface PrintPayload {
  version: 1; jobId: string;
  snapshot: ExportManifest['snapshot'];
  settings: Pick<Settings, 'template' | 'paper' | 'orientation' | 'margins' | 'pageNumbers' | 'pageNumberStart' | 'toc' | 'tocDepth' | 'cover' | 'contentLang' | 'inkSaver'>;
  page: { widthMm: number; heightMm: number; contentWidthMm: number; contentHeightMm: number; numberStart: number };
  lang: string; title: string; author?: string; generator: string;
  bodyClass: string; bodyInner: string;
  /** CSS dokumen (tanpa font) untuk polisher Paged.js */ styles: string[];
  /** @font-face dengan data: URL */ fontCss: string; fonts: FontManifestEntry[];
  /** id heading yang tampil di TOC (urut) */ tocIds: string[]; headingIds: string[];
  /** Layout preview remains available for source inspection even when faithful printing is unsupported. */
  pdfRestrictions?: Issue[];
  issues: Issue[];
  options: { fontTimeoutMs: number; imageTimeoutMs: number; maxPasses: number };
}

export interface PaginationFailure {
  code: 'FONT_TIMEOUT' | 'FONT_LOAD_FAILED' | 'IMAGE_TIMEOUT' | 'IMAGE_LOAD_FAILED' | 'TOC_UNSTABLE' | 'PAGINATION_FAILED' | 'ABORTED' | 'BLOCKING_ISSUES' | 'BAD_PAYLOAD' | 'FRAME_TIMEOUT' | 'FRAME_STARTUP_TIMEOUT' | 'FRAME_STALLED' | 'FRAME_DEADLINE' | 'FRAME_LOAD_FAILED';
  message: string;
}
export interface PageDiagnostic { page: number; blank: boolean; chars: number; overflow: { tag: string; dxMm: number; dyMm: number }[] }

export interface PrintTraceEvent {
  jobId: string; seq: number; ms: number; phase: string; event: 'start' | 'end' | 'point';
  attempt: number; pass: number; globalPass: number; engineCalls: number; pages: number;
  durationMs?: number; detail?: string; units?: number;
}

export interface PrintProgress { phase: string; pass?: number; pages?: number; units?: number }
export interface PaginationResult {
  events?: PrintTraceEvent[];
  trace?: { attempt: number; pass: number; globalPass: number; pages: number; elapsedMs: number; repair?: string }[];
  status: 'ok' | 'error'; jobId: string; snapshot: ExportManifest['snapshot'];
  pageCount: number; expectedPages: number; passes: number; stable: boolean;
  /** heading id → halaman fisik (1-based) dan label nomor yang tercetak ('' untuk sampul) */
  pageMap: Record<string, { page: number; label: string }>; pageLabels: string[];
  toc: { id: string; label: string }[];
  diagnostics: PageDiagnostic[]; repeatedTableHeaders: number; continuedMessages: number;
  layoutFixes: { tablesFitted: number; mathScaled: number };
  issues: Issue[]; timings: Record<string, number>;
  /** HTML datar tanpa skrip, font tersemat, sudah dipaginasi — untuk API PDF server / Chrome */
  flattenedHtml: string; flattenedBytes: number; fonts: FontManifestEntry[];
  /** EN-006: hasil verifikasi pasca-perataan (fail-closed): jumlah halaman, inventaris isi, blok terpotong */
  verification: { status: 'pass' | 'fail' | 'timeout'; pages: number; inventory: { field: string; expected: string; actual: string; at?: number; blockId?: string; kind?: string }[]; structure: { code: string; page?: number; expected: string; actual: string; target?: string }[]; lostBlocks: number };
  failure?: PaginationFailure;
}

/** Pesan antarjendela (aplikasi ⇄ print.html), selalu diverifikasi origin-nya. */
export type PrintMessage =
  | { type: 'pf-print'; payload: PrintPayload; autoPrint?: boolean }
  | { type: 'pf-print-ready' }
  | ({ type: 'pf-print-progress'; jobId: string } & PrintProgress)
  | { type: 'pf-print-result'; jobId: string; result: PaginationResult }
  | { type: 'pf-print-error'; jobId: string; failure: PaginationFailure; issues: Issue[]; events?: PrintTraceEvent[] };
