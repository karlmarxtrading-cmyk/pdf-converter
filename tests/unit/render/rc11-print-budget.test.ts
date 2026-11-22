// @vitest-environment jsdom
import { beforeAll, expect, it, vi } from 'vitest';
import { LIMITS } from '../../../src/core/limits';
import { buildPrintPayload } from '../../../src/render/print-payload';
import { preparePrint } from '../../../src/render/print-client';
import { composeBook, prepareBook } from '../../../src/render/flow-book';
import type { PrintPayload } from '../../../src/render/print-types';
import { nodeFontSource, realDoc } from './helpers';

const limit = LIMITS.pdfPayloadBytes;
const source = '# A06\n\nDraft ending 42.';
const note = {id:'a06', code:'A06_TEST', severity:'info', scope:'pdf', message:''} as const;
const options = {fontSource:nodeFontSource, renderMermaid:false};
let doc: Awaited<ReturnType<typeof realDoc>>;
let sample: PrintPayload;
const utf8 = (text: string) => Buffer.byteLength(text, 'utf8');
const wire = (p: PrintPayload) => utf8(JSON.stringify(p));

beforeAll(async () => {
  doc = await realDoc(source, 'BUS-01', {toc:false, cover:false});
  sample = await buildPrintPayload(doc.snapshot, {...doc.body, issues:[note]}, options);
});

// Large synthetic diagnostics let us dial the exact wire byte, keeping the
// article, independent source check, real font selection and final HTML intact.
it.each([-1,0,1])('builds the real payload and admits only the inclusive limit (%i byte offset)', async delta => {
  const mixed = 'x'.repeat(32767) + '🙃\n"\\\u0000\ud800';
  const fill = mixed + 'x'.repeat(limit + delta - wire(sample) - utf8(JSON.stringify(mixed)) + 2);
  const body = {...doc.body, issues:[{...note, message:fill}]};
  const build = buildPrintPayload(doc.snapshot, body, options);
  if (delta === 1) {
    const refusal = await build.then(() => null, error => error);
    expect(refusal).toMatchObject({code:'BUDGET_EXCEEDED', result:{kind:'pdfPayload',limit}});
    expect(document.querySelector('iframe')).toBeNull();
  } else {
    const payload = await build;
    expect(wire(payload)).toBe(limit + delta);
    const session = preparePrint(payload);
    const child = document.querySelector('iframe')!.contentWindow!;
    const send = vi.spyOn(child, 'postMessage').mockImplementation(() => {});
    const fromChild = (data: unknown) => window.dispatchEvent(new MessageEvent('message', {source:child,origin:location.origin,data}));
    fromChild({type:'pf-print-ready'});
    expect(send.mock.calls[0]![0].payload).toBe(payload);
    fromChild({type:'pf-print-result',jobId:payload.jobId,result:{status:'ok'}});
    (await session).dispose();
  }
  expect(doc.snapshot.source).toBe(source);
  expect(doc.body.issues).not.toContainEqual(expect.objectContaining({id:note.id}));
});

it('rechecks the actual transfer after the frame handshake and releases a rejected frame', async () => {
  const mutable = {...sample};
  const task = preparePrint(mutable);
  const frame = document.querySelector('iframe')!;
  const child = frame.contentWindow!;
  const send = vi.spyOn(child,'postMessage').mockImplementation(() => {});
  mutable.fontCss = 'x'.repeat(limit);
  window.dispatchEvent(new MessageEvent('message', {source:child,origin:location.origin,data:{type:'pf-print-ready'}}));
  await expect(task).rejects.toMatchObject({code:'BUDGET_EXCEEDED'});
  expect(send).not.toHaveBeenCalled();
  expect(frame.isConnected).toBe(false);
});

async function bookWithSize(bytes: number): Promise<PrintPayload> {
  // Escaped '<' in a legal CSS comment makes book UTF-8 larger than JSON.
  const css = '/*' + '<'.repeat(8192) + '*/';
  const styles = [...sample.styles, css];
  const start = await composeBook({...sample, styles});
  styles[styles.length - 1] = css.slice(0,-2) + 'x'.repeat(bytes - utf8(start)) + '*/';
  return {...sample, styles};
}

it.each([-1,0,1])('checks the actual serialized print book at offset %i', async delta => {
  const p = await bookWithSize(limit + delta);
  expect(wire(p)).toBeLessThan(limit);
  const blob = vi.spyOn(URL, 'createObjectURL');
  try {
    if (delta > 0) {
      const refusal = await composeBook(p).then(() => null, error => error);
      expect(refusal).toMatchObject({code:'BUDGET_EXCEEDED',result:{actual:limit+1}});
      await expect(prepareBook(p,new AbortController().signal)).rejects.toMatchObject({code:'BUDGET_EXCEEDED',result:{actual:limit+1}});
      expect(blob).not.toHaveBeenCalled();
    } else {
      const html = await composeBook(p);
      expect(utf8(html)).toBe(limit+delta);
      expect(html.endsWith('</body></html>\n')).toBe(true);
      expect(html.includes('Draft ending 42.')).toBe(true);
    }
  } finally { blob.mockRestore(); }
  expect(doc.snapshot.source).toBe(source);
  expect(document.querySelector('iframe')).toBeNull();
});

it('cancels an in-flight book before allocating its frame, then builds an edited revision for retry',async () => {
  const ctrl = new AbortController();
  const p = await bookWithSize(3 * 1024 * 1024);
  const job = prepareBook(p,ctrl.signal);
  setTimeout(() => ctrl.abort(),0);
  await expect(job).rejects.toMatchObject({name:'AbortError'});
  expect(document.querySelector('iframe')).toBeNull();
  const changed = await realDoc('# Retry\n\nNew final line.', 'BUS-01', {cover:false}, 2);
  const retry = await buildPrintPayload(changed.snapshot,changed.body,options);
  const result = await composeBook(retry);
  expect(retry.snapshot.revision).toBe(2);
  expect(result).toContain('New final line.');
  expect(result).not.toContain('Draft ending 42.');
  expect(doc.snapshot.source).toBe(source);
});
