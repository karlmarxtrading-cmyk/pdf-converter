// @vitest-environment node
/**
 * MESIN-36: penangan Worker dijalankan di Node TANPA DOM (tidak ada `document`/`window`).
 * Membuktikan seluruh pekerjaan Worker bebas DOM dan protokolnya (progress, hasil, batal, galat, versi protokol).
 */
import { describe, it, expect } from 'vitest';
import { createHandler } from '../../../src/engine/handler';
import { ENGINE_PROTOCOL, type EngineResponse } from '../../../src/engine/protocol';
import type { AnalyzeInput } from '../../../src/engine/analyze';

const opts = { allowExternalImages: false, template: 'BUS-01', lang: 'id', assets: [{ id: 'a'.repeat(64), path: 'img/a.png', mime: 'image/png', width: 10, height: 10, origin: 'upload' }] } as unknown as AnalyzeInput['options'];
const SRC = '# Judul\n\nTeks  dengan $x^2$ dan [tautan](https://contoh.id).\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```js\nconst x = 1;\n```\n\n![gambar](img/a.png)\n\n$$\n\\frac{1}{2}\n$$\n\nZW​space dan bidi ‮abc‬.\n';

function run(input: AnalyzeInput, extra: (h: (r: never) => Promise<void>) => void = () => {}) {
  const out: EngineResponse[] = [];
  const h = createHandler((r) => out.push(r), () => Promise.resolve());
  const p = h({ type: 'job', protocol: ENGINE_PROTOCOL, jobId: 1, docVersion: 'v1', kind: 'analyze', input } as never);
  extra(h as never);
  return p.then(() => out);
}

describe('MESIN-36 worker handler (Node, tanpa DOM)', () => {
  it('tidak ada DOM di lingkungan ini', () => {
    expect(typeof (globalThis as { document?: unknown }).document).toBe('undefined');
    expect(typeof (globalThis as { window?: unknown }).window).toBe('undefined');
  });
  it('menghasilkan progress berurutan lalu hasil dengan versi dokumen yang sama', async () => {
    const out = await run({ source: SRC, options: opts });
    const prog = out.filter((m) => m.type === 'progress');
    expect(prog.map((m) => (m as { phase: string }).phase)).toEqual(['chars', 'render', 'integrity-model', 'references']);
    const res = out.find((m) => m.type === 'result') as Extract<EngineResponse, { type: 'result' }>;
    expect(res, JSON.stringify(out.filter((m) => m.type === 'error'))).toBeTruthy();
    expect(res.docVersion).toBe('v1');
    const r = res.result;
    expect(r.stage1.html).toContain('data-block-id');
    expect(r.stage1.html).not.toContain('src="data:'); // byte aset tidak pernah di Worker
    expect(r.stage1.assetSrc.length).toBe(1);
    expect(r.stage1.slots.length).toBe(2);
    expect(r.stage1.slots.every((s) => s.ok && s.html.includes('katex'))).toBe(true);
    expect(r.expected.blocks.length).toBeGreaterThan(4);
    expect(r.expected.pua).toEqual([['', 1]]);
    expect(r.assets).toMatchObject({ complete: true, total: 1 });
    expect(r.chars.bidiControls).toBe(2);
    expect(r.chars.zeroWidth).toBe(1);
    const codes = r.stage1.issues.map((i) => i.code);
    expect(codes).toContain('INPUT_BIDI_CONTROLS');
    expect(codes).toContain('INPUT_ZERO_WIDTH');
    // hasil dapat diklon terstruktur (syarat postMessage)
    expect(() => structuredClone(r)).not.toThrow();
  });
  it('pembatalan sebelum titik periksa → cancelled, tanpa hasil', async () => {
    const out: EngineResponse[] = [];
    const h = createHandler((r) => out.push(r), () => new Promise((r) => setTimeout(r, 0)));
    const p = h({ type: 'job', protocol: ENGINE_PROTOCOL, jobId: 7, docVersion: 'v', kind: 'analyze', input: { source: SRC, options: opts } });
    void h({ type: 'cancel', jobId: 7 });
    await p;
    expect(out.some((m) => m.type === 'result')).toBe(false);
    expect(out.some((m) => m.type === 'cancelled' && m.jobId === 7)).toBe(true);
  });
  it('versi protokol berbeda ditolak', async () => {
    const out: EngineResponse[] = [];
    const h = createHandler((r) => out.push(r));
    await h({ type: 'job', protocol: 99, jobId: 2, docVersion: 'v', kind: 'analyze', input: { source: 'x', options: opts } } as never);
    expect(out[0]).toMatchObject({ type: 'error', code: 'ENGINE_PROTOCOL_MISMATCH' });
  });
  it('emoji ZWJ dan ZWNJ tidak dilaporkan sebagai karakter tak terlihat', async () => {
    const out = await run({ source: 'Tim 👩‍💻 dan می‌خواهم.\n', options: opts });
    const res = out.find((m) => m.type === 'result') as Extract<EngineResponse, { type: 'result' }>;
    expect(res.result.chars.zeroWidth).toBe(0);
  });
});
