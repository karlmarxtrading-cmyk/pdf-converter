/** Reject partial downloads before preview caches their bytes or export embeds them. */
export function assertWoff2(bytes: Uint8Array): void {
  const headerSize = 48;
  if (bytes.byteLength < headerSize) throw new Error('WOFF2 terpotong / truncated WOFF2');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tableCount = view.getUint16(12);
  const compressedSize = view.getUint32(20);
  if (view.getUint32(0) !== 0x774f4632 || view.getUint32(8) !== bytes.byteLength ||
      !tableCount || view.getUint16(14) !== 0 || !compressedSize ||
      headerSize + 2 * tableCount + compressedSize > bytes.byteLength) {
    throw new Error('WOFF2 rusak atau terpotong / invalid or truncated WOFF2');
  }
}
