/**
 * Transaksi tempel (PF-009, UX-03, IMP-05). Model editor di atas buffer teks:
 *  - setiap paste mencatat seleksi awal/akhir, fragmen mentah (plain + html), dan rentang hasil;
 *  - tiga operasi berbeda: sisipkan di kursor, tambahkan sebagai pesan baru, ganti seluruh sumber (eksplisit);
 *  - "konversi fragmen B ke Markdown" hanya mengganti rentang B yang dilacak;
 *  - rentang di-rebase saat pengguna mengetik di tempat lain; menjadi usang (stale) bila fragmen itu sendiri diedit;
 *  - setiap transaksi undo/redo sebagai SATU unit.
 * Offset = indeks UTF-16 (sama dengan textarea.selectionStart).
 */
import type { Limits } from './contracts';
import { LIMITS, checkTextBudget, type BudgetResult } from './limits';
import { htmlToMarkdown, type ConversionChange } from './clipboard';
import type { CoreIssue } from './util';

export type FragmentStatus = 'live' | 'stale' | 'removed';
export interface PasteFragment {
  id: string; start: number; end: number; status: FragmentStatus;
  rawPlain: string; rawHtml?: string; selectionStart: number; selectionEnd: number;
  mode: 'insert' | 'append-message' | 'replace-all'; converted: boolean; createdAt: number;
}

export type TxKind = 'paste-insert' | 'paste-append-message' | 'replace-all' | 'convert-fragment' | 'edit';
interface Change { start: number; removed: string; inserted: string }
interface Tx { id: number; kind: TxKind; change: Change; fragsBefore: PasteFragment[]; fragsAfter: PasteFragment[]; label: string }

export type LedgerResult<T = object> = ({ ok: true; text: string } & T) | { ok: false; code: 'BUDGET_EXCEEDED' | 'CLIPBOARD_INTEGRITY' | 'FRAGMENT_STALE' | 'FRAGMENT_NOT_FOUND' | 'NO_HTML' | 'CONFIRM_REQUIRED' | 'NOTHING_TO_UNDO' | 'NOTHING_TO_REDO' | 'BAD_RANGE'; message: string; messageEn: string; budget?: BudgetResult };

const cloneFrags = (f: PasteFragment[]) => f.map((x) => ({ ...x }));

export class PasteLedger {
  private _text: string;
  private frags: PasteFragment[] = [];
  private undoStack: Tx[] = [];
  private redoStack: Tx[] = [];
  private rollbackEdit?: () => void;
  private rememberEdit(): void {
    const text = this._text, frags = this.frags, undo = [...this.undoStack], redo = [...this.redoStack];
    this.rollbackEdit = () => { this._text = text; this.frags = frags; this.undoStack = undo; this.redoStack = redo; };
  }
  /**
   * EN-009 (statis 3.0): undo/redo aplikasi kini ditangani `ProjectUndo` (transaksi proyek berbatas). Ledger hanya
   * melacak fragmen tempelan; riwayat internalnya dibuang agar tidak tumbuh tanpa batas.
   */
  forgetHistory(): void { this.undoStack = []; this.redoStack = []; }
  rejectLastEdit(): void { this.rollbackEdit?.(); this.rollbackEdit = undefined; }
  private seq = 0; private txSeq = 0;
  /** pemisah antar pesan untuk "tambahkan sebagai pesan baru" */
  messageSeparator = '\n\n';
  constructor(initial = '', private limits: Limits = LIMITS) { this._text = initial; }

  get text(): string { return this._text; }
  get fragments(): readonly PasteFragment[] { return this.frags; }
  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }
  history(): { id: number; kind: TxKind; label: string }[] { return this.undoStack.map((t) => ({ id: t.id, kind: t.kind, label: t.label })); }
  fragment(id: string): PasteFragment | undefined { return this.frags.find((f) => f.id === id); }

  private rebase(frags: PasteFragment[], c: Change, exclude?: string): void {
    const delta = c.inserted.length - c.removed.length;
    const cEnd = c.start + c.removed.length;
    for (const f of frags) {
      if (f.id === exclude || f.status === 'removed') continue;
      if (cEnd <= f.start && !(c.removed.length === 0 && c.start === f.start && f.start === f.end)) {
        // sepenuhnya sebelum fragmen (penyisipan tepat di awal fragmen juga menggeser)
        f.start += delta; f.end += delta;
      } else if (c.start >= f.end) {
        // sesudah fragmen (penyisipan tepat di akhir fragmen tidak mengubah fragmen)
      } else {
        // tumpang tindih → fragmen ini diedit: usang; rentang dipertahankan terbaik-upaya
        f.status = c.start <= f.start && cEnd >= f.end ? 'removed' : 'stale';
        if (f.status === 'stale') f.end = Math.max(f.start, f.end + delta);
      }
    }
  }

  private commit(kind: TxKind, change: Change, mutate: (frags: PasteFragment[]) => void, label: string): Tx {
    this.rememberEdit();
    const before = cloneFrags(this.frags);
    const after = cloneFrags(this.frags);
    mutate(after);
    this._text = this._text.slice(0, change.start) + change.inserted + this._text.slice(change.start + change.removed.length);
    const tx: Tx = { id: ++this.txSeq, kind, change, fragsBefore: before, fragsAfter: after, label };
    this.frags = after;
    this.undoStack.push(tx);
    this.redoStack = [];
    return tx;
  }

  private budgetFor(plain: string, html?: string): BudgetResult | null {
    const b1 = checkTextBudget('paste', plain, this.limits);
    if (!b1.ok) return b1;
    if (html !== undefined) { const b2 = checkTextBudget('pasteHtml', html, this.limits); if (!b2.ok) return b2; }
    return null;
  }

  private sizeAfter(change: Change): BudgetResult {
    const t = this._text.slice(0, change.start) + change.inserted + this._text.slice(change.start + change.removed.length);
    return checkTextBudget('markdown', t, this.limits);
  }

  /** Sisipkan fragmen di kursor/seleksi (mengganti seleksi bila start != end). */
  pasteAtCursor(sel: { start: number; end: number }, clip: { plain: string; html?: string }): LedgerResult<{ fragment: PasteFragment }> {
    return this.pasteInternal('insert', sel, clip);
  }

  /** Tambahkan sebagai pesan baru di akhir sumber (dipisah baris kosong). */
  appendAsMessage(clip: { plain: string; html?: string }): LedgerResult<{ fragment: PasteFragment }> {
    return this.pasteInternal('append-message', { start: this._text.length, end: this._text.length }, clip);
  }

  /** Ganti seluruh sumber — hanya dengan konfirmasi eksplisit. */
  replaceAll(clip: { plain: string; html?: string }, confirm: { confirmed: boolean }): LedgerResult<{ fragment: PasteFragment }> {
    if (!confirm.confirmed) return { ok: false, code: 'CONFIRM_REQUIRED', message: 'Mengganti seluruh sumber memerlukan konfirmasi.', messageEn: 'Replacing the whole source requires confirmation.' };
    return this.pasteInternal('replace-all', { start: 0, end: this._text.length }, clip);
  }

  private pasteInternal(mode: PasteFragment['mode'], sel: { start: number; end: number }, clip: { plain: string; html?: string }): LedgerResult<{ fragment: PasteFragment }> {
    const { start, end } = sel;
    if (start < 0 || end < start || end > this._text.length) return { ok: false, code: 'BAD_RANGE', message: 'Rentang seleksi tidak valid.', messageEn: 'Invalid selection range.' };
    const b = this.budgetFor(clip.plain, clip.html);
    if (b) return { ok: false, code: 'BUDGET_EXCEEDED', budget: b, message: b.message, messageEn: b.messageEn };
    let inserted = clip.plain;
    let offset = 0;
    if (mode === 'append-message' && this._text.length > 0) {
      const sep = this._text.endsWith('\n\n') ? '' : this._text.endsWith('\n') ? '\n' : this.messageSeparator;
      inserted = sep + clip.plain; offset = sep.length;
    }
    const change: Change = { start, removed: this._text.slice(start, end), inserted };
    const size = this.sizeAfter(change);
    if (!size.ok) return { ok: false, code: 'BUDGET_EXCEEDED', budget: size, message: size.message, messageEn: size.messageEn };
    const frag: PasteFragment = {
      id: `frag-${++this.seq}`, start: start + offset, end: start + offset + clip.plain.length, status: 'live', rawPlain: clip.plain,
      selectionStart: start, selectionEnd: end, mode, converted: false, createdAt: Date.now(),
      ...(clip.html !== undefined ? { rawHtml: clip.html } : {}),
    };
    const kind: TxKind = mode === 'insert' ? 'paste-insert' : mode === 'append-message' ? 'paste-append-message' : 'replace-all';
    this.commit(kind, change, (fr) => {
      if (mode === 'replace-all') for (const f of fr) f.status = 'removed';
      else this.rebase(fr, change);
      fr.push({ ...frag });
    }, mode === 'insert' ? 'Tempel di kursor' : mode === 'append-message' ? 'Tambahkan sebagai pesan baru' : 'Ganti seluruh sumber');
    return { ok: true, text: this._text, fragment: { ...frag } };
  }

  /** Edit pengguna (mengetik/hapus) pada rentang [start,end) → satu transaksi; fragmen di-rebase/ditandai usang. */
  edit(start: number, end: number, inserted: string): LedgerResult {
    if (start < 0 || end < start || end > this._text.length) return { ok: false, code: 'BAD_RANGE', message: 'Rentang edit tidak valid.', messageEn: 'Invalid edit range.' };
    const change: Change = { start, removed: this._text.slice(start, end), inserted };
    const size = this.sizeAfter(change);
    if (!size.ok) return { ok: false, code: 'BUDGET_EXCEEDED', budget: size, message: size.message, messageEn: size.messageEn };
    this.commit('edit', change, (fr) => this.rebase(fr, change), 'Edit');
    return { ok: true, text: this._text };
  }

  /** Sinkronisasi dari nilai textarea: diff awalan/akhiran bersama → satu edit. */
  syncFromText(next: string): LedgerResult {
    if (next === this._text) return { ok: true, text: this._text };
    const a = this._text;
    if (next.startsWith(a)) return this.edit(a.length, a.length, next.slice(a.length));
    if (a.startsWith(next)) return this.edit(next.length, a.length, '');
    let p = 0; const max = Math.min(a.length, next.length);
    while (p < max && a.charCodeAt(p) === next.charCodeAt(p)) p++;
    let s = 0;
    while (s < max - p && a.charCodeAt(a.length - 1 - s) === next.charCodeAt(next.length - 1 - s)) s++;
    return this.edit(p, a.length - s, next.slice(p, next.length - s));
  }

  /** Konversi HTML fragmen menjadi Markdown; HANYA rentang fragmen yang diganti. */
  convertFragment(id: string): LedgerResult<{ fragment: PasteFragment; changes: ConversionChange[]; issues: CoreIssue[]; before: string; after: string }> {
    const f = this.frags.find((x) => x.id === id);
    if (!f) return { ok: false, code: 'FRAGMENT_NOT_FOUND', message: 'Fragmen tidak ditemukan.', messageEn: 'Fragment not found.' };
    if (f.status !== 'live') return { ok: false, code: 'FRAGMENT_STALE', message: 'Fragmen sudah diedit setelah ditempel; konversi lama tidak berlaku. Tempel ulang atau pilih rentang baru.', messageEn: 'The fragment was edited after pasting; the old conversion no longer applies. Paste again or select a new range.' };
    if (f.rawHtml === undefined) return { ok: false, code: 'NO_HTML', message: 'Fragmen ini tidak memiliki HTML clipboard.', messageEn: 'This fragment has no clipboard HTML.' };
    const conv = htmlToMarkdown(f.rawHtml, { plain: f.rawPlain, limits: this.limits });
    if (!conv.ok) return conv;
    const md = conv.markdown.replace(/\n+$/, '');
    const change: Change = { start: f.start, removed: this._text.slice(f.start, f.end), inserted: md };
    const size = this.sizeAfter(change);
    if (!size.ok) return { ok: false, code: 'BUDGET_EXCEEDED', budget: size, message: size.message, messageEn: size.messageEn };
    let updated: PasteFragment = f;
    this.commit('convert-fragment', change, (fr) => {
      this.rebase(fr, change, f.id);
      const g = fr.find((x) => x.id === f.id)!;
      g.end = g.start + md.length; g.converted = true;
      updated = { ...g };
    }, 'Konversi fragmen ke Markdown');
    return { ok: true, text: this._text, fragment: updated, changes: conv.changes, issues: conv.issues, before: change.removed, after: md };
  }

  undo(): LedgerResult<{ kind: TxKind }> {
    this.rememberEdit();
    const tx = this.undoStack.pop();
    if (!tx) return { ok: false, code: 'NOTHING_TO_UNDO', message: 'Tidak ada yang dapat dibatalkan.', messageEn: 'Nothing to undo.' };
    const c = tx.change;
    this._text = this._text.slice(0, c.start) + c.removed + this._text.slice(c.start + c.inserted.length);
    this.frags = cloneFrags(tx.fragsBefore);
    this.redoStack.push(tx);
    return { ok: true, text: this._text, kind: tx.kind };
  }

  redo(): LedgerResult<{ kind: TxKind }> {
    this.rememberEdit();
    const tx = this.redoStack.pop();
    if (!tx) return { ok: false, code: 'NOTHING_TO_REDO', message: 'Tidak ada yang dapat diulang.', messageEn: 'Nothing to redo.' };
    const c = tx.change;
    this._text = this._text.slice(0, c.start) + c.inserted + this._text.slice(c.start + c.removed.length);
    this.frags = cloneFrags(tx.fragsAfter);
    this.undoStack.push(tx);
    return { ok: true, text: this._text, kind: tx.kind };
  }
}
