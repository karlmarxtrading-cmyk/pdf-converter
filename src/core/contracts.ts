/**
 * PaperForma 2 — kontrak bersama antarmodul (core ↔ render ↔ ui ↔ worker).
 * Berkas ini adalah satu-satunya sumber tipe lintas modul. Ubah hanya dengan menambah (additive).
 * Satuan offset sumber: indeks UTF-16 (sama dengan String.prototype.slice / textarea.selectionStart).
 * Ukuran anggaran: byte UTF-8.
 */
export const SCHEMA_VERSION = 2;
export const APP_VERSION = '3.0.0-rc.5';
export const RENDERER_VERSION = 'pf-render-3.0.0-rc.5';

export type TemplateId = 'EDU-01' | 'BUS-01' | 'EDT-01' | 'CON-01';
export type Paper = 'A4' | 'A5' | 'Letter' | 'Legal';
export type Orientation = 'portrait' | 'landscape';
export type Role = 'user' | 'assistant' | 'system' | 'other' | 'unknown';
export type Severity = 'error' | 'warning' | 'info';

/** Rentang pada raw input; start/end = indeks UTF-16 pada input.rawPlain (atau rawHtml bila kind='html'). */
export interface SourceRef { inputId: string; messageId?: string; start: number; end: number; unit: 'utf16' }

export interface Issue {
  id: string; code: string; severity: Severity; message: string;
  /** kategori cakupan pemeriksaan: lihat spesifikasi 04 §8 */
  scope: 'input' | 'math' | 'table' | 'asset' | 'structure' | 'integrity' | 'layout' | 'security' | 'font' | 'pdf';
  sourceRef?: SourceRef; line?: number; blockId?: string; blocking?: boolean;
}

export interface AssetRecord {
  /** sha256 hex dari bytes — identitas berbasis isi (CODE-03) */
  id: string; path: string; mime: string; bytes: Uint8Array; width?: number; height?: number;
  origin: 'upload' | 'zip' | 'clipboard' | 'remote-copy' | 'brand';
}

export interface InputRecord {
  id: string; kind: 'markdown-file' | 'paste-plain' | 'paste-html' | 'zip' | 'project';
  name?: string; importedAt: string; byteLength: number;
  rawPlain: string; rawHtml?: string; rawSourceHash: string;
}

export interface Message {
  id: string; role: Role; roleConfidence: 'confirmed' | 'high' | 'low' | 'unknown';
  speakerLabel?: string; timestamp?: string; /** hanya jika ada di sumber; tidak pernah dikarang */
  markdown: string; selected: boolean; sourceRef: SourceRef; flags: string[];
}

export type OutputMode = 'answer' | 'selected-messages' | 'transcript' | 'curated' | 'source-appendix';

export interface PublicationSpan {
  kind: 'message' | 'block' | 'label' | 'separator' | 'main' | 'appendix-title';
  outStart: number; outEnd: number; messageId?: string; sourceRef?: SourceRef;
  blockId?: string; role?: Role; roleConfidence?: Message['roleConfidence'];
}

export interface Conversation {
  /** Studio publishes project.source. Message choices are drafts until the user builds again. */
  editable?: true;
  curatedBlockIds?: string[];
  /** Immutable provenance of the last composition, offsets refer to that sourceHash. */
  publication?: { mode: OutputMode; sourceHash: string; sourceLength: number; spans: PublicationSpan[] };
  inputId: string; messages: Message[]; outputMode: OutputMode; selectedOrder: string[];
  showRoles: boolean; unresolved: Issue[]; provider?: { name: string; confidence: 'low' | 'high'; basis: string };
}

export interface Margins { top: number; right: number; bottom: number; left: number } // mm

export interface Settings {
  template: TemplateId; paper: Paper; orientation: Orientation; margins: Margins;
  /** true = margin/cover/toc mengikuti default template; false = kustom pengguna (UX-06/PF-023) */
  followTemplateDefaults: boolean;
  bodyFont: 'source-serif-4' | 'inter'; baseSizePt: number; lineHeight: number;
  cover: boolean; toc: boolean; tocDepth: 1 | 2 | 3; chapterBreak: boolean;
  pageNumbers: boolean; pageNumberStart: number; header: string; footer: string;
  inkSaver: boolean; contentLang: string; /** bahasa ISI dokumen, terpisah dari bahasa UI */
  title: string; subtitle?: string; author?: string; dateText?: string;
  allowExternalImages: boolean; brandKitId?: string;
}

export interface BrandKit {
  id: string; name: string; accent: string; headingFont: 'inter' | 'source-serif-4';
  logoAssetId?: string; orgName?: string; footerText?: string; updatedAt: string;
}

export interface Project {
  schemaVersion: typeof SCHEMA_VERSION; projectId: string; name: string; createdAt: string; updatedAt: string;
  revision: number; sourcePath?: string; inputs: InputRecord[]; /** markdown aktif yang dirender */ source: string;
  conversation?: Conversation; assets: AssetRecord[]; settings: Settings; brandKit?: BrandKit;
  history: { revision: number; at: string; label: string; source: string; delta?: { start: number; remove: number; insert: string };
    /** statis 3.0 (UI-06): status proyek non-teks pada revisi ini (JSON HistoryState); byte aset tidak diduplikasi, hanya id */
    stateJson?: string }[];
}

/** Keadaan proyek selain teks sumber yang dicatat per revisi; aset dirujuk lewat id (hash isi). */
export interface HistoryState {
  name: string; settings: Settings; brandKit?: BrandKit; assetIds: string[];
  /** PF-AUD-A04: content hashes can have multiple filename aliases. Older states have only assetIds. */
  assetRefs?: { id: string; path: string }[];
  sourcePath?: string; conversation?: Conversation;
}

export interface Snapshot {
  projectId: string; revision: number; createdAt: string;
  rawSourceHash: string; contentSnapshotHash: string; renderInputHash: string;
  templateId: TemplateId; templateVersion: string; rendererVersion: string;
  source: string; sourcePath?: string; settings: Settings; brandKit?: BrandKit; assets: AssetRecord[]; conversation?: Conversation;
}

export interface TocEntry { id: string; level: number; text: string }
export interface FootnoteEntry { id: string; label: string; refCount: number; defined: boolean }

export interface BlockInfo { id: string; type: string; line: number; text: string; sourceRef?: SourceRef; messageId?: string }

/** Hasil core.renderBody: HTML isi yang SUDAH disanitasi, tanpa <html>/<head>, tanpa CSS templat. */
export interface RenderedBody {
  html: string; toc: TocEntry[]; footnotes: FootnoteEntry[]; blocks: BlockInfo[]; issues: Issue[];
  stats: { words: number; tables: number; math: number; images: number; code: number; mermaid: number };
  /** kode Unicode script yang dipakai isi, untuk resolver font */ scripts: string[];
  mermaidPending: boolean; /** blok mermaid berupa <pre class="pf-mermaid" data-src> yang dirender oleh lapisan DOM */
}

export interface ExportManifest {
  kind: 'html-standalone' | 'html-zip' | 'html-publication' | 'pdf-local-print';
  snapshot: Pick<Snapshot, 'projectId' | 'revision' | 'rawSourceHash' | 'contentSnapshotHash' | 'renderInputHash' | 'templateId' | 'templateVersion' | 'rendererVersion'>;
  outputHash: string; bytes: number; pages?: number; createdAt: string; checks: { name: string; status: 'pass' | 'fail' | 'warn' | 'not-run'; detail?: string }[];
}

/* ------------------------------------------------------------------ *
 * Tanda tangan fungsi yang WAJIB diekspor src/core/index.ts (dipakai render/ui).
 * ------------------------------------------------------------------ */
export interface Limits {
  markdownBytes: number; pasteBytes: number; pasteHtmlBytes: number; assetBytes: number; totalProjectBytes: number;
  zipBytes: number; zipEntries: number; zipMaxDepth: number; zipMaxRatio: number; zipUnpackedBytes: number;
  mathChars: number; maxNodes: number; maxNesting: number; maxTableCells: number; standaloneHtmlBytes: number; pdfPayloadBytes: number;
}
export interface RenderOptions {
  assets: AssetRecord[]; allowExternalImages: boolean; template: TemplateId; sourcePath?: string;
  /** bila ada dan outputMode != 'answer', isi dirender per pesan: <section class="pf-msg" data-role data-message-id> */
  conversation?: Conversation; idPrefix?: string;
}
export interface CoreApi {
  LIMITS: Limits;
  utf8Length(s: string): number;
  sha256Hex(data: Uint8Array | string): Promise<string>;
  /** Markdown → HTML isi tersanitasi + diagnostik. Tidak pernah mengubah `source`. */
  renderBody(source: string, opts: RenderOptions): Promise<RenderedBody>;
  /** data: URL untuk aset; cache dikunci oleh asset.id (hash isi), bukan path/ukuran/MIME. */
  assetDataUrl(asset: AssetRecord): string;
  makeSnapshot(project: Project): Promise<Snapshot>;
  defaultSettings(template: TemplateId): Settings;
}
