// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { preparePrint } from '../../../src/render/print-client';
import type { PrintPayload } from '../../../src/render/print-types';

async function openSession() {
  const origin = location.origin;
  const ready = preparePrint({ jobId: 'print-test', page: { widthMm: 210 } } as PrintPayload);
  const frame = document.querySelector('iframe')!;
  const child = frame.contentWindow!;
  const print = vi.spyOn(child, 'print').mockImplementation(() => {});
  vi.spyOn(child, 'focus').mockImplementation(() => {});
  const data = { type: 'pf-print-result', jobId: 'print-test', result: { status: 'ok' } };
  window.dispatchEvent(new MessageEvent('message', { origin, source: child, data }));
  return { session: await ready, child, print };
}

afterEach(() => { document.body.replaceChildren(); vi.useRealTimers(); });

describe('native print session', () => {
  it('a double activation requests one dialog and settles both callers on return', async () => {
    const { session, child, print } = await openSession();
    const first = session.print();
    const second = session.print();
    expect(print).toHaveBeenCalledTimes(1);
    child.dispatchEvent(new Event('afterprint'));
    expect(await Promise.all([first, second])).toEqual(['returned', 'returned']);
    expect(session.state).toBe('returned');
    session.dispose();
  });
  it('disposing an active dialog settles its caller and releases the iframe', async () => {
    const { session, child } = await openSession();
    const request = session.print();
    session.dispose();
    child.dispatchEvent(new Event('afterprint'));
    expect(await request).toBe('unknown');
    expect(session.state).toBe('disposed');
    expect(document.querySelector('iframe')).toBeNull();
  });
  it('a late afterprint updates an unknown state and permits a new request', async () => {
    vi.useFakeTimers();
    const { session, child, print } = await openSession();
    const first = session.print({ unknownAfterMs: 10 });
    await vi.advanceTimersByTimeAsync(10);
    expect(await first).toBe('unknown');
    child.dispatchEvent(new Event('afterprint'));
    expect(session.state).toBe('returned');
    const second = session.print();
    child.dispatchEvent(new Event('afterprint'));
    expect(await second).toBe('returned');
    expect(print).toHaveBeenCalledTimes(2);
    session.dispose();
  });
});
