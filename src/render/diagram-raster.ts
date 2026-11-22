import { bytesToBase64, inspectInlineImage, pixelsOf, type InlineImageInspection } from '../core/assets';
import type { AssetRecord } from '../core/contracts';
import { IMAGE_BUDGET, LIMITS } from '../core/limits';

type Accepted = Extract<InlineImageInspection, {ok: true}>;
type Resource = Pick<Accepted, 'id' | 'pixels' | 'byteLength'>;
export type DiagramRaster = Pick<Accepted, 'width' | 'height'> & { dataUrl: string };
type ReadRemote = (url: string, maximum: number) => Promise<string>;

export async function readDiagramRaster(url: string, maximum: number, signal: AbortSignal): Promise<string> {
  const response = await fetch(url, { mode: 'cors', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', signal });
  const mime = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  const reader = response.body?.getReader();
  if (!response.ok || !reader || !mime || !/^image\/(?:png|jpeg|gif|webp)$/.test(mime) ||
      Number(response.headers.get('content-length')) > maximum) {
    await reader?.cancel();
    throw new Error('Respons HTTPS untuk gambar diagram tidak dapat diperiksa atau melebihi batas aset.');
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      signal.throwIfAborted();
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > maximum) throw new Error('Gambar HTTPS melebihi batas byte aset.');
      chunks.push(part.value);
    }
  } catch (error) { await reader.cancel(); throw error; }
  finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return 'data:' + mime + ';base64,' + bytesToBase64(bytes);
}

/** One ledger per render. Project assets, ordinary inline images and diagram
 * rasters share their content digests. A failed diagram reserves no quota. */
export class DiagramRasterBudget {
  private ids = new Set<string>();
  private pixels = 0;
  private bytes = 0;
  constructor(private maxPixels = Number(IMAGE_BUDGET.maxTotalPixels), private maxBytes = LIMITS.totalProjectBytes) {}

  seed(root: HTMLElement, assets: readonly AssetRecord[]): void {
    for (const asset of assets) this.add({id: asset.id, pixels: pixelsOf(asset), byteLength: asset.bytes.byteLength});
    for (const img of root.querySelectorAll('img[src]')) {
      const src = img.getAttribute('src') || '';
      if (!/^data:image\/(png|jpeg|gif|webp);/i.test(src)) continue;
      const result = inspectInlineImage(src);
      if (result.ok) this.add(result);
    }
  }

  private add(row: Resource): void {
    if (this.ids.has(row.id)) return;
    this.ids.add(row.id); this.pixels += row.pixels; this.bytes += row.byteLength;
  }

  begin(online: boolean) {
    const pending = new Map<string, Resource>();
    const byUrl = new Map<string, Promise<DiagramRaster>>();
    const snapshots = new Map<string, DiagramRaster>();
    // Mermaid may lay out sibling nodes concurrently. Limit the transient byte
    // buffer to one remote response per diagram and stop the queue on failure.
    let previous: Promise<unknown> = Promise.resolve();
    let pixels = this.pixels, bytes = this.bytes;
    const inspect = async (url: string, read: ReadRemote): Promise<DiagramRaster> => {
      if (pixels > this.maxPixels || bytes > this.maxBytes)
        throw new Error('Jumlah piksel atau byte gambar dokumen melewati batas proyek.');
      let dataUrl = url;
      if (!/^data:/i.test(url)) {
        if (!online || !/^https:\/\//i.test(url)) throw new Error('Gambar diagram memerlukan izin HTTPS lokal.');
        dataUrl = await read(url, LIMITS.assetBytes);
      }
      const row = inspectInlineImage(dataUrl);
      if (!row.ok) throw new Error(row.message);
      if (!this.ids.has(row.id) && !pending.has(row.id)) {
        if (pixels + row.pixels > this.maxPixels || bytes + row.byteLength > this.maxBytes)
          throw new Error('Jumlah piksel atau byte gambar dokumen melewati batas proyek.');
        pixels += row.pixels; bytes += row.byteLength; pending.set(row.id, row);
      }
      const snapshot = snapshots.get(row.id) ?? {width: row.width, height: row.height, dataUrl};
      snapshots.set(row.id, snapshot);
      return snapshot;
    };
    return {
      resolve: (url: string, read: ReadRemote): Promise<DiagramRaster> => {
        let result = byUrl.get(url);
        if (!result) {
          result = previous.then(() => inspect(url, read));
          byUrl.set(url, result); previous = result;
        }
        return result;
      },
      commit: () => { for (const row of pending.values()) this.add(row); },
    };
  }
}
