// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { inspectInlineImage } from '../../../src/core/assets';
import { LIMITS } from '../../../src/core/limits';
import { DiagramRasterBudget, readDiagramRaster } from '../../../src/render/diagram-raster';
import { checkedDiagram } from '../../../src/render/diagram-policy';

const bytes = (width: number) => readFileSync('fixtures/rc12/raster/' + width + 'px.png');
const png = (width: number) => 'data:image/png;base64,' + bytes(width).toString('base64');
const offlineRead = () => Promise.reject(new Error('Unexpected network read'));

describe('raster admission for Mermaid', () => {
  it('enforces each dimension, byte and pixel boundary using ordinary tiny PNGs', () => {
    for (const n of [7, 8, 9]) {
      expect(inspectInlineImage(png(n), LIMITS, {maxDimension: 8, maxPixels: 50}).ok).toBe(n <= 8);
      expect(inspectInlineImage(png(n), LIMITS, {maxDimension: 100, maxPixels: 8}).ok).toBe(n <= 8);
    }
    for (const delta of [-1, 0, 1]) {
      expect(inspectInlineImage(png(8), {...LIMITS, assetBytes: bytes(8).length + delta}).ok).toBe(delta >= 0);
    }
  });
  it('rejects MIME mismatches, invalid base64 and unreadable headers on the detached SVG', () => {
    for (const url of [png(7).replace('/png', '/jpeg'), 'data:image/png;base64,...', 'data:image/png;base64,AAAA']) {
      expect(() => checkedDiagram('<svg xmlns="http://www.w3.org/2000/svg"><image href="' + url + '"/></svg>', false, document)).toThrow();
    }
  });
  it('charges unique pixel and byte totals across diagrams, including ordinary document images', async () => {
    for (const kind of ['pixels','bytes']) for (const delta of [-1,0,1]) {
      const root = document.createElement('div'); root.innerHTML = '<img src="' + png(7) + '">';
      const ledger = new DiagramRasterBudget(kind === 'pixels' ? 15 + delta : 100, kind === 'bytes' ? bytes(7).length + bytes(8).length + delta : 1000);
      ledger.seed(root, []);
      const first = ledger.begin(false);
      expect((await first.resolve(png(7),offlineRead)).width).toBe(7);
      first.commit();
      const second = ledger.begin(false);
      const next = second.resolve(png(8), offlineRead);
      if (delta < 0) await expect(next).rejects.toThrow(/batas proyek/);
      else { expect((await next).width).toBe(8); second.commit(); }
    }
  });
  it('discards reservations on failure and repeats a permitted image without another read', async () => {
    const ledger = new DiagramRasterBudget(9,512);
    await ledger.begin(false).resolve(png(9),offlineRead);
    const retry = ledger.begin(true);
    const read = vi.fn(async () => png(7));
    const src = 'https://example.invalid/swatch.png';
    const first = await retry.resolve(src,read);
    expect((await retry.resolve(src,read)).dataUrl).toBe(first.dataUrl);
    expect(read).toHaveBeenCalledTimes(1);
    retry.commit();
    await expect(ledger.begin(false).resolve(src,read)).rejects.toThrow(/izin/);
    expect(read).toHaveBeenCalledTimes(1);
  });
  it('bounds streaming responses, enforces type and checks cancellation', async () => {
    const url = 'https://example.invalid/swatch.png';
    const controller = new AbortController();
    try {
      vi.stubGlobal('fetch', vi.fn(async () => new Response(bytes(7), {headers:{'Content-Type':'image/png'}})));
      await expect(readDiagramRaster(url,bytes(7).length,controller.signal)).resolves.toBe(png(7));
      await expect(readDiagramRaster(url,bytes(7).length-1,controller.signal)).rejects.toThrow(/byte/);
      controller.abort();
      await expect(readDiagramRaster(url,1000,controller.signal)).rejects.toThrow();
    } finally { vi.unstubAllGlobals(); }
  });
});
