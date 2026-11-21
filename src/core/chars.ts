/** Analisis karakter tak terlihat/kendali (EN, keamanan input). Hanya melaporkan; sumber tidak pernah diubah. */
import { mkIssue, type CoreIssue } from './util';

export interface CharAnalysis {
  codePoints: number; lines: number; nonAscii: number;
  privateUse: number; bidiControls: number; zeroWidth: number; controls: number; softHyphens: number; replacementChars: number;
  /** baris (1-based) contoh per kategori, paling banyak 20 */
  samples: { bidi: number[]; zeroWidth: number[]; controls: number[]; replacement: number[] };
}
/** Analisis karakter: hanya melaporkan, tidak pernah mengubah sumber. */
export function analyzeChars(source: string): CharAnalysis {
  const a: CharAnalysis = { codePoints: 0, lines: 1, nonAscii: 0, privateUse: 0, bidiControls: 0, zeroWidth: 0, controls: 0, softHyphens: 0, replacementChars: 0, samples: { bidi: [], zeroWidth: [], controls: [], replacement: [] } };
  let line = 1;
  const push = (arr: number[]) => { if (arr.length < 20 && arr[arr.length - 1] !== line) arr.push(line); };
  for (let i = 0; i < source.length; i++) {
    let c = source.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < source.length) { const d = source.charCodeAt(i + 1); if (d >= 0xdc00 && d <= 0xdfff) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++; } }
    a.codePoints++;
    if (c === 10) { line++; a.lines++; continue; }
    if (c < 128) { if ((c < 32 && c !== 9 && c !== 13) || c === 127) { a.controls++; push(a.samples.controls); } continue; }
    a.nonAscii++;
    if (c >= 0xe000 && c <= 0xf8ff) a.privateUse++;
    else if ((c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069) || c === 0x200e || c === 0x200f || c === 0x061c) { a.bidiControls++; push(a.samples.bidi); }
    // ZWJ/ZWNJ (U+200D/U+200C) sah dalam emoji dan aksara Persia/India → tidak dilaporkan
    else if (c === 0x200b || c === 0x2060 || (c === 0xfeff && i > 0)) { a.zeroWidth++; push(a.samples.zeroWidth); }
    else if (c === 0xad) a.softHyphens++;
    else if (c === 0xfffd) { a.replacementChars++; push(a.samples.replacement); }
    else if (c >= 0x80 && c <= 0x9f) { a.controls++; push(a.samples.controls); }
  }
  return a;
}

/** Temuan dari analisis karakter (tidak memblokir; isi tidak diubah). */
export function charIssues(a: CharAnalysis): CoreIssue[] {
  const out: CoreIssue[] = [];
  const at = (l: number[]) => l.join(', ');
  if (a.bidiControls) out.push(mkIssue('INPUT_BIDI_CONTROLS', 'warning', 'input', { id: `Naskah memuat ${a.bidiControls} karakter kendali arah teks tak terlihat (baris ${at(a.samples.bidi)}). Karakter ini dapat membuat teks tampil dalam urutan berbeda dari isinya; dipertahankan apa adanya — hapus bila tidak disengaja.`, en: `The document contains ${a.bidiControls} invisible bidirectional control characters (lines ${at(a.samples.bidi)}). They can make text display in a different order than stored; kept as-is — remove them if unintended.` }, { line: a.samples.bidi[0], detail: { count: a.bidiControls } }));
  if (a.zeroWidth) out.push(mkIssue('INPUT_ZERO_WIDTH', 'info', 'input', { id: `Naskah memuat ${a.zeroWidth} karakter lebar-nol (baris ${at(a.samples.zeroWidth)}); dipertahankan apa adanya.`, en: `The document contains ${a.zeroWidth} zero-width characters (lines ${at(a.samples.zeroWidth)}); kept as-is.` }, { line: a.samples.zeroWidth[0], detail: { count: a.zeroWidth } }));
  if (a.controls) out.push(mkIssue('INPUT_CONTROL_CHARS', 'warning', 'input', { id: `Naskah memuat ${a.controls} karakter kendali (baris ${at(a.samples.controls)}) yang tidak tampil saat dicetak.`, en: `The document contains ${a.controls} control characters (lines ${at(a.samples.controls)}) that do not print.` }, { line: a.samples.controls[0], detail: { count: a.controls } }));
  if (a.replacementChars) out.push(mkIssue('INPUT_REPLACEMENT_CHARS', 'warning', 'input', { id: `Naskah memuat ${a.replacementChars} karakter pengganti "�" (baris ${at(a.samples.replacement)}) — tanda bahwa berkas asal pernah dibaca dengan encoding yang salah.`, en: `The document contains ${a.replacementChars} replacement characters "�" (lines ${at(a.samples.replacement)}) — a sign the original file was decoded with the wrong encoding.` }, { line: a.samples.replacement[0], detail: { count: a.replacementChars } }));
  return out;
}

