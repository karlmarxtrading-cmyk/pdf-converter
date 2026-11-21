/**
 * MESIN-36 — klien mesin analisis di thread utama.
 *  - Satu Worker modul; setiap pekerjaan punya jobId unik + docVersion (renderInputHash).
 *  - Pekerjaan baru menggantikan yang lama: yang lama dibatalkan (pesan 'cancel'), hasilnya DITOLAK bila tetap tiba (stale).
 *  - Timeout: Worker dihentikan & dibuat ulang (memori dilepas), pekerjaan ditolak dengan ENGINE_TIMEOUT.
 *  - Worker gagal dibuat / crash berulang → fallback di thread utama dengan jeda antar-fase.
 */
import { analyze, PHASES, type AnalyzeInput, type AnalyzeResult, type Phase } from './analyze';
import { ENGINE_PROTOCOL, type EngineRequest, type EngineResponse } from './protocol';

export interface WorkerLike {
  postMessage(m: EngineRequest): void;
  terminate(): void;
  onmessage: ((ev: { data: EngineResponse }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

export class EngineError extends Error {
  constructor(public code: 'ENGINE_STALE' | 'ENGINE_TIMEOUT' | 'ENGINE_JOB_FAILED' | 'ENGINE_CRASHED' | 'ENGINE_ABORTED' | 'ENGINE_PROTOCOL_MISMATCH' | 'ENGINE_DOC_VERSION', message: string) { super(message); this.name = 'EngineError'; }
}

export interface EngineStats {
  mode: 'worker' | 'fallback' | 'idle'; started: number; completed: number; staleDropped: number; cancelled: number;
  timeouts: number; errors: number; respawns: number; lastMs: number; lastPhase: Phase | null; reason?: string;
}
export interface RunOptions { docVersion: string; signal?: AbortSignal; onProgress?: (p: { phase: Phase; done: number; total: number }) => void; timeoutMs?: number }

interface Pending { jobId: number; docVersion: string; resolve: (r: AnalyzeResult) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> | null; onProgress?: RunOptions['onProgress']; t0: number; input: AnalyzeInput; opts: RunOptions }

export interface EngineClientOptions {
  /** pembuat Worker; null → fallback. Default: Worker modul Vite. */
  factory?: (() => WorkerLike | null) | null;
  /** batas waktu default (ms) per pekerjaan; default dihitung dari ukuran naskah */
  timeoutMs?: number;
  /** jeda ke event loop pada fallback */
  yieldFn?: () => Promise<void>;
  maxCrashes?: number;
}

export function defaultTimeout(input: AnalyzeInput): number {
  return 60_000 + Math.ceil(input.source.length / 1024) * 25;
}

const yieldDefault = (): Promise<void> => {
  const sch = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  return sch?.yield ? sch.yield() : new Promise((r) => setTimeout(r, 0));
};

export class EngineClient {
  private worker: WorkerLike | null = null;
  private seq = 0;
  private latest = 0;
  private pending = new Map<number, Pending>();
  private crashes = 0;
  /** Worker saat ini sudah mengirim 'ready' (modul termuat). Galat sebelum itu = gagal memuat → fallback langsung. */
  private readySeen = false;
  readonly stats: EngineStats = { mode: 'idle', started: 0, completed: 0, staleDropped: 0, cancelled: 0, timeouts: 0, errors: 0, respawns: 0, lastMs: 0, lastPhase: null };
  private factory: (() => WorkerLike | null) | null;
  private yieldFn: () => Promise<void>;

  constructor(private opts: EngineClientOptions = {}) {
    this.factory = opts.factory === undefined ? defaultFactory : opts.factory;
    this.yieldFn = opts.yieldFn ?? yieldDefault;
  }

  get mode(): 'worker' | 'fallback' { return this.ensureWorker() ? 'worker' : 'fallback'; }

  private ensureWorker(): WorkerLike | null {
    if (this.worker) return this.worker;
    if (!this.factory || this.crashes >= (this.opts.maxCrashes ?? 3)) { this.stats.mode = 'fallback'; return null; }
    let w: WorkerLike | null = null;
    try { w = this.factory(); } catch (e) { this.stats.reason = `worker-create-failed: ${(e as Error).message}`; w = null; }
    if (!w) { this.factory = null; this.stats.mode = 'fallback'; this.stats.reason ??= 'worker-unavailable'; return null; }
    this.readySeen = false;
    w.onmessage = (ev) => this.onMessage(ev.data);
    w.onerror = (ev) => this.onCrash(ev);
    this.worker = w; this.stats.mode = 'worker';
    return w;
  }

  private onMessage(m: EngineResponse): void {
    if (m.type === 'ready') { if (m.protocol !== ENGINE_PROTOCOL) this.onCrash(new Error('protocol mismatch')); else this.readySeen = true; return; }
    const p = this.pending.get(m.jobId);
    if (!p) { if (m.type === 'result') this.stats.staleDropped++; return; }
    if (m.type === 'progress') { if (m.jobId === this.latest) { this.stats.lastPhase = m.phase; p.onProgress?.({ phase: m.phase, done: m.done, total: m.total }); } return; }
    this.settle(p);
    if (m.type === 'cancelled') { this.stats.cancelled++; p.reject(new EngineError('ENGINE_STALE', 'dibatalkan')); return; }
    if (m.type === 'error') { this.stats.errors++; p.reject(new EngineError(m.code === 'ENGINE_PROTOCOL_MISMATCH' ? 'ENGINE_PROTOCOL_MISMATCH' : 'ENGINE_JOB_FAILED', m.message)); return; }
    // result
    if (m.jobId !== this.latest) { this.stats.staleDropped++; p.reject(new EngineError('ENGINE_STALE', `hasil pekerjaan ${m.jobId} usang (terbaru ${this.latest})`)); return; }
    if (m.docVersion !== p.docVersion) { this.stats.errors++; p.reject(new EngineError('ENGINE_DOC_VERSION', `versi dokumen hasil ${m.docVersion} ≠ ${p.docVersion}`)); return; }
    this.crashes = 0;
    this.stats.completed++; this.stats.lastMs = Math.round(m.ms);
    p.resolve(m.result);
  }

  private settle(p: Pending): void { if (p.timer) clearTimeout(p.timer); this.pending.delete(p.jobId); }

  private restart(): void {
    try { this.worker?.terminate(); } catch { /* sudah mati */ }
    this.worker = null; this.stats.respawns++;
  }

  private onCrash(ev: unknown): void {
    this.crashes++;
    const msg = (ev as { message?: string })?.message ?? 'worker error';
    this.stats.reason = `worker-crash: ${msg}`;
    if (!this.readySeen) {
      // Modul Worker gagal dimuat/diinisialisasi (mis. chunk lama hilang setelah deploy baru, CSP, browser tanpa Worker modul):
      // beralih permanen ke fallback dan jalankan ulang pekerjaan yang tertunda di sana — tidak ada revisi yang gagal karena ini.
      this.stats.reason = `worker-load-failed: ${msg}`;
      this.factory = null;
      const waiting = [...this.pending.values()];
      for (const p of waiting) this.settle(p);
      try { this.worker?.terminate(); } catch { /* */ }
      this.worker = null; this.stats.mode = 'fallback';
      for (const p of waiting) this.runFallback(p.jobId, p.input, p.opts).then(p.resolve, p.reject);
      return;
    }
    for (const p of [...this.pending.values()]) { this.settle(p); this.stats.errors++; p.reject(new EngineError('ENGINE_CRASHED', `Worker berhenti: ${msg}`)); }
    this.restart();
  }

  /** Jalankan analisis. Pekerjaan sebelumnya otomatis dibatalkan dan hasilnya tidak akan diterapkan. */
  run(input: AnalyzeInput, o: RunOptions): Promise<AnalyzeResult> {
    const jobId = ++this.seq;
    this.latest = jobId;
    this.stats.started++;
    for (const old of [...this.pending.values()]) {
      // batalkan yang lama: Worker berhenti di titik periksa berikutnya; janji lama ditolak sebagai usang
      this.worker?.postMessage({ type: 'cancel', jobId: old.jobId });
      this.settle(old); this.stats.cancelled++;
      old.reject(new EngineError('ENGINE_STALE', `digantikan oleh pekerjaan ${jobId}`));
    }
    if (o.signal?.aborted) return Promise.reject(new EngineError('ENGINE_ABORTED', 'dibatalkan'));
    const w = this.ensureWorker();
    if (!w) return this.runFallback(jobId, input, o);
    return new Promise<AnalyzeResult>((resolve, reject) => {
      const timeoutMs = o.timeoutMs ?? this.opts.timeoutMs ?? defaultTimeout(input);
      const p: Pending = { jobId, docVersion: o.docVersion, resolve, reject, timer: null, t0: Date.now(), input, opts: o, ...(o.onProgress ? { onProgress: o.onProgress } : {}) };
      p.timer = setTimeout(() => {
        if (!this.pending.has(jobId)) return;
        this.settle(p); this.stats.timeouts++;
        // hentikan Worker agar komputasi macet tidak terus memakan memori/CPU; dibuat ulang pada pekerjaan berikutnya
        for (const q of [...this.pending.values()]) { this.settle(q); q.reject(new EngineError('ENGINE_STALE', 'Worker dimulai ulang')); }
        this.restart();
        reject(new EngineError('ENGINE_TIMEOUT', `Analisis melebihi ${Math.round(timeoutMs / 1000)} detik dan dihentikan.`));
      }, timeoutMs);
      this.pending.set(jobId, p);
      o.signal?.addEventListener('abort', () => {
        if (!this.pending.has(jobId)) return;
        w.postMessage({ type: 'cancel', jobId }); this.settle(p); this.stats.cancelled++;
        reject(new EngineError('ENGINE_ABORTED', 'dibatalkan'));
      }, { once: true });
      w.postMessage({ type: 'job', protocol: ENGINE_PROTOCOL, jobId, docVersion: o.docVersion, kind: 'analyze', input });
    });
  }

  private async runFallback(jobId: number, input: AnalyzeInput, o: RunOptions): Promise<AnalyzeResult> {
    const t0 = Date.now();
    const check = async () => {
      await this.yieldFn();
      if (o.signal?.aborted) throw new EngineError('ENGINE_ABORTED', 'dibatalkan');
      if (jobId !== this.latest) { this.stats.staleDropped++; throw new EngineError('ENGINE_STALE', `pekerjaan ${jobId} usang`); }
    };
    try {
      await check();
      const r = await analyze(input, { onPhase: (phase, i) => { this.stats.lastPhase = phase; o.onProgress?.({ phase, done: i, total: PHASES.length }); }, checkpoint: check });
      await check();
      this.stats.completed++; this.stats.lastMs = Date.now() - t0;
      return r;
    } catch (e) { if (!(e instanceof EngineError)) this.stats.errors++; throw e; }
  }

  dispose(): void {
    for (const p of [...this.pending.values()]) { this.settle(p); p.reject(new EngineError('ENGINE_ABORTED', 'ditutup')); }
    try { this.worker?.terminate(); } catch { /* */ }
    this.worker = null;
  }
}

function defaultFactory(): WorkerLike | null {
  if (typeof Worker === 'undefined') return null;
  return new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module', name: 'paperforma-engine' }) as unknown as WorkerLike;
}

/** Ubah aset lengkap menjadi metadata (tanpa byte) untuk dikirim ke Worker. */
export function assetMeta(assets: { id: string; path: string; mime: string; width?: number; height?: number; origin: string; bytes?: Uint8Array }[]): AnalyzeInput['options']['assets'] {
  return assets.map(({ bytes: _b, ...rest }) => rest) as AnalyzeInput['options']['assets'];
}
