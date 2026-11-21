/**
 * Klien halaman cetak untuk aplikasi: memaginasi di iframe print.html (origin sama) dan cetak lokal (PDF-12).
 * Tidak ada data dokumen yang dikirim ke server pada jalur ini.
 */
import { PaginationError } from './paginate-error';
import type { PaginationResult, PrintMessage, PrintPayload } from './print-types';

export interface FrameOptions {
  printUrl?: string; signal?: AbortSignal; timeoutMs?: number;
  onProgress?: (p: { phase: string; pass?: number; pages?: number }) => void;
  /** iframe ditempel ke elemen ini dan dibiarkan terlihat (pratinjau). Default: tersembunyi di luar layar lalu dibuang. */
  mount?: HTMLElement; keepFrame?: boolean; autoPrint?: boolean;
}
export interface FrameResult { result: PaginationResult; frame: HTMLIFrameElement | null }

export function paginateInFrame(payload: PrintPayload, o: FrameOptions = {}): Promise<FrameResult> {
  const url = new URL(o.printUrl ?? '/print.html', location.href);
  const frame = document.createElement('iframe');
  frame.title = 'PaperForma print';
  frame.setAttribute('aria-hidden', o.mount ? 'false' : 'true');
  if (!o.mount) frame.style.cssText = `position:fixed;left:-100000px;top:0;width:${Math.ceil(payload.page.widthMm * 3.8) + 80}px;height:800px;border:0;visibility:hidden`;
  else frame.style.cssText = 'width:100%;height:100%;border:0';
  const keep = !!(o.keepFrame || o.mount || o.autoPrint);
  return new Promise<FrameResult>((resolve, reject) => {
    let done = false;
    const cleanup = () => { window.removeEventListener('message', onMsg); clearTimeout(timer); o.signal?.removeEventListener('abort', onAbort); if (!keep) frame.remove(); };
    const finish = (fn: () => void) => { if (done) return; done = true; cleanup(); fn(); };
    const onAbort = () => finish(() => { frame.remove(); reject(new PaginationError({ code: 'ABORTED', message: 'Paginasi dibatalkan.' }, [])); });
    // EN-010: frame yang gagal tidak pernah dipertahankan (juga dengan keepFrame); listener/timer dibersihkan di finish().
    const timer = setTimeout(() => finish(() => { frame.remove(); reject(new PaginationError({ code: 'FRAME_TIMEOUT', message: `Halaman cetak tidak merespons dalam ${o.timeoutMs ?? 180000} ms.` }, [])); }), o.timeoutMs ?? 180000);
    const onMsg = (ev: MessageEvent<PrintMessage>) => {
      if (ev.origin !== url.origin || ev.source !== frame.contentWindow || !ev.data) return;
      const m = ev.data;
      if (m.type === 'pf-print-ready') frame.contentWindow!.postMessage({ type: 'pf-print', payload, autoPrint: o.autoPrint } satisfies PrintMessage, url.origin);
      else if (m.type === 'pf-print-progress' && m.jobId === payload.jobId) o.onProgress?.(m);
      else if (m.type === 'pf-print-result' && m.jobId === payload.jobId) finish(() => resolve({ result: m.result, frame: keep ? frame : null }));
      else if (m.type === 'pf-print-error' && m.jobId === payload.jobId) finish(() => { frame.remove(); reject(new PaginationError(m.failure, m.issues)); });
    };
    window.addEventListener('message', onMsg);
    o.signal?.addEventListener('abort', onAbort, { once: true });
    if (o.signal?.aborted) return onAbort();
    frame.src = url.href;
    (o.mount ?? document.body).appendChild(frame);
  });
}

/**
 * Siklus hidup cetak lokal (EN-005, statis 3.0). Status yang dapat diamati aplikasi:
 *  - 'prepared'         : paginasi + verifikasi selesai, frame siap; belum ada dialog.
 *  - 'dialog-requested' : window.print() dipanggil pada frame. Ini BUKAN bukti PDF dibuat/disimpan.
 *  - 'returned'         : peramban mengirim `afterprint` pada frame — dialog sudah ditutup (disimpan ATAU dibatalkan;
 *                         aplikasi tidak dapat membedakan keduanya).
 *  - 'unknown'          : `afterprint` tidak teramati (beberapa peramban/OS). Frame dipertahankan sampai dispose().
 *  - 'disposed'         : frame dan listener dibuang.
 * Frame TIDAK dibuang dengan timer. Snapshot yang sedang dicetak tidak pernah diubah; dispose() idempoten.
 */
export type PrintLifecycle = 'prepared' | 'dialog-requested' | 'returned' | 'unknown' | 'disposed';
export interface PrintSession {
  result: PaginationResult; frame: HTMLIFrameElement;
  readonly state: PrintLifecycle;
  /** membuka dialog cetak native; mengembalikan janji yang selesai saat afterprint teramati (atau 'unknown') */
  print(opts?: { unknownAfterMs?: number }): Promise<'returned' | 'unknown'>;
  dispose(): void;
  onState?: (s: PrintLifecycle) => void;
}

/** Siapkan cetak: paginasi di iframe tersembunyi yang dipertahankan. Tidak membuka dialog. */
export async function preparePrint(payload: PrintPayload, o: Omit<FrameOptions, 'autoPrint' | 'keepFrame'> = {}): Promise<PrintSession> {
  const { result, frame } = await paginateInFrame(payload, { ...o, keepFrame: true });
  if (result.status !== 'ok' || !frame) { frame?.remove(); throw new PaginationError(result.failure ?? { code: 'BLOCKING_ISSUES', message: 'Dokumen memiliki masalah penghalang.' }, result.issues); }
  let state: PrintLifecycle = 'prepared';
  let detach: (() => void) | null = null;
  const session: PrintSession = {
    result, frame,
    get state() { return state; },
    print(opts = {}) {
      const w = frame.contentWindow;
      if (!w || state === 'disposed') return Promise.resolve('unknown');
      return new Promise((resolve) => {
        const set = (s: PrintLifecycle) => { state = s; session.onState?.(s); };
        const onAfter = () => { detach?.(); set('returned'); resolve('returned'); };
        // Pada sebagian peramban window.print() memblok sampai dialog ditutup; afterprint lalu terkirim sinkron/segera.
        // Bila tidak ada afterprint dalam batas waktu, status 'unknown' — frame TETAP dipertahankan untuk cetak ulang.
        const timer = setTimeout(() => { if (state === 'dialog-requested') { set('unknown'); resolve('unknown'); } }, opts.unknownAfterMs ?? 120_000);
        detach = () => { w.removeEventListener('afterprint', onAfter); clearTimeout(timer); detach = null; };
        w.addEventListener('afterprint', onAfter, { once: true });
        set('dialog-requested');
        try { w.focus(); w.print(); } catch { detach?.(); set('unknown'); resolve('unknown'); }
      });
    },
    dispose() { if (state === 'disposed') return; detach?.(); frame.remove(); state = 'disposed'; session.onState?.('disposed'); },
  };
  return session;
}

/** Kompatibilitas: siapkan lalu buka dialog. Frame dipertahankan sampai dispose() pada sesi yang dikembalikan. */
export async function printLocally(payload: PrintPayload, o: Omit<FrameOptions, 'autoPrint'> = {}): Promise<PrintSession> {
  const session = await preparePrint(payload, o);
  void session.print();
  return session;
}
