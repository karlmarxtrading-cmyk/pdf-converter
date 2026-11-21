import type { RenderManifest } from './exports';
import type { PaginationResult } from './print-types';
import { nowIso, sha256Hex, utf8 } from './util';

export interface LocalPrintManifest extends RenderManifest {
  /** `outputHash` adalah SHA-256 HTML TERPAGINASI yang diserahkan ke dialog cetak — bukan hash berkas PDF. */
  hashOf: 'paginated-html';
  /** Byte PDF dibuat oleh dialog cetak peramban/OS dan tidak pernah teramati aplikasi. */
  pdfBytes: 'not-observed';
}

/** Manifest jalur Cetak / Simpan PDF lokal. Tidak mengklaim PDF dibuat, disimpan, atau terverifikasi. */
export async function localPrintManifest(r: PaginationResult, settings: RenderManifest['settings']): Promise<LocalPrintManifest> {
  const b = utf8(r.flattenedHtml);
  return {
    kind: 'pdf-local-print', snapshot: r.snapshot, outputHash: await sha256Hex(b), hashOf: 'paginated-html', pdfBytes: 'not-observed',
    bytes: b.length, pages: r.pageCount, createdAt: nowIso(),
    profile: 'pdf', scripts: 'none', network: 'none', fonts: r.fonts, issueCount: r.issues.length, settings,
    checks: [
      { name: 'content-inventory', status: r.verification.status === 'pass' && !r.verification.inventory.length ? 'pass' : 'fail', detail: r.verification.status },
      { name: 'page-structure', status: r.verification.status !== 'timeout' && !(r.verification.structure ?? []).some((x) => x.code !== 'INTERNAL_LINK_BROKEN') ? 'pass' : 'fail', detail: `${(r.verification.structure ?? []).length} selisih (nomor halaman, daftar isi, tautan internal)` },
      { name: 'page-count', status: r.verification.pages === r.pageCount && r.pageCount > 0 ? 'pass' : 'fail', detail: `${r.pageCount}` },
      { name: 'toc-stable', status: r.stable ? 'pass' : 'fail', detail: `${r.passes} putaran` },
      { name: 'no-overflow', status: r.diagnostics.some((d) => d.overflow.length) ? 'warn' : 'pass' },
      { name: 'no-blank-pages', status: r.diagnostics.some((d) => d.blank) ? 'warn' : 'pass' },
      { name: 'browser-print-output', status: 'not-run', detail: 'berkas PDF dibuat oleh dialog cetak peramban/OS; byte tidak teramati aplikasi' },
    ],
  };
}
