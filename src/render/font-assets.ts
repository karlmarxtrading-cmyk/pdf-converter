/// <reference types="vite/client" />
/**
 * Sumber font peramban: berkas woff2 dari node_modules diberi URL oleh Vite (`?url`) dan diambil
 * SESUAI PERMINTAAN — modul ini hanya diimpor oleh jalur ekspor, sehingga landing tidak memuat font ekspor (PF-029).
 */
import type { FontFaceSpec, FontSource } from './fonts';

const loaders: Record<string, () => Promise<unknown>> = {
  ...import.meta.glob('/node_modules/@fontsource/inter/files/inter-*-{400,600,700}-{normal,italic}.woff2', { query: '?url', import: 'default' }),
  ...import.meta.glob('/node_modules/@fontsource/source-serif-4/files/source-serif-4-*-{400,600,700}-{normal,italic}.woff2', { query: '?url', import: 'default' }),
  ...import.meta.glob('/node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-*-400-normal.woff2', { query: '?url', import: 'default' }),
  ...import.meta.glob('/node_modules/katex/dist/fonts/*.woff2', { query: '?url', import: 'default' }),
};
const byFile = new Map<string, () => Promise<unknown>>();
for (const [k, v] of Object.entries(loaders)) byFile.set(k.slice(k.lastIndexOf('/') + 1), v);
const cache = new Map<string, Promise<Uint8Array>>();

export const availableFontFiles = (): string[] => [...byFile.keys()].sort();

export const browserFontSource: FontSource = (spec: FontFaceSpec) => {
  const hit = cache.get(spec.file);
  if (hit) return hit;
  const load = byFile.get(spec.file);
  if (!load) return Promise.reject(new Error(`berkas font tidak dibundel: ${spec.file}`));
  const p = (async () => {
    const url = (await load()) as string;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  })();
  p.catch(() => cache.delete(spec.file));
  cache.set(spec.file, p);
  return p;
};
