/**
 * Perbaikan tabel Markdown yang tidak rata (SEM-05) sebagai diff yang dapat dibatalkan.
 * Tidak ada sel yang dibuang atau digeser: baris pendek diberi sel kosong di akhir; bila ada
 * baris yang lebih panjang dari judul, kolom judul kosong ditambahkan.
 */
import { makeEdit, type ReversibleEdit } from './wrapper';

/** Memecah baris tabel menjadi sel mentah (menghormati \| dan `kode`). */
export function splitRow(line: string): { lead: string; cells: string[]; trail: string } {
  let s = line;
  const lead = /^\s*/.exec(s)![0];
  s = s.slice(lead.length);
  const cells: string[] = [];
  let cur = ''; let inCode = 0; let started = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === '\\' && i + 1 < s.length) { cur += c + s[i + 1]; i++; continue; }
    if (c === '`') { let j = i; while (s[j] === '`') j++; const run = j - i; inCode = inCode === run ? 0 : inCode || run; cur += s.slice(i, j); i = j - 1; continue; }
    if (c === '|' && !inCode) { if (!started && cur.trim() === '') { started = true; cur = ''; continue; } cells.push(cur); cur = ''; started = true; continue; }
    cur += c;
  }
  if (cur.trim() !== '') cells.push(cur);
  return { lead, cells, trail: '' };
}

const DELIM_RE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

/** Mencari blok tabel yang memuat baris `line` (1-based). */
export function findTable(source: string, line: number): { startLine: number; endLine: number } | null {
  const lines = source.split('\n');
  let i = line - 1;
  if (i < 0 || i >= lines.length || !lines[i]!.includes('|')) return null;
  let s = i; while (s > 0 && lines[s - 1]!.includes('|') && lines[s - 1]!.trim() !== '') s--;
  let e = i; while (e + 1 < lines.length && lines[e + 1]!.includes('|') && lines[e + 1]!.trim() !== '') e++;
  if (s + 1 > e || !DELIM_RE.test(lines[s + 1]!)) return null;
  return { startLine: s + 1, endLine: e + 1 };
}

export function repairTable(source: string, line: number): ReversibleEdit | null {
  const t = findTable(source, line);
  if (!t) return null;
  const lines = source.split('\n');
  const rows = lines.slice(t.startLine - 1, t.endLine).map((l) => l.replace(/\r$/, ''));
  const cr = lines[t.startLine - 1]!.endsWith('\r') ? '\r' : '';
  const parsed = rows.map(splitRow);
  const width = Math.max(...parsed.map((p, i) => (i === 1 ? 0 : p.cells.length)));
  const out = parsed.map((p, i) => {
    if (p.cells.length === width) return rows[i]!;
    const cells = [...p.cells];
    while (cells.length < width) cells.push(i === 1 ? ' --- ' : i === 0 ? '  ' : '  ');
    return `${p.lead}|${cells.join('|')}|`;
  });
  if (out.every((o, i) => o === rows[i])) return null;
  const next = [...lines];
  next.splice(t.startLine - 1, rows.length, ...out.map((o) => o + cr));
  return makeEdit(`table-pad-${t.startLine}`, `Ratakan tabel baris ${t.startLine}–${t.endLine} (sel kosong ditambahkan, tidak ada yang dibuang)`, `Even out table at lines ${t.startLine}–${t.endLine} (empty cells added, nothing removed)`, source, next.join('\n'));
}
