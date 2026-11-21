/** Utilitas kecil modul render (tanpa dependensi). */
export const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? utf8(data) : data;
  const d = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function bytesToBase64(b: Uint8Array): string {
  const G = globalThis as { Buffer?: { from(b: Uint8Array): { toString(enc: string): string } } };
  if (G.Buffer) return G.Buffer.from(b).toString('base64');
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}
export function base64ToBytes(s: string): Uint8Array {
  const bin = atob(s); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export function dataUrlToBytes(url: string): { mime: string; bytes: Uint8Array } | null {
  const m = /^data:([^;,]*)((?:;[^;,]*)*?)(;base64)?,(.*)$/s.exec(url);
  if (!m) return null;
  const bytes = m[3] ? base64ToBytes(m[4]!) : utf8(decodeURIComponent(m[4]!));
  return { mime: m[1] || 'text/plain', bytes };
}

export const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

export const nowIso = (): string => new Date().toISOString();

export function extOf(mime: string): string {
  return ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/avif': 'avif' } as Record<string, string>)[mime] ?? 'bin';
}
