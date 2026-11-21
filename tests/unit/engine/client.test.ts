/** MESIN-36: klien mesin — pekerjaan usang ditolak, timeout menghentikan Worker, crash → fallback, versi dokumen dijaga. */
import { describe, it, expect, vi } from 'vitest';
import { EngineClient, EngineError, type WorkerLike } from '../../../src/engine/client';
import type { EngineRequest, EngineResponse } from '../../../src/engine/protocol';
import type { AnalyzeInput, AnalyzeResult } from '../../../src/engine/analyze';

class FakeWorker implements WorkerLike {
  onmessage: ((ev: { data: EngineResponse }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  sent: EngineRequest[] = [];
  terminated = false;
  postMessage(m: EngineRequest) { this.sent.push(m); }
  terminate() { this.terminated = true; }
  reply(m: EngineResponse) { this.onmessage?.({ data: m }); }
}
const input: AnalyzeInput = { source: '# A\n\nteks', options: { allowExternalImages: false, template: 'BUS-01', assets: [] } as unknown as AnalyzeInput['options'] };
const fakeResult = { marker: 1 } as unknown as AnalyzeResult;

describe('EngineClient', () => {
  it('hasil pekerjaan lama yang tiba setelah pekerjaan baru dimulai ditolak (tidak diterapkan)', async () => {
    const w = new FakeWorker();
    const c = new EngineClient({ factory: () => w });
    const p1 = c.run(input, { docVersion: 'v1' });
    const p2 = c.run(input, { docVersion: 'v2' });
    await expect(p1).rejects.toMatchObject({ code: 'ENGINE_STALE' });
    expect(w.sent.some((m) => m.type === 'cancel' && m.jobId === 1)).toBe(true);
    w.reply({ type: 'result', jobId: 1, docVersion: 'v1', result: fakeResult, ms: 5 }); // terlambat
    expect(c.stats.staleDropped).toBe(1);
    w.reply({ type: 'result', jobId: 2, docVersion: 'v2', result: fakeResult, ms: 5 });
    await expect(p2).resolves.toBe(fakeResult);
    expect(c.stats.completed).toBe(1);
  });
  it('versi dokumen hasil berbeda → ditolak', async () => {
    const w = new FakeWorker();
    const c = new EngineClient({ factory: () => w });
    const p = c.run(input, { docVersion: 'v1' });
    w.reply({ type: 'result', jobId: 1, docVersion: 'vX', result: fakeResult, ms: 1 });
    await expect(p).rejects.toMatchObject({ code: 'ENGINE_DOC_VERSION' });
  });
  it('progress hanya diteruskan untuk pekerjaan terbaru', async () => {
    const w = new FakeWorker();
    const c = new EngineClient({ factory: () => w });
    const seen: string[] = [];
    const p = c.run(input, { docVersion: 'v1', onProgress: (g) => seen.push(g.phase) });
    w.reply({ type: 'progress', jobId: 1, docVersion: 'v1', phase: 'render', done: 1, total: 4 });
    w.reply({ type: 'result', jobId: 1, docVersion: 'v1', result: fakeResult, ms: 1 });
    await p;
    expect(seen).toEqual(['render']);
  });
  it('timeout: Worker dihentikan, pekerjaan ditolak ENGINE_TIMEOUT, Worker baru dibuat untuk pekerjaan berikutnya', async () => {
    vi.useFakeTimers();
    const made: FakeWorker[] = [];
    const c = new EngineClient({ factory: () => { const w = new FakeWorker(); made.push(w); return w; }, timeoutMs: 1000 });
    const p = c.run(input, { docVersion: 'v1' });
    const assertion = expect(p).rejects.toMatchObject({ code: 'ENGINE_TIMEOUT' });
    vi.advanceTimersByTime(1001);
    await assertion;
    expect(made[0]!.terminated).toBe(true);
    expect(c.stats.timeouts).toBe(1);
    const p2 = c.run(input, { docVersion: 'v2' });
    expect(made.length).toBe(2);
    made[1]!.reply({ type: 'result', jobId: 2, docVersion: 'v2', result: fakeResult, ms: 1 });
    await expect(p2).resolves.toBe(fakeResult);
    vi.useRealTimers();
  });
  it('pembatalan lewat AbortSignal mengirim cancel dan menolak janji', async () => {
    const w = new FakeWorker();
    const c = new EngineClient({ factory: () => w });
    const ac = new AbortController();
    const p = c.run(input, { docVersion: 'v1', signal: ac.signal });
    ac.abort();
    await expect(p).rejects.toMatchObject({ code: 'ENGINE_ABORTED' });
    expect(w.sent.at(-1)).toEqual({ type: 'cancel', jobId: 1 });
  });
  it('modul Worker gagal dimuat (sebelum ready) → pekerjaan yang sama dijalankan ulang di fallback, tanpa galat', async () => {
    let n = 0;
    const c = new EngineClient({ factory: () => { n++; const w = new FakeWorker(); queueMicrotask(() => w.onerror?.({ message: 'Failed to fetch module' })); return w; }, yieldFn: () => Promise.resolve() });
    const r = await c.run(input, { docVersion: 'a' });
    expect(r.stage1.html).toContain('data-block-id');
    expect(c.stats.mode).toBe('fallback');
    expect(c.stats.reason).toMatch(/worker-load-failed/);
    expect(n).toBe(1);
    await expect(c.run(input, { docVersion: 'b' })).resolves.toHaveProperty('expected');
    expect(n).toBe(1); // tidak mencoba Worker lagi
  });
  it('crash berulang SETELAH ready → fallback thread utama yang tetap menghasilkan analisis nyata', async () => {
    let n = 0;
    const c = new EngineClient({ factory: () => { n++; const w = new FakeWorker(); queueMicrotask(() => { w.reply({ type: 'ready', protocol: 1 }); w.onerror?.({ message: 'boom' }); }); return w; }, maxCrashes: 2, yieldFn: () => Promise.resolve() });
    await expect(c.run(input, { docVersion: 'a' })).rejects.toBeInstanceOf(EngineError);
    await expect(c.run(input, { docVersion: 'b' })).rejects.toMatchObject({ code: 'ENGINE_CRASHED' });
    const r = await c.run(input, { docVersion: 'c' });
    expect(c.stats.mode).toBe('fallback');
    expect(n).toBe(2);
    expect(r.stage1.html).toContain('data-block-id');
    expect(r.expected.blocks.length).toBe(2);
  });
  it('fallback: pekerjaan yang digantikan berhenti di titik periksa (stale) tanpa menghasilkan', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const c = new EngineClient({ factory: null, yieldFn: () => gate });
    const p1 = c.run(input, { docVersion: 'v1' });
    const p2 = c.run(input, { docVersion: 'v2' });
    release();
    await expect(p1).rejects.toMatchObject({ code: 'ENGINE_STALE' });
    await expect(p2).resolves.toHaveProperty('stage1');
  });
});
