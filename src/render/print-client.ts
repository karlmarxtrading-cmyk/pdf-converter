/**
 * Klien halaman cetak untuk aplikasi: memaginasi di iframe print.html (origin sama) dan cetak lokal (PDF-12).
 * Tidak ada data dokumen yang dikirim ke server pada jalur ini.
 */
import { assertPrintPayload } from './print-budget';
import { PaginationError } from './paginate-error';
import type { PaginationResult, PrintMessage, PrintPayload, PrintProgress, PrintTraceEvent } from './print-types';

// The watchdog only advances at known milestones or on increasing work
// counters for the current logical pass. Old or invented stages are inert.
const measuredPhases = new Set([
  'fonts','images','fragment-work','paginate','batch-pages','assemble','heading-check','diagnostics',
  'diagnostic-pages','widow-pages','font-pages','flatten','serialize-pages','inventory',
  'inventory-source-ready','inventory-reopen','inventory-pages','geometry','verified-pages',
]);
export interface FrameOptions {
  printUrl?: string; signal?: AbortSignal; timeoutMs?: number;
  startupMs?: number; stallMs?: number;
  onProgress?: (p: PrintProgress) => void;
  /** iframe ditempel ke elemen ini dan dibiarkan terlihat (pratinjau). Default: tersembunyi di luar layar lalu dibuang. */
  mount?: HTMLElement; keepFrame?: boolean; autoPrint?: boolean;
}
export interface FrameResult { result: PaginationResult; frame: HTMLIFrameElement | null }

export function paginateInFrame(payload: PrintPayload, o: FrameOptions = {}): Promise<FrameResult> {
  if (o.autoPrint && payload.pdfRestrictions?.length) return Promise.reject(
    new PaginationError({ code: 'BLOCKING_ISSUES', message: payload.pdfRestrictions[0]!.message }, payload.pdfRestrictions));
  try { assertPrintPayload(payload); } catch (error) { return Promise.reject(error); }
  const url = new URL(o.printUrl ?? '/print.html', location.href);
  const frame = document.createElement('iframe');
  frame.title = 'PaperForma print';
  frame.setAttribute('aria-hidden', o.mount ? 'false' : 'true');
  if (!o.mount) frame.style.cssText = `position:fixed;left:-100000px;top:0;width:${Math.ceil(payload.page.widthMm * 3.8) + 80}px;height:800px;border:0;visibility:hidden`;
  else frame.style.cssText = 'width:100%;height:100%;border:0';
  const keep = !!(o.keepFrame || o.mount || o.autoPrint);
  return new Promise<FrameResult>((resolve, reject) => {
    let done = false, ready = false;
    const start = performance.now();
    const large = (payload.bodyInner?.length ?? 0) >= 1_000_000;
    const totalMs = o.timeoutMs ?? (large ? 900_000 : 180_000);
    const stallMs = o.stallMs ?? (large ? 90_000 : 45_000);
    let last = 'startup', progressAt = start;
    const counters = new Map<string, number>();
    let currentPass = 0;
    let idle: ReturnType<typeof setTimeout>;
    const cleanup = () => {
      window.removeEventListener('message', onMsg);
      frame.removeEventListener('error', onLoadError);
      clearTimeout(deadline); clearTimeout(idle);
      o.signal?.removeEventListener('abort', onAbort);
    };
    const finish = (fn: () => void) => { if (done) return; done = true; cleanup(); fn(); };
    const fail = (code: 'FRAME_STARTUP_TIMEOUT' | 'FRAME_STALLED' | 'FRAME_DEADLINE' | 'FRAME_LOAD_FAILED', reason: string) => finish(() => {
      const now = performance.now();
      const message = reason + ' · ' + payload.jobId + ' · fase ' + last + ' · ' +
        Math.round(now-start) + ' ms total · ' + Math.round(now-progressAt) + ' ms sejak progres.';
      const events = stopChild();
      frame.remove();
      reject(new PaginationError({code, message}, [{id:'print-frame',code,severity:'error',scope:'layout',blocking:true,message}],events));
    });
    const stopChild = () => {
      let events: PrintTraceEvent[] = [];
      try {
        frame.contentWindow?.dispatchEvent(new CustomEvent('pf-print-stop',{detail:{
          jobId:payload.jobId,receive:(entries:PrintTraceEvent[]) => { events = structuredClone(entries); },
        }}));
      } catch { /* Frame load can fail before a same-origin document exists. */ }
      return events;
    };
    const onLoadError = () => fail('FRAME_LOAD_FAILED','Halaman cetak gagal dimuat.');
    const onAbort = () => finish(() => {
      const events = stopChild();
      frame.remove();
      reject(new PaginationError({code:'ABORTED',message:'Paginasi dibatalkan.'},[],events));
    });
    const deadline = setTimeout(() => fail('FRAME_DEADLINE','Batas waktu total persiapan cetak tercapai.'),totalMs);
    idle = setTimeout(() => fail('FRAME_STARTUP_TIMEOUT','Halaman cetak belum siap. Periksa pemuatan print.html, aset, dan CSP.'),o.startupMs ?? 30_000);
    const advance = (phase:string) => {
      last = phase; progressAt = performance.now(); clearTimeout(idle);
      idle = setTimeout(() => fail('FRAME_STALLED','Pekerjaan cetak berhenti melaporkan kemajuan.'),stallMs);
    };
    const onMsg = (ev: MessageEvent<PrintMessage>) => {
      if (ev.origin !== url.origin || ev.source !== frame.contentWindow || !ev.data) return;
      const m = ev.data;
      if (m.type === 'pf-print-ready' && !ready) {
        try { assertPrintPayload(payload); }
        catch (error) { finish(() => { frame.remove(); reject(error); }); return; }
        ready = true; advance('payload');
        frame.contentWindow!.postMessage({ type: 'pf-print', payload, autoPrint: o.autoPrint } satisfies PrintMessage, url.origin);
      } else if (m.type === 'pf-print-progress' && m.jobId === payload.jobId && ready) {
        const pass = m.pass ?? 0;
        if (!measuredPhases.has(m.phase) || !Number.isSafeInteger(pass) || pass < currentPass ||
            pass > currentPass + 1 || (pass > currentPass && m.phase !== 'paginate')) return;
        const key = m.phase + '/' + pass;
        const units = m.units ?? m.pages ?? 0;
        if (!Number.isSafeInteger(units) || units < 0 || units <= (counters.get(key) ?? -1)) return;
        if ((m.phase === 'fonts' || m.phase === 'images') && (pass !== 0 || units !== 0)) return;
        currentPass = pass; counters.set(key, units); advance(key + ' · ' + units); o.onProgress?.(m);
      } else if (m.type === 'pf-print-result' && m.jobId === payload.jobId) finish(() => { if (!keep) frame.remove(); resolve({ result: m.result, frame: keep ? frame : null }); });
      else if (m.type === 'pf-print-error' && m.jobId === payload.jobId) finish(() => { frame.remove(); reject(new PaginationError(m.failure, m.issues,m.events)); });
    };
    frame.addEventListener('error', onLoadError);
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
  if (payload.pdfRestrictions?.length) throw new PaginationError(
    { code: 'BLOCKING_ISSUES', message: payload.pdfRestrictions[0]!.message }, payload.pdfRestrictions);
  const { result, frame } = await paginateInFrame(payload, { ...o, keepFrame: true });
  if (result.status !== 'ok' || !frame) { frame?.remove(); throw new PaginationError(result.failure ?? { code: 'BLOCKING_ISSUES', message: 'Dokumen memiliki masalah penghalang.' }, result.issues); }
  let state: PrintLifecycle = 'prepared';
  type Outcome = 'returned' | 'unknown';
  let pending: Promise<Outcome> | null = null;
  let settle: ((outcome: Outcome) => void) | null = null;
  let detach: (() => void) | null = null;
  const finish = (outcome: Outcome) => {
    const resolve = settle;
    pending = null;
    settle = null;
    resolve?.(outcome);
  };
  const session: PrintSession = {
    result, frame,
    get state() { return state; },
    print(opts = {}) {
      const w = frame.contentWindow;
      if (!w || state === 'disposed') return Promise.resolve('unknown');
      if (pending) return pending;
      // A retry replaces a late-afterprint listener from a previously timed out request.
      detach?.();
      const request = new Promise<Outcome>((resolve) => { settle = resolve; });
      pending = request;
      const set = (s: PrintLifecycle) => { state = s; session.onState?.(s); };
      const onAfter = () => { detach?.(); finish('returned'); set('returned'); };
      const timer = setTimeout(() => { finish('unknown'); set('unknown'); }, opts.unknownAfterMs ?? 120_000);
      detach = () => { w.removeEventListener('afterprint', onAfter); clearTimeout(timer); detach = null; };
      w.addEventListener('afterprint', onAfter, { once: true });
      set('dialog-requested');
      try { w.focus(); w.print(); } catch { detach?.(); finish('unknown'); set('unknown'); }
      return request;
    },
    dispose() { if (state === 'disposed') return; detach?.(); finish('unknown'); frame.remove(); state = 'disposed'; session.onState?.('disposed'); },
  };
  return session;
}

/** Kompatibilitas: siapkan lalu buka dialog. Frame dipertahankan sampai dispose() pada sesi yang dikembalikan. */
export async function printLocally(payload: PrintPayload, o: Omit<FrameOptions, 'autoPrint'> = {}): Promise<PrintSession> {
  const session = await preparePrint(payload, o);
  void session.print();
  return session;
}
