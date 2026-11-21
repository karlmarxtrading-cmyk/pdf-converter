/**
 * Konversi offset (05 §6): sourceRef memakai indeks UTF-16; anggaran memakai byte UTF-8.
 * Code point dihitung terpisah. Ketiganya TIDAK sama untuk emoji/aksara non-ASCII.
 */
export function utf16ToUtf8Offset(text: string, index: number): number {
  if (index < 0 || index > text.length) throw new RangeError('OFFSET_OUT_OF_RANGE');
  let n = 0;
  for (let i = 0; i < index; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length && (text.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
      if (i + 1 >= index) throw new RangeError('OFFSET_SPLITS_SURROGATE_PAIR');
      n += 4; i++;
    } else n += 3;
  }
  return n;
}

export function utf8ToUtf16Offset(text: string, byteOffset: number): number {
  if (byteOffset < 0) throw new RangeError('OFFSET_OUT_OF_RANGE');
  let n = 0;
  let i = 0;
  while (i < text.length && n < byteOffset) {
    const c = text.charCodeAt(i);
    let w: number; let units = 1;
    if (c < 0x80) w = 1;
    else if (c < 0x800) w = 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length && (text.charCodeAt(i + 1) & 0xfc00) === 0xdc00) { w = 4; units = 2; } else w = 3;
    if (n + w > byteOffset) throw new RangeError('OFFSET_SPLITS_UTF8_SEQUENCE');
    n += w; i += units;
  }
  if (n !== byteOffset) throw new RangeError('OFFSET_OUT_OF_RANGE');
  return i;
}

export function utf16ToCodePointOffset(text: string, index: number): number {
  let cp = 0;
  for (let i = 0; i < index; i++) {
    const c = text.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length && (text.charCodeAt(i + 1) & 0xfc00) === 0xdc00) i++;
    cp++;
  }
  return cp;
}

/** Rentang UTF-16 → rentang byte UTF-8 (untuk laporan/ekspor). */
export function rangeToUtf8(text: string, start: number, end: number): { start: number; end: number } {
  return { start: utf16ToUtf8Offset(text, start), end: utf16ToUtf8Offset(text, end) };
}
