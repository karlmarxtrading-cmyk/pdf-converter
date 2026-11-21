/**
 * Undo/redo TRANSAKSI PROYEK (UI-06, EN-009; statis 3.0).
 *
 * Setiap entri adalah keadaan proyek lengkap yang dapat dipulihkan: sumber, pengaturan, templat, brand kit,
 * percakapan, nama, path sumber, dan daftar aset. Objek proyek bersifat immutable sehingga entri berbagi
 * struktur dengan proyek aktif; byte aset TIDAK diduplikasi (array aset menunjuk AssetRecord yang sama).
 *
 * Batas retensi terpisah dari riwayat proyek: jumlah entri dan total karakter sumber unik. Ketikan beruntun
 * digabung menjadi satu transaksi. Melewati batas hanya membuang entri undo TERTUA — sumber aktif, input mentah
 * dan riwayat revisi proyek tidak disentuh.
 */
import type { Project } from './contracts';

export type UndoFields = Pick<Project, 'source' | 'settings' | 'name' | 'assets'> & Partial<Pick<Project, 'brandKit' | 'conversation' | 'sourcePath'>>;
export interface UndoEntry { state: UndoFields; label: string; at: number; key?: string }

export const UNDO_LIMITS = Object.freeze({ maxEntries: 200, maxSourceChars: 24 * 1024 * 1024, coalesceMs: 1200 });

export function undoFieldsOf(p: Project): UndoFields {
  const f: UndoFields = { source: p.source, settings: p.settings, name: p.name, assets: p.assets };
  if (p.brandKit) f.brandKit = p.brandKit;
  if (p.conversation) f.conversation = p.conversation;
  if (p.sourcePath !== undefined) f.sourcePath = p.sourcePath;
  return f;
}

/**
 * Perubahan yang mengembalikan proyek ke `state`. Input mentah (`inputs`) TIDAK pernah diurungkan: materi asli yang
 * pernah ditempel/diunggah tetap tersimpan dan dapat dilihat lewat "Lihat sumber mentah".
 * Aset yang ditambahkan setelah `state` dipertahankan di belakang daftar agar byte-nya tidak hilang (tanpa rujukan,
 * aset tidak mengubah keluaran); `redo` mengembalikan daftar persisnya.
 */
export function changesFor(state: UndoFields, current?: Pick<Project, 'assets'>): Partial<Project> {
  // PF-AUD-A03: the same path may now contain different bytes. The restored path wins;
  // the displaced bytes remain in the redo snapshot, not a duplicate project path.
  const paths = new Set(state.assets.map((a) => a.path.normalize('NFC')));
  const keep = current ? current.assets.filter((a) => !paths.has(a.path.normalize('NFC'))) : [];
  return { source: state.source, settings: state.settings, name: state.name, assets: [...state.assets, ...keep], brandKit: state.brandKit, conversation: state.conversation, sourcePath: state.sourcePath };
}

export class ProjectUndo {
  private past: UndoEntry[] = [];
  private future: UndoEntry[] = [];
  dropped = 0;
  constructor(private limits: { maxEntries: number; maxSourceChars: number; coalesceMs: number } = UNDO_LIMITS, private now: () => number = () => Date.now()) {}

  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }
  get size(): { past: number; future: number; dropped: number } { return { past: this.past.length, future: this.future.length, dropped: this.dropped }; }
  peekUndo(): UndoEntry | undefined { return this.past.at(-1); }
  peekRedo(): UndoEntry | undefined { return this.future.at(-1); }

  /**
   * Catat keadaan SEBELUM perubahan. `key` menggabungkan transaksi beruntun yang sejenis (mis. 'edit'):
   * bila entri terakhir memiliki key sama dan masih dalam jendela waktu, keadaan tertuanya dipertahankan.
   */
  record(before: Project, label: string, key?: string): void {
    const t = this.now();
    const last = this.past.at(-1);
    this.future = [];
    if (key && last?.key === key && t - last.at <= this.limits.coalesceMs) { last.at = t; return; }
    this.past.push({ state: undoFieldsOf(before), label, at: t, ...(key ? { key } : {}) });
    this.enforce();
  }

  /** Mengembalikan keadaan tujuan undo dan menyimpan keadaan sekarang untuk redo. */
  undo(current: Project): UndoEntry | null {
    const e = this.past.pop();
    if (!e) return null;
    this.future.push({ state: undoFieldsOf(current), label: e.label, at: this.now() });
    return e;
  }

  redo(current: Project): UndoEntry | null {
    const e = this.future.pop();
    if (!e) return null;
    this.past.push({ state: undoFieldsOf(current), label: e.label, at: this.now() });
    return e;
  }

  clear(): void { this.past = []; this.future = []; this.dropped = 0; }

  private enforce(): void {
    while (this.past.length > this.limits.maxEntries) { this.past.shift(); this.dropped++; }
    // Sumber unik (string identik dibagi oleh mesin JS); hitung karakter sekali per string berbeda.
    const unique = (): number => { const seen = new Set<string>(); let n = 0; for (const e of [...this.past, ...this.future]) if (!seen.has(e.state.source)) { seen.add(e.state.source); n += e.state.source.length; } return n; };
    while (this.past.length > 1 && unique() > this.limits.maxSourceChars) { this.past.shift(); this.dropped++; }
  }
}
