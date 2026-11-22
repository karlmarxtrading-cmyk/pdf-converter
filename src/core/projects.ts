/**
 * Proyek (PF-031, UX-10, OPS-06/07/08) dan brand kit (PF-032).
 *  - model Project sesuai kontrak; revisi & riwayat;
 *  - paket portabel .pfproj (ZIP: manifest.json, project.json, source.md, inputs/, assets/, settings.json, brandkit.json) + verifikasi hash;
 *  - migrasi skema v1 (draf IndexedDB baseline 1.0.0) → v2: eksplisit, dapat dibatalkan, draf asli DISIMPAN;
 *  - bundle rusak ditolak tanpa menyentuh proyek aktif (fungsi murni; tidak ada state global).
 */
import { zipSync, type Zippable } from 'fflate';
import { APP_VERSION, SCHEMA_VERSION, type AssetRecord, type BrandKit, type HistoryState, type InputRecord, type Limits, type Project, type Settings, type TemplateId } from './contracts';
import { canonicalJson, computeContentSnapshotHash, computeRawSourceHash, inputRawHash, sha256Hex, sha256HexSync } from './hash';
import { LIMITS, assertBudget, BudgetError, checkBudget, utf8Length, type BudgetResult } from './limits';
import { extractZipFiles, importZip, readCentralDirectory } from './zip';
import { createAssetRecord } from './assets';
import { TEMPLATES, templateDefaultSettings } from '../render/templates';
import { validateProject, validateSettings, validateKit } from './schema';
import { inheritSaveBase } from './save-base';
import { randomId, nowIso } from './util';

export const HISTORY_MAX = 100;
export const BUNDLE_FORMAT = 'paperforma-project';

export function createProject(opts: { name?: string; template?: TemplateId; source?: string; now?: string; projectId?: string } = {}): Project {
  const now = opts.now ?? nowIso();
  const settings = templateDefaultSettings(opts.template ?? 'EDU-01');
  return {
    schemaVersion: SCHEMA_VERSION, projectId: opts.projectId ?? randomId('proj'), name: opts.name ?? 'Tanpa judul', createdAt: now, updatedAt: now,
    revision: 0, inputs: [], source: opts.source ?? '', assets: [], settings, history: [],
  };
}

export async function makeInputRecord(kind: InputRecord['kind'], rawPlain: string, opts: { rawHtml?: string; name?: string; now?: string } = {}): Promise<InputRecord> {
  const rec: InputRecord = {
    id: randomId('input'), kind, importedAt: opts.now ?? nowIso(), byteLength: utf8Length(rawPlain) + (opts.rawHtml ? utf8Length(opts.rawHtml) : 0),
    rawPlain, rawSourceHash: await inputRawHash(rawPlain, opts.rawHtml),
  };
  if (opts.rawHtml !== undefined) rec.rawHtml = opts.rawHtml;
  if (opts.name !== undefined) rec.name = opts.name;
  return rec;
}

/** Direct paste must claim its cursor range and material in the same event as the editor transaction. */
export function makePasteInputRecord(rawPlain: string, rawHtml?: string): InputRecord {
  const plain = sha256HexSync(rawPlain);
  const rawSourceHash = rawHtml === undefined ? plain : sha256HexSync(canonicalJson({ html: sha256HexSync(rawHtml), plain }));
  return { id: randomId('input'), kind: rawHtml === undefined ? 'paste-plain' : 'paste-html',
    importedAt: nowIso(), rawPlain, ...(rawHtml === undefined ? {} : { rawHtml }), rawSourceHash,
    byteLength: utf8Length(rawPlain) + utf8Length(rawHtml ?? '') };
}

/** Reverse deltas reconstruct an older source from its successor. Old full snapshots remain readable. */
export const HISTORY_BYTES = 6 * 1024 * 1024;
type HistoryEntry = Project['history'][number];
export function historySource(p: Project, revision: number): string {
  let source = p.source;
  for (let i = p.history.length - 1; i >= 0; i--) {
    const entry = p.history[i]!;
    const d = entry.delta;
    source = d ? source.slice(0, d.start) + d.insert + source.slice(d.start + d.remove) : entry.source;
    if (entry.revision === revision) return source;
  }
  throw new Error('Unknown project revision');
}
function reverseDelta(next: string, previous: string): NonNullable<HistoryEntry['delta']> {
  if (next.startsWith(previous)) return { start: previous.length, remove: next.length - previous.length, insert: '' };
  if (previous.startsWith(next)) return { start: next.length, remove: 0, insert: previous.slice(next.length) };
  const common = Math.min(next.length, previous.length);
  let start = 0, suffix = 0;
  while (start < common && next.charCodeAt(start) === previous.charCodeAt(start)) start++;
  while (suffix < common - start && next.charCodeAt(next.length-1-suffix) === previous.charCodeAt(previous.length-1-suffix)) suffix++;
  return { start, remove: next.length - start - suffix, insert: previous.slice(start, previous.length - suffix) };
}

/** Serialisasi keadaan non-teks proyek (deterministik; tanpa byte aset). */
export function historyStateJson(p: Pick<Project, 'name' | 'settings' | 'brandKit' | 'assets' | 'sourcePath' | 'conversation'>): string {
  const st: HistoryState = { name: p.name, settings: p.settings, assetIds: p.assets.map((a) => a.id), assetRefs: p.assets.map(({ id, path }) => ({ id, path })) };
  if (p.brandKit) st.brandKit = p.brandKit;
  if (p.sourcePath !== undefined) st.sourcePath = p.sourcePath;
  if (p.conversation) st.conversation = p.conversation;
  return JSON.stringify(st);
}

/** Keadaan lengkap sebuah revisi: teks selalu; keadaan non-teks hanya untuk revisi yang dibuat versi 3.0 ke atas. */
export function historyEntryState(p: Project, revision: number): { source: string; state?: HistoryState } {
  const source = historySource(p, revision);
  const entry = p.history.find((h) => h.revision === revision);
  if (!entry?.stateJson) return { source };
  try {
    const state = JSON.parse(entry.stateJson) as HistoryState;
    // PF-AUD-A06: legacy/untrusted history JSON is data, not an unchecked restoration object.
    if (!state || Array.isArray(state) || typeof state !== 'object' || typeof state.name !== 'string' || state.name.length > 1024 ||
        !Array.isArray(state.assetIds) || state.assetIds.some(id => typeof id !== 'string' || !/^[0-9a-f]{64}$/.test(id))) return { source };
    validateSettings(state.settings);
    if (state.assetRefs !== undefined && (!Array.isArray(state.assetRefs) || state.assetRefs.length !== state.assetIds.length ||
        state.assetRefs.some((ref, i) => !ref || typeof ref.path !== 'string' || !ref.path || ref.path.length > 8192 || ref.id !== state.assetIds[i]) ||
        new Set(state.assetRefs.map(ref => ref.path.normalize('NFC'))).size !== state.assetRefs.length)) return { source };
    if (state.brandKit) validateKit(state.brandKit, state.assetIds.map(id => ({ id } as AssetRecord)));
    if (state.sourcePath !== undefined && typeof state.sourcePath !== 'string') return { source };
    return { source, state };
  } catch { return { source }; }
}

/**
 * Perubahan untuk memulihkan revisi sebagai REVISI BARU (UI-06). Aset dirujuk lewat id: aset yang sudah tidak ada di
 * proyek dilaporkan di `missingAssetIds` (tidak dikarang/dihapus diam-diam). Revisi lama tanpa keadaan → hanya teks.
 */
export function restoreRevisionChanges(p: Project, revision: number): { changes: Partial<Project>; scope: 'full' | 'text-only'; missingAssetIds: string[] } {
  const { source, state } = historyEntryState(p, revision);
  if (!state) return { changes: { source }, scope: 'text-only', missingAssetIds: [] };
  const byId = new Map<string, AssetRecord[]>();
  for (const a of p.assets) byId.set(a.id, [...(byId.get(a.id) ?? []), a]);
  const missingAssetIds: string[] = [];
  const restored: AssetRecord[] = [];
  const used = new Set<string>();
  const refs = state.assetRefs ?? state.assetIds.map(id => ({ id, path: undefined }));
  for (const ref of refs) {
    const aliases = byId.get(ref.id) ?? [];
    // Old states contain only hashes. Match each alias once in project order, never duplicate a path.
    const found = ref.path ? aliases.find(a => a.path === ref.path) ?? aliases[0] : aliases.find(a => !used.has(a.path));
    if (!found) { missingAssetIds.push(ref.id); continue; }
    const asset = ref.path && found.path !== ref.path ? { ...found, path: ref.path } : found;
    if (used.has(asset.path)) { missingAssetIds.push(ref.id); continue; }
    restored.push(asset); used.add(asset.path);
  }
  // Aset revisi lama yang masih ada dipulihkan; aset yang ditambahkan sesudahnya DIPERTAHANKAN agar byte-nya tidak hilang
  // (aset tanpa rujukan tidak mengubah keluaran).
  const assets = [...restored, ...p.assets.filter((a) => !used.has(a.path))];
  const brandKit = state.brandKit?.logoAssetId && !assets.some(a => a.id === state.brandKit!.logoAssetId)
    ? { ...state.brandKit, logoAssetId: undefined } : state.brandKit;
  const changes: Partial<Project> = { source, name: state.name, settings: { ...state.settings, allowExternalImages: p.settings.allowExternalImages }, brandKit, sourcePath: state.sourcePath, conversation: state.conversation, assets };
  return { changes, scope: 'full', missingAssetIds };
}

const STATE_KEYS = ['name', 'settings', 'brandKit', 'assets', 'sourcePath', 'conversation'] as const;

export function commitRevision(p: Project, changes: Partial<Omit<Project, 'schemaVersion'|'projectId'|'revision'|'createdAt'|'updatedAt'|'history'>>, label: string, now = nowIso(), limits: Limits = LIMITS): Project {
  const next = { ...p, ...changes, revision: p.revision + 1, updatedAt: now };
  for (const k of Object.keys(next) as (keyof Project)[]) if (next[k] === undefined) delete next[k];
  const history = p.history.slice(-(HISTORY_MAX - 1));
  const previous = history.at(-1);
  if (previous && previous.source.length >= 128 && !previous.delta) {
    const delta = reverseDelta(next.source, previous.source);
    if (delta.insert.length + 64 < previous.source.length) history[history.length-1] = { ...previous, source: '', delta };
  }
  // keadaan non-teks: pakai ulang JSON revisi sebelumnya bila tidak ada kunci keadaan yang berubah (murah saat mengetik)
  const prevState = p.history.at(-1)?.stateJson;
  const stateChanged = !prevState || STATE_KEYS.some((k) => k in changes && (changes as Record<string, unknown>)[k] !== (p as unknown as Record<string, unknown>)[k]);
  history.push({ revision: next.revision, at: now, label, source: next.source, stateJson: stateChanged ? historyStateJson(next) : prevState });
  next.history = history;
  const upper = history.reduce((sum, entry) => sum + jsonUpperBound(entry) + 1, 0);
  let sizes: number[] | undefined;
  let remove = 0;
  function measure() {
    return sizes ??= history.map(entry => utf8Length(JSON.stringify(entry)) + 1);
  }
  if (upper > HISTORY_BYTES) {
    let used = measure().reduce((sum,n) => sum + n, 0);
    while (remove < history.length && used > HISTORY_BYTES) used -= measure()[remove++]!;
    if (remove) next.history = history.slice(remove);
  }
  try {
    checkAdmission(next, limits);
  } catch (error) {
    if (!(error instanceof BudgetError) || !['zip','totalProject','zipUnpacked'].includes(error.result.kind)) throw error;
    const deficit = error.result.actual - error.result.limit;
    let freed = 0, drop = 0;
    while (drop < next.history.length && freed < deficit) freed += measure()[remove + drop++]!;
    next.history = next.history.slice(drop);
    // Removing the first/last entry can change one JSON separator and metadata digit counts.
    if (next.history.length && projectBytes(next) >= Math.min(limits.totalProjectBytes, limits.zipUnpackedBytes)) next.history = next.history.slice(1);
    try { assertPortable(next, limits); }
    catch (again) {
      if (!next.history.length) throw again;
      next.history = [];
      assertPortable(next, limits);
    }
  }
  validateProject(next);
  inheritSaveBase(p, next);
  return next;
}

/** Penggabungan aset ZIP secara transaksional (AST-08): bila anggaran total terlampaui, proyek dikembalikan apa adanya. */
export async function importZipIntoProject(p: Project, zipBytes: Uint8Array, limits: Limits = LIMITS): Promise<
  | { ok: true; project: Project; markdown: { path: string; text: string; bytes: number }[]; needsSelection: boolean; report: { unsupported: string[]; rejected: string[] } }
  | { ok: false; project: Project; message: string; messageEn: string; budget?: BudgetResult }> {
  const r = await importZip(zipBytes, { limits, existingProjectBytes: 0 });
  if (!r.ok) return { ok: false, project: p, message: r.fatal.message, messageEn: r.fatal.messageEn, ...(r.budget ? { budget: r.budget } : {}) };
  const byPath = new Map(p.assets.map((a) => [a.path.normalize('NFC'), a]));
  for (const a of r.assets) byPath.set(a.path.normalize('NFC'), a);
  const assets = [...byPath.values()];
  try {
    const project = commitRevision(p, { assets }, 'Impor ZIP', nowIso(), limits);
    return { ok: true, project, markdown: r.markdown, needsSelection: r.needsSelection, report: { unsupported: r.unsupported.map(u => u.path), rejected: r.rejected.map(u => u.path) } };
  } catch (e) {
    if (e instanceof BudgetError) return { ok: false, project: p, budget: e.result, message: e.result.message, messageEn: e.result.messageEn };
    return { ok: false, project: p, message: 'Aset tidak sesuai model proyek.', messageEn: 'Assets do not satisfy the project schema.' };
  }
}

/* ---------------- brand kit ---------------- */
export function validateBrandKit(b: Partial<BrandKit>, assets: AssetRecord[] = []): { ok: true; brandKit: BrandKit } | { ok: false; errors: { field: string; message: string; messageEn: string }[] } {
  const errors: { field: string; message: string; messageEn: string }[] = [];
  const name = (b.name ?? '').trim();
  if (!name || name.length > 80) errors.push({ field: 'name', message: 'Nama brand kit wajib (1–80 karakter).', messageEn: 'Brand kit name is required (1–80 chars).' });
  if (!/^#[0-9a-f]{6}$/i.test(b.accent ?? '')) errors.push({ field: 'accent', message: 'Warna aksen harus heksadesimal #RRGGBB.', messageEn: 'Accent colour must be hex #RRGGBB.' });
  if (b.headingFont !== 'inter' && b.headingFont !== 'source-serif-4') errors.push({ field: 'headingFont', message: 'Font judul harus inter atau source-serif-4.', messageEn: 'Heading font must be inter or source-serif-4.' });
  if (b.logoAssetId && !assets.some((a) => a.id === b.logoAssetId)) errors.push({ field: 'logoAssetId', message: 'Logo tidak ditemukan di aset proyek.', messageEn: 'Logo not found among project assets.' });
  if ((b.orgName ?? '').length > 120) errors.push({ field: 'orgName', message: 'Nama organisasi maksimal 120 karakter.', messageEn: 'Organisation name max 120 chars.' });
  if ((b.footerText ?? '').length > 200) errors.push({ field: 'footerText', message: 'Teks kaki maksimal 200 karakter.', messageEn: 'Footer text max 200 chars.' });
  if (errors.length) return { ok: false, errors };
  const kit: BrandKit = { id: b.id ?? randomId('brand'), name, accent: b.accent!.toLowerCase(), headingFont: b.headingFont!, updatedAt: nowIso() };
  if (b.logoAssetId) kit.logoAssetId = b.logoAssetId;
  if (b.orgName) kit.orgName = b.orgName;
  if (b.footerText) kit.footerText = b.footerText;
  return { ok: true, brandKit: kit };
}

/* ---------------- migrasi v1 → v2 ---------------- */
/** Bentuk draf baseline 1.0.0 (IndexedDB 'paperforma'/'drafts' kunci 'current'). */
export interface LegacyDraftV1 {
  source: string; title?: string; savedAt?: string;
  settings?: { template?: string; paper?: string; orientation?: string; margin?: string; marginMm?: { top: number; right: number; bottom: number; left: number }; font?: string; baseSize?: number; lineHeight?: number; accent?: string; cover?: boolean; toc?: boolean; tocDepth?: number; pageNumbers?: boolean; header?: string; headerText?: string; footerText?: string; chapterBreak?: boolean; headingNumbers?: boolean; codeWrap?: boolean; tableFont?: string; [k: string]: unknown };
  assets?: { path: string; bytes: Uint8Array | number[]; mime?: string; [k: string]: unknown }[];
}

export interface MigrationChange { field: string; from: unknown; to: unknown; note: string }
export interface MigrationResult { project: Project; changes: MigrationChange[]; original: LegacyDraftV1; warnings: string[] }

/**
 * Pemetaan gaya 1.0.0 → format 2.0 berdasarkan MAKNA, bukan urutan registri.
 * 'academic' (makalah akademik A4) tidak boleh menjadi CON-01 (transkrip percakapan): format terdekat
 * adalah EDT-01 (esai/bab panjang). Kertas/margin dari draf lama dipertahankan oleh migrasi, sehingga
 * makalah A4 tetap A4. Perbedaan gaya dicatat sebagai MigrationChange.
 */
const LEGACY_TO_TEMPLATE: Record<string, TemplateId> = { textbook: 'EDU-01', report: 'BUS-01', essay: 'EDT-01', academic: 'EDT-01' };
void TEMPLATES;

export function isLegacyDraftV1(x: unknown): x is LegacyDraftV1 {
  return !!x && typeof x === 'object' && typeof (x as LegacyDraftV1).source === 'string' && !('schemaVersion' in (x as object));
}

/**
 * Migrasi eksplisit draf 1.0.0 → Project v2. Draf asli disimpan utuh sebagai InputRecord kind 'project'
 * (JSON, bytes aset diganti hash) dan dikembalikan sebagai `original` untuk dibatalkan (revertMigration).
 */
export async function migrateV1Draft(d: LegacyDraftV1, now = nowIso()): Promise<MigrationResult> {
  if (!isLegacyDraftV1(d) || (d.title !== undefined && typeof d.title !== 'string') ||
      (d.assets !== undefined && !Array.isArray(d.assets)) ||
      (d.settings !== undefined && (d.settings === null || typeof d.settings !== 'object' || Array.isArray(d.settings)))) throw new TypeError('Invalid legacy draft');
  for (const [key, value] of Object.entries(d.settings ?? {})) {
    const type = ['baseSize','lineHeight','tocDepth'].includes(key) ? 'number' :
      ['cover','toc','pageNumbers','chapterBreak','headingNumbers','codeWrap'].includes(key) ? 'boolean' :
      ['template','paper','orientation','font','accent','header','headerText','footerText','tableFont','margin'].includes(key) ? 'string' : undefined;
    if (type && typeof value !== type) throw new TypeError('Invalid legacy setting: ' + key);
    if (key === 'marginMm' && (!value || typeof value !== 'object' || !['top','right','bottom','left'].every(k => Number.isFinite((value as Record<string, number>)[k])))) throw new TypeError('Invalid legacy margins');
  }
  assertBudget('markdown', utf8Length(d.source));
  const changes: MigrationChange[] = []; const warnings: string[] = [];
  const s = d.settings ?? {};
  const legacyTpl = String(s.template ?? 'academic');
  const tpl = LEGACY_TO_TEMPLATE[legacyTpl] ?? 'EDT-01';
  changes.push({ field: 'settings.template', from: legacyTpl, to: tpl, note: legacyTpl === 'academic' ? 'Academic Paper 1.0.0 dipetakan ke EDT-01 (format panjang terdekat); kertas/margin asli dipertahankan. Tidak ada format akademik khusus pada rilis 2.0.' : 'Gaya 1.0.0 dipetakan ke format rilis 2.0.' });
  const base = templateDefaultSettings(tpl);
  const settings: Settings = { ...base, followTemplateDefaults: false };
  if (['A4', 'A5', 'Letter', 'Legal'].includes(String(s.paper))) settings.paper = s.paper as Settings['paper'];
  if (s.orientation === 'portrait' || s.orientation === 'landscape') settings.orientation = s.orientation;
  if (s.marginMm && typeof s.marginMm.top === 'number') settings.margins = { ...s.marginMm };
  if (s.font) { settings.bodyFont = s.font === 'sans' ? 'inter' : 'source-serif-4'; changes.push({ field: 'settings.font', from: s.font, to: settings.bodyFont, note: 'Nama font dipetakan.' }); }
  if (typeof s.baseSize === 'number') settings.baseSizePt = s.baseSize;
  if (typeof s.lineHeight === 'number') settings.lineHeight = s.lineHeight;
  for (const k of ['cover', 'toc', 'pageNumbers', 'chapterBreak'] as const) if (typeof s[k] === 'boolean') settings[k] = s[k] as boolean;
  if (s.tocDepth === 1 || s.tocDepth === 2 || s.tocDepth === 3) settings.tocDepth = s.tocDepth;
  settings.header = String(s.headerText ?? ''); settings.footer = String(s.footerText ?? '');
  settings.title = d.title ?? '';
  for (const k of ['headingNumbers', 'codeWrap', 'tableFont', 'accent', 'header', 'margin']) if (k in s) { changes.push({ field: `settings.${k}`, from: s[k], to: undefined, note: 'Tidak ada padanan langsung di v2; nilai asli tetap ada di draf yang disimpan.' }); }
  const assets: AssetRecord[] = [];
  const assetRefs: { path: string; sha256: string; bytes: number }[] = [];
  for (const a of d.assets ?? []) {
    if (!a || typeof a.path !== 'string' || (!(a.bytes instanceof Uint8Array) && !(Array.isArray(a.bytes) && a.bytes.every(x => Number.isInteger(x) && x >= 0 && x <= 255)))) throw new TypeError('Invalid legacy asset');
    const bytes = a.bytes instanceof Uint8Array ? a.bytes : new Uint8Array(a.bytes);
    const r = await createAssetRecord(bytes, a.path, 'upload');
    if (r.ok) { assets.push(r.asset); assetRefs.push({ path: a.path, sha256: r.asset.id, bytes: bytes.length }); }
    else throw new Error(r.message);
  }
  const legacyJson = JSON.stringify({ ...d, assets: assetRefs }, null, 2);
  const legacyInput = await makeInputRecord('project', legacyJson, { name: 'draf-1.0.0.json', now });
  const srcInput = await makeInputRecord('markdown-file', d.source, { name: 'draf-1.0.0.md', now });
  const p = createProject({ name: d.title || 'Draf 1.0.0', template: tpl, source: d.source, now });
  p.settings = settings; p.assets = assets; p.inputs = [srcInput, legacyInput];
  p.history = [{ revision: 0, at: now, label: 'Migrasi dari draf 1.0.0', source: d.source }];
  validateProject(p); assertPortable(p, LIMITS);
  return { project: p, changes, original: d, warnings };
}

/** Membatalkan migrasi: mengembalikan draf asli tanpa perubahan. */
export function revertMigration(m: MigrationResult): LegacyDraftV1 { return m.original; }

/* ---------------- paket portabel .pfproj ---------------- */
export interface BundleManifest {
  format: typeof BUNDLE_FORMAT; schemaVersion: number; appVersion: string; projectId: string; revision: number; createdAt: string;
  files: { path: string; sha256: string; bytes: number }[];
  hashes: { rawSourceHash: string; contentSnapshotHash: string };
}

const extOf = (mime: string) => ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg' } as Record<string, string>)[mime] ?? 'bin';
const te = new TextEncoder();

function projectMetadata(p: Project) {
  return { ...p, assets: p.assets.map((a) => ({ id: a.id, path: a.path, mime: a.mime, width: a.width, height: a.height, origin: a.origin, file: `assets/${a.id}.${extOf(a.mime)}` })), inputs: p.inputs.map((i) => ({ ...i, rawPlain: undefined, rawHtml: undefined, plainFile: `inputs/${i.id}.txt`, htmlFile: i.rawHtml !== undefined ? `inputs/${i.id}.html` : undefined })) };
}

function portableFiles<T>(p: Project, json: (v: unknown) => T): Map<string, T | string | Uint8Array> {
  const files = new Map<string, T | string | Uint8Array>([
    ['project.json', json(projectMetadata(p))], ['source.md', p.source], ['settings.json', json(p.settings)]
  ]);
  if (p.brandKit) files.set('brandkit.json', json(p.brandKit));
  for (const i of p.inputs) {
    files.set(`inputs/${i.id}.txt`, i.rawPlain);
    if (i.rawHtml !== undefined) files.set(`inputs/${i.id}.html`, i.rawHtml);
  }
  for (const a of p.assets) files.set(`assets/${a.id}.${extOf(a.mime)}`, a.bytes);
  return files;
}
const byteSize = (data: number | string | Uint8Array) => typeof data === 'number' ? data : typeof data === 'string' ? utf8Length(data) : data.byteLength;
const hashPlaceholder = '0'.repeat(64);
function portableSize(p: Project, files: Map<string, number | string | Uint8Array>) {
  const entries = [...files].map(([path,data]) => ({ path, bytes: byteSize(data), sha256: hashPlaceholder }));
  const manifest: BundleManifest = { format: BUNDLE_FORMAT, schemaVersion: SCHEMA_VERSION, appVersion: APP_VERSION, projectId: p.projectId, revision: p.revision, createdAt: p.updatedAt, files: entries, hashes: { rawSourceHash: hashPlaceholder, contentSnapshotHash: hashPlaceholder } };
  const unpacked = entries.reduce((sum, e) => sum + e.bytes, utf8Length(JSON.stringify(manifest, null, 2)));
  // Local headers + central directory + end record for the STORE fallback.
  const zip = unpacked + [...files.keys(),'manifest.json'].reduce((sum,path) => sum + 76 + 2 * utf8Length(path), 22);
  const uniqueAssetBytes = [...files].reduce((sum,[name,data]) => sum + (name.startsWith('assets/') ? byteSize(data) : 0), 0);
  const storedAssets = p.assets.reduce((sum,a) => sum + a.bytes.byteLength, 0);
  return { unpacked, total:unpacked + storedAssets - uniqueAssetBytes, zip, count: entries.length + 1 };
}
/** Upper bound for the byte length of canonical JSON. Six bytes covers any
 * UTF-16 unit, including a control character written as a Unicode escape.
 * Unsupported values return Infinity so admission uses the exact serializer. */
function jsonUpperBound(value: unknown, seen = new Set<object>()): number {
  if (value === null || value === undefined) return 4;
  if (typeof value === 'string') return 2 + 6 * value.length;
  if (typeof value === 'boolean') return 5;
  if (typeof value === 'number') return Number.isFinite(value) ? 25 : Infinity;
  if (typeof value !== 'object' || seen.has(value)) return Infinity;
  const array = Array.isArray(value);
  if (!array && ![null, Object.prototype].includes(Object.getPrototypeOf(value))) return Infinity;
  seen.add(value);
  let size = 2;
  if (array) {
    // Count holes as null and reserve one comma per item.
    for (const item of value) size += 1 + jsonUpperBound(item, seen);
  } else {
    for (const [key, item] of Object.entries(value)) {
      size += 4 + 6 * key.length + jsonUpperBound(item, seen);
    }
  }
  seen.delete(value);
  return size;
}

function checkAdmission(p: Project, limits: Limits): void {
  const size = portableSize(p, portableFiles(p, jsonUpperBound));
  if (size.zip <= limits.zipBytes && size.unpacked <= limits.zipUnpackedBytes &&
      size.total <= limits.totalProjectBytes && size.count <= limits.zipEntries) {
    assertBudget('markdown', utf8Length(p.source), limits);
    return;
  }
  // Crossing an upper bound is inconclusive. Use the exact bytes before deciding.
  assertPortable(p, limits);
}

export function projectBytes(p: Project): number {
  return portableSize(p, portableFiles(p, canonicalJson)).total;
}
export function assertPortable(p: Project, limits: Limits = LIMITS) {
  assertBudget('markdown', utf8Length(p.source), limits);
  const files = portableFiles(p, canonicalJson);
  const { count, unpacked, total, zip } = portableSize(p, files);
  assertBudget('zipEntries', count, limits);
  assertBudget('totalProject', total, limits);
  assertBudget('zipUnpacked', unpacked, limits);
  assertBudget('zip', zip, limits);
  return files;
}

export async function exportBundle(p: Project, now = nowIso(), limits: Limits = LIMITS): Promise<{ bytes: Uint8Array; manifest: BundleManifest }> {
  validateProject(p);
  const files: Record<string, Uint8Array> = Object.create(null);
  for (const [path, data] of assertPortable(p, limits)) files[path] = typeof data === 'string' ? te.encode(data) : data;
  const list = [];
  for (const [path, data] of Object.entries(files).sort(([a], [b]) => (a < b ? -1 : 1))) list.push({ path, sha256: await sha256Hex(data), bytes: data.byteLength });
  const manifest: BundleManifest = {
    format: BUNDLE_FORMAT, schemaVersion: SCHEMA_VERSION, appVersion: APP_VERSION, projectId: p.projectId, revision: p.revision, createdAt: now, files: list,
    hashes: { rawSourceHash: await computeRawSourceHash(p.inputs, p.source), contentSnapshotHash: await computeContentSnapshotHash(p.source, p.conversation) },
  };
  files['manifest.json'] = te.encode(JSON.stringify(manifest, null, 2));
  assertBudget('zipEntries', Object.keys(files).length, limits);
  const entries: Zippable = Object.create(null);
  for (const [path, data] of Object.entries(files)) {
    // Image bytes can be highly repetitive, too. Store assets verbatim under the normal ZIP ratio policy.
    entries[path] = path.startsWith('assets/') ? [data, { level: 0 }] : data;
  }
  let bytes = zipSync(entries, { level: 6 });
  if (bytes.length > limits.zipBytes) bytes = zipSync(files, { level: 0 });
  assertBudget('zip', bytes.length, limits);
  // Use the same reader as recovery before offering the download, including asset validation and hashes.
  const checked = await importBundle(bytes, limits);
  if (!checked.ok) throw new Error(checked.message);
  return { bytes, manifest };
}

export type BundleImportResult =
  | { ok: true; project: Project; manifest: BundleManifest; migrated?: MigrationResult }
  | { ok: false; code: 'BUNDLE_NOT_ZIP' | 'BUNDLE_NO_MANIFEST' | 'BUNDLE_FORMAT' | 'BUNDLE_NEWER_SCHEMA' | 'BUNDLE_HASH_MISMATCH' | 'BUNDLE_MISSING_FILE' | 'BUNDLE_CORRUPT' | 'BUDGET_EXCEEDED' | 'BUNDLE_UNSAFE'; message: string; messageEn: string };

/** Impor paket. Fungsi murni: proyek aktif TIDAK disentuh; pemanggil menggantinya hanya bila ok. */
export async function importBundle(bytes: Uint8Array, limits: Limits = LIMITS): Promise<BundleImportResult> {
  const fail = (code: Extract<BundleImportResult, { ok: false }>['code'], id: string, en: string): BundleImportResult => ({ ok: false, code, message: id, messageEn: en });
  const zipBudget = checkBudget('zip', bytes.length, limits);
  if (!zipBudget.ok) return fail('BUDGET_EXCEEDED', zipBudget.message, zipBudget.messageEn);
  if (!readCentralDirectory(bytes).ok) {
    // mungkin draf v1 berupa JSON
    try {
      const j = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      if (isLegacyDraftV1(j)) {
        const md = checkBudget('markdown', utf8Length(j.source), limits);
        if (!md.ok) return fail('BUDGET_EXCEEDED', md.message, md.messageEn);
        const m = await migrateV1Draft(j);
        const total = checkBudget('totalProject', projectBytes(m.project), limits);
        if (!total.ok) return fail('BUDGET_EXCEEDED', total.message, total.messageEn);
        return { ok: true, project: m.project, manifest: { format: BUNDLE_FORMAT, schemaVersion: 1, appVersion: '1.0.0', projectId: m.project.projectId, revision: 0, createdAt: m.project.createdAt, files: [], hashes: { rawSourceHash: '', contentSnapshotHash: '' } }, migrated: m }; }
    } catch { /* bukan JSON */ }
    return fail('BUNDLE_NOT_ZIP', 'Berkas bukan paket proyek PaperForma (.pfproj).', 'The file is not a PaperForma project bundle (.pfproj).');
  }
  const extracted = extractZipFiles(bytes, limits, 0, 'project');
  if (!extracted.ok) {
    const { fatal } = extracted;
    return fail(['ZIP_TOO_LARGE', 'ZIP_ENTRY_TOO_LARGE', 'ZIP_UNPACKED_TOO_LARGE'].includes(fatal.code) ? 'BUDGET_EXCEEDED' : 'BUNDLE_UNSAFE', fatal.message, fatal.messageEn);
  }
  const files = extracted.files;
  const mf = files.get('manifest.json');
  if (!mf) return fail('BUNDLE_NO_MANIFEST', 'manifest.json tidak ada di paket.', 'manifest.json is missing from the bundle.');
  let manifest: BundleManifest;
  try { manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(mf)); } catch { return fail('BUNDLE_CORRUPT', 'manifest.json tidak dapat dibaca.', 'manifest.json cannot be read.'); }
  if (!manifest || typeof manifest !== 'object' || manifest.format !== BUNDLE_FORMAT) return fail('BUNDLE_FORMAT', 'Format paket tidak dikenal.', 'Unknown bundle format.');
  if (manifest.schemaVersion > SCHEMA_VERSION) return fail('BUNDLE_NEWER_SCHEMA', `Paket dibuat oleh versi skema lebih baru (${manifest.schemaVersion}). Perbarui aplikasi.`, `The bundle uses a newer schema (${manifest.schemaVersion}). Update the app.`);
  if (manifest.schemaVersion !== SCHEMA_VERSION || typeof manifest.appVersion !== 'string' || !Number.isFinite(Date.parse(manifest.createdAt)) || !Array.isArray(manifest.files) || !manifest.hashes || !manifest.files.every(f => f && typeof f.path === 'string' && typeof f.sha256 === 'string' && /^[0-9a-f]{64}$/.test(f.sha256) && Number.isSafeInteger(f.bytes) && f.bytes >= 0)) {
    return fail('BUNDLE_CORRUPT', 'Daftar berkas manifest tidak valid.', 'Invalid manifest file list.');
  }
  const declared = new Set(manifest.files.map(f => f.path));
  if (declared.size !== manifest.files.length || [...files.keys()].some(path => path !== 'manifest.json' && !declared.has(path))) {
    return fail('BUNDLE_CORRUPT', 'Isi arsip berbeda dari daftar manifest.', 'Archive contents differ from the manifest.');
  }
  for (const f of manifest.files) {
    const data = files.get(f.path);
    if (!data) return fail('BUNDLE_MISSING_FILE', `Berkas ${f.path} hilang dari paket.`, `File ${f.path} is missing from the bundle.`);
    if ((await sha256Hex(data)) !== f.sha256 || data.byteLength !== f.bytes) return fail('BUNDLE_HASH_MISMATCH', `Hash ${f.path} tidak cocok; paket rusak atau diubah.`, `Hash of ${f.path} does not match; the bundle is corrupt or modified.`);
  }
  try {
    const dec = (path: string) => {
      const bytes = files.get(path);
      if (!bytes) throw new Error('BUNDLE_MISSING_FILE');
      return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    };
    const pj = JSON.parse(dec('project.json'));
    if (!pj || pj.schemaVersion !== SCHEMA_VERSION || typeof pj.projectId !== 'string' || pj.projectId !== manifest.projectId || pj.revision !== manifest.revision ||
        !Array.isArray(pj.history) || !Array.isArray(pj.inputs) || !Array.isArray(pj.assets) ||
        !pj.settings || !Object.hasOwn(TEMPLATES, pj.settings.template) ||
        !pj.history.every((item: Project['history'][number]) => item && typeof item.source === 'string' && Number.isSafeInteger(item.revision))) {
      return fail('BUNDLE_CORRUPT', 'Identitas atau struktur proyek tidak valid.', 'Invalid project identity or structure.');
    }
    const inputs: InputRecord[] = [];
    for (const i of pj.inputs ?? []) {
      if (i.plainFile !== `inputs/${i.id}.txt` || (i.htmlFile !== undefined && i.htmlFile !== `inputs/${i.id}.html`)) throw new Error('input.file');
      const rec: InputRecord = { id: i.id, kind: i.kind, importedAt: i.importedAt, byteLength: i.byteLength, rawPlain: dec(i.plainFile), rawSourceHash: i.rawSourceHash };
      if (i.htmlFile) rec.rawHtml = dec(i.htmlFile);
      if (rec.byteLength !== utf8Length(rec.rawPlain) + utf8Length(rec.rawHtml ?? '')) throw new Error('input.byteLength');
      if (i.name !== undefined) rec.name = i.name;
      if ((await inputRawHash(rec.rawPlain, rec.rawHtml)) !== rec.rawSourceHash) return fail('BUNDLE_HASH_MISMATCH', `Hash sumber mentah ${i.id} tidak cocok.`, `Raw source hash of ${i.id} does not match.`);
      inputs.push(rec);
    }
    const assets: AssetRecord[] = [];
    for (const a of pj.assets ?? []) {
      const data = files.get(a.file);
      if (!data) return fail('BUNDLE_MISSING_FILE', `Aset ${a.path} hilang.`, `Asset ${a.path} is missing.`);
      const r = await createAssetRecord(data, a.path, a.origin ?? 'upload', limits);
      if (!r.ok) return fail('BUNDLE_UNSAFE', r.message, r.messageEn);
      if (r.asset.id !== a.id) return fail('BUNDLE_HASH_MISMATCH', `Isi aset ${a.path} tidak cocok dengan id-nya.`, `Asset ${a.path} content does not match its id.`);
      if (a.file !== `assets/${a.id}.${extOf(r.asset.mime)}` || a.mime !== r.asset.mime || a.width !== r.asset.width || a.height !== r.asset.height) throw new Error('asset.metadata');
      assets.push(r.asset);
    }
    const project: Project = { ...pj, schemaVersion: SCHEMA_VERSION, inputs, assets, source: dec('source.md') };
    if (project.source !== pj.source) return fail('BUNDLE_HASH_MISMATCH', 'source.md tidak cocok dengan project.json.', 'source.md does not match project.json.');
    validateProject(project);
    if (canonicalJson(JSON.parse(dec('settings.json'))) !== canonicalJson(project.settings) ||
        (!!project.brandKit !== files.has('brandkit.json')) || (project.brandKit && canonicalJson(JSON.parse(dec('brandkit.json'))) !== canonicalJson(project.brandKit))) throw new Error('settings copy');
    const raw = await computeRawSourceHash(project.inputs, project.source);
    const content = await computeContentSnapshotHash(project.source, project.conversation);
    if (raw !== manifest.hashes.rawSourceHash || content !== manifest.hashes.contentSnapshotHash) return fail('BUNDLE_HASH_MISMATCH', 'Hash proyek tidak cocok dengan manifest.', 'Project hashes do not match the manifest.');
    const members = assertPortable(project, limits);
    if (members.size !== declared.size || [...declared].some(name => !members.has(name))) throw new Error('Undeclared project data');
    // Verify the sender’s bytes first. Network consent belongs to this recipient.
    project.settings = { ...project.settings, allowExternalImages: false };
    return { ok: true, project, manifest };
  } catch (e) {
    if (e instanceof BudgetError) return fail('BUDGET_EXCEEDED', e.result.message, e.result.messageEn);
    const field = e instanceof TypeError && e.message.startsWith('Invalid project field:') ? e.message.slice(22) : '';
    return fail('BUNDLE_CORRUPT', 'Isi paket tidak valid. ' + field, 'Invalid project bundle. ' + field);
  }
}
