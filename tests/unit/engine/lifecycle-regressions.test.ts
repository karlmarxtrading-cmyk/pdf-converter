// @vitest-environment node
/** PF-RC4-ENGINE: cancellation must release resources and also govern fallback analysis. */
import { getEventListeners } from 'node:events';
import { describe, expect, it } from 'vitest';
import { EngineClient, type WorkerLike } from '../../../src/engine/client';
import type { EngineRequest, EngineResponse } from '../../../src/engine/protocol';
import type { AnalyzeInput, AnalyzeResult } from '../../../src/engine/analyze';

class ControlledWorker implements WorkerLike {
  onmessage: ((ev: { data: EngineResponse }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  sent: EngineRequest[] = [];
  terminated = false;
  postMessage(message: EngineRequest) { this.sent.push(message); }
  terminate() { this.terminated = true; }
  reply(message: EngineResponse) { this.onmessage?.({ data: message }); }
}
const input: AnalyzeInput = { source: '# Retained content\n\nText and $x^2$.', options: { allowExternalImages: false, template: 'EDU-01', assets: [] } };
const fakeResult = { marker: 'transport-test' } as unknown as AnalyzeResult;

describe('PF-RC4-ENGINE resource lifecycle', () => {
  it('releases AbortSignal listeners after completed jobs instead of retaining the full source', async () => {
    const worker = new ControlledWorker();
    const client = new EngineClient({ factory: () => worker });
    const controller = new AbortController();
    const pending = client.run(input, { docVersion: 'one', signal: controller.signal });
    worker.reply({ type: 'result', jobId: 1, docVersion: 'one', result: fakeResult, ms: 1 });
    await pending;
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    client.dispose();
  });

  it('dispose cancels pending fallback work before a result can be applied', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const client = new EngineClient({ factory: null, yieldFn: () => gate });
    const pending = client.run(input, { docVersion: 'one' });
    const assertion = expect(pending).rejects.toMatchObject({ code: 'ENGINE_ABORTED' });
    client.dispose(); release();
    await assertion;
  });

  it('fallback enforces its deadline at a yield boundary', async () => {
    const client = new EngineClient({ factory: null, yieldFn: () => new Promise((resolve) => setTimeout(resolve, 25)) });
    await expect(client.run(input, { docVersion: 'one', timeoutMs: 5 })).rejects.toMatchObject({ code: 'ENGINE_TIMEOUT' });
    client.dispose();
  });

  it('postMessage failure rejects and cleans up without leaving a timer or retained listener', async () => {
    const worker = new ControlledWorker();
    worker.postMessage = () => { throw new Error('DataCloneError during transport'); };
    const client = new EngineClient({ factory: () => worker });
    const controller = new AbortController();
    await expect(client.run(input, { docVersion: 'one', signal: controller.signal, timeoutMs: 100 })).rejects.toThrow();
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    expect(worker.terminated).toBe(true);
    client.dispose();
  });

  it('does not forward progress for a different document revision', async () => {
    const worker = new ControlledWorker();
    const client = new EngineClient({ factory: () => worker });
    let called = false;
    const pending = client.run(input, { docVersion: 'one', onProgress: () => { called = true; } });
    worker.reply({ type: 'progress', jobId: 1, docVersion: 'other', phase: 'render', done: 1, total: 4 });
    client.dispose();
    await expect(pending).rejects.toMatchObject({ code: 'ENGINE_ABORTED' });
    expect(called).toBe(false);
  });
});
