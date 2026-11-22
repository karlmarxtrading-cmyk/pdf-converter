# Syarat penerimaan RC12

Jalankan `npm run verify:release` dari root ekstraksi. Promosi memerlukan 24 PASS pada identitas kandidat yang sama. Satu FAIL, BLOCKED, atau NOT_RUN menghasilkan NO_GO dan kode keluar bukan nol. Source, dist, harness, observasi proses dan checksum artefak dikaitkan dengan putaran penerimaan. Berkas sumber novel hanya diperlukan untuk pengujian ulang privat. Laporan publik menyajikan hash, hitungan, platform dan hasil perbandingan.

| Gerbang | Yang harus dibuktikan |
|---|---|
| G01–G02 | Identitas arsip, ekstraksi bersih, pemeriksaan kode, tes, build dan HTTP lokal |
| G03–G06 | Unduhan nyata empat template, keutuhan wrapper, prosa dan setiap representasi rumus, penolakan perubahan isi |
| G07–G08 | PDF fisik, glif dan formula, kode, baris kosong, indentasi dan batas halaman |
| G09–G11 | Performa terhadap RC6 dalam empat cohort, sampel kapasitas dan kontrol negatif verifier |
| G12–G14 | Clipboard asli provider pada perangkat target, dialog cetak OS, aksesibilitas dan pemulihan pengguna |
| G15–G16 | Preview HTTPS dari proyek yang terhubung, rollback produksi dan otorisasi promosi |
| U01–U04 | Cetak buku dari UI pada naskah privat, seluruh percobaan dan progres, integritas lima bentuk dokumen besar |
| U05–U08 | Navigasi HTML luring, penolakan bukti kapasitas kontradiktif, isolasi konteks rumus, nomor daftar aktual |

Nama gate terperinci, putusan dan path bukti dapat dibaca di [ledger final](../evidence/rc12/LEDGER.json). [Matriks dukungan](COMPATIBILITY_RC12.md) membedakan uji browser otomatis, dialog sistem, dan perangkat target. Hasil versi lama di evidence/rc11/ hanya berlaku untuk RC11.
