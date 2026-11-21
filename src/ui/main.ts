/**
 * PaperForma 3 (statis) — aplikasi. Alur: Masukkan materi → Atur dokumen → Periksa dan ekspor.
 * Seluruh pemrosesan berjalan di browser. Tidak ada akun, harga, kuota, backend API, telemetry, atau pengiriman isi.
 *
 * Prinsip state (audit statis 2026-11-20):
 *  - UI-01  status simpan eksplisit: revisi aktif vs revisi terakhir yang benar-benar tersimpan vs cadangan yang diminta.
 *  - UI-02  semua label siap/pemeriksaan terikat revisi + renderInputHash + target; invalidasi langsung memperbarui UI.
 *  - UI-03  satu pemilik pekerjaan paginasi per snapshot (dedupe + abort); progress lama tidak menimpa yang baru.
 *  - UI-04  hasil terminal ekspor (gagal/diblokir/dibatalkan/siap) tampil DI DALAM dialog ekspor.
 *  - UI-05  bahasa/tema hanya mengubah presentasi; draf brand kit dipertahankan.
 *  - UI-06  undo/redo transaksi proyek (sumber, pengaturan, templat, brand, percakapan, aset) + pemulihan revisi penuh.
 *  - UI-07  satu pintu "Buka berkas"; HTML clipboard hanya dipakai bila masih sepadan dengan teks yang terlihat.
 *  - UI-08  semua temuan dan revisi dapat dijangkau (paging, filter, cari, unduh laporan lengkap).
 */
import './styles.css';
import * as C from '../core/index';
import type { AssetRecord, BrandKit, Conversation, Issue, OutputMode, Project, RenderedBody, Role, Settings, Snapshot, TemplateId } from '../core/index';
import * as R from '../render/index';
import { applyI18n, getLang, initLang, onLangChange, pick, setLang, t, type Key, type UiLang } from './i18n';
import { getTheme, initTheme, setTheme, type ThemePref } from './theme';
import { $, $$, announce, choiceDialog, confirmDialog, downloadBytes, el, fmtBytes, go, initMenu, initRouter, initTabs, notify, openDialog, safeFileName, skipToMain, currentRoute, updateTitle } from './shell';
import { SAMPLE_MD, SAMPLE_CONVERSATION } from './samples';
import { EngineClient, EngineError, assetMeta, type WorkerLike } from '../engine/client';
import { detectCompat } from './compat';
import { reviewDiff } from './review-diff';

type Target = 'html' | 'print';
type ViewStatus = 'idle' | 'processing' | 'ready' | 'failed';
type SaveUi = 'empty' | 'off' | 'bundle' | 'pending' | 'saved' | 'failed' | 'quota' | 'blocked' | 'unavailable' | 'conflict' | 'deleted';
type PubKind = 'print' | 'html-standalone' | 'html-zip' | 'html-publication';

/* =============================== state =============================== */
/** QA saja: `localStorage['pf.qa.engine']='main'` memaksa fallback thread utama untuk menguji jalur tanpa Worker. */
function qaEngineOptions(): ConstructorParameters<typeof EngineClient>[0] {
  if (import.meta.env.VITE_PF_QA !== '1') return {};
  try {
    const m = localStorage.getItem('pf.qa.engine');
    if (m === 'main') return { factory: null };
    // simulasi chunk Worker hilang setelah deploy baru: URL modul yang tidak ada
    if (m === 'broken') return { factory: () => new Worker(new URL('/assets/engine.worker-hilang.js', location.href), { type: 'module' }) as unknown as WorkerLike };
    return {};
  } catch { return {}; }
}

const S = {
  project: C.createProject({ name: '', template: 'BUS-01' }) as Project,
  /** PF-AUD-A01: invalidates pending imports even when the same project is reopened. */
  projectGeneration: 0,
  /** pelacak fragmen tempelan (konversi per fragmen); teks otoritatif = project.source */
  ledger: new C.PasteLedger(''),
  undo: new C.ProjectUndo(),
  prevProject: null as Project | null,
  view: {
    status: 'idle' as ViewStatus,
    revision: -1,
    snapshot: null as Snapshot | null,
    rendered: null as RenderedBody | null,
    hash: '',
    /** issue pratinjau di luar body: pemuatan font, Mermaid (EN-007) — milik revisi `hash` */
    previewIssues: [] as Issue[],
    fontChecked: false,
    integrity: null as C.IntegrityReport | null,
    assets: null as C.AssetPreflight | null,
    error: '' as string,
  },
  /** cache render per renderInputHash (bahasa UI/tema tidak masuk hash → tidak memicu render ulang) */
  cache: null as null | { hash: string; rendered: RenderedBody; html: string; previewIssues: Issue[]; integrity: C.IntegrityReport; assets: C.AssetPreflight },
  layout: {
    hash: '', jobId: 0, status: 'none' as 'none' | 'running' | 'done' | 'failed',
    issues: [] as Issue[], result: null as R.PaginationResult | null, abort: null as AbortController | null,
    promise: null as Promise<void> | null,
  },
  payloadCache: null as null | { hash: string; payload: R.PrintPayload },
  reports: { html: null as C.PreflightReport | null, print: null as C.PreflightReport | null },
  revGuard: new C.RevisionGuard(),
  exportGuard: new R.ExportGuard(),
  storage: null as C.ProjectStorage | null,
  autosave: null as C.AutosaveController | null,
  saveEnabled: false,
  save: { status: 'idle' as C.SaveStatus, savedRevision: -1, savedProjectId: '', bundleRevision: -1, bundleProjectId: '', lastNotified: '' as string },
  brandKits: [] as BrandKit[],
  brandLogos: new Map<string, AssetRecord>(),
  /** UI-05: draf brand kit yang belum disimpan (bertahan saat bahasa/tema berganti) */
  brandDraft: null as null | { kitId: string; name: string; org: string; accent: string; head: string; foot: string; logoId?: string },
  checks: { sev: 'all' as 'all' | 'error' | 'warning' | 'info', cat: '', q: '', page: 0 },
  historyPage: 0,
  paste: { mode: 'answer' as 'answer' | 'conversation', html: null as string | null, plainAtPaste: '' },
  publish: { running: false, abort: null as AbortController | null, session: null as R.PrintSession | null, lastKind: 'html-standalone' as PubKind, ack: false, last: null as null | { bytes: Uint8Array; name: string; mime: string } },
  metrics: [] as { phase: string; ms: number; at: number; revision: number }[],
  /** MESIN-36: analisis di Web Worker (fallback thread utama dengan jeda antar-fase) */
  engine: new EngineClient(qaEngineOptions()),
  progress: null as null | { phase: string; done: number; total: number },
};
const editor = () => $<HTMLTextAreaElement>('#editor');
const ISSUES_PER_PAGE = 100;
const HISTORY_PER_PAGE = 20;

function metric(phase: string, t0: number): void {
  S.metrics.push({ phase, ms: Math.round(performance.now() - t0), at: Date.now(), revision: S.project.revision });
  if (S.metrics.length > 400) S.metrics.splice(0, S.metrics.length - 400);
}

/* =============================== boot =============================== */
initTheme(); initLang();
let booted = false;
async function boot(): Promise<void> {
  if (booted) return; booted = true;
  applyI18n(document);
  syncPrefControls();
  wireGlobal();
  initTabs($('.panel-left .tabs'));
  // UI-03: memilih tab Halaman hanya meminta pekerjaan dari pengelola paginasi (dedupe per snapshot)
  initTabs($('.preview-bar .seg'), (id) => { if (id === 't-pages') void requestLayout('tab'); });
  initTabs($('.panel-right .tabs'));
  initFlow(); renderCompat();
  initMenu($<HTMLButtonElement>('#src-menu-btn'), $('#src-menu'));
  buildGoalCards();
  lazyLanding();
  await initStorage();
  initRouter(() => { void refresh(); });
  updateTitle();
  updateSaveUi();
  updateUndoButtons();
  onLangChange(() => {
    updateTitle(); buildGoalCards(); rebuildFormatCardsIfShown(); renderChecks(); updateReadiness(); renderConversationPanel(); renderAssets();
    renderBrandEditor(); updateSaveUi(); syncPrefControls(); syncSettingsUi(); updateRenderState(); refreshPublishDialog();
  });
}

/* =============================== prefs =============================== */
function syncPrefControls(): void {
  $$<HTMLSelectElement>('select[data-pref=lang]').forEach((s) => { s.value = getLang(); });
  $$<HTMLSelectElement>('select[data-pref=theme]').forEach((s) => { s.value = getTheme(); });
}

/* =============================== events =============================== */
function wireGlobal(): void {
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const a = target.closest<HTMLElement>('[data-action]');
    if (a && !(a as HTMLButtonElement).disabled) { e.preventDefault(); void runAction(a.dataset.action!, a); return; }
    const sc = target.closest<HTMLElement>('[data-scroll]');
    if (sc) { const s = document.getElementById(sc.dataset.scroll!); s?.scrollIntoView({ behavior: 'smooth' }); s?.focus({ preventScroll: true }); }
    const mt = target.closest<HTMLElement>('[data-mtab]');
    if (mt) setMobilePanel(mt.dataset.mtab as 'left' | 'center' | 'right');
    const f = target.closest<HTMLElement>('[data-filter]');
    if (f) { S.checks.sev = f.dataset.filter as typeof S.checks.sev; S.checks.page = 0; $$('[data-filter]').forEach((b) => b.setAttribute('aria-pressed', String(b === f))); renderChecks(); }
  });
  document.addEventListener('change', (e) => {
    const tg = e.target as HTMLElement;
    if (tg.matches('select[data-pref=lang]')) setLang((tg as HTMLSelectElement).value as UiLang);
    if (tg.matches('select[data-pref=theme]')) { setTheme((tg as HTMLSelectElement).value as ThemePref); syncPrefControls(); }
  });
  document.addEventListener('keydown', (e) => {
    // Undo/Redo proyek dari mana pun di studio, kecuali saat mengetik di bidang lain selain editor
    const mod = e.ctrlKey || e.metaKey;
    if (!mod || e.altKey || currentRoute() !== 'workspace' || document.querySelector('dialog[open]')) return;
    const tg = e.target as HTMLElement;
    if (tg !== editor() && tg.matches('input, textarea, select, [contenteditable]')) return;
    const k = e.key.toLowerCase();
    if (k === 'z') { e.preventDefault(); void (e.shiftKey ? doRedo() : doUndo()); }
    else if (k === 'y') { e.preventDefault(); void doRedo(); }
  });
  const ed = editor();
  ed.addEventListener('input', () => onEditorInput());
  ed.addEventListener('paste', (e) => onEditorPaste(e));
  $<HTMLInputElement>('#doc-title').addEventListener('change', (e) => { const v = (e.target as HTMLInputElement).value.trim(); commit({ name: v, settings: { ...S.project.settings, title: v } }, 'title'); });
  $$<HTMLInputElement | HTMLSelectElement>('[data-set]').forEach((inp) => inp.addEventListener('change', () => onSettingInput(inp)));
  $$<HTMLInputElement>('[data-margin]').forEach((inp) => inp.addEventListener('change', () => {
    const v = Math.max(5, Math.min(60, Number(inp.value) || 0));
    commit({ settings: { ...S.project.settings, margins: { ...S.project.settings.margins, [inp.dataset.margin!]: v }, followTemplateDefaults: false } }, 'margins');
    syncSettingsUi();
  }));
  $<HTMLInputElement>('#s-leading').addEventListener('input', (e) => { $('#s-leading-out').textContent = (e.target as HTMLInputElement).value; });
  $<HTMLSelectElement>('#s-brand').addEventListener('change', (e) => { const id = (e.target as HTMLSelectElement).value; applyBrandKit(S.brandKits.find((b) => b.id === id)); });
  $<HTMLInputElement>('#opt-external').addEventListener('change', (e) => commit({ settings: { ...S.project.settings, allowExternalImages: (e.target as HTMLInputElement).checked } }, 'external-images'));
  $<HTMLInputElement>('#opt-localsave').addEventListener('change', (e) => void toggleLocalSave((e.target as HTMLInputElement).checked));
  // berkas
  $<HTMLInputElement>('#file-open').addEventListener('change', (e) => { const inp = e.target as HTMLInputElement; const files = [...(inp.files ?? [])]; inp.value = ''; void openFiles(files); });
  $<HTMLInputElement>('#file-assets').addEventListener('change', (e) => { const inp = e.target as HTMLInputElement; const files = [...(inp.files ?? [])]; inp.value = ''; if (files.length) void addAssetFiles(files); });
  const replacement = $<HTMLInputElement>('#file-replace');
  replacement.addEventListener('cancel', () => { delete replacement.dataset.replace; });
  replacement.addEventListener('change', () => {
    const id = replacement.dataset.replace; const file = replacement.files?.[0];
    replacement.value = ''; delete replacement.dataset.replace;
    if (id && file) void replaceAsset(id, file);
  });
  // dialog tempel (UI-07: HTML clipboard terikat teks yang terlihat)
  const pa = $<HTMLTextAreaElement>('#paste-area');
  pa.addEventListener('paste', (e) => {
    const html = e.clipboardData?.getData('text/html') || '';
    const plain = e.clipboardData?.getData('text/plain') || '';
    S.paste.html = html.trim() ? html : null;
    S.paste.plainAtPaste = plain;
    setTimeout(updatePasteRich, 0);
  });
  pa.addEventListener('input', () => { $('#paste-size').textContent = fmtBytes(C.utf8Length(pa.value)); updatePasteRich(); });
  $$<HTMLInputElement>('input[name=paste-mode]').forEach((r) => r.addEventListener('change', () => { $('#paste-replace-warn').hidden = !(r.value === 'replace' && r.checked); }));
  $('#paste-ok').addEventListener('click', (e) => { e.preventDefault(); void submitPaste(); });
  // drag & drop → dispatcher yang sama dengan picker
  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => { if (e.dataTransfer?.types.includes('Files')) { dragDepth++; $('#drop-overlay').hidden = false; } });
  window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('#drop-overlay').hidden = true; } });
  window.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
  window.addEventListener('drop', (e) => { if (!e.dataTransfer?.files.length) return; e.preventDefault(); dragDepth = 0; $('#drop-overlay').hidden = true; void openFiles([...e.dataTransfer.files]); });
  // pemeriksaan
  $<HTMLSelectElement>('#check-cat').addEventListener('change', (e) => { S.checks.cat = (e.target as HTMLSelectElement).value; S.checks.page = 0; renderChecks(); });
  let qTimer = 0;
  $<HTMLInputElement>('#check-q').addEventListener('input', (e) => { clearTimeout(qTimer); qTimer = window.setTimeout(() => { S.checks.q = (e.target as HTMLInputElement).value.trim().toLowerCase(); S.checks.page = 0; renderChecks(); }, 150); });
  $('#issue-prev').addEventListener('click', () => { S.checks.page = Math.max(0, S.checks.page - 1); renderChecks(); $('#issue-list').focus?.(); });
  $('#issue-next').addEventListener('click', () => { S.checks.page++; renderChecks(); });
  $('#history-prev').addEventListener('click', () => { S.historyPage = Math.max(0, S.historyPage - 1); renderHistory(); });
  $('#history-next').addEventListener('click', () => { S.historyPage++; renderHistory(); });
  // ekspor
  $$<HTMLInputElement>('input[name=pub-kind]').forEach((r) => r.addEventListener('change', () => { S.publish.ack = false; refreshPublishDialog(); }));
  $<HTMLInputElement>('#pub-online').addEventListener('change', () => refreshPublishDialog());
  $('#pub-go').addEventListener('click', () => void runPublish());
  $('#pub-cancel').addEventListener('click', () => cancelPublish());
  const pubDlg = $<HTMLDialogElement>('#dlg-publish');
  // Escape/Tutup saat proses = batalkan proses (perilaku eksplisit), dialog tetap terbuka menampilkan status
  pubDlg.addEventListener('cancel', (e) => { if (S.publish.running) { e.preventDefault(); cancelPublish(); } });
  pubDlg.addEventListener('close', () => onPublishClosed());
  $<HTMLSelectElement>('#raw-select').addEventListener('change', () => showRawSelected());
  $('#raw-download').addEventListener('click', () => downloadRaw());
  // UI-01: penjaga tambahan bagi perubahan yang belum tersimpan/dicadangkan
  window.addEventListener('beforeunload', (e) => {
    if (S.autosave?.status === 'pending') void S.autosave.flush();
    if (isDirty()) { e.preventDefault(); e.returnValue = ''; }
  });
}

async function runAction(action: string, src: HTMLElement): Promise<void> {
  switch (action) {
    case 'skip': return skipToMain();
    case 'open-workspace': goWorkspace(); return void refresh();
    case 'open-file': return $<HTMLInputElement>('#file-open').click();
    case 'paste': return openPaste('answer', src);
    case 'paste-conv': return openPaste('conversation', src);
    case 'add-assets': return $<HTMLInputElement>('#file-assets').click();
    case 'save-bundle': return void saveBundle();
    case 'sample': return void loadSample();
    case 'new': return void newProject();
    case 'undo': return void doUndo();
    case 'redo': return void doRedo();
    case 'view-raw': return void viewRaw(src);
    case 'history': return void openHistory(src);
    case 'storage': return void openProjects(src);
    case 'publish': return void openPublish(src);
    case 'apply-style': return applyTemplateAction(false);
    case 'apply-full': return applyTemplateAction(true);
    case 'run-layout-check': return void runLayoutCheck();
    case 'clear-local': return void clearLocal();
    case 'download-report': return downloadReport();
    case 'goto-checks': return gotoChecks();
    default: return;
  }
}

function setMobilePanel(p: 'left' | 'center' | 'right'): void {
  $('#main-ws').dataset.mobile = p;
  $$('[data-mtab]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mtab === p)));
}
function gotoChecks(): void {
  const dlg = $<HTMLDialogElement>('#dlg-publish'); if (dlg.open && !S.publish.running) dlg.close();
  setMobilePanel('right'); ($('#t-checks') as HTMLButtonElement).click(); $('#readiness-box').focus?.();
}
function goWorkspace(): void { if (currentRoute() !== 'workspace') go('workspace'); }
function selectLeftTab(id: string): void { ($(`#${id}`) as HTMLButtonElement).click(); }

/* =============================== project mutations =============================== */
/**
 * Satu-satunya jalur perubahan proyek. Mencatat keadaan sebelumnya ke undo transaksi proyek (UI-06),
 * menaikkan revisi, menginvalidasi semua hasil turunan dan memperbarui status simpan.
 */
function commit(changes: Parameters<typeof C.commitRevision>[1], label: string, opts: { render?: boolean; undoKey?: string; record?: boolean } = {}): boolean {
  const before = S.project;
  try {
    const next = C.commitRevision(before, changes, label);
    if (opts.record !== false) S.undo.record(before, label, opts.undoKey);
    S.project = next;
    invalidateOutput();
  } catch (e) {
    if (S.ledger.text !== S.project.source) S.ledger.rejectLastEdit();
    if (editor().value !== S.project.source) editor().value = S.project.source;
    syncSettingsUi();
    notify('error', e instanceof C.BudgetError ? pick(e.result.message, e.result.messageEn) :
      pick('Perubahan ditolak. Periksa nilai bidang proyek.', 'Change rejected. Check the project field values.') + ' ' + (e as Error).message);
    return false;
  }
  S.ledger.forgetHistory();
  if (S.saveEnabled && S.autosave) S.autosave.schedule(S.project);
  updateSaveUi(); updateUndoButtons();
  if (opts.render !== false) scheduleRender();
  return true;
}

function setEditorFromProject(caret?: number): void {
  const ed = editor();
  if (ed.value !== S.project.source) ed.value = S.project.source;
  if (caret !== undefined) ed.selectionStart = ed.selectionEnd = Math.min(caret, ed.value.length);
}

/** Terapkan teks ledger ke proyek (setelah operasi ledger yang sukses). */
function commitLedger(label: string, extra: Parameters<typeof C.commitRevision>[1] = {}, caret?: number, opts: { undoKey?: string } = {}): boolean {
  const ok = commit({ ...extra, source: S.ledger.text }, label, opts);
  if (ok) setEditorFromProject(caret);
  return ok;
}

function onEditorInput(): void {
  const r = S.ledger.syncFromText(editor().value);
  if (!r.ok) {
    // anggaran terlampaui: kembalikan ke teks terakhir yang sah, tanpa pemotongan (IMP-13)
    const caret = editor().selectionStart;
    editor().value = S.ledger.text;
    editor().selectionStart = editor().selectionEnd = Math.min(caret, S.ledger.text.length);
    notify('error', pick(r.message, r.messageEn));
    return;
  }
  commit({ source: S.ledger.text }, 'edit', { undoKey: 'edit' });
}

/** Tempel langsung ke editor: rich HTML ditawarkan konversi untuk fragmen ITU saja (terikat status fragmen). */
function onEditorPaste(e: ClipboardEvent): void {
  const plain = e.clipboardData?.getData('text/plain') ?? '';
  const html = e.clipboardData?.getData('text/html') ?? '';
  if (!plain && !html) return;
  e.preventDefault();
  const ed = editor();
  const r = S.ledger.pasteAtCursor({ start: ed.selectionStart, end: ed.selectionEnd }, { plain, html: html || undefined });
  if (!r.ok) { notify('error', pick(r.message, r.messageEn)); return; }
  const input = C.makePasteInputRecord(plain, html || undefined);
  if (!commitLedger('paste-at-cursor', { inputs: [...S.project.inputs, input] }, r.fragment.end)) { S.ledger.rejectLastEdit(); return; }
  if (html.trim()) {
    const fragId = r.fragment.id;
    notify('info', pick('Teks terformat ditempel apa adanya sebagai teks biasa.', 'Formatted text was pasted as plain text.'), [
      { label: pick('Ubah bagian ini ke Markdown…', 'Convert this part to Markdown…'), run: () => void convertFragment(fragId) },
    ], { sticky: true });
  }
}

async function convertFragment(fragId: string): Promise<void> {
  const ledger = S.ledger;
  const frag = ledger.fragment(fragId);
  if (!frag || frag.status !== 'live') { notify('warning', pick('Bagian tempelan itu sudah diedit atau dihapus; konversi dibatalkan agar isi Anda tidak tertimpa.', 'That pasted part was edited or removed; conversion was cancelled so your text is not overwritten.')); return; }
  const preview = C.htmlToMarkdown(frag.rawHtml ?? '', { plain: frag.rawPlain });
  if (!preview.ok) { notify('error', pick(preview.message, preview.messageEn)); return; }
  const before = ledger.text.slice(frag.start, frag.end);
  const ok = await showDiff(before, preview.markdown, pick(`Hanya bagian yang ditempel (${fmtBytes(C.utf8Length(before))}) yang diganti. Perubahan: ${preview.changes.map((c) => `${c.kind}×${c.count}`).join(', ') || '—'}.`, `Only the pasted part (${fmtBytes(C.utf8Length(before))}) is replaced. Changes: ${preview.changes.map((c) => `${c.kind}×${c.count}`).join(', ') || '—'}.`), preview.issues);
  if (!ok || S.ledger !== ledger) return;
  const r = S.ledger.convertFragment(fragId);
  if (!r.ok) { notify('error', pick(r.message, r.messageEn)); return; }
  if (commitLedger('convert-fragment', {}, r.fragment.end)) notify('success', pick('Bagian tempelan diubah ke Markdown. Gunakan Urungkan untuk membatalkan.', 'Pasted part converted to Markdown. Use Undo to revert.'));
}

/* ---------------- undo/redo transaksi proyek (UI-06) ---------------- */
function applyUndoState(entry: C.UndoEntry, label: 'undo' | 'redo'): boolean {
  const changes = C.changesFor(entry.state, S.project);
  if (!commit(changes, label, { record: false })) return false;
  S.ledger = new C.PasteLedger(S.project.source);
  setEditorFromProject();
  if (S.project.brandKit) rememberKit(S.project.brandKit);
  S.brandDraft = null;
  syncSettingsUi(); renderAssets(); renderConversationPanel(); renderBrandEditor();
  announce(`${t(label === 'undo' ? 'ws.undo' : 'ws.redo')}: ${entry.label}`);
  return true;
}
async function doUndo(): Promise<void> {
  const before = S.project, e = S.undo.peekUndo();
  if (!e) { if (S.prevProject) return restorePrevProject(); announce(pick('Tidak ada yang dapat diurungkan.', 'Nothing to undo.')); return; }
  // PF-AUD-A03: only consume a history entry after project admission succeeds.
  if (applyUndoState(e, 'undo')) S.undo.undo(before);
  updateUndoButtons();
}
async function doRedo(): Promise<void> {
  const before = S.project, e = S.undo.peekRedo();
  if (!e) { announce(pick('Tidak ada yang dapat diulang.', 'Nothing to redo.')); return; }
  if (applyUndoState(e, 'redo')) S.undo.redo(before);
  updateUndoButtons();
}
function restorePrevProject(): void {
  const p = S.prevProject; if (!p) return; S.prevProject = null;
  loadProject(p, pick('Proyek sebelumnya dipulihkan.', 'Previous project restored.'), { keepPrev: true });
}
function updateUndoButtons(): void {
  const u = S.undo.peekUndo(), r = S.undo.peekRedo();
  const ub = $<HTMLButtonElement>('#btn-undo'), rb = $<HTMLButtonElement>('#btn-redo');
  ub.disabled = !u && !S.prevProject; rb.disabled = !r;
  ub.title = u ? `${t('ws.undo')}: ${u.label}` : S.prevProject ? pick('Urungkan: kembali ke proyek sebelumnya', 'Undo: back to previous project') : t('ws.undo');
  rb.title = r ? `${t('ws.redo')}: ${r.label}` : t('ws.redo');
}

/* =============================== input: tempel =============================== */
function openPaste(mode: 'answer' | 'conversation', src: HTMLElement): void {
  S.paste = { mode, html: null, plainAtPaste: '' };
  $('#dlg-paste-title').textContent = t(mode === 'answer' ? 'paste.title' : 'paste.conv.title');
  const pa = $<HTMLTextAreaElement>('#paste-area'); pa.value = '';
  $('#paste-rich').hidden = true; $('#paste-error').hidden = true; $('#paste-size').textContent = '0 B';
  $('#paste-mode-wrap').hidden = !S.project.source.length || mode === 'conversation';
  ($<HTMLInputElement>('input[name=paste-mode][value=insert]')).checked = true; $('#paste-replace-warn').hidden = true;
  void openDialog($<HTMLDialogElement>('#dlg-paste'), src);
  pa.focus();
}

/** HTML clipboard hanya sah bila teks yang terlihat masih persis teks clipboard yang menyertainya. */
function pasteHtmlValid(): boolean {
  const pa = $<HTMLTextAreaElement>('#paste-area');
  return !!S.paste.html && !!pa.value && normalizeNl(pa.value) === normalizeNl(S.paste.plainAtPaste);
}
const normalizeNl = (s: string) => s.replace(/\r\n?/g, '\n').replace(/\n+$/, '');
function updatePasteRich(): void {
  const box = $('#paste-rich');
  if (!S.paste.html) { box.hidden = true; return; }
  box.hidden = false;
  const valid = pasteHtmlValid();
  $('#paste-rich-msg').textContent = t(valid ? 'paste.rich' : 'paste.rich.stale');
  const md = $<HTMLInputElement>('input[name=paste-repr][value=markdown]');
  md.disabled = !valid;
  if (!valid) ($<HTMLInputElement>('input[name=paste-repr][value=plain]')).checked = true;
}

async function submitPaste(): Promise<void> {
  const owner = S.project, ledger = S.ledger;
  const plain = $<HTMLTextAreaElement>('#paste-area').value;
  const repr = ($<HTMLInputElement>('input[name=paste-repr]:checked')).value;
  const html = pasteHtmlValid() && repr === 'markdown' ? S.paste.html! : undefined;
  const rawHtml = pasteHtmlValid() ? S.paste.html! : undefined;
  const mode = S.project.source ? ($<HTMLInputElement>('input[name=paste-mode]:checked')).value : 'replace';
  const err = (m: string) => { const b = $('#paste-error'); b.textContent = m; b.hidden = false; b.focus?.(); };
  if (!plain.trim()) { err(pick('Belum ada teks yang ditempel.', 'Nothing has been pasted yet.')); return; }
  const bp = C.checkTextBudget('paste', plain); if (!bp.ok) { err(pick(bp.message, bp.messageEn)); return; }
  if (rawHtml) { const bh = C.checkTextBudget('pasteHtml', rawHtml); if (!bh.ok) { err(pick(bh.message, bh.messageEn)); return; } }
  const input = await C.makeInputRecord(rawHtml ? 'paste-html' : 'paste-plain', plain, { rawHtml, name: S.paste.mode });
  if (S.project !== owner || S.ledger !== ledger) { err(t('export.stale')); return; }

  if (S.paste.mode === 'conversation') {
    const parsed = C.parseClipboardConversation({ plain, html }, input.id);
    const blocking = parsed.issues.filter((i) => i.blocking || i.severity === 'error');
    if (blocking.length || !parsed.conversation.messages.length) { err(blocking.map((i) => pick(i.message, i.messageEn)).join(' · ') || pick('Tidak ada pesan yang dikenali.', 'No messages recognised.')); return; }
    // EN-011/UI-07: issue konversi ditampilkan SEBELUM diterapkan
    const warn = parsed.issues.filter((i) => i.severity === 'warning');
    if (warn.length) {
      const list = el('ul', { class: 'issue-mini' }, ...warn.slice(0, 20).map((i) => el('li', { text: pick(i.message, i.messageEn) })));
      if (warn.length > 20) list.append(el('li', { text: pick(`…dan ${warn.length - 20} lagi`, `…and ${warn.length - 20} more`) }));
      $<HTMLDialogElement>('#dlg-paste').close('ok');
      if (!(await confirmDialog(pick(`${parsed.conversation.messages.length} pesan dikenali dengan ${warn.length} catatan. Terapkan?`, `${parsed.conversation.messages.length} messages recognised with ${warn.length} notes. Apply?`), list))) return;
    } else $<HTMLDialogElement>('#dlg-paste').close('ok');
    if (S.project !== owner || S.ledger !== ledger) { notify('warning', t('export.stale')); return; }
    if (!commit({ inputs: [...S.project.inputs, input], conversation: { ...parsed.conversation, editable: true } }, 'import-conversation', { render: false })) return;
    goWorkspace();
    const sum = C.importSummary(parsed.conversation);
    notify(warn.length ? 'warning' : 'success',
      pick(`${sum.messages} pesan dikenali; ${sum.unknownRoles} peran perlu konfirmasi. Pilih pesan dan bentuk hasil, lalu tekan “Buat dokumen”.`, `${sum.messages} messages recognised; ${sum.unknownRoles} roles need confirmation. Choose messages and output form, then press “Build document”.`));
    selectLeftTab('t-msgs'); setMobilePanel('left');
    renderConversationPanel(); scheduleRender();
    return;
  }

  let text = plain;
  if (html) {
    const conv = C.htmlToMarkdown(html, { plain });
    if (!conv.ok) { err(pick(conv.message, conv.messageEn)); return; }
    $<HTMLDialogElement>('#dlg-paste').close('ok');
    const ok = await showDiff(plain, conv.markdown, pick('Teks biasa (−) dibandingkan hasil konversi Markdown (+). Tidak ada yang diterapkan sebelum Anda menyetujuinya; bila ditolak, teks biasa yang dipakai.', 'Plain text (−) compared with the Markdown conversion (+). Nothing is applied until you approve; if you decline, the plain text is used.'), conv.issues);
    if (ok) text = conv.markdown;
  } else $<HTMLDialogElement>('#dlg-paste').close('ok');
  if (S.project !== owner || S.ledger !== ledger) { notify('warning', t('export.stale')); return; }
  const payload = { plain: text };
  const ed = editor();
  let r: C.LedgerResult<{ fragment: C.PasteFragment }>;
  if (mode === 'append') r = S.ledger.appendAsMessage(payload);
  else if (mode === 'replace') r = S.ledger.replaceAll(payload, { confirmed: true });
  else r = S.ledger.pasteAtCursor({ start: ed.selectionStart, end: ed.selectionEnd }, payload);
  if (!r.ok) { notify('error', pick(r.message, r.messageEn)); return; }
  goWorkspace();
  if (!commitLedger('paste', { inputs: [...S.project.inputs, input], ...(mode === 'replace' ? { sourcePath: undefined } : {}) }, r.fragment.end)) return;
  autoTitle();
}

/* =============================== input: berkas (UI-07, satu dispatcher) =============================== */
type FileKind = 'text' | 'zip' | 'bundle' | 'image' | 'pdf' | 'docx' | 'unknown';
export function classifyFile(name: string): FileKind {
  const n = name.toLowerCase();
  if (/\.(md|markdown|txt)$/.test(n)) return 'text';
  if (n.endsWith('.pfproj')) return 'bundle';
  if (n.endsWith('.zip')) return 'zip';
  if (/\.(png|jpe?g|gif|webp|svg)$/.test(n)) return 'image';
  if (n.endsWith('.pdf')) return 'pdf';
  if (/\.(docx?|odt|rtf)$/.test(n)) return 'docx';
  return 'unknown';
}
async function openFiles(files: File[]): Promise<void> {
  if (!files.length) return;
  const images: File[] = [];
  let textUsed = false;
  for (const f of files) {
    const k = classifyFile(f.name);
    if (k === 'image') { images.push(f); continue; }
    if (k === 'text') { if (textUsed) { notify('warning', pick(`${f.name} dilewati: buka satu naskah teks per kali.`, `${f.name} skipped: open one text document at a time.`)); continue; } textUsed = true; await importMarkdownFile(f); continue; }
    if (k === 'zip') { await importZipFile(f); continue; }
    if (k === 'bundle') { await importBundleFile(f); continue; }
    if (k === 'pdf') { notify('error', pick(`${f.name}: impor PDF belum didukung. Salin teksnya lalu gunakan “Tempel teks”.`, `${f.name}: PDF import is not supported. Copy its text and use “Paste text”.`)); continue; }
    if (k === 'docx') { notify('error', pick(`${f.name}: impor DOCX/ODT/RTF belum didukung. Simpan sebagai Markdown/teks, atau salin lalu tempel.`, `${f.name}: DOCX/ODT/RTF import is not supported. Save it as Markdown/text, or copy and paste.`)); continue; }
    notify('error', pick(`${f.name}: jenis berkas tidak didukung. Didukung: .md .markdown .txt .zip .pfproj dan gambar PNG/JPEG/WebP/GIF/SVG.`, `${f.name}: unsupported file type. Supported: .md .markdown .txt .zip .pfproj and PNG/JPEG/WebP/GIF/SVG images.`));
  }
  if (images.length) await addAssetFiles(images);
}

async function importMarkdownFile(f: File): Promise<void> {
  const owner = S.project, ledger = S.ledger;
  const t0 = performance.now();
  const r = await C.readFileWithinBudget(f, 'markdown');
  if (S.project !== owner || S.ledger !== ledger) return;
  if (!r.ok) { notify('error', pick(r.budget.message, r.budget.messageEn)); return; }
  const dec = C.decodeUtf8Strict(r.bytes);
  if (!dec.ok) { notify('error', pick(`${f.name} bukan teks UTF-8 yang valid. Simpan ulang sebagai UTF-8.`, `${f.name} is not valid UTF-8 text. Re-save it as UTF-8.`)); return; }
  const input = await C.makeInputRecord('markdown-file', dec.text, { name: f.name });
  if (S.project !== owner || S.ledger !== ledger) return;
  const replace = !S.project.source || (await confirmDialog(pick(`Ganti seluruh sumber dengan ${f.name}? Anda dapat mengurungkannya.`, `Replace the entire source with ${f.name}? You can undo this.`)));
  if (!replace || S.project !== owner || S.ledger !== ledger) return;
  const lr = S.ledger.replaceAll({ plain: dec.text }, { confirmed: true });
  if (!lr.ok) { notify('error', pick(lr.message, lr.messageEn)); return; }
  goWorkspace();
  if (!commitLedger('open-file', { sourcePath: undefined, inputs: [...S.project.inputs, input], conversation: undefined, name: S.project.name || f.name.replace(/\.(md|markdown|txt)$/i, '') }, 0)) return;
  metric('ingest', t0);
  autoTitle();
  if (dec.hadBom || /\r\n/.test(dec.text)) notify('info', pick('BOM/akhir baris CRLF dipertahankan pada sumber asli; tampilan tidak berubah.', 'BOM/CRLF line endings are kept in the original source; display is unaffected.'));
}

async function importZipFile(f: File): Promise<void> {
  const owner = S.project;
  const rb = await C.readFileWithinBudget(f, 'zip');
  if (owner !== S.project) return;
  if (!rb.ok) { notify('error', pick(rb.budget.message, rb.budget.messageEn)); return; }
  const r = await C.importZipIntoProject(owner, rb.bytes);
  if (owner !== S.project) return;
  if (!r.ok) { notify('error', pick(r.message, r.messageEn)); return; }
  goWorkspace();
  let chosen: { path: string; text: string } | null = null;
  if (r.markdown.length) {
    chosen = r.markdown[0]!;
    if (r.needsSelection || S.project.source) {
      const sel = el('select', { id: 'zip-pick', 'aria-label': pick('Naskah', 'Document') });
      sel.append(el('option', { value: '', text: pick('— jangan ganti sumber —', '— keep current source —') }));
      r.markdown.forEach((m, i) => sel.append(el('option', { value: String(i), text: `${m.path} (${fmtBytes(m.bytes)})` })));
      sel.value = S.project.source ? '' : '0';
      const ok = await confirmDialog(pick(`ZIP berisi ${r.markdown.length} naskah. Pilih naskah yang dipakai sebagai sumber:`, `The ZIP contains ${r.markdown.length} documents. Choose the one to use as source:`), sel);
      chosen = ok && sel.value !== '' ? r.markdown[Number(sel.value)]! : null;
    }
  }
  if (S.project !== owner) return;
  if (chosen) {
    const input = await C.makeInputRecord('zip', chosen.text, { name: chosen.path });
    if (owner !== S.project) return;
    const lr = S.ledger.replaceAll({ plain: chosen.text }, { confirmed: true });
    if (!lr.ok) { notify('error', pick(lr.message, lr.messageEn)); return; }
    if (!commitLedger('zip', { sourcePath: chosen.path, assets: r.project.assets, inputs: [...S.project.inputs, input], conversation: undefined }, 0)) return;
    autoTitle();
  } else if (!commit({ assets: r.project.assets }, 'zip-assets')) return;
  const rep = [...r.report.unsupported, ...r.report.rejected];
  notify(rep.length ? 'warning' : 'success', pick(`ZIP diimpor: ${S.project.assets.length} aset di proyek.${rep.length ? ` Dilewati: ${rep.slice(0, 6).join('; ')}${rep.length > 6 ? '…' : ''}` : ''}`, `ZIP imported: ${S.project.assets.length} assets in project.${rep.length ? ` Skipped: ${rep.slice(0, 6).join('; ')}${rep.length > 6 ? '…' : ''}` : ''}`));
  renderAssets();
}

async function addAssetFiles(files: File[]): Promise<void> {
  const owner = S.project.projectId;
  const generation = S.projectGeneration;
  const originalPaths = new Map(S.project.assets.map(a => [a.path, a]));
  const msgs: string[] = [];
  let assets = [...S.project.assets];
  const additions = new Map<string, AssetRecord>();
  let added = 0;
  for (const f of files) {
    const rb = await C.readFileWithinBudget(f, 'asset');
    if (owner !== S.project.projectId || generation !== S.projectGeneration) return;
    if (!rb.ok) { msgs.push(f.name + ': ' + pick(rb.budget.message, rb.budget.messageEn)); continue; }
    // QA-02: anggaran piksel diperiksa dari header di AssetStore (termasuk total proyek) sebelum dekode apa pun
    const store = new C.AssetStore(assets);
    const res = await store.add(rb.bytes, f.name, 'upload');
    if (owner !== S.project.projectId || generation !== S.projectGeneration) return;
    if (!res.ok) { msgs.push(f.name + ': ' + pick(res.message, res.messageEn)); continue; }
    if (res.replaced && res.replaced.id !== res.asset.id) C.evictAsset(res.replaced.id);
    assets = store.list(); additions.set(res.asset.path, res.asset); added++;
  }
  // PF-AUD-A01: merge against the latest project. Independent concurrent batches survive;
  // a competing replacement of the same path requires a retry instead of overwriting it.
  const latest = new Map(S.project.assets.map(a => [a.path, a]));
  for (const [path, asset] of additions) {
    if (latest.get(path) !== originalPaths.get(path)) {
      notify('warning', pick(`Gambar ${path} telah berubah saat unggahan diproses. Unggah ulang agar perubahan terbaru tidak tertimpa.`, `Image ${path} changed while the upload was processing. Upload again so the latest change is not overwritten.`));
      return;
    }
    latest.set(path, asset);
  }
  if (added && !commit({ assets: [...latest.values()] }, 'add-images')) return;
  goWorkspace();
  renderAssets();
  if (msgs.length) notify('error', msgs.join(' · ')); else notify('success', pick(`${added} gambar ditambahkan.`, `${added} image(s) added.`));
}

async function replaceAsset(path: string, f: File): Promise<void> {
  const owner = S.project.projectId;
  const generation = S.projectGeneration;
  // PF-AUD-A02: content IDs are shared by aliases; the clicked filename is the selection identity.
  const old = S.project.assets.find((a) => a.path === path); if (!old) return;
  const rb = await C.readFileWithinBudget(f, 'asset');
  if (owner !== S.project.projectId || generation !== S.projectGeneration) return;
  if (!rb.ok) { notify('error', pick(rb.budget.message, rb.budget.messageEn)); return; }
  const rec = await C.createAssetRecord(rb.bytes, old.path, 'upload');
  if (!rec.ok) { notify('error', pick(rec.message, rec.messageEn)); return; }
  if (owner !== S.project.projectId || generation !== S.projectGeneration || !S.project.assets.includes(old)) return;
  const brandKit = S.project.brandKit?.logoAssetId === old.id && !S.project.assets.some(a => a !== old && a.id === old.id)
    ? { ...S.project.brandKit, logoAssetId: rec.asset.id } : S.project.brandKit;
  if (!commit({ assets: S.project.assets.map((a) => (a === old ? rec.asset : a)), brandKit }, 'replace-image')) return;
  renderAssets();
  notify('success', pick(`Gambar ${old.path} diganti (sha256 ${rec.asset.id.slice(0, 12)}…). Urungkan untuk mengembalikan.`, `Image ${old.path} replaced (sha256 ${rec.asset.id.slice(0, 12)}…). Undo to revert.`));
}

/** PF-AUD-A01: the same ownership rule covers remote-copy and brand image pickers. */
async function importAssetAtPath(f: File, path: string, origin: AssetRecord['origin'], owner: string, generation: number): Promise<AssetRecord | undefined> {
  const current = () => S.project.projectId === owner && S.projectGeneration === generation;
  if (!current()) return;
  const previous = S.project.assets.find(a => a.path === path);
  const rb = await C.readFileWithinBudget(f, 'asset');
  if (!current()) return;
  if (!rb.ok) { notify('error', pick(rb.budget.message, rb.budget.messageEn)); return; }
  const r = await C.createAssetRecord(rb.bytes, path, origin);
  if (!current()) return;
  if (!r.ok) { notify('error', pick(r.message, r.messageEn)); return; }
  if (S.project.assets.find(a => a.path === path) !== previous) { notify('warning', t('export.stale')); return; }
  const assets = S.project.assets.filter(a => a.path !== path).concat(r.asset);
  if (commit({ assets }, origin === 'brand' ? 'brand-logo' : 'external-copy')) return r.asset;
}

async function importBundleFile(f: File): Promise<void> {
  const rb = await C.readFileWithinBudget(f, 'zip');
  if (!rb.ok) { notify('error', pick(rb.budget.message, rb.budget.messageEn)); return; }
  const r = await C.importBundle(rb.bytes);
  if (!r.ok) { notify('error', pick(r.message, r.messageEn)); return; } // proyek aktif tidak disentuh
  if (!(await guardUnsaved())) return;
  let imported = r.project;
  const collision = imported.projectId === S.project.projectId || (S.saveEnabled && await S.storage?.load(imported.projectId));
  if (collision) imported = { ...imported, projectId: C.createProject().projectId };
  loadProject(imported, pick(`Paket proyek dibuka${r.migrated ? ' (dimigrasi dari versi lama; asli tetap di dalam paket)' : ''}. Urungkan untuk kembali ke proyek sebelumnya.`, `Project bundle opened${r.migrated ? ' (migrated from an older version; the original is kept in the bundle)' : ''}. Undo returns to the previous project.`));
  if (collision) notify('info', pick('Paket dibuka sebagai salinan karena ID proyek sudah digunakan di perangkat ini.', 'This bundle opened as a separate copy because the project ID is already in use on this device.'));
}

/* =============================== proyek =============================== */
function hasContent(p: Project = S.project): boolean { return !!(p.source.trim() || p.conversation || p.assets.length || p.inputs.length); }
/** UI-01: perubahan yang belum tersimpan di perangkat DAN belum diminta sebagai cadangan .pfproj */
function isDirty(): boolean {
  if (!hasContent()) return false;
  const p = S.project;
  if (S.saveEnabled && S.save.savedProjectId === p.projectId && S.save.savedRevision === p.revision) return false;
  if (S.save.bundleProjectId === p.projectId && S.save.bundleRevision === p.revision) return false;
  return true;
}
/** Penjaga sebelum mengganti proyek aktif: tawarkan cadangan bila ada perubahan belum tersimpan. */
async function guardUnsaved(): Promise<boolean> {
  if (!isDirty()) return true;
  const v = await choiceDialog(t('confirm.unsaved'), [
    { value: 'cancel', label: t('cancel') },
    { value: 'discard', label: t('choice.discard') },
    { value: 'save', label: t('choice.save'), primary: true },
  ]);
  if (v === 'save') return saveBundle();
  return v === 'discard';
}

function invalidateOutput(): void {
  S.revGuard.invalidate();
  // UI-02: status turun ke "memproses revisi N" SEKETIKA; tidak ada label siap milik revisi lama
  S.view.status = 'processing';
  S.reports = { html: null, print: null };
  if (S.layout.hash && S.layout.hash !== S.cache?.hash) { /* layout tetap terikat hash lamanya */ }
  abortLayout();
  if (S.publish.abort && S.publish.running) S.publish.abort.abort(new DOMException('stale', 'AbortError'));
  S.publish.last = null;
  if (S.publish.session && S.publish.session.state === 'prepared') { S.publish.session.dispose(); S.publish.session = null; }
  updateReadiness(); renderChecks(); updateRenderState();
}

function loadProject(p: Project, msg?: string, opts: { keepPrev?: boolean } = {}): void {
  const c = p.conversation;
  if (c && !c.editable) {
    const res = C.composeConversation(c, { lang: p.settings.contentLang.startsWith('en') ? 'en' : 'id', mainSource: p.source });
    const matches = C.verifyComposition(res, c).ok && (res.markdown === p.source || c.outputMode === 'source-appendix');
    try {
      p = C.commitRevision(p, { source: matches ? res.markdown : p.source, conversation: { ...c, editable: true, ...(matches ? { publication: C.publicationFor(c, res) } : {}) } }, 'editable-conversation');
    } catch (e) { notify('error', String((e as Error).message)); return; }
  }
  if (!opts.keepPrev && hasContent()) S.prevProject = S.project;
  S.exportGuard.activate(p.projectId);
  S.projectGeneration++;
  delete $<HTMLInputElement>('#file-replace').dataset.replace;
  S.project = p;
  S.undo.clear();
  S.cache = null; S.payloadCache = null; S.brandDraft = null;
  invalidateOutput();
  if (S.saveEnabled) S.autosave?.schedule(p);
  S.ledger = new C.PasteLedger(p.source);
  editor().value = p.source;
  if (p.brandKit) rememberKit(p.brandKit);
  goWorkspace();
  syncSettingsUi(); renderAssets(); renderConversationPanel(); renderBrandEditor(); updateSaveUi(); updateUndoButtons();
  scheduleRender(0);
  if (msg) notify('success', msg);
}

async function newProject(): Promise<void> {
  if (!(await guardUnsaved())) return;
  if (S.autosave) await S.autosave.flush();
  loadProject(C.createProject({ template: S.project.settings.template }));
}

async function loadSample(): Promise<void> {
  if (S.project.source && !(await confirmDialog(pick('Ganti sumber dengan contoh? Anda dapat mengurungkannya.', 'Replace the source with the sample? You can undo this.')))) return;
  const input = await C.makeInputRecord('paste-plain', SAMPLE_MD, { name: 'sample' });
  const r = S.ledger.replaceAll({ plain: SAMPLE_MD }, { confirmed: true });
  if (!r.ok) return;
  goWorkspace();
  if (!commitLedger('sample', { sourcePath: undefined, inputs: [...S.project.inputs, input], conversation: undefined, name: S.project.name || pick('Contoh laporan', 'Sample report') }, 0)) return;
  autoTitle();
}

function autoTitle(): void {
  if (S.project.settings.title) return;
  const m = /^#\s+(.+)$/m.exec(S.project.source);
  if (m) { const ti = m[1]!.trim().slice(0, 160); commit({ name: S.project.name || ti, settings: { ...S.project.settings, title: ti } }, 'auto-title', { record: false }); /* bagian dari transaksi yang memicunya */ syncSettingsUi(); }
}

/* =============================== pipeline pratinjau =============================== */
let renderTimer = 0;
/** Debounce adaptif: naskah besar menunggu lebih lama agar ketikan tidak memicu render berulang. */
function scheduleRender(delay?: number): void {
  clearTimeout(renderTimer);
  const d = delay ?? Math.min(1200, 250 + Math.floor(S.project.source.length / 20000) * 60);
  renderTimer = window.setTimeout(() => void refresh(), d);
}

function updateRenderState(): void {
  const st = $('#render-state');
  const v = S.view;
  const rev = S.project.revision;
  if (v.status === 'processing') {
    const pg = S.progress;
    const ph: Record<string, [string, string]> = { chars: ['memeriksa karakter', 'checking characters'], render: ['mengurai & menyusun', 'parsing & building'], 'integrity-model': ['membuat model keutuhan', 'building the integrity model'], references: ['memeriksa rujukan gambar', 'checking image references'], finish: ['sanitasi & pratinjau', 'sanitizing & previewing'] };
    const label = pg ? ph[pg.phase] : undefined;
    st.textContent = pg && label ? pick(`Memproses revisi ${rev} — tahap ${pg.done + 1}/${pg.total}: ${label[0]}…`, `Processing revision ${rev} — step ${pg.done + 1}/${pg.total}: ${label[1]}…`) : pick(`Memproses revisi ${rev}…`, `Processing revision ${rev}…`);
  }
  else if (v.status === 'failed') st.textContent = pick(`Revisi ${rev} gagal diproses`, `Revision ${rev} failed to process`);
  else if (v.status === 'ready' && v.rendered) st.textContent = pick(`Revisi ${v.revision} · ${v.rendered.stats.words} kata`, `Revision ${v.revision} · ${v.rendered.stats.words} words`);
  else st.textContent = '';
  // UI-02: pratinjau lama diberi label jelas sampai revisi baru selesai
  const stale = $('#stale-banner');
  const showing = v.revision >= 0 && v.revision !== rev && hasContent();
  stale.hidden = !showing;
  if (showing) stale.textContent = v.status === 'failed'
    ? pick(`Pratinjau di bawah milik revisi ${v.revision}. Revisi ${rev} gagal diproses: ${v.error}. Sumber Anda tetap utuh.`, `The preview below belongs to revision ${v.revision}. Revision ${rev} failed: ${v.error}. Your source is intact.`)
    : pick(`Pratinjau revisi sebelumnya (${v.revision}) — revisi ${rev} sedang diproses.`, `Previous revision preview (${v.revision}) — revision ${rev} is being processed.`);
}

async function refresh(): Promise<void> {
  if (currentRoute() !== 'workspace') return;
  const tok = S.revGuard.begin();
  const p = S.project;
  $('#empty-state').hidden = hasContent(p);
  ($<HTMLInputElement>('#doc-title')).value = p.settings.title || p.name || '';
  $('#src-stats').textContent = `${p.source.split('\n').length} ${pick('baris', 'lines')} · ${fmtBytes(C.utf8Length(p.source))}`;
  S.view.status = 'processing'; updateRenderState(); updateReadiness();
  const t0 = performance.now();
  try {
    const ts = performance.now();
    const snapshot = await C.makeSnapshot(p);
    if (!S.revGuard.isCurrent(tok)) return;
    metric('snapshot', ts);
    let entry = S.cache?.hash === snapshot.renderInputHash ? S.cache : null;
    if (!entry) {
      const t1 = performance.now();
      // MESIN-36: tahap tanpa DOM (karakter, parsing, render tahap 1, model keutuhan) di Worker; hasil usang ditolak klien
      const opts = C.snapshotRenderOptions(snapshot);
      S.progress = null;
      const analysis = await S.engine.run({ source: snapshot.source, options: { ...opts, assets: assetMeta(snapshot.assets) } }, {
        docVersion: snapshot.renderInputHash,
        onProgress: (pg) => { if (S.revGuard.isCurrent(tok)) { S.progress = pg; updateRenderState(); } },
      });
      if (!S.revGuard.isCurrent(tok)) return;
      metric(`analyze-${S.engine.stats.mode}`, t1);
      if (S.engine.stats.mode === 'fallback') renderCompat();
      for (const [k, ms] of Object.entries(analysis.timings)) S.metrics.push({ phase: `engine-${k}`, ms: Math.round(ms), at: Date.now(), revision: S.project.revision });
      const tf = performance.now();
      S.progress = { phase: 'finish', done: 4, total: 5 }; updateRenderState();
      const rendered = C.finishRender(analysis.stage1, snapshot.assets);
      metric('finish', tf);
      const t2 = performance.now();
      const integrity = C.checkRenderIntegrity(snapshot.source, rendered, { conversation: snapshot.conversation, expected: analysis.expected });
      metric('integrity', t2);
      const t3 = performance.now();
      const { html, issues } = await composeScreen(snapshot, rendered);
      if (!S.revGuard.isCurrent(tok)) return;
      metric('compose', t3);
      entry = { hash: snapshot.renderInputHash, rendered, html, previewIssues: issues, integrity, assets: analysis.assets };
      S.cache = entry;
      const fr = $<HTMLIFrameElement>('#live-frame');
      const scroll = fr.contentWindow?.scrollY ?? 0;
      fr.srcdoc = html;
      fr.onload = () => { fr.contentWindow?.scrollTo(0, scroll); };
    }
    S.progress = null;
    Object.assign(S.view, { status: 'ready', revision: snapshot.revision, snapshot, rendered: entry.rendered, hash: snapshot.renderInputHash, previewIssues: entry.previewIssues, fontChecked: true, integrity: entry.integrity, assets: entry.assets, error: '' });
    S.exportGuard.observe(snapshot);
    $('#src-hash').textContent = ` · raw ${snapshot.rawSourceHash.slice(0, 10)} · rev ${snapshot.revision}`;
    let tu = performance.now(); rebuildReports(); metric('reports', tu);
    tu = performance.now(); renderOutline(); metric('outline', tu);
    tu = performance.now(); renderChecks(); metric('checks', tu);
    tu = performance.now(); renderAssets(); updateReadiness(); updateRenderState(); metric('ui', tu);
    metric('refresh', t0);
    if (!$('#p-pages').hidden) void requestLayout('tab');
  } catch (e) {
    if (!S.revGuard.isCurrent(tok)) return;
    if (e instanceof EngineError && (e.code === 'ENGINE_STALE' || e.code === 'ENGINE_ABORTED')) return; // digantikan revisi lebih baru
    S.view.status = 'failed'; S.view.error = (e as Error).message;
    S.reports = { html: null, print: null };
    updateRenderState(); updateReadiness(); renderChecks();
    notify('error', pick(`Pratinjau revisi ${p.revision} gagal dibuat: ${(e as Error).message}. Sumber Anda tetap utuh.`, `Preview of revision ${p.revision} failed: ${(e as Error).message}. Your source is intact.`));
  }
}

const fontUrlCache = new Map<string, string>();
/** Font pratinjau: kegagalan dicatat sebagai issue lingkup font (EN-007), bukan ditelan. */
async function previewFonts(html: string, settings: Settings, brandKit?: BrandKit): Promise<{ css: string; issues: Issue[] }> {
  const plan = R.planFonts({ html, settings, mode: 'screen', headingFont: brandKit?.headingFont, brandKit });
  const { browserFontSource } = await import('../render/font-assets');
  const css: string[] = [];
  const issues: Issue[] = [...plan.issues];
  await Promise.all(plan.faces.map(async (spec) => {
    let url = fontUrlCache.get(spec.file);
    if (!url) {
      try {
        const b = await browserFontSource(spec);
        if (b.length < 12 || b[0] !== 0x77 || b[1] !== 0x4f || b[2] !== 0x46 || b[3] !== 0x32) throw new Error('bukan WOFF2');
        url = URL.createObjectURL(new Blob([b as BlobPart], { type: 'font/woff2' })); fontUrlCache.set(spec.file, url);
      } catch (e) {
        issues.push({ id: `font-load-${spec.file}`, code: 'FONT_LOAD_FAILED', severity: 'error', scope: 'font', blocking: true, message: `Font ${spec.family} ${spec.weight} ${spec.style} (${spec.subset}) gagal dimuat: ${(e as Error).message}` });
        return;
      }
    }
    css.push(`@font-face{font-family:'${spec.family}';font-style:${spec.style};font-weight:${spec.weight};font-display:swap;src:url(${url}) format('woff2');${spec.unicodeRange ? `unicode-range:${spec.unicodeRange};` : ''}}`);
  }));
  return { css: css.join('\n'), issues };
}

async function composeScreen(snapshot: Snapshot, body: RenderedBody): Promise<{ html: string; issues: Issue[] }> {
  const prepared = await R.prepareBody(snapshot, body, { mode: 'screen', renderMermaid: true, allowExternalImages: snapshot.settings.allowExternalImages });
  const fonts = await previewFonts(prepared.html, snapshot.settings, snapshot.brandKit);
  const doc = await R.composeDocument(snapshot, { mode: 'screen', prepared, fontCss: fonts.css, adaptive: true });
  // EN-007: issue Mermaid/gambar dari prepareBody dan issue font diteruskan ke panel Pemeriksaan
  return { html: doc.html, issues: C.dedupeIssues([...prepared.issues, ...fonts.issues]) };
}

/* =============================== pengelola paginasi (UI-03, EN-010) =============================== */
function abortLayout(): void {
  if (S.layout.abort) S.layout.abort.abort();
  S.layout.abort = null; S.layout.promise = null;
  if (S.layout.status === 'running') S.layout.status = 'none';
  const stage = $('#p-pages');
  stage.querySelectorAll('iframe').forEach((f) => f.remove());
  $('#pages-empty').hidden = false;
}

/** Meminta paginasi snapshot aktif. Permintaan untuk hash yang sama berbagi satu pekerjaan. */
function requestLayout(_why: 'tab' | 'button' | 'publish'): Promise<void> {
  const v = S.view;
  if (v.status !== 'ready' || !v.snapshot || !v.rendered) return Promise.resolve();
  const shown = !!$('#p-pages').querySelector('iframe');
  // Hasil untuk hash yang sama dipakai ulang; bila hasil berasal dari persiapan cetak (frame tersembunyi milik sesi cetak),
  // tampilan halaman dibuat sekali saat diminta.
  if (S.layout.hash === v.hash && (S.layout.status === 'failed' || (S.layout.status === 'done' && (shown || _why === 'publish')))) return Promise.resolve();
  if (S.layout.hash === v.hash && S.layout.status === 'running' && S.layout.promise) return S.layout.promise;
  abortLayout();
  const jobId = ++S.layout.jobId;
  const ctrl = new AbortController();
  const snapshot = v.snapshot, rendered = v.rendered, hash = v.hash;
  Object.assign(S.layout, { hash, status: 'running', issues: [], result: null, abort: ctrl });
  const stage = $('#p-pages');
  $('#pages-empty').hidden = true;
  $('#render-state').textContent = pick('Menyiapkan halaman…', 'Preparing pages…');
  const t0 = performance.now();
  const run = (async () => {
    try {
      const payload = await getPayload(snapshot, rendered, ctrl.signal);
      if (jobId !== S.layout.jobId) return;
      const { result } = await R.paginateInFrame(payload, {
        mount: stage, keepFrame: true, signal: ctrl.signal,
        onProgress: (pr) => { if (jobId === S.layout.jobId) $('#render-state').textContent = `${pick('Halaman', 'Pages')}: ${pr.phase}${pr.pages ? ` · ${pr.pages}` : ''}`; },
      });
      if (jobId !== S.layout.jobId) { stage.querySelectorAll('iframe').forEach((f) => f.remove()); return; }
      metric('layout', t0);
      Object.assign(S.layout, { status: 'done', issues: result.issues, result, abort: null });
      const fr = stage.querySelector('iframe');
      if (fr) { fr.title = t('frame.pages'); fr.removeAttribute('aria-hidden'); fr.tabIndex = 0; fr.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;visibility:visible'; fitPages(fr); }
      $('#render-state').textContent = pick(`Revisi ${snapshot.revision} · ${result.pageCount} halaman · ${result.passes} lintasan${result.stable ? '' : ' (tidak stabil)'}`, `Revision ${snapshot.revision} · ${result.pageCount} pages · ${result.passes} passes${result.stable ? '' : ' (unstable)'}`);
    } catch (e) {
      if (jobId !== S.layout.jobId) return;
      if (ctrl.signal.aborted) { S.layout.status = 'none'; return; }
      const issues = e instanceof R.PrintBlockedError ? e.issues
        : (e as R.PaginationError).issues?.length ? (e as R.PaginationError).issues
        : [{ id: 'layout-fail', code: (e as R.PaginationError).failure?.code ?? 'PAGINATION_FAILED', severity: 'error' as const, scope: 'layout' as const, blocking: true, message: (e as R.PaginationError).failure?.message ?? (e as Error).message }];
      Object.assign(S.layout, { status: 'failed', issues, result: null, abort: null });
      $('#pages-empty').hidden = false;
      $('#render-state').textContent = pick('Pemeriksaan halaman gagal — lihat Pemeriksaan', 'Page check failed — see Checks');
    } finally {
      if (jobId === S.layout.jobId) { S.layout.promise = null; rebuildReports(); renderChecks(); updateReadiness(); }
    }
  })();
  S.layout.promise = run;
  return run;
}

/** Skala tampilan halaman agar muat lebar panel (hanya @media screen di frame pratinjau; tidak memengaruhi cetak). */
function fitPages(fr: HTMLIFrameElement): void {
  const apply = () => {
    const d = fr.contentDocument; const pg = d?.querySelector<HTMLElement>('.pagedjs_page'); if (!d || !pg) return;
    const z = Math.min(1, Math.max(0.3, (fr.clientWidth - 32) / pg.offsetWidth));
    d.documentElement.style.setProperty('--pf-zoom', String(z));
  };
  apply();
  new ResizeObserver(apply).observe(fr);
}

async function getPayload(snapshot: Snapshot, rendered: RenderedBody, signal?: AbortSignal): Promise<R.PrintPayload> {
  if (S.payloadCache?.hash === snapshot.renderInputHash) return S.payloadCache.payload;
  const t0 = performance.now();
  const payload = await R.buildPrintPayload(snapshot, rendered, { signal });
  metric('print-payload', t0);
  S.payloadCache = { hash: snapshot.renderInputHash, payload };
  return payload;
}

async function runLayoutCheck(): Promise<void> {
  if (S.view.status !== 'ready') { await refresh(); }
  ($('#t-pages') as HTMLButtonElement).click(); // memanggil requestLayout yang sama (dedupe)
  await requestLayout('button');
  const n = issueCount(S.reports.print);
  notify(S.layout.status === 'failed' ? 'error' : 'info', S.layout.status === 'done'
    ? pick(`Pemeriksaan halaman selesai: ${S.layout.result?.pageCount ?? 0} halaman, ${n} temuan.`, `Page check finished: ${S.layout.result?.pageCount ?? 0} pages, ${n} findings.`)
    : pick('Pemeriksaan halaman gagal. Rincian ada di Pemeriksaan.', 'The page check failed. Details are in Checks.'), [{ label: t('checks.see'), run: () => gotoChecks() }]);
}

/* =============================== laporan & kesiapan (UI-02, EN-002) =============================== */
function rebuildReports(): void {
  const v = S.view;
  if (v.status !== 'ready' || !v.snapshot || !v.rendered || !v.integrity) { S.reports = { html: null, print: null }; return; }
  const identity = { projectId: v.snapshot.projectId, revision: v.snapshot.revision, renderInputHash: v.hash };
  const base = { integrity: v.integrity, renderedForHash: v.hash, ...(v.assets ? { assets: v.assets } : {}) };
  // Issue pratinjau (font/Mermaid) dicek nyata untuk revisi ini → kategori font "diperiksa"
  const fontIssues = v.previewIssues.filter((i) => i.scope === 'font');
  const otherPreview = v.previewIssues.filter((i) => i.scope !== 'font');
  const html = C.preflight(v.snapshot, { ...v.rendered, issues: [...v.rendered.issues, ...otherPreview] }, { ...base, target: 'html', identity, external: { font: fontIssues } });
  const layoutHere = S.layout.hash === v.hash && (S.layout.status === 'done' || S.layout.status === 'failed');
  const print = C.preflight(v.snapshot, { ...v.rendered, issues: [...v.rendered.issues, ...otherPreview] }, {
    ...base, target: 'print', identity: { ...identity, ...(layoutHere ? { layoutJobId: String(S.layout.jobId) } : {}) },
    external: { font: fontIssues, ...(layoutHere ? { layout: S.layout.issues } : {}) },
  });
  S.reports = { html, print };
}

const STATUS_KEY: Record<string, Key> = { ready: 'status.ready', review: 'status.review', fix: 'status.fix', unchecked: 'status.unchecked' };
function issueCount(r: C.PreflightReport | null): number { return r ? r.categories.reduce((a, c) => a + c.counts.error + c.counts.warning, 0) : 0; }

/* =============================== alur kerja 1–5 & kompatibilitas =============================== */
function initFlow(): void {
  const act: Record<string, () => void> = {
    input: () => { setMobilePanel('left'); ($('#t-src') as HTMLButtonElement).click(); editor().focus(); },
    check: () => { setMobilePanel('right'); ($('#t-checks') as HTMLButtonElement).click(); },
    style: () => { setMobilePanel('right'); ($('#t-settings') as HTMLButtonElement).click(); },
    preview: () => { setMobilePanel('center'); ($('#t-pages') as HTMLButtonElement).click(); },
    save: () => { ($('.ws-actions [data-action=publish]') as HTMLButtonElement).click(); },
  };
  $$<HTMLButtonElement>('[data-flow]').forEach((b) => b.addEventListener('click', () => act[b.dataset.flow ?? '']?.()));
}
function updateFlow(): void {
  const v = S.view;
  const current = v.status === 'ready' && v.revision === S.project.revision;
  const layoutHere = S.layout.hash === v.hash;
  const st: Record<string, 'done' | 'todo' | 'attention'> = {
    input: hasContent() ? 'done' : 'todo',
    check: !current ? 'todo' : S.reports.html?.status === 'fix' ? 'attention' : 'done',
    style: 'todo',
    preview: !current || !layoutHere ? 'todo' : S.layout.status === 'failed' || S.layout.result?.verification.status !== 'pass' ? 'attention' : S.layout.status === 'done' ? 'done' : 'todo',
    save: S.save.savedRevision === S.project.revision && S.save.savedProjectId === S.project.projectId ? 'done' : 'todo',
  };
  const key: Record<string, Key> = { done: 'flow.state.done', todo: 'flow.state.todo', attention: 'flow.state.attention' };
  $$<HTMLButtonElement>('[data-flow]').forEach((b, i) => {
    const s0 = st[b.dataset.flow ?? ''] ?? 'todo';
    b.dataset.state = s0;
    b.setAttribute('aria-label', `${i + 1}. ${b.textContent?.replace(/^\s*\d+\s*/, '').trim()} — ${t(key[s0]!)}`);
  });
}
function renderCompat(): void {
  const items = detectCompat().filter((c) => !c.ok);
  const lines = items.map((c) => pick(c.id, c.en));
  if (S.engine.stats.mode === 'fallback' && !items.some((c) => c.key === 'worker')) lines.push(pick(`Analisis berjalan di thread utama (Worker tidak dapat dipakai: ${S.engine.stats.reason ?? 'tidak diketahui'}). Hasil tetap sama; dokumen besar terasa lebih lambat.`, `Analysis runs on the main thread (Worker unavailable: ${S.engine.stats.reason ?? 'unknown'}). Results are the same; large documents feel slower.`));
  const b = $('#compat-banner');
  b.hidden = !lines.length;
  b.replaceChildren(...lines.map((l) => el('p', { text: l })));
}

function updateReadiness(): void {
  updateFlow();
  const box = $('#readiness-box'); box.replaceChildren();
  const v = S.view;
  const row = (label: string, status: string, text: string, hint?: string) => el('div', { class: 'ready-row' },
    el('span', { class: 'ready-target', text: label }), el('span', { class: `pill ${status}`, text }), hint ? el('span', { class: 'hint', text: hint }) : null);
  if (!hasContent()) { box.append(el('p', { class: 'hint', text: t('empty.desc') })); }
  else if (v.status === 'failed') {
    box.append(row(t('target.html'), 'fix', t('status.failed'), v.error), row(t('target.print'), 'fix', t('status.failed')));
  } else if (v.status === 'processing' || v.revision !== S.project.revision) {
    box.append(row(t('target.html'), 'unchecked', t('status.processing')), row(t('target.print'), 'unchecked', t('status.processing')));
  } else {
    const h = S.reports.html, p = S.reports.print;
    const layoutState = S.layout.hash === v.hash ? S.layout.status : 'none';
    box.append(row(t('target.html'), h?.status ?? 'unchecked', t(STATUS_KEY[h?.status ?? 'unchecked']!)));
    const printHint = layoutState === 'running' ? pick('memaginasi…', 'paginating…') : layoutState === 'none' ? pick('perlu pemeriksaan halaman', 'needs the page check') : undefined;
    box.append(row(t('target.print'), p?.status ?? 'unchecked', t(STATUS_KEY[p?.status ?? 'unchecked']!), printHint));
    box.append(el('p', { class: 'hint ident', text: `rev ${v.revision} · ${v.hash.slice(0, 12)}` }));
  }
  const n = issueCount(S.reports.print ?? S.reports.html);
  $$('[data-issue-count]').forEach((b) => { b.textContent = n ? String(n) : ''; });
}

/* =============================== struktur & pemeriksaan (UI-08) =============================== */
function renderOutline(): void {
  const ol = $('#outline'); ol.replaceChildren();
  const toc = S.view.rendered?.toc ?? [];
  $('#outline-empty').hidden = toc.length > 0;
  for (const h of toc) {
    const b = el('button', { type: 'button', class: `l${h.level}`, text: h.text });
    b.addEventListener('click', () => { const d = $<HTMLIFrameElement>('#live-frame').contentDocument; d?.getElementById(h.id)?.scrollIntoView(); setMobilePanel('center'); });
    ol.append(el('li', {}, b));
  }
}

/** Semua temuan unik dari kedua target (cetak ⊇ HTML + layout), dengan kategori asalnya. */
function allIssues(): Issue[] {
  const r = S.reports;
  return C.dedupeIssues([...(r.print?.categories ?? []), ...(r.html?.categories ?? [])].flatMap((c) => c.issues));
}

function renderChecks(): void {
  const sum = $('#check-summary'); sum.replaceChildren();
  const list = $('#issue-list'); list.replaceChildren();
  const r = S.reports.print ?? S.reports.html;
  const catSel = $<HTMLSelectElement>('#check-cat');
  if (!r) { $('#issue-count').textContent = ''; $('#issue-pager').hidden = true; catSel.replaceChildren(el('option', { value: '', text: t('checks.anycat') })); return; }
  for (const c of r.categories) {
    const lab = c.checked ? t(STATUS_KEY[c.status] ?? 'status.unchecked') : t('status.unchecked');
    sum.append(el('div', { class: 'cov' }, el('span', { text: pick(c.coverage.id, c.coverage.en) }), el('span', { class: `pill ${c.checked ? c.status : 'unchecked'}`, text: lab })));
  }
  const all = allIssues();
  const cats = [...new Set(all.map((i) => i.scope))].sort();
  const prevCat = S.checks.cat;
  catSel.replaceChildren(el('option', { value: '', text: t('checks.anycat') }), ...cats.map((c) => el('option', { value: c, text: c })));
  catSel.value = cats.includes(prevCat as Issue['scope']) ? prevCat : '';
  const q = S.checks.q;
  const filtered = all.filter((i) => (S.checks.sev === 'all' || i.severity === S.checks.sev) && (!catSel.value || i.scope === catSel.value)
    && (!q || `${i.code} ${i.message} ${(i as C.CoreIssue).messageEn ?? ''}`.toLowerCase().includes(q)));
  const pages = Math.max(1, Math.ceil(filtered.length / ISSUES_PER_PAGE));
  S.checks.page = Math.min(S.checks.page, pages - 1);
  const start = S.checks.page * ISSUES_PER_PAGE;
  const shown = filtered.slice(start, start + ISSUES_PER_PAGE);
  $('#issue-count').textContent = filtered.length
    ? pick(`Menampilkan ${start + 1}–${start + shown.length} dari ${filtered.length} temuan (total ${all.length}).`, `Showing ${start + 1}–${start + shown.length} of ${filtered.length} findings (total ${all.length}).`)
    : '';
  $('#issue-pager').hidden = pages <= 1;
  ($<HTMLButtonElement>('#issue-prev')).disabled = S.checks.page === 0;
  ($<HTMLButtonElement>('#issue-next')).disabled = S.checks.page >= pages - 1;
  if (!filtered.length) { list.append(el('li', { class: 'hint', text: t('checks.none') })); return; }
  for (const it of shown) {
    const ci = it as C.CoreIssue;
    const acts = el('div', { class: 'acts' });
    if (it.line) { const b = el('button', { type: 'button', class: 'btn btn-quiet btn-sm', text: `${t('checks.goto')} ${it.line}` }); b.addEventListener('click', () => gotoLine(it.line!)); acts.append(b); }
    const repair = ci.detail?.repair;
    if (repair === 'unwrap-fence' || repair === 'table-pad') { const b = el('button', { type: 'button', class: 'btn btn-secondary btn-sm', text: t('checks.repair') }); b.addEventListener('click', () => void repairIssue(it)); acts.append(b); }
    const sev = it.severity === 'error' ? t('checks.error') : it.severity === 'warning' ? t('checks.warning') : t('checks.info');
    list.append(el('li', { class: 'issue', 'data-sev': it.severity }, el('div', { class: 'sev', text: `${sev} · ${it.scope} · ${it.code}${it.blocking ? ' · ' + pick('menghalangi', 'blocking') : ''}` }), el('div', { text: pick(it.message, ci.messageEn) }), acts));
  }
}

function downloadReport(): void {
  const v = S.view;
  const report = {
    app: { name: 'PaperForma', version: C.APP_VERSION }, generatedAt: new Date().toISOString(),
    identity: v.snapshot ? { projectId: v.snapshot.projectId, revision: v.snapshot.revision, renderInputHash: v.hash, rawSourceHash: v.snapshot.rawSourceHash } : null,
    current: { revision: S.project.revision, viewStatus: v.status },
    layout: { status: S.layout.hash === v.hash ? S.layout.status : 'none', pages: S.layout.hash === v.hash ? S.layout.result?.pageCount ?? null : null, verification: S.layout.hash === v.hash ? S.layout.result?.verification ?? null : null },
    targets: { html: S.reports.html, print: S.reports.print },
    issues: allIssues(),
  };
  downloadBytes(new TextEncoder().encode(JSON.stringify(report, null, 2)), safeFileName(`${S.project.name || 'dokumen'}-laporan-rev${S.project.revision}`, 'json'), 'application/json');
}

function gotoLine(line: number): void {
  selectLeftTab('t-src'); setMobilePanel('left');
  const ed = editor(); const lines = ed.value.split('\n');
  let pos = 0; for (let i = 0; i < Math.min(line - 1, lines.length); i++) pos += lines[i]!.length + 1;
  ed.focus(); ed.selectionStart = pos; ed.selectionEnd = pos + (lines[line - 1]?.length ?? 0);
  const lh = parseFloat(getComputedStyle(ed).lineHeight) || 20; ed.scrollTop = Math.max(0, (line - 4) * lh);
}

async function repairIssue(it: Issue): Promise<void> {
  const src = S.project.source;
  let edit: C.ReversibleEdit | null = null;
  if ((it as C.CoreIssue).detail?.repair === 'unwrap-fence') edit = C.unwrapWrapper(src, C.detectWrapper(src));
  else if ((it as C.CoreIssue).detail?.repair === 'table-pad' && it.line) edit = C.repairTable(src, it.line);
  if (!edit) { notify('warning', pick('Tidak ada perbaikan otomatis yang aman untuk temuan ini. Edit sumber secara manual.', 'No safe automatic fix for this finding. Edit the source manually.')); return; }
  const ok = await showDiff(edit.before, edit.after, pick(edit.label, edit.labelEn));
  if (!ok || S.project.source !== src) return;
  const r = S.ledger.replaceAll({ plain: edit.after }, { confirmed: true });
  if (!r.ok) { notify('error', pick(r.message, r.messageEn)); return; }
  if (commitLedger('repair')) notify('success', pick('Perbaikan diterapkan. Urungkan untuk membatalkan.', 'Fix applied. Undo to revert.'));
}

async function showDiff(before: string, after: string, desc: string, issues: { message: string; messageEn?: string; severity?: string }[] = []): Promise<boolean> {
  const result = await reviewDiff(before, after);
  const view = $('#diff-view'); view.replaceChildren();
  view.classList.toggle('diff-full', result.kind === 'full');
  if (result.kind === 'full') {
    // PF-AUD-U02: two complete read-only texts instead of unbounded diff computation/DOM rows.
    // The approval button still controls whether the caller applies the conversion.
    for (const [text, label, filename] of [[before, t('repair.before'), 'before.txt'], [after, t('repair.after'), 'after.md']] as const) {
      const pane = el('textarea', { readonly: true, 'aria-label': label, wrap: 'off', rows: '14', spellcheck: 'false' });
      pane.value = text;
      const save = el('button', { type: 'button', class: 'btn btn-secondary btn-sm', text: t('repair.download') });
      save.addEventListener('click', () => downloadBytes(new TextEncoder().encode(text), filename, 'text/plain;charset=utf-8'));
      view.append(el('section', {}, el('strong', { text: label }), pane, save));
    }
  } else {
    for (const part of result.parts) {
      const lines = part.value.replace(/\n$/, '').split('\n');
      const cls = part.added ? 'add' : part.removed ? 'del' : '';
      const shown = !cls && lines.length > 6 ? [...lines.slice(0, 3), null, ...lines.slice(-3)] : lines;
      for (const l of shown) view.append(l === null ? el('div', { class: 'gap', text: '⋯' }) : el('div', { class: cls, text: l }));
    }
  }
  $('#diff-desc').textContent = desc + (result.kind === 'full' ? ' ' + t('repair.full') : '');
  // UI-07: issue konversi (mis. CLIPBOARD_PLAIN_MISMATCH) tampil sebelum persetujuan
  const box = $('#diff-issues'); box.replaceChildren();
  const relevant = issues.filter((i) => i.severity !== 'info');
  box.hidden = !relevant.length;
  if (relevant.length) box.append(el('p', { text: pick('Catatan konversi:', 'Conversion notes:') }), el('ul', {}, ...relevant.slice(0, 30).map((i) => el('li', { text: pick(i.message, i.messageEn) }))));
  return (await openDialog($<HTMLDialogElement>('#dlg-diff'))) === 'apply';
}

/* =============================== assets =============================== */
function renderAssets(): void {
  const ul = $('#asset-list'); ul.replaceChildren();
  $<HTMLInputElement>('#opt-external').checked = S.project.settings.allowExternalImages;
  const pre = S.view.snapshot ? (S.view.assets && S.view.hash === S.view.snapshot.renderInputHash ? S.view.assets : C.assetPreflight(S.view.snapshot)) : null;
  $$('[data-asset-count]').forEach((b) => { b.textContent = S.project.assets.length ? String(S.project.assets.length) : ''; });
  for (const m of pre?.missing ?? []) ul.append(el('li', {}, el('span', { class: 'missing', text: '⚠' }), el('div', {}, el('div', { class: 'path', text: m.path }), el('div', { class: 'meta missing', text: pick(`dirujuk baris ${m.line} — belum diunggah`, `referenced on line ${m.line} — not uploaded`) })), el('span')));
  for (const ext of pre?.external ?? []) {
    // PF-014 / CODE-09: aplikasi tidak mengambil gambar dari situs lain (CSP connect-src 'self');
    // pengguna mengunggah salinan yang sah, lalu salinan dipetakan ke URL asli.
    const up = el('button', { type: 'button', class: 'btn btn-secondary btn-sm', text: pick('Unggah salinan…', 'Upload copy…') });
    up.addEventListener('click', () => {
      const owner = S.project.projectId, generation = S.projectGeneration;
      const fi = $<HTMLInputElement>('#file-logo');
      fi.onchange = async () => {
        const f = fi.files?.[0]; fi.value = ''; fi.onchange = null; if (!f) return;
        if (!/^https:\/\//i.test(ext.url)) return;
        const rec = await importAssetAtPath(f, ext.url, 'remote-copy', owner, generation);
        if (!rec) return;
        renderAssets();
        notify('success', pick(`Salinan untuk ${ext.url} ditambahkan; gambar ini akan masuk cetak dan HTML mandiri.`, `Copy for ${ext.url} added; this image will be included in print and standalone HTML.`));
      };
      fi.click();
    });
    ul.append(el('li', {}, el('span', { text: '🌐' }), el('div', {}, el('div', { class: 'path', text: ext.url }), el('div', { class: 'meta', text: ext.resolvedAssetId ? pick('salinan lokal tersedia', 'local copy available') : pick('gambar eksternal — belum masuk cetak/HTML mandiri sampai salinannya diunggah', 'external image — not in print/standalone HTML until a copy is uploaded') })), ext.resolvedAssetId ? el('span') : up));
  }
  if (!S.project.assets.length && !pre?.missing.length) { ul.append(el('li', { class: 'hint', text: t('assets.empty') })); return; }
  for (const a of S.project.assets) {
    const img = el('img', { alt: '', src: C.assetDataUrl(a) });
    const rep = el('button', { type: 'button', class: 'btn btn-quiet btn-sm', text: t('assets.replace') });
    rep.addEventListener('click', () => { const fi = $<HTMLInputElement>('#file-replace'); fi.dataset.replace = a.path; fi.click(); });
    const del = el('button', { type: 'button', class: 'btn btn-quiet btn-sm', text: t('assets.remove') });
    // Byte aset tetap dirujuk oleh undo (tanpa duplikasi) sehingga penghapusan dapat diurungkan
    del.addEventListener('click', () => { commit({ assets: S.project.assets.filter((x) => x !== a) }, 'remove-image'); renderAssets(); });
    ul.append(el('li', {}, img, el('div', {}, el('div', { class: 'path', text: a.path }), el('div', { class: 'meta', text: `${a.mime} · ${fmtBytes(a.bytes.length)}${a.width ? ` · ${a.width}×${a.height}` : ''} · sha256 ${a.id.slice(0, 10)}…` })), el('div', {}, rep, del)));
  }
}

/* =============================== conversation panel =============================== */
const ROLES: Role[] = ['user', 'assistant', 'system', 'other', 'unknown'];
function renderConversationPanel(): void {
  const host = $('#conv-panel'); host.replaceChildren();
  const c = S.project.conversation;
  $$('[data-msg-count]').forEach((b) => { b.textContent = c ? String(c.messages.length) : ''; });
  if (!c) { host.append(el('p', { class: 'hint', text: pick('Belum ada percakapan. Gunakan “Tempel percakapan”.', 'No conversation yet. Use “Paste conversation”.') }), btnAction('paste-conv', t('cta.conv'))); return; }
  const sum = C.importSummary(c);
  host.append(el('p', { class: 'banner' }, `${t('conv.summary')}: ${sum.messages} ${t('conv.msgs')} · ${sum.selected} ${t('conv.selected')} · ${pick('peran belum pasti', 'uncertain roles')}: ${sum.unknownRoles}${c.provider ? ` · ${pick('penyedia (dugaan)', 'provider (guess)')}: ${c.provider.name}` : ''}`));
  const modeSel = el('select', { id: 'conv-mode' });
  const modes: [OutputMode, Key][] = [['answer', 'conv.mode.answer'], ['selected-messages', 'conv.mode.selected'], ['transcript', 'conv.mode.transcript'], ['curated', 'conv.mode.curated'], ['source-appendix', 'conv.mode.appendix']];
  for (const [v, k] of modes) modeSel.append(el('option', { value: v, text: t(k) }));
  modeSel.value = c.outputMode;
  modeSel.addEventListener('change', () => updateConv(C.setOutputMode(c, modeSel.value as OutputMode).conversation, 'mode'));
  const showRoles = el('input', { type: 'checkbox', id: 'conv-roles' }) as HTMLInputElement; showRoles.checked = ['transcript', 'source-appendix'].includes(c.outputMode) || (c.outputMode === 'selected-messages' && c.showRoles);
  showRoles.disabled = c.outputMode !== 'selected-messages';
  showRoles.addEventListener('change', () => updateConv({ ...c, showRoles: showRoles.checked }, 'show-roles'));
  host.append(el('div', { class: 'field' }, el('label', { for: 'conv-mode', text: t('conv.mode') }), modeSel), el('label', { class: 'check' }, showRoles, el('span', { text: t('conv.showroles') })));
  if (showRoles.disabled) host.append(el('p', { class: 'hint', text: showRoles.checked ? pick('Bentuk ini selalu mencantumkan pembicara.', 'This output form always identifies speakers.') : pick('Bentuk ini memakai isi tanpa label pembicara.', 'This output form uses the content without speaker labels.') }));
  host.append(el('p', { class: 'hint', text: pick('Buat dokumen menerapkan pilihan sebagai Markdown yang dapat disunting. Pratinjau dan ekspor mengikuti editor.', 'Build document applies these choices as editable Markdown. Preview and export follow the editor.') }));
  const bulk = el('div', { class: 'field-row' });
  const selA = el('button', { type: 'button', class: 'btn btn-secondary btn-sm', text: pick('Pilih semua jawaban asisten', 'Select all assistant answers') });
  selA.addEventListener('click', () => updateConv(C.selectMessages(c, c.messages.filter((m) => m.role === 'assistant').map((m) => m.id)).conversation, 'select-assistant'));
  const selAll = el('button', { type: 'button', class: 'btn btn-secondary btn-sm', text: pick('Pilih semua pesan', 'Select all messages') });
  selAll.addEventListener('click', () => updateConv(C.selectMessages(c, c.messages.map((m) => m.id)).conversation, 'select-all'));
  bulk.append(selA, selAll); host.append(bulk);
  const dupes = C.suggestDuplicates(c.messages);
  const dupeOf = new Map<string, string>(); for (const d of dupes) { dupeOf.set(d.a, d.kind); dupeOf.set(d.b, d.kind); }
  const order = c.selectedOrder.length ? c.selectedOrder : c.messages.filter((m) => m.selected).map((m) => m.id);
  const ul = el('ol', { class: 'msg-list' });
  c.messages.forEach((m, idx) => {
    const cb = el('input', { type: 'checkbox', 'aria-label': `${pick('Pilih pesan', 'Select message')} ${idx + 1}` }) as HTMLInputElement; cb.checked = m.selected;
    cb.addEventListener('change', () => updateConv(C.setSelected(c, m.id, cb.checked).conversation, 'select'));
    const rs = el('select', { 'aria-label': `${t('conv.role')} ${idx + 1}` }) as HTMLSelectElement;
    for (const r of ROLES) rs.append(el('option', { value: r, text: t(`conv.role.${r}` as Key) }));
    rs.value = m.role; rs.addEventListener('change', () => updateConv(C.setRole(c, m.id, rs.value as Role).conversation, 'role'));
    const pos = order.indexOf(m.id);
    const up = el('button', { type: 'button', class: 'icon-btn', 'aria-label': `${t('conv.up')} ${idx + 1}`, text: '↑' }); (up as HTMLButtonElement).disabled = pos <= 0;
    up.addEventListener('click', () => { const o = [...order]; [o[pos - 1], o[pos]] = [o[pos]!, o[pos - 1]!]; updateConv(C.reorderSelected(c, o).conversation, 'reorder'); });
    const down = el('button', { type: 'button', class: 'icon-btn', 'aria-label': `${t('conv.down')} ${idx + 1}`, text: '↓' }); (down as HTMLButtonElement).disabled = pos < 0 || pos >= order.length - 1;
    down.addEventListener('click', () => { const o = [...order]; [o[pos + 1], o[pos]] = [o[pos]!, o[pos + 1]!]; updateConv(C.reorderSelected(c, o).conversation, 'reorder'); });
    const body = el('textarea', { class: 'msg-body', readonly: true, rows: '5', 'aria-label': `${pick('Isi pesan', 'Message text')} ${idx + 1}` }) as HTMLTextAreaElement; body.value = m.markdown;
    const split = el('button', { type: 'button', class: 'btn btn-quiet btn-sm', text: t('conv.split'), title: pick('Letakkan kursor di isi pesan, lalu tekan', 'Place the caret in the message text, then press') });
    split.addEventListener('click', () => { const off = body.selectionStart; if (off <= 0 || off >= m.markdown.length) { notify('info', pick('Letakkan kursor di dalam isi pesan pada titik pemisahan.', 'Place the caret inside the message text where it should split.')); return; } updateConv(C.splitMessage(c, m.id, off).conversation, 'split'); });
    const next = c.messages[idx + 1];
    const merge = el('button', { type: 'button', class: 'btn btn-quiet btn-sm', text: t('conv.merge') }); (merge as HTMLButtonElement).disabled = !next;
    merge.addEventListener('click', () => { if (next) updateConv(C.mergeMessages(c, m.id, next.id).conversation, 'merge'); });
    const flags = [m.roleConfidence === 'low' || m.roleConfidence === 'unknown' ? t('conv.conf.low') : '', dupeOf.has(m.id) ? t('conv.dupe') : '', ...m.flags].filter(Boolean);
    ul.append(el('li', { class: 'msg', 'data-selected': String(m.selected) },
      el('div', { class: 'msg-head' }, cb, el('strong', { text: `#${idx + 1}` }), rs, m.speakerLabel ? el('span', { class: 'meta', text: `“${m.speakerLabel}”` }) : null, m.timestamp ? el('span', { class: 'meta', text: m.timestamp }) : null, pos >= 0 ? el('span', { class: 'badge', text: String(pos + 1) }) : null, el('span', { class: 'tools' }, up, down)),
      flags.length ? el('div', { class: 'flag', text: flags.join(' · ') }) : null, body, el('div', { class: 'acts' }, split, merge)));
  });
  host.append(ul);
  if (c.outputMode === 'curated') renderBlockPicker(host, c);
  const build = el('button', { type: 'button', class: 'btn btn-primary', text: t('conv.build') });
  build.addEventListener('click', () => void buildFromConversation());
  host.append(el('div', { style: 'margin-top:12px' }, build));
}
function renderBlockPicker(host: HTMLElement, c: Conversation): void {
  const ids = c.curatedBlockIds ?? [];
  const blocks = C.selectedMessages(c).flatMap(m => C.curatedBlocks(m).map(b => ({ ...b, message: m })));
  const byId = new Map(blocks.map(b => [b.id, b]));
  const set = (next: string[]) => updateConv({ ...c, curatedBlockIds: next }, 'blocks');
  const box = el('fieldset', {}, el('legend', { text: pick('Pilih blok', 'Choose blocks') }));
  for (const b of blocks) {
    const cb = el('input', { type: 'checkbox', 'data-curated-id': b.id });
    cb.checked = ids.includes(b.id);
    cb.disabled = b.unsupported;
    cb.addEventListener('change', () => set(cb.checked ? [...ids, b.id] : ids.filter(id => id !== b.id)));
    box.append(el('label', { class: 'check' }, cb, el('span', { text: b.unsupported ? pick('Frontmatter · sunting metadata ini pada awal dokumen.', 'Frontmatter · edit this metadata at the beginning of the document.') : `${b.message.id} · ${b.type} · ${b.text.slice(0, 100)}` })));
  }
  host.append(box);
  if (!ids.length) return;
  const order = el('ol', { id: 'curated-order' });
  ids.forEach((id, pos) => {
    const b = byId.get(id);
    const row = el('li', {}, el('span', { text: b ? b.text.slice(0, 88) : pick('Blok berubah atau pesannya tidak dipilih. Hapus dari urutan.', 'This block changed or its message is unselected. Remove it from the order.') }));
    for (const [step, title] of [[-1, t('conv.up')], [1, t('conv.down')]] as const) {
      const dest = pos + step;
      const move = el('button', { type: 'button', 'aria-label': `${title} · ${pos + 1}`, text: step < 0 ? '↑' : '↓' });
      move.disabled = dest < 0 || dest >= ids.length;
      move.addEventListener('click', () => { const next = [...ids]; [next[pos], next[dest]] = [next[dest]!, next[pos]!]; set(next); });
      row.append(move);
    }
    const remove = el('button', { type: 'button', text: pick('Hapus pilihan', 'Remove selection') });
    remove.addEventListener('click', () => set(ids.filter(x => x !== id)));
    row.append(remove); order.append(row);
  });
  host.append(order);
}

function btnAction(action: string, label: string): HTMLButtonElement { return el('button', { type: 'button', class: 'btn btn-secondary', 'data-action': action, text: label }) as HTMLButtonElement; }
function updateConv(c: Conversation, label: string): void { commit({ conversation: c }, `conversation:${label}`); renderConversationPanel(); }

async function buildFromConversation(): Promise<void> {
  const c = S.project.conversation; if (!c) return;
  const owner = S.project;
  let main = S.project.source;
  if (c.outputMode === 'source-appendix' && c.publication?.mode === 'source-appendix') {
    const first = c.publication.spans.find(s => s.kind === 'main');
    if (first && await C.sha256Hex(main) === c.publication.sourceHash) main = main.slice(first.outStart, first.outEnd);
    else {
      const ed = editor();
      if (ed.selectionEnd === ed.selectionStart) {
        notify('warning', pick('Lampiran telah disunting. Pilih teks utama di editor agar lampiran lama tidak disisipkan ulang.', 'The appendix has been edited. Select the main text in the editor to replace the previous appendix.'));
        return;
      }
      main = main.slice(ed.selectionStart, ed.selectionEnd);
    }
  }
  const res = C.composeConversation(c, { lang: S.project.settings.contentLang.startsWith('en') ? 'en' : 'id', mainSource: main });
  const checked = C.verifyComposition(res, c);
  if (!checked.ok) { notify('error', checked.issues.map(i => pick(i.message, i.messageEn)).join(' · ')); return; }
  if (S.project.source && !(await confirmDialog(pick('Terapkan pilihan ini ke editor? Susunan baru menggantikan naskah aktif. Percakapan asli tetap tersedia dan perubahan dapat diurungkan.', 'Apply these choices to the editor? The composition replaces the active document. The original conversation stays available and you can undo.')))) return;
  const publication = C.publicationFor(c, res);
  if (S.project !== owner) { notify('warning', t('export.stale')); return; }
  const r = S.ledger.replaceAll({ plain: res.markdown }, { confirmed: true });
  if (!r.ok) { notify('error', pick(r.message, r.messageEn)); return; }
  const tpl: TemplateId = c.outputMode === 'transcript' ? 'CON-01' : S.project.settings.template;
  if (!commitLedger('compose', { sourcePath: c.outputMode === 'source-appendix' ? owner.sourcePath : undefined, conversation: { ...c, editable: true, publication },
    settings: tpl !== owner.settings.template ? R.applyTemplate(owner.settings, tpl).settings : owner.settings }, 0)) return;
  syncSettingsUi(); renderConversationPanel(); setMobilePanel('center');
  notify('success', pick(`Dokumen disusun dari ${C.importSummary(c).selected} pesan; peta asal tersimpan (${res.provenance.length} blok).`, `Document composed from ${C.importSummary(c).selected} messages; provenance kept (${res.provenance.length} blocks).`));
}

/* =============================== settings / templates =============================== */
function buildGoalCards(): void {
  const g = $('#goal-grid'); g.replaceChildren();
  for (const tp of R.listTemplates()) {
    const b = el('button', { type: 'button', class: 'goal', role: 'radio', 'aria-checked': String(S.project.settings.template === tp.id), 'data-tpl': tp.id }, el('strong', { text: `${pick(tp.name.id, tp.name.en)}` }), el('span', { text: `${tp.id} · ${tp.tokens.paper}` }));
    b.addEventListener('click', () => selectGoal(tp.id));
    b.addEventListener('keydown', (e) => { const all = $$<HTMLButtonElement>('.goal', g); const i = all.indexOf(b); if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); all[(i + 1) % all.length]!.focus(); } if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); all[(i - 1 + all.length) % all.length]!.focus(); } });
    b.tabIndex = S.project.settings.template === tp.id ? 0 : -1;
    g.append(b);
  }
}
let pendingGoal: TemplateId | null = null;
function selectGoal(id: TemplateId): void {
  pendingGoal = id;
  $$('.goal').forEach((b) => { const on = b.dataset.tpl === id; b.setAttribute('aria-checked', String(on)); (b as HTMLButtonElement).tabIndex = on ? 0 : -1; });
  applyTemplateAction(S.project.settings.followTemplateDefaults);
}
function applyTemplateAction(full: boolean): void {
  const id = pendingGoal ?? S.project.settings.template;
  const res = R.applyTemplate({ ...S.project.settings, followTemplateDefaults: full }, id);
  commit({ settings: res.settings }, full ? 'template-full' : 'template-style');
  syncSettingsUi(); buildGoalCards();
  // UX-06: jelaskan apa yang diterapkan dan apa yang dipertahankan
  if (res.kept.length) announce(pick(`Dipertahankan: ${res.kept.join(', ')}`, `Kept: ${res.kept.join(', ')}`));
  notify('info', full ? pick(`Rekomendasi ${id} diterapkan: ${res.applied.join(', ') || '—'}.`, `${id} recommendation applied: ${res.applied.join(', ') || '—'}.`) : pick(`Gaya ${id} diterapkan; pengaturan Anda dipertahankan: ${res.kept.join(', ') || '—'}.`, `${id} style applied; your settings kept: ${res.kept.join(', ') || '—'}.`));
}

function onSettingInput(inp: HTMLInputElement | HTMLSelectElement): void {
  const k = inp.dataset.set as keyof Settings;
  let v: unknown = inp instanceof HTMLInputElement && inp.type === 'checkbox' ? inp.checked : inp.value;
  if (['baseSizePt', 'lineHeight', 'pageNumberStart', 'tocDepth'].includes(k)) v = Number(v);
  const layoutKeys: (keyof Settings)[] = ['paper', 'orientation', 'bodyFont', 'baseSizePt', 'lineHeight', 'cover', 'toc', 'tocDepth', 'chapterBreak', 'pageNumbers', 'header', 'footer'];
  const next = { ...S.project.settings, [k]: v } as Settings;
  if (layoutKeys.includes(k)) next.followTemplateDefaults = false;
  if (k === 'followTemplateDefaults' && v === true) { const r = R.applyTemplate(next, next.template); commit({ settings: r.settings }, 'follow-defaults'); syncSettingsUi(); return; }
  commit({ settings: next, ...(k === 'title' ? { name: String(v) } : {}) }, `setting:${k}`);
  if (layoutKeys.includes(k)) syncSettingsUi();
}

function syncSettingsUi(): void {
  const s = S.project.settings;
  $$<HTMLInputElement | HTMLSelectElement>('[data-set]').forEach((inp) => {
    const v = (s as unknown as Record<string, unknown>)[inp.dataset.set!];
    if (inp instanceof HTMLInputElement && inp.type === 'checkbox') inp.checked = !!v; else inp.value = v === undefined || v === null ? '' : String(v);
  });
  $$<HTMLInputElement>('[data-margin]').forEach((inp) => { inp.value = String(s.margins[inp.dataset.margin as keyof typeof s.margins]); });
  $('#s-leading-out').textContent = String(s.lineHeight);
  ($<HTMLInputElement>('#doc-title')).value = s.title || S.project.name || '';
  const bs = $<HTMLSelectElement>('#s-brand'); bs.replaceChildren(el('option', { value: '', text: t('brand.none') }));
  for (const b of S.brandKits) bs.append(el('option', { value: b.id, text: b.name }));
  bs.value = S.project.brandKit?.id ?? '';
  buildGoalCards();
}

/* =============================== brand kit =============================== */
function rememberKit(kit: BrandKit): void {
  S.brandKits = [...S.brandKits.filter((other) => other.id !== kit.id), kit];
  const logo = S.project.assets.find((asset) => asset.id === kit.logoAssetId);
  if (logo) S.brandLogos.set(kit.id, logo);
  else if (S.brandLogos.get(kit.id)?.id !== kit.logoAssetId) S.brandLogos.delete(kit.id);
}
function applyBrandKit(kit?: BrandKit): void {
  const assets = [...S.project.assets];
  if (kit?.logoAssetId && !assets.some((a) => a.id === kit.logoAssetId)) {
    const cached = S.brandLogos.get(kit.id);
    if (!cached) {
      notify('warning', pick('Pilih kembali logo kit ini lalu simpan agar logo tersedia di proyek berikutnya.', 'Choose the logo for this kit again and save it to make it available in future projects.'));
    } else {
      assets.push({ ...cached, path: assets.some((a) => a.path === cached.path) ? 'brand/' + cached.id + '.' + cached.path.split('.').pop() : cached.path });
    }
  }
  S.brandDraft = null;
  commit({ brandKit: kit, assets, settings: { ...S.project.settings, brandKitId: kit?.id } }, 'brand');
  renderBrandEditor();
}
function renderBrandEditor(): void {
  const host = $('#brand-editor'); host.replaceChildren();
  const cur = S.project.brandKit;
  const kitId = cur?.id ?? '';
  // UI-05: nilai diambil dari draf yang belum disimpan bila ada (bahasa/tema berganti tidak menghapusnya)
  const d = S.brandDraft && S.brandDraft.kitId === kitId ? S.brandDraft : null;
  const name = el('input', { type: 'text', id: 'b-name', maxlength: '80' }) as HTMLInputElement; name.value = d?.name ?? cur?.name ?? '';
  const org = el('input', { type: 'text', id: 'b-org', maxlength: '120' }) as HTMLInputElement; org.value = d?.org ?? cur?.orgName ?? '';
  const acc = el('input', { type: 'color', id: 'b-accent' }) as HTMLInputElement; acc.value = d?.accent ?? cur?.accent ?? '#245b75';
  const hf = el('select', { id: 'b-head' }) as HTMLSelectElement; hf.append(el('option', { value: 'inter', text: 'Inter' }), el('option', { value: 'source-serif-4', text: 'Source Serif 4' })); hf.value = d?.head ?? cur?.headingFont ?? 'inter';
  const foot = el('input', { type: 'text', id: 'b-foot', maxlength: '120' }) as HTMLInputElement; foot.value = d?.foot ?? cur?.footerText ?? '';
  let logoId = d ? d.logoId : cur?.logoAssetId;
  const sync = () => {
    S.brandDraft = { kitId, name: name.value, org: org.value, accent: acc.value, head: hf.value, foot: foot.value, logoId };
    draftNote.hidden = false;
  };
  const draftNote = el('div', { class: 'banner banner-warn', role: 'status' }, el('span', { text: t('brand.draft') + ' ' }));
  const discard = el('button', { type: 'button', class: 'btn btn-quiet btn-sm', text: t('brand.discard') });
  discard.addEventListener('click', () => { S.brandDraft = null; renderBrandEditor(); });
  draftNote.append(discard);
  draftNote.hidden = !d;
  for (const inp of [name, org, acc, hf, foot]) inp.addEventListener('input', sync);
  hf.addEventListener('change', sync);
  const logoInfo = el('span', { class: 'hint', text: logoId ? `sha256 ${logoId.slice(0, 10)}…` : '—' });
  const logoBtn = el('button', { type: 'button', class: 'btn btn-secondary btn-sm', text: t('brand.logo') });
  logoBtn.addEventListener('click', () => {
    const owner = S.project.projectId, generation = S.projectGeneration;
    const fi = $<HTMLInputElement>('#file-logo');
    fi.onchange = async () => {
      const f = fi.files?.[0]; fi.value = ''; fi.onchange = null; if (!f) return;
      const rec = await importAssetAtPath(f, `brand/${f.name}`, 'brand', owner, generation);
      if (!rec || !logoInfo.isConnected) return;
      logoId = rec.id; logoInfo.textContent = `sha256 ${logoId.slice(0, 10)}…`; sync();
    };
    fi.click();
  });
  const save = el('button', { type: 'button', class: 'btn btn-primary btn-sm', text: t('brand.save') });
  save.addEventListener('click', async () => {
    const v = C.validateBrandKit({ id: cur?.id ?? `brand-${crypto.randomUUID()}`, name: name.value.trim(), orgName: org.value.trim() || undefined, accent: acc.value, headingFont: hf.value as BrandKit['headingFont'], footerText: foot.value.trim() || undefined, logoAssetId: logoId, updatedAt: new Date().toISOString() }, S.project.assets);
    if (!v.ok) { notify('error', v.errors.map((e) => pick(e.message, e.messageEn)).join(' · ')); return; }
    rememberKit(v.brandKit);
    S.brandDraft = null;
    commit({ brandKit: v.brandKit, settings: { ...S.project.settings, brandKitId: v.brandKit.id } }, 'brand-kit');
    syncSettingsUi(); renderBrandEditor();
    $('#brand-editor .btn-primary').focus();
    if (S.saveEnabled && S.storage) { const r = await S.storage.saveBrandKit(v.brandKit, S.brandLogos.get(v.brandKit.id)); notify(r.status === 'saved' ? 'success' : 'error', r.status === 'saved' ? pick('Brand kit disimpan di perangkat ini.', 'Brand kit saved on this device.') : pick(`Brand kit dipakai, tetapi gagal disimpan: ${r.status}.`, `Brand kit applied but not saved: ${r.status}.`)); }
    else notify('info', pick('Brand kit dipakai pada proyek ini. Aktifkan penyimpanan otomatis untuk memakainya lagi di proyek lain.', 'Brand kit applied to this project. Turn on automatic saving to reuse it in other projects.'));
  });
  const del = el('button', { type: 'button', class: 'btn btn-quiet btn-sm', text: t('brand.delete') }); (del as HTMLButtonElement).disabled = !cur;
  del.addEventListener('click', async () => {
    if (!cur) return;
    if (S.storage && S.saveEnabled) { const r = await S.storage.deleteBrandKit(cur.id); if (r.status !== 'deleted' && r.status !== 'not-found') { notify('error', pick(`Brand kit gagal dihapus: ${r.status}.`, `Brand kit could not be deleted: ${r.status}.`)); return; } }
    S.brandKits = S.brandKits.filter((b) => b.id !== cur.id);
    S.brandLogos.delete(cur.id); S.brandDraft = null;
    if (S.project.brandKit?.id !== cur.id) { syncSettingsUi(); return; }
    commit({ brandKit: undefined, settings: { ...S.project.settings, brandKitId: undefined } }, 'brand-delete'); renderBrandEditor(); syncSettingsUi();
  });
  const f = (id: string, k: Key, c: HTMLElement) => el('div', { class: 'field' }, el('label', { for: id, text: t(k) }), c);
  host.append(draftNote, f('b-name', 'brand.name', name), f('b-org', 'brand.org', org), el('div', { class: 'field-row' }, f('b-accent', 'brand.accent', acc), f('b-head', 'brand.headfont', hf)), f('b-foot', 'brand.footer', foot), el('div', { class: 'field' }, logoBtn, ' ', logoInfo), el('div', { class: 'field-row' }, save, del));
}


/* =============================== penyimpanan (UI-01) =============================== */
async function initStorage(): Promise<void> {
  let enabled = false; try { enabled = localStorage.getItem('pf.store.enabled') === '1'; } catch { /* diblokir */ }
  if (enabled) await toggleLocalSave(true, true);
  renderBrandEditor(); syncSettingsUi(); updateSaveUi();
  // Pemulihan: tawarkan proyek terakhir yang tersimpan di perangkat (tidak dibuka otomatis)
  if (S.saveEnabled && S.storage) {
    try {
      const list = await S.storage.list();
      const last = [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      if (last) notify('info', pick(`Proyek terakhir di perangkat ini: “${last.name || last.projectId}” (rev ${last.revision}).`, `Last project on this device: “${last.name || last.projectId}” (rev ${last.revision}).`), [
        { label: pick('Lanjutkan', 'Continue'), run: () => void (async () => { const full = await S.storage!.load(last.projectId); if (full) { loadProject(full); S.save.savedRevision = full.revision; S.save.savedProjectId = full.projectId; updateSaveUi(); } else notify('error', pick('Proyek tidak dapat dibaca.', 'Project could not be read.')); })() },
      ], { sticky: true });
    } catch { /* daftar tidak terbaca: status penyimpanan sudah melaporkan */ }
  }
  // migrasi draf 1.0.0: eksplisit, asli tetap
  try {
    const legacy = await C.readLegacyDraft();
    if (legacy && C.isLegacyDraftV1(legacy)) notify('info', pick('Ditemukan draf dari PaperForma 1.0. Buka sebagai proyek baru? Draf asli tidak diubah.', 'A draft from PaperForma 1.0 was found. Open it as a new project? The original draft is not changed.'), [
      { label: pick('Buka draf lama', 'Open old draft'), run: () => void (async () => { const m = await C.migrateV1Draft(legacy); loadProject(m.project, pick(`Draf dimigrasi (${m.changes.length} perubahan bidang). ${m.warnings.join(' ')}`, `Draft migrated (${m.changes.length} field changes). ${m.warnings.join(' ')}`)); })() },
    ], { sticky: true });
  } catch { /* IndexedDB tidak tersedia */ }
}

async function toggleLocalSave(on: boolean, silent = false): Promise<void> {
  const cb = $<HTMLInputElement>('#opt-localsave');
  if (!on) {
    await S.autosave?.flush(); S.autosave?.cancel();
    S.saveEnabled = false; S.autosave = null; cb.checked = false;
    try { localStorage.setItem('pf.store.enabled', '0'); } catch { /* ignore */ }
    updateSaveUi(); renderStorageState();
    if (!silent) notify('info', pick('Penyimpanan otomatis dimatikan. Data yang sudah tersimpan tidak dihapus; gunakan “Hapus semua data lokal” untuk menghapusnya.', 'Automatic saving turned off. Already-saved data is not deleted; use “Delete all local data” to remove it.'));
    return;
  }
  const st = new C.IdbProjectStorage();
  if (!(await st.available())) {
    cb.checked = false; S.saveEnabled = false; S.save.status = 'unavailable'; updateSaveUi(); renderStorageState();
    notify('error', pick('Penyimpanan perangkat tidak tersedia (mode privat atau diblokir). Simpan paket kerja (.pfproj) sebagai cadangan.', 'Device storage is unavailable (private mode or blocked). Save a work bundle (.pfproj) as a backup.'), [{ label: t('ws.menu.savebundle'), run: () => void saveBundle() }]);
    return;
  }
  S.storage = st; S.saveEnabled = true; cb.checked = true;
  S.autosave = new C.AutosaveController(st, 1000, (s, r) => onSaveStatus(s, r));
  try { localStorage.setItem('pf.store.enabled', '1'); } catch { /* ignore */ }
  const storedKits = await st.listBrandKits();
  for (const { storedLogo, ...kit } of storedKits) {
    if (!S.brandKits.some((b) => b.id === kit.id)) S.brandKits.push(kit);
    if (storedLogo && storedLogo.id === kit.logoAssetId && !S.brandLogos.has(kit.id)) S.brandLogos.set(kit.id, storedLogo);
  }
  syncSettingsUi(); renderStorageState();
  if (hasContent()) S.autosave.schedule(S.project);
}

function onSaveStatus(s: C.SaveStatus, r: C.SaveResult | null): void {
  S.save.status = s;
  if (s === 'saved' && r?.revision !== undefined) { S.save.savedRevision = r.revision; S.save.savedProjectId = S.project.projectId; }
  updateSaveUi(); renderStorageState();
}

function saveUiState(): SaveUi {
  if (!hasContent()) return 'empty';
  const p = S.project;
  if (S.saveEnabled) {
    const st = S.save.status;
    if (st === 'pending') return 'pending';
    if (st === 'failed') return 'failed';
    if (st === 'quota-exceeded') return 'quota';
    if (st === 'blocked') return 'blocked';
    if (st === 'unavailable') return 'unavailable';
    if (st === 'conflict') return 'conflict';
    if (st === 'rejected-deleted') return 'deleted';
    if (S.save.savedProjectId === p.projectId && S.save.savedRevision === p.revision) return 'saved';
    return 'pending';
  }
  if (S.save.status === 'unavailable') return 'unavailable';
  if (S.save.bundleProjectId === p.projectId && S.save.bundleRevision === p.revision) return 'bundle';
  return 'off';
}
const SAVE_LABEL: Record<SaveUi, Key> = { empty: 'store.status.empty', off: 'store.status.off', bundle: 'store.status.bundle', pending: 'store.status.pending', saved: 'store.status.saved', failed: 'store.status.failed', quota: 'store.status.quota', blocked: 'store.status.blocked', unavailable: 'store.status.unavailable', conflict: 'store.status.conflict', deleted: 'store.status.deleted' };

function updateSaveUi(): void {
  updateFlow();
  const st = saveUiState();
  const b = $('#save-status');
  b.dataset.state = st;
  let label = t(SAVE_LABEL[st]);
  if (st === 'bundle') label += ` · rev ${S.save.bundleRevision}`;
  if (st === 'saved') label += ` · rev ${S.save.savedRevision}`;
  b.querySelector('.label')!.textContent = label;
  b.title = st === 'off' ? pick('Belum ada salinan proyek ini di perangkat atau dalam paket. Tekan untuk menyimpan.', 'No copy of this project exists on the device or as a bundle. Press to save.') : label;
  // Kegagalan nyata diberitahukan sekali per transisi dengan aksi cadangan
  if (['failed', 'quota', 'blocked', 'conflict', 'deleted'].includes(st) && S.save.lastNotified !== `${st}:${S.project.revision}`) {
    S.save.lastNotified = `${st}:${S.project.revision}`;
    const msg = st === 'conflict' ? pick('Proyek ini juga diubah di tab lain. Kedua versi tersedia di Penyimpanan & proyek; simpan paket kerja agar tidak ada yang hilang.', 'This project was also changed in another tab. Both versions are in Storage & projects; save a work bundle so nothing is lost.')
      : st === 'deleted' ? pick('Proyek ini dihapus di tab lain. Perubahan di tab ini BELUM disimpan; simpan paket kerja.', 'This project was deleted in another tab. Changes in this tab are NOT saved; save a work bundle.')
      : st === 'quota' ? pick('Penyimpanan perangkat penuh; proyek BELUM disimpan. Isi tetap ada di halaman ini; simpan paket kerja sebagai cadangan.', 'Device storage is full; the project was NOT saved. Content is still on this page; save a work bundle as a backup.')
      : pick('Proyek GAGAL disimpan di perangkat. Isi tetap ada di halaman ini; simpan paket kerja sebagai cadangan.', 'The project was NOT saved on this device. Content is still on this page; save a work bundle as a backup.');
    notify('error', msg, [{ label: t('ws.menu.savebundle'), run: () => void saveBundle() }]);
  }
}

function renderStorageState(): void {
  const box = $('#storage-state');
  const st = saveUiState();
  box.className = `banner ${['failed', 'quota', 'blocked', 'unavailable', 'conflict', 'deleted'].includes(st) ? 'banner-error' : st === 'off' ? 'banner-warn' : ''}`;
  const parts = [`${t(SAVE_LABEL[st])}.`, pick(`Revisi aktif: ${S.project.revision}.`, `Active revision: ${S.project.revision}.`)];
  if (S.saveEnabled) parts.push(S.save.savedProjectId === S.project.projectId ? pick(`Terakhir tersimpan di perangkat: rev ${S.save.savedRevision}.`, `Last saved on device: rev ${S.save.savedRevision}.`) : pick('Belum tersimpan di perangkat.', 'Not yet saved on the device.'));
  if (S.save.bundleProjectId === S.project.projectId) parts.push(pick(`Paket kerja terakhir diminta untuk rev ${S.save.bundleRevision} (browser tidak selalu dapat memastikan berkas tersimpan).`, `Last work bundle requested for rev ${S.save.bundleRevision} (the browser cannot always confirm the file was saved).`));
  parts.push(pick('Unduhan HTML/cetak bukan cadangan proyek; gunakan paket kerja .pfproj untuk menyimpan sumber, aset dan pengaturan yang dapat disunting.', 'HTML/print downloads are not project backups; use a .pfproj work bundle to keep the editable source, assets and settings.'));
  box.textContent = parts.join(' ');
}

async function clearLocal(): Promise<void> {
  if (!(await confirmDialog(t('confirm.clear')))) return;
  const st = S.storage ?? new C.IdbProjectStorage();
  S.autosave?.cancel();
  await S.autosave?.flush();
  const r = await st.deleteAll();
  if (r.status === 'deleted' || r.status === 'not-found') {
    try { localStorage.removeItem('pf.store.enabled'); } catch { /* ignore */ }
    S.saveEnabled = false; S.autosave = null; S.brandKits = []; S.brandLogos.clear(); $<HTMLInputElement>('#opt-localsave').checked = false;
    S.save.savedRevision = -1; S.save.savedProjectId = ''; S.save.status = 'idle';
    syncSettingsUi(); updateSaveUi(); renderStorageState(); void renderProjectList();
    notify('success', pick('Semua data PaperForma di perangkat ini telah dihapus. Proyek yang sedang terbuka tetap di halaman sampai Anda menutupnya.', 'All PaperForma data on this device was deleted. The open project stays on the page until you close it.'));
  } else notify('error', r.status === 'blocked' ? pick('Penghapusan diblokir oleh tab PaperForma lain yang masih terbuka. Tutup tab lain lalu coba lagi. Data BELUM terhapus.', 'Deletion was blocked by another open PaperForma tab. Close other tabs and retry. Data was NOT deleted.') : pick(`Penghapusan gagal (${r.status}). Data BELUM terhapus.`, `Deletion failed (${r.status}). Data was NOT deleted.`), [{ label: t('export.retry'), run: () => void clearLocal() }]);
}

async function renderProjectList(): Promise<void> {
  const ul = $('#proj-list'); ul.replaceChildren();
  if (!S.storage || !S.saveEnabled) { ul.append(el('li', { class: 'hint', text: t('projects.off') })); return; }
  await S.autosave?.flush();
  const list = await S.storage.list();
  if (!list.length) ul.append(el('li', { class: 'hint', text: t('projects.empty') }));
  for (const p of list) {
    const open = el('button', { type: 'button', class: 'btn btn-secondary btn-sm', text: t('projects.open') });
    open.addEventListener('click', async () => {
      if (p.projectId !== S.project.projectId && !(await guardUnsaved())) return;
      const full = await S.storage!.load(p.projectId);
      if (!full) { notify('error', pick('Proyek tidak dapat dibaca.', 'Project could not be read.')); return; }
      $<HTMLDialogElement>('#dlg-projects').close();
      loadProject(full); S.save.savedRevision = full.revision; S.save.savedProjectId = full.projectId; updateSaveUi();
    });
    const del = el('button', { type: 'button', class: 'btn btn-danger btn-sm', text: t('projects.delete') });
    del.addEventListener('click', async () => {
      if (!(await confirmDialog(pick(`Hapus proyek “${p.name || p.projectId}” dari perangkat ini?`, `Delete project “${p.name || p.projectId}” from this device?`)))) return;
      const r = S.autosave ? await S.autosave.deleteProject(p.projectId) : await S.storage!.delete(p.projectId);
      if (r.status === 'deleted') { notify('success', pick('Proyek dihapus.', 'Project deleted.')); void renderProjectList(); }
      else notify('error', pick(`Proyek tidak terhapus (${r.status}).`, `Project not deleted (${r.status}).`));
    });
    ul.append(el('li', {}, el('strong', { text: p.name || p.projectId }), el('span', { class: 'hint', text: `rev ${p.revision} · ${new Date(p.updatedAt).toLocaleString(getLang())}${p.projectId === S.project.projectId ? ' · ' + pick('proyek aktif', 'active project') : ''}` }), el('div', { class: 'row' }, open, del)));
  }
}

async function openProjects(src: HTMLElement): Promise<void> {
  renderStorageState();
  await renderProjectList();
  await openDialog($<HTMLDialogElement>('#dlg-projects'), src);
}

/* ---------------- riwayat revisi (UI-06, UI-08: seluruh revisi tersimpan dapat dijangkau) ---------------- */
async function openHistory(src: HTMLElement): Promise<void> {
  S.historyPage = 0; renderHistory();
  await openDialog($<HTMLDialogElement>('#dlg-history'), src);
}
function renderHistory(): void {
  const ul = $('#history-list'); ul.replaceChildren();
  const hist = [...S.project.history].reverse();
  const pages = Math.max(1, Math.ceil(hist.length / HISTORY_PER_PAGE));
  S.historyPage = Math.min(S.historyPage, pages - 1);
  const start = S.historyPage * HISTORY_PER_PAGE;
  const shown = hist.slice(start, start + HISTORY_PER_PAGE);
  const oldest = S.project.history[0]?.revision;
  $('#history-count').textContent = hist.length
    ? pick(`Menampilkan ${start + 1}–${start + shown.length} dari ${hist.length} revisi tersimpan (tertua: rev ${oldest}).`, `Showing ${start + 1}–${start + shown.length} of ${hist.length} stored revisions (oldest: rev ${oldest}).`)
    : pick('Belum ada revisi.', 'No revisions yet.');
  ($<HTMLButtonElement>('#history-prev')).disabled = S.historyPage === 0;
  ($<HTMLButtonElement>('#history-next')).disabled = S.historyPage >= pages - 1;
  for (const h of shown) {
    const full = !!h.stateJson;
    const cur = h.revision === S.project.revision;
    const b = el('button', { type: 'button', class: 'btn btn-quiet btn-sm', text: t(full ? 'history.restore' : 'history.restore.text') });
    (b as HTMLButtonElement).disabled = cur;
    b.addEventListener('click', () => restoreRevision(h.revision));
    ul.append(el('li', {}, el('span', { class: 'hint', text: `rev ${h.revision} · ${h.label} · ${new Date(h.at).toLocaleString(getLang())}${cur ? ' · ' + pick('aktif', 'active') : ''}${full ? '' : ' · ' + pick('hanya teks', 'text only')}` }), b));
  }
}
function restoreRevision(revision: number): void {
  const r = C.restoreRevisionChanges(S.project, revision);
  if (!commit(r.changes, `restore-rev-${revision}`)) return;
  S.ledger = new C.PasteLedger(S.project.source);
  setEditorFromProject(); S.brandDraft = null;
  if (S.project.brandKit) rememberKit(S.project.brandKit);
  syncSettingsUi(); renderAssets(); renderConversationPanel(); renderBrandEditor();
  $<HTMLDialogElement>('#dlg-history').close();
  const scope = r.scope === 'full' ? pick('sumber, pengaturan, templat, brand kit, percakapan dan aset', 'source, settings, template, brand kit, conversation and assets') : pick('teks saja (revisi dari versi lama tidak menyimpan keadaan lain)', 'text only (revisions from older versions do not store other state)');
  notify(r.missingAssetIds.length ? 'warning' : 'success', pick(`Revisi ${revision} dipulihkan sebagai revisi baru ${S.project.revision}: ${scope}. Urungkan untuk membatalkan.`, `Revision ${revision} restored as new revision ${S.project.revision}: ${scope}. Undo to revert.`)
    + (r.missingAssetIds.length ? ' ' + pick(`${r.missingAssetIds.length} gambar dari revisi itu sudah tidak ada di proyek; unggah ulang bila diperlukan.`, `${r.missingAssetIds.length} image(s) from that revision are no longer in the project; re-upload if needed.`) : ''));
}

/** Paket kerja .pfproj — satu-satunya cadangan lengkap yang dapat disunting. Mengembalikan true bila unduhan diminta. */
async function saveBundle(): Promise<boolean> {
  const owner = S.project;
  try {
    await S.autosave?.flush();
    const t0 = performance.now();
    const { bytes, manifest } = await C.exportBundle(owner);
    metric('bundle-export', t0);
    if (owner !== S.project) { notify('warning', t('export.stale')); return false; }
    downloadBytes(bytes, safeFileName(owner.name || owner.settings.title || 'proyek', 'pfproj'), 'application/zip');
    S.save.bundleRevision = owner.revision; S.save.bundleProjectId = owner.projectId;
    updateSaveUi(); renderStorageState();
    notify('success', pick(`Paket kerja diminta untuk diunduh (${fmtBytes(bytes.length)}, ${manifest.files.length} berkas, rev ${manifest.revision}). Pastikan berkas tersimpan di perangkat Anda.`, `Work bundle download requested (${fmtBytes(bytes.length)}, ${manifest.files.length} files, rev ${manifest.revision}). Make sure the file was saved on your device.`));
    return true;
  } catch (error) {
    notify('error', pick('Paket kerja gagal dibuat. Salin sumber terlebih dahulu. Jika ukuran melebihi batas, simpan materi dalam beberapa proyek.', 'Could not create the work bundle. Copy your source first. If it exceeds the size limit, save the material in smaller projects.') + ' ' + (error as Error).message);
    return false;
  }
}

/* =============================== sumber mentah =============================== */
async function viewRaw(src: HTMLElement): Promise<void> {
  const sel = $<HTMLSelectElement>('#raw-select'); sel.replaceChildren();
  S.project.inputs.forEach((inp, i) => sel.append(el('option', { value: String(i), text: `${i + 1}. ${inp.kind}${inp.name ? ` · ${inp.name}` : ''} · ${fmtBytes(inp.byteLength)} · ${new Date(inp.importedAt).toLocaleString(getLang())}` })));
  S.project.inputs.forEach((inp, i) => { if (inp.rawHtml) sel.append(el('option', { value: `h${i}`, text: `${i + 1}. HTML clipboard (${pick('teks mentah', 'raw text')})` })); });
  if (S.project.conversation?.publication) sel.append(el('option', { value: 'publication', text: pick('Susunan terakhir · peta asal', 'Last composition · source map') }));
  if (!S.project.inputs.length) sel.append(el('option', { value: '', text: pick('Belum ada input', 'No input yet') }));
  showRawSelected();
  await openDialog($<HTMLDialogElement>('#dlg-raw'), src);
}
function rawSelected(): { text: string; name: string } {
  const v = $<HTMLSelectElement>('#raw-select').value;
  if (v === 'publication') return { text: JSON.stringify(S.project.conversation?.publication, null, 2), name: 'peta-asal.json' };
  const inp = v.startsWith('h') ? S.project.inputs[Number(v.slice(1))] : S.project.inputs[Number(v)];
  if (!inp) return { text: '', name: 'input.txt' };
  return { text: v.startsWith('h') ? inp.rawHtml ?? '' : inp.rawPlain, name: v.startsWith('h') ? 'clipboard.html.txt' : (inp.name || 'input') + '.txt' };
}
function showRawSelected(): void {
  const r = rawSelected();
  // ditampilkan sebagai TEKS (textContent), tidak pernah innerHTML
  $('#raw-view').textContent = r.text;
}
function downloadRaw(): void { const r = rawSelected(); downloadBytes(new TextEncoder().encode(r.text), safeFileName(r.name.replace(/\.[^.]+$/, ''), 'txt'), 'text/plain;charset=utf-8'); }

/* =============================== periksa & ekspor (UI-04, QA-01, EN-005, EN-012) =============================== */
function pubKind(): PubKind { return ($<HTMLInputElement>('input[name=pub-kind]:checked')).value as PubKind; }
const targetOf = (k: PubKind): Target => (k === 'print' ? 'print' : 'html');

async function openPublish(src: HTMLElement): Promise<void> {
  if (!hasContent()) { notify('info', t('empty.desc')); return; }
  goWorkspace();
  if (S.view.status !== 'ready' || S.view.revision !== S.project.revision) { clearTimeout(renderTimer); await refresh(); }
  ($<HTMLInputElement>(`input[name=pub-kind][value=${S.publish.lastKind}]`)).checked = true;
  S.publish.ack = false;
  setPublishPhase('idle');
  refreshPublishDialog();
  void openDialog($<HTMLDialogElement>('#dlg-publish'), src);
}

type PubPhase = 'idle' | 'running' | 'done' | 'failed' | 'blocked' | 'cancelled' | 'print-ready';
let pubPhase: PubPhase = 'idle';
function setPublishPhase(p: PubPhase, phaseText = ''): void {
  pubPhase = p;
  S.publish.running = p === 'running';
  $('#publish-progress').hidden = p !== 'running';
  $('#publish-progress .phase').textContent = phaseText;
  $('#pub-cancel').hidden = p !== 'running';
  ($<HTMLButtonElement>('#pub-close')).disabled = p === 'running';
  $$<HTMLInputElement>('#pub-targets input').forEach((i) => { i.disabled = p === 'running'; });
  if (p === 'idle') { $('#publish-result').hidden = true; $('#publish-result').replaceChildren(); }
  refreshGoButton();
}
function setPhaseText(s: string): void { $('#publish-progress .phase').textContent = s; announce(s); }

/** Ringkasan + gerbang per target dari laporan revisi aktif. */
function refreshPublishDialog(): void {
  const dlg = $<HTMLDialogElement>('#dlg-publish');
  if (!dlg.open && pubPhase === 'idle' && !S.publish.running) { /* tetap dibangun saat dibuka */ }
  const kind = pubKind();
  $('#pub-options').hidden = kind !== 'html-publication';
  $('#print-help').hidden = kind !== 'print';
  if (kind === 'print') ($<HTMLDetailsElement>('#print-help')).open = true;
  const v = S.view;
  const sum = $('#publish-summary'); sum.replaceChildren();
  if (v.snapshot && v.rendered) {
    const s = v.snapshot.settings;
    sum.append(el('dl', { class: 'kv' },
      el('dt', { text: t('export.snapshot') }), el('dd', { text: `rev ${v.snapshot.revision} · ${v.hash.slice(0, 12)}` }),
      el('dt', { text: pick('Format', 'Format') }), el('dd', { text: `${s.template} · ${s.paper} ${s.orientation === 'landscape' ? t('set.landscape') : t('set.portrait')}` }),
      el('dt', { text: pick('Isi', 'Content') }), el('dd', { text: `${v.rendered.stats.words} ${pick('kata', 'words')} · ${v.rendered.stats.tables} ${pick('tabel', 'tables')} · ${v.rendered.stats.math} ${pick('rumus', 'formulas')} · ${v.rendered.stats.images} ${pick('gambar', 'images')}` })));
  }
  renderGate();
}

function gateFor(kind: PubKind): C.Verdict | null {
  const rep = S.reports[targetOf(kind)];
  if (!rep) return null;
  let issues = rep.categories.flatMap((c) => c.issues);
  // Lapisan cetak dijalankan saat ekspor; issue layout dari pemeriksaan sebelumnya untuk hash yang sama tetap berlaku
  if (kind === 'html-publication' && ($<HTMLInputElement>('#pub-online')).checked) issues = issues.filter((i) => i.code !== 'EXTERNAL_IMAGE_EXCLUDED');
  return C.verdictOf(issues);
}

function renderGate(): void {
  const box = $('#publish-gate'); box.replaceChildren();
  if (pubPhase !== 'idle') { box.hidden = true; refreshGoButton(); return; }
  const g = gateFor(pubKind());
  if (!g || g.status === 'pass') { box.hidden = true; refreshGoButton(); return; }
  box.hidden = false;
  const list = (items: Issue[]) => {
    const ul = el('ul', { class: 'issue-mini' }, ...items.slice(0, 12).map((i) => el('li', {}, el('code', { text: i.code }), ' ', pick(i.message, (i as C.CoreIssue).messageEn))));
    if (items.length > 12) ul.append(el('li', { text: pick(`…dan ${items.length - 12} lagi di Pemeriksaan`, `…and ${items.length - 12} more in Checks`) }));
    return ul;
  };
  const goChecks = el('button', { type: 'button', class: 'btn btn-secondary btn-sm', 'data-action': 'goto-checks', text: t('export.gotochecks') });
  if (g.status === 'blocked') {
    box.className = 'gate banner banner-error';
    box.append(el('p', { text: t('export.blocked') }), list(g.block), goChecks);
  } else {
    box.className = 'gate banner banner-warn';
    const cb = el('input', { type: 'checkbox', id: 'pub-ack' }) as HTMLInputElement;
    cb.checked = S.publish.ack;
    cb.addEventListener('change', () => { S.publish.ack = cb.checked; refreshGoButton(); });
    box.append(el('p', { text: t('export.confirm') }), list(g.confirm), el('label', { class: 'check' }, cb, el('span', { text: t('export.confirm.ack') })), goChecks);
  }
  refreshGoButton();
}

function refreshGoButton(): void {
  const go = $<HTMLButtonElement>('#pub-go');
  const kind = pubKind();
  go.textContent = t(kind === 'print' ? 'export.go.print' : 'export.go');
  if (pubPhase === 'running') { go.disabled = true; return; }
  if (pubPhase === 'print-ready') { go.hidden = true; return; }
  go.hidden = false;
  const g = gateFor(kind);
  go.disabled = !g || S.view.status !== 'ready' || g.status === 'blocked' || (g.status === 'confirm' && !S.publish.ack);
}

function cancelPublish(): void {
  if (!S.publish.running) return;
  S.publish.abort?.abort(new DOMException('cancelled', 'AbortError'));
}

function onPublishClosed(): void {
  // Sesi cetak dipertahankan selama dialog native mungkin masih terbuka; dibuang setelah lifecycle selesai
  const s = S.publish.session;
  if (s && s.state !== 'dialog-requested') { s.dispose(); S.publish.session = null; }
  pubPhase = 'idle';
}

function showResult(kind: 'ok' | 'error' | 'warn', title: string, body: (Node | string)[], actions: HTMLElement[] = []): void {
  const box = $('#publish-result');
  box.hidden = false; box.className = `pub-result banner ${kind === 'ok' ? 'banner-ok' : kind === 'error' ? 'banner-error' : 'banner-warn'}`;
  box.replaceChildren(el('h3', { text: title }), ...body.map((b) => (typeof b === 'string' ? el('p', { text: b }) : b)), el('div', { class: 'field-row' }, ...actions));
  box.focus();
  announce(title, kind === 'error');
}
function btn(label: string, run: () => void, cls = 'btn btn-secondary btn-sm'): HTMLButtonElement { const b = el('button', { type: 'button', class: cls, text: label }) as HTMLButtonElement; b.addEventListener('click', run); return b; }
function issueList(issues: Issue[]): HTMLElement {
  const ul = el('ul', { class: 'issue-mini' }, ...issues.slice(0, 15).map((i) => el('li', {}, el('code', { text: i.code }), ' ', pick(i.message, (i as C.CoreIssue).messageEn))));
  if (issues.length > 15) ul.append(el('li', { text: pick(`…dan ${issues.length - 15} lagi`, `…and ${issues.length - 15} more`) }));
  return ul;
}

async function runPublish(): Promise<void> {
  const kind = pubKind();
  const v = S.view;
  if (!v.snapshot || !v.rendered || v.status !== 'ready' || v.revision !== S.project.revision) { showResult('warn', t('export.stale'), []); return; }
  const g = gateFor(kind);
  if (!g || g.status === 'blocked' || (g.status === 'confirm' && !S.publish.ack)) { renderGate(); return; }
  S.publish.lastKind = kind;
  const ctrl = new AbortController();
  S.publish.abort = ctrl;
  const snapshot = v.snapshot, body = v.rendered;
  $('#publish-gate').hidden = true;
  $('#publish-result').hidden = true;
  setPublishPhase('running', pick('Memeriksa…', 'Checking…'));
  const t0 = performance.now();
  try {
    if (kind === 'print') await runPrint(snapshot, body, ctrl);
    else await runHtml(kind, snapshot, body, ctrl);
    metric(`export-${kind}`, t0);
  } catch (e) {
    if (ctrl.signal.aborted) {
      const stale = (ctrl.signal.reason as DOMException | undefined)?.message === 'stale';
      setPublishPhase('cancelled');
      showResult('warn', stale ? t('export.stale') : t('export.cancelled'), [], [btn(t('export.retry'), () => { setPublishPhase('idle'); refreshPublishDialog(); void runPublish(); })]);
      return;
    }
    if (e instanceof R.ExportBlockedError || e instanceof R.PrintBlockedError) {
      setPublishPhase('blocked');
      const failed = e instanceof R.ExportBlockedError ? e.failedChecks.map((c) => `${c.name}${c.detail ? ` (${c.detail})` : ''}`) : [];
      showResult('error', t('export.blocked'), [
        ...(failed.length ? [pick(`Pemeriksaan wajib gagal: ${failed.join(', ')}.`, `Required checks failed: ${failed.join(', ')}.`)] : []),
        issueList(e.verdict.block.length ? e.verdict.block : e.issues),
      ], [btn(t('export.gotochecks'), () => gotoChecks()), btn(t('export.retry'), () => { setPublishPhase('idle'); refreshPublishDialog(); })]);
      return;
    }
    if (e instanceof R.StaleExportError) { setPublishPhase('failed'); showResult('warn', t('export.stale'), [], [btn(t('export.retry'), () => { setPublishPhase('idle'); refreshPublishDialog(); })]); return; }
    const pe = e as R.PaginationError;
    setPublishPhase('failed');
    if (kind === 'print' && pe.issues?.length) { Object.assign(S.layout, { hash: S.view.hash, status: 'failed', issues: pe.issues, result: null }); rebuildReports(); renderChecks(); updateReadiness(); }
    showResult('error', t('export.failed'), [pe.failure?.message ?? (e as Error).message, ...(pe.issues?.length ? [issueList(pe.issues.filter((i) => i.severity !== 'info'))] : [])],
      [btn(t('export.retry'), () => { setPublishPhase('idle'); refreshPublishDialog(); void runPublish(); }, 'btn btn-primary btn-sm'), btn(t('export.gotochecks'), () => gotoChecks())]);
  } finally { if (S.publish.abort === ctrl) S.publish.abort = null; }
}

async function runHtml(kind: Exclude<PubKind, 'print'>, snapshot: Snapshot, body: RenderedBody, ctrl: AbortController): Promise<void> {
  const profile = kind === 'html-standalone' ? 'standalone' : kind === 'html-zip' ? 'zip' : 'publication';
  const online = profile === 'publication' && ($<HTMLInputElement>('#pub-online')).checked;
  const enh = profile === 'publication' && ($<HTMLInputElement>('#pub-enhance')).checked;
  setPhaseText(pick('Memuat font, menyusun dan memvalidasi hasil…', 'Loading fonts, composing and validating the output…'));
  const { browserFontSource } = await import('../render/font-assets');
  const r = await R.exportHtml({ snapshot, body, profile, variant: online ? 'online' : 'offline', enhancements: enh, guard: S.exportGuard, signal: ctrl.signal, fontSource: browserFontSource });
  if (ctrl.signal.aborted) throw ctrl.signal.reason;
  const ext = profile === 'standalone' ? 'html' : 'zip';
  const base = snapshot.settings.title || S.project.name || 'dokumen';
  const name = safeFileName(profile === 'publication' ? `${base}-publikasi` : base, ext);
  const mime = ext === 'html' ? 'text/html;charset=utf-8' : 'application/zip';
  const deliver = () => {
    downloadBytes(r.bytes, name, mime);
    S.publish.last = { bytes: r.bytes, name, mime };
    setPublishPhase('done');
    const checks = el('ul', { class: 'checks-mini' }, ...r.manifest.checks.map((c) => el('li', { 'data-status': c.status, text: `${c.status === 'pass' ? '✓' : c.status === 'warn' ? '!' : c.status === 'not-run' ? '–' : '✗'} ${c.name}${c.detail ? ` — ${c.detail}` : ''}` })));
    showResult('ok', t('export.done'), [
      pick(`${name} · ${fmtBytes(r.bytes.length)} · rev ${snapshot.revision}`, `${name} · ${fmtBytes(r.bytes.length)} · rev ${snapshot.revision}`),
      el('p', { class: 'hint', text: `SHA-256 ${r.manifest.outputHash}` }), checks,
      pick('Browser yang menyimpan berkas; periksa folder unduhan Anda.', 'The browser saves the file; check your downloads folder.'),
    ], [
      btn(t('export.download'), () => downloadBytes(r.bytes, name, mime), 'btn btn-primary btn-sm'),
      ...(ext === 'html' ? [btn(t('export.open'), () => { const u = URL.createObjectURL(new Blob([r.bytes as BlobPart], { type: mime })); window.open(u, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(u), 60000); })] : []),
      btn(t('export.savebundle'), () => void saveBundle()),
    ]);
  };
  if (r.status === 'confirm' && r.reviewChecks.length) {
    // Keputusan eksplisit atas pemeriksaan "tinjau" yang gagal (tautan internal / cakupan glyph)
    setPublishPhase('failed');
    const cb = el('input', { type: 'checkbox', id: 'pub-review-ack' }) as HTMLInputElement;
    const go = btn(pick('Unduh dengan catatan ini', 'Download with these notes'), () => { if (cb.checked) deliver(); }, 'btn btn-primary btn-sm');
    go.disabled = true; cb.addEventListener('change', () => { go.disabled = !cb.checked; });
    showResult('warn', pick('Hasil dibuat, tetapi perlu keputusan Anda', 'Output created, but needs your decision'), [
      el('ul', { class: 'issue-mini' }, ...r.reviewChecks.map((c) => el('li', { text: `${c.name}${c.detail ? ` — ${c.detail}` : ''}` }))),
      issueList(r.issues.filter((i) => i.code === 'FRAGMENT_TARGET_MISSING' || i.code === 'FONT_GLYPH_NOT_BUNDLED')),
      el('label', { class: 'check' }, cb, el('span', { text: t('export.confirm.ack') })),
    ], [go, btn(t('export.gotochecks'), () => gotoChecks())]);
    return;
  }
  deliver();
}

async function runPrint(snapshot: Snapshot, body: RenderedBody, ctrl: AbortController): Promise<void> {
  S.publish.session?.dispose(); S.publish.session = null;
  setPhaseText(pick('Memuat font dan gambar…', 'Loading fonts and images…'));
  const payload = await getPayload(snapshot, body, ctrl.signal);
  if (ctrl.signal.aborted) throw ctrl.signal.reason;
  setPhaseText(pick('Memaginasi dan memverifikasi isi halaman…', 'Paginating and verifying page content…'));
  const session = await R.preparePrint(payload, { signal: ctrl.signal, onProgress: (p) => setPhaseText(`${pick('Halaman', 'Pages')}: ${p.phase}${p.pages ? ` · ${p.pages}` : ''}`) });
  if (ctrl.signal.aborted || S.view.hash !== snapshot.renderInputHash) { session.dispose(); throw ctrl.signal.reason ?? new DOMException('stale', 'AbortError'); }
  S.publish.session = session;
  // hasil layout ini juga menjadi pemeriksaan halaman untuk hash yang sama (tanpa paginasi kedua)
  Object.assign(S.layout, { hash: snapshot.renderInputHash, status: 'done', issues: session.result.issues, result: session.result });
  rebuildReports(); renderChecks(); updateReadiness();
  const manifest = await R.localPrintManifest(session.result, snapshot.settings);
  setPublishPhase('print-ready');
  ($<HTMLDetailsElement>('#print-help')).open = false;
  const state = el('p', { class: 'print-state', 'aria-live': 'polite', text: pick('Tekan “Buka dialog cetak”, lalu pilih tujuan PDF.', 'Press “Open print dialog”, then choose a PDF destination.') });
  const printBtn = btn(t('print.open'), () => {
    state.textContent = t('print.requested');
    printBtn.textContent = t('print.again');
    void session.print().then((res) => {
      state.textContent = t(res === 'returned' ? 'print.returned' : 'print.unknown');
      if (!$<HTMLDialogElement>('#dlg-publish').open && S.publish.session === session) { session.dispose(); S.publish.session = null; }
    });
  }, 'btn btn-primary btn-sm');
  showResult('ok', t('print.ready'), [
    pick(`${session.result.pageCount} halaman · rev ${snapshot.revision} · verifikasi isi: ${session.result.verification.status}`, `${session.result.pageCount} pages · rev ${snapshot.revision} · content verification: ${session.result.verification.status}`),
    el('p', { class: 'hint', text: pick(`SHA-256 HTML terpaginasi (bukan berkas PDF): ${manifest.outputHash}`, `SHA-256 of the paginated HTML (not a PDF file): ${manifest.outputHash}`) }),
    el('ul', { class: 'checks-mini' }, ...manifest.checks.map((c) => el('li', { 'data-status': c.status, text: `${c.status === 'pass' ? '✓' : c.status === 'warn' ? '!' : '–'} ${c.name}${c.detail ? ` — ${c.detail}` : ''}` }))),
    state,
  ], [printBtn, btn(t('export.savebundle'), () => void saveBundle())]);
  printBtn.focus();
}

/* =============================== beranda (dirender saat terlihat) =============================== */
async function sampleSnapshot(md: string, template: TemplateId): Promise<{ snapshot: Snapshot; body: RenderedBody }> {
  const p = C.createProject({ template, source: md, name: 'sample' });
  p.settings.title = (/^#\s+(.+)$/m.exec(md)?.[1] ?? 'PaperForma').trim();
  const snapshot = await C.makeSnapshot(p);
  const body = await C.renderBody(snapshot.source, C.snapshotRenderOptions(snapshot));
  return { snapshot, body };
}
function whenVisible(target: Element, run: () => void): void {
  if (!('IntersectionObserver' in window)) { run(); return; }
  const io = new IntersectionObserver((ents) => { if (ents.some((e) => e.isIntersecting)) { io.disconnect(); run(); } }, { rootMargin: '200px' });
  io.observe(target);
}
let formatCardsShown = false;
function lazyLanding(): void {
  // F.5: contoh hero dan kartu format TIDAK dirender saat boot; hanya bila terlihat
  whenVisible($('#hero-frame'), () => void renderHeroProof());
  whenVisible($('#format-cards'), () => { formatCardsShown = true; buildFormatCards(); });
}
function rebuildFormatCardsIfShown(): void { if (formatCardsShown) buildFormatCards(); }
async function renderHeroProof(): Promise<void> {
  const t0 = performance.now();
  try { const { snapshot, body } = await sampleSnapshot(SAMPLE_MD, 'BUS-01'); $<HTMLIFrameElement>('#hero-frame').srcdoc = (await composeScreen(snapshot, body)).html; metric('hero', t0); }
  catch (e) { $<HTMLIFrameElement>('#hero-frame').replaceWith(el('p', { class: 'banner banner-error', text: `${pick('Contoh gagal dirender', 'Sample failed to render')}: ${(e as Error).message}` })); }
}
function buildFormatCards(): void {
  const host = $('#format-cards'); host.replaceChildren();
  for (const tp of R.listTemplates()) {
    const fr = el('iframe', { title: `${tp.id} — ${pick(tp.name.id, tp.name.en)}`, sandbox: 'allow-same-origin', loading: 'lazy' }) as HTMLIFrameElement;
    const card = el('article', { class: 'card fmt-card' }, fr, el('h3', { text: pick(tp.name.id, tp.name.en) }), el('p', { class: 'meta', text: `${tp.id} · v${tp.version}` }), el('p', { class: 'hint', text: pick(tp.summary.id, tp.summary.en) }));
    const use = el('button', { type: 'button', class: 'btn btn-secondary btn-sm', text: pick('Pakai format ini', 'Use this format') });
    use.addEventListener('click', () => { commit({ settings: R.templateDefaultSettings(tp.id, { title: S.project.settings.title, contentLang: S.project.settings.contentLang }) }, 'template-from-landing', { render: false }); go('workspace'); syncSettingsUi(); void refresh(); });
    card.append(use); host.append(card);
    whenVisible(fr, () => void (async () => {
      try {
        if (tp.id === 'CON-01') {
          const p = C.createProject({ template: tp.id, name: 'sample' });
          const parsed = C.parsePlainConversation(SAMPLE_CONVERSATION, 'sample');
          const conv: Conversation = { ...parsed.conversation, outputMode: 'transcript', showRoles: true };
          p.conversation = C.selectMessages(conv, conv.messages.map((m) => m.id)).conversation; p.source = SAMPLE_CONVERSATION; p.settings.title = pick('Transkrip contoh', 'Sample transcript');
          const snapshot = await C.makeSnapshot(p);
          const body = await C.renderBody(snapshot.source, C.snapshotRenderOptions(snapshot));
          fr.srcdoc = (await composeScreen(snapshot, body)).html;
        } else { const { snapshot, body } = await sampleSnapshot(SAMPLE_MD, tp.id); fr.srcdoc = (await composeScreen(snapshot, body)).html; }
      } catch { fr.replaceWith(el('p', { class: 'hint', text: pick('Pratinjau gagal dimuat.', 'Preview failed to load.') })); }
    })());
  }
}

/* =============================== kait QA (hanya build QA; SA-12) =============================== */
if (import.meta.env.VITE_PF_QA === '1') {
  (window as unknown as { __pf: unknown }).__pf = {
    state: () => ({ revision: S.project.revision, source: S.project.source, canUndo: S.undo.canUndo, canRedo: S.undo.canRedo, undo: S.undo.size,
      settings: S.project.settings, brandKit: S.project.brandKit ?? null, assets: S.project.assets.map((a) => ({ id: a.id, path: a.path })),
      view: { status: S.view.status, revision: S.view.revision, hash: S.view.hash }, reports: { html: S.reports.html?.status ?? null, print: S.reports.print?.status ?? null },
      layout: { status: S.layout.status, jobId: S.layout.jobId, hash: S.layout.hash, pages: S.layout.result?.pageCount ?? null, verification: S.layout.result?.verification ?? null },
      save: saveUiState(), dirty: isDirty(), route: currentRoute(), issues: allIssues().map((i) => ({ code: i.code, severity: i.severity, scope: i.scope, blocking: !!i.blocking, message: String(i.message ?? '').slice(0, 300) })),
      print: S.publish.session?.state ?? null, brandDraft: S.brandDraft, history: S.project.history.length }),
    metrics: () => S.metrics.slice(),
    engine: () => ({ ...S.engine.stats }),
    /** ringkasan HTML isi yang dirender (membandingkan Worker vs fallback) */
    renderedDigest: async () => { const h = S.view.rendered?.html ?? ''; return { length: h.length, sha256: await C.sha256Hex(h.replace(/pfg-[a-z0-9-]+/gi, 'pfg')) }; },
    layoutJobs: () => S.layout.jobId,
    /** HTML datar hasil paginasi terverifikasi (yang dicetak) + peta halaman, untuk uji PDF nyata */
    flattened: () => S.layout.result ? { html: S.layout.result.flattenedHtml, pages: S.layout.result.pageCount, labels: S.layout.result.pageLabels, pageMap: S.layout.result.pageMap, verification: S.layout.result.verification, timings: S.layout.result.timings, hash: S.layout.hash } : null,
  };
}

// boot dipanggil setelah seluruh deklarasi modul terinisialisasi (hindari TDZ)
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => void boot()); else void boot();
