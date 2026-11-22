/// <reference types="vite/client" />
/**
 * Sumber font peramban: berkas woff2 dari node_modules diberi URL oleh Vite (`?url`) dan diambil
 * sesuai kebutuhan pratinjau dan ekspor. Daftar URL berada dalam satu modul.
 */
import { assertWoff2 } from './woff2';
import type { FontFaceSpec, FontSource } from './fonts';

const urls: Record<string, string> = {
  ...import.meta.glob<string>('/node_modules/@fontsource/inter/files/inter-*-{400,600,700}-{normal,italic}.woff2', { query: '?url', import: 'default', eager: true }),
  ...import.meta.glob<string>('/node_modules/@fontsource/source-serif-4/files/source-serif-4-*-{400,600,700}-{normal,italic}.woff2', { query: '?url', import: 'default', eager: true }),
  ...import.meta.glob<string>('/node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-*-400-normal.woff2', { query: '?url', import: 'default', eager: true }),
  ...import.meta.glob<string>('/node_modules/@fontsource/noto-emoji/files/noto-emoji-emoji-400-normal.woff2', { query: '?url', import: 'default', eager: true }),
  ...import.meta.glob<string>('/node_modules/katex/dist/fonts/*.woff2', { query: '?url', import: 'default', eager: true }),
};
const byFile = new Map<string, string>();
for (const [k, v] of Object.entries(urls)) byFile.set(k.slice(k.lastIndexOf('/') + 1), v);
const cache = new Map<string, Promise<Uint8Array>>();

export const availableFontFiles = (): string[] => [...byFile.keys()].sort();

export const browserFontSource: FontSource = (spec: FontFaceSpec) => {
  const hit = cache.get(spec.file);
  if (hit) return hit;
  const url = byFile.get(spec.file);
  if (!url) return Promise.reject(new Error(`berkas font tidak dibundel: ${spec.file}`));
  const p = (async () => {
    // A stalled shared font fetch must not poison preview/export retries forever.
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    assertWoff2(bytes);
    return bytes;
  })();
  p.catch(() => cache.delete(spec.file));
  cache.set(spec.file, p);
  return p;
};
