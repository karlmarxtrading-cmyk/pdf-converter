/** Label yang DITULIS ke dalam dokumen mengikuti bahasa ISI (settings.contentLang), bukan bahasa UI. */
import type { Role } from '../core/contracts';

export interface DocLabels {
  toc: string; cont: string; skip: string; cover: string; notes: string; table: (n: number, caption?: string) => string;
  fn: string; back: (ref: string) => string; extMissing: string; missing: string; blockedImg: string; appendix: string;
  tablePart: (part: number, total: number, first: number, last: number, count: number) => string;
  scrollable: string; math: string; code: string; diagramFailed: string; diagramNotRendered: string;
  externalImage: (alt: string) => string; role: Record<Role, string>; roleUnconfirmed: string;
  wideCode: string; wideTable: string; footerGenerated: string; messages: string;
}

const ID: DocLabels = {
  fn: 'Catatan kaki', back: ref => `Kembali ke rujukan ${ref}`, extMissing: 'Gambar eksternal belum dimuat',
  missing: 'Gambar belum tersedia', blockedImg: 'Gambar diblokir', appendix: 'Lampiran: percakapan sumber',
  tablePart: (part, total, first, last, count) => `bagian ${part}/${total}: kolom ${first}–${last} dari ${count}${part > 1 ? ' (kolom 1 diulang)' : ''}`,
  toc: 'Daftar Isi', cont: 'lanjutan', skip: 'Lewati ke isi', cover: 'Sampul', notes: 'Catatan',
  table: (n, c) => `Tabel ${n}${c ? `: ${c}` : ''} (dapat digulir)`, scrollable: 'dapat digulir', math: 'Rumus (dapat digulir)', code: 'Kode',
  diagramFailed: 'Diagram tidak dapat dirender; sumber Mermaid ditampilkan apa adanya.',
  diagramNotRendered: 'Diagram belum dirender pada keluaran ini; sumber Mermaid ditampilkan apa adanya.',
  externalImage: (alt) => `Gambar eksternal tidak disertakan pada keluaran luring${alt ? `: ${alt}` : ''}`,
  role: { user: 'Pengguna', assistant: 'Asisten', system: 'Sistem', other: 'Pembicara lain', unknown: 'Peran tidak diketahui' },
  roleUnconfirmed: 'peran belum dikonfirmasi', wideCode: 'kode lebar', wideTable: 'tabel lebar', footerGenerated: 'Dibuat dengan PaperForma', messages: 'Pesan',
};
const EN: DocLabels = {
  fn: 'Footnotes', back: ref => `Back to reference ${ref}`, extMissing: 'External image not loaded',
  missing: 'Image not available', blockedImg: 'Image blocked', appendix: 'Appendix: source conversation',
  tablePart: (part, total, first, last, count) => `part ${part}/${total}: columns ${first}–${last} of ${count}${part > 1 ? ' (column 1 repeated)' : ''}`,
  toc: 'Contents', cont: 'continued', skip: 'Skip to content', cover: 'Cover', notes: 'Notes',
  table: (n, c) => `Table ${n}${c ? `: ${c}` : ''} (scrollable)`, scrollable: 'scrollable', math: 'Equation (scrollable)', code: 'Code',
  diagramFailed: 'The diagram could not be rendered; the Mermaid source is shown as is.',
  diagramNotRendered: 'The diagram was not rendered in this output; the Mermaid source is shown as is.',
  externalImage: (alt) => `External image not included in the offline output${alt ? `: ${alt}` : ''}`,
  role: { user: 'User', assistant: 'Assistant', system: 'System', other: 'Other speaker', unknown: 'Unknown role' },
  roleUnconfirmed: 'role not confirmed', wideCode: 'wide code', wideTable: 'wide table', footerGenerated: 'Made with PaperForma', messages: 'Messages',
};
export const docLanguage = (contentLang?: string): 'id' | 'en' => /^en\b/i.test(contentLang ?? '') ? 'en' : 'id';
export const docLabels = (contentLang?: string): DocLabels => docLanguage(contentLang) === 'en' ? EN : ID;
