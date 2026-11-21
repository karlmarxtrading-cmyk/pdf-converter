// @vitest-environment jsdom
/** ST-QA-47: gambar diganti dengan nama DAN ukuran byte sama tetapi isi berbeda → pratinjau/ekspor memakai isi baru. */
import { describe, it, expect } from 'vitest';
import { deflateSync, crc32 } from 'node:zlib';
import { AssetStore, renderBody, assetDataUrl } from '../../../src/core/index';

function png(rgb: [number, number, number]): Uint8Array {
  const raw = Buffer.concat(Array.from({ length: 4 }, () => Buffer.from([0, ...rgb, ...rgb, ...rgb, ...rgb])));
  const chunk = (t: string, d: Buffer) => { const b = Buffer.alloc(8 + d.length + 4); b.writeUInt32BE(d.length, 0); b.write(t, 4, 'latin1'); d.copy(b, 8); b.writeUInt32BE(crc32(Buffer.concat([Buffer.from(t, 'latin1'), d])) >>> 0, 8 + d.length); return b; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(4, 0); ihdr.writeUInt32BE(4, 4); ihdr[8] = 8; ihdr[9] = 2;
  return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 0 })), chunk('IEND', Buffer.alloc(0))]));
}

describe('penggantian aset bernama & berukuran sama', () => {
  it('identitas berbasis isi: render memakai byte baru, aset lama tidak muncul lagi', async () => {
    const a = png([255, 0, 0]); const b = png([0, 0, 255]);
    expect(a.length).toBe(b.length);
    const store = new AssetStore([]);
    const r1 = await store.add(a, 'img/logo.png', 'upload'); expect(r1.ok).toBe(true);
    const src = '![logo](img/logo.png)\n';
    const opts = (assets: ReturnType<AssetStore['list']>) => ({ assets, allowExternalImages: false, template: 'BUS-01' as const });
    const h1 = (await renderBody(src, opts(store.list()))).html;
    store.remove('img/logo.png');
    const r2 = await store.add(b, 'img/logo.png', 'upload'); expect(r2.ok).toBe(true);
    const list = store.list();
    expect(list.length).toBe(1);
    const h2 = (await renderBody(src, opts(list))).html;
    const urlOld = assetDataUrl({ ...list[0]!, id: (r1 as { asset: { id: string } }).asset.id, bytes: a });
    const urlNew = assetDataUrl(list[0]!);
    expect(urlNew).not.toBe(urlOld);
    expect(h1).toContain(urlOld);
    expect(h2).toContain(urlNew);
    expect(h2).not.toContain(urlOld);
  });
});
