/**
 * Deteksi kemampuan browser (perintah lanjutan §2: fungsi yang memerlukan browser tertentu harus dijelaskan dan ditangani).
 * Tidak memblokir aplikasi: setiap kekurangan dijelaskan beserta dampaknya dan jalur cadangan yang dipakai.
 */
export interface CompatItem { key: string; ok: boolean; id: string; en: string }
export function detectCompat(): CompatItem[] {
  const w = globalThis as unknown as Record<string, unknown>;
  const has = (k: string) => typeof w[k] !== 'undefined';
  const css = (p: string) => { try { return typeof CSS !== 'undefined' && CSS.supports(p); } catch { return false; } };
  return [
    { key: 'indexeddb', ok: has('indexedDB'), id: 'Penyimpanan lokal (IndexedDB) tidak tersedia — mis. mode privat tertentu. Proyek tidak dapat disimpan di browser; gunakan "Simpan paket .pfproj".', en: 'Local storage (IndexedDB) is unavailable — e.g. some private modes. Projects cannot be saved in the browser; use "Save .pfproj package".' },
    { key: 'worker', ok: has('Worker'), id: 'Web Worker tidak tersedia. Analisis dokumen berjalan di thread utama dengan jeda antar-tahap; dokumen besar terasa lebih lambat.', en: 'Web Workers are unavailable. Document analysis runs on the main thread with pauses between steps; large documents feel slower.' },
    { key: 'subtle', ok: !!(globalThis.crypto && globalThis.crypto.subtle), id: 'Web Crypto tidak tersedia (halaman tidak dibuka lewat HTTPS). Sidik jari dihitung dengan implementasi JavaScript yang lebih lambat.', en: 'Web Crypto is unavailable (page not served over HTTPS). Fingerprints use a slower JavaScript implementation.' },
    { key: 'dialog', ok: typeof HTMLDialogElement !== 'undefined', id: 'Elemen dialog tidak didukung browser ini; jendela ekspor dan konfirmasi mungkin tidak tampil dengan benar. Perbarui browser.', en: 'This browser does not support the dialog element; export and confirmation windows may not display correctly. Update the browser.' },
    { key: 'print-css', ok: css('break-before: page') || css('page-break-before: always'), id: 'Browser ini tidak mendukung aturan pemutusan halaman CSS; hasil cetak dapat berbeda dari halaman yang diperiksa.', en: 'This browser does not support CSS page-break rules; printed output may differ from the checked pages.' },
  ];
}
