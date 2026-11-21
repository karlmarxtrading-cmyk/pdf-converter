/** Penangan pesan Worker — dipisah dari engine.worker.ts agar dapat diuji di Node tanpa DOM. */
import { analyze, PHASES } from './analyze';
import { ENGINE_PROTOCOL, type EngineRequest, type EngineResponse } from './protocol';

export class EngineCancelled extends Error { constructor() { super('cancelled'); this.name = 'EngineCancelled'; } }

/** Membuat penangan; `post` mengirim balasan, `yieldNow` memberi kesempatan pesan 'cancel' diproses. */
export function createHandler(post: (r: EngineResponse) => void, yieldNow: () => Promise<void> = () => new Promise((r) => setTimeout(r, 0))) {
  const cancelled = new Set<number>();
  const active = new Set<number>();
  return async function handle(req: EngineRequest): Promise<void> {
    // PF-RC4-ENGINE: late cancellation must not retain one id per completed edit forever.
    if (req.type === 'cancel') { if (active.has(req.jobId)) cancelled.add(req.jobId); return; }
    if (req.protocol !== ENGINE_PROTOCOL) { post({ type: 'error', jobId: req.jobId, docVersion: req.docVersion, code: 'ENGINE_PROTOCOL_MISMATCH', message: `protokol ${req.protocol} ≠ ${ENGINE_PROTOCOL}` }); return; }
    active.add(req.jobId);
    const t0 = Date.now();
    const check = async () => { await yieldNow(); if (cancelled.has(req.jobId)) throw new EngineCancelled(); };
    try {
      await check();
      const result = await analyze(req.input, {
        onPhase: (phase, i) => post({ type: 'progress', jobId: req.jobId, docVersion: req.docVersion, phase, done: i, total: PHASES.length }),
        checkpoint: check,
      });
      await check();
      post({ type: 'result', jobId: req.jobId, docVersion: req.docVersion, result, ms: Date.now() - t0 });
    } catch (e) {
      if (e instanceof EngineCancelled) post({ type: 'cancelled', jobId: req.jobId });
      else post({ type: 'error', jobId: req.jobId, docVersion: req.docVersion, code: 'ENGINE_JOB_FAILED', message: (e as Error)?.message ?? String(e) });
    } finally { cancelled.delete(req.jobId); active.delete(req.jobId); }
  };
}
