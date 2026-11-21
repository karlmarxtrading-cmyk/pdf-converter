/**
 * Kebijakan keputusan hasil akhir (QA-01, EN-012; statis 3.0).
 * - block   : issue `blocking`, atau error pada lingkup integrity/security. Hasil final TIDAK boleh diserahkan;
 *             tidak ada konfirmasi generik yang dapat melewatinya.
 * - confirm : error lain yang tidak memblokir (mis. rumus gagal dirender dan ditampilkan sebagai sumber,
 *             gambar lokal belum diunggah). Hasil hanya diserahkan setelah pengguna mengakui daftar spesifik itu.
 * - note    : peringatan/info; ditampilkan, tidak menghalangi.
 */
import type { Issue } from './contracts';

export type IssueClass = 'block' | 'confirm' | 'note';

export function classifyIssue(i: Pick<Issue, 'blocking' | 'severity' | 'scope'>): IssueClass {
  if (i.blocking) return 'block';
  if (i.severity === 'error' && (i.scope === 'integrity' || i.scope === 'security')) return 'block';
  if (i.severity === 'error') return 'confirm';
  return 'note';
}

export interface Verdict { status: 'pass' | 'confirm' | 'blocked'; block: Issue[]; confirm: Issue[]; notes: Issue[] }

/** Gabungkan issue tanpa duplikasi (kode + baris + blok + pesan). */
export function dedupeIssues<T extends Issue>(issues: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const i of issues) {
    const k = `${i.code}|${i.line ?? ''}|${i.blockId ?? ''}|${i.message}`;
    if (seen.has(k)) continue;
    seen.add(k); out.push(i);
  }
  return out;
}

export function verdictOf(issues: Issue[]): Verdict {
  const all = dedupeIssues(issues);
  const block = all.filter((i) => classifyIssue(i) === 'block');
  const confirm = all.filter((i) => classifyIssue(i) === 'confirm');
  const notes = all.filter((i) => classifyIssue(i) === 'note');
  return { status: block.length ? 'blocked' : confirm.length ? 'confirm' : 'pass', block, confirm, notes };
}
