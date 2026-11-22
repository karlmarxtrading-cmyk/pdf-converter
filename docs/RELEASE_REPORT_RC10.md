# PaperForma 3.0.0-rc.10

**NO_GO** pada 24 gerbang wajib. Hasil lokal tercatat pada satu putaran untuk source dan distribusi berikut.

| Putusan | Jumlah |
|---|---:|
| PASS | 18 |
| FAIL | 1 |
| BLOCKED | 4 |
| NOT_RUN | 1 |

| Identitas | SHA-256 atau ID |
|---|---|
| Source | `774465b21054bfd933b869ea7232d3d59ff8e1fa0422a8d83b18208b08b6abd6` |
| Dist | `b2351cef15853b432dbe1fa9c02d0537308cc778a16fdbec551e2e243b9caefd` |
| Putaran | `862feb27-d188-4f90-a381-c64533c2f220` |

[Ledger lengkap](../evidence/rc10/LEDGER.json) · [Keputusan verifier](../evidence/rc10/acceptance/all-gates.json) · [Identitas bahan asli](../evidence/rc10/input/identity.json)

## Temuan audit dan penutupan

| ID | Temuan | Status | Gerbang |
|---|---|---|---|
| RC9-F01 | Jalur cetak buku dari editor | VERIFIED | U01, U04 |
| RC9-F02 | Performa terhadap RC6 | IMPLEMENTED_NOT_VERIFIED | G09 |
| RC9-F03 | Validasi semantik delapan gerbang U | VERIFIED | G11 |
| RC9-F04 | Respons, pembatalan dan pelepasan sumber daya | VERIFIED | U02 |
| RC9-F05 | Akuntansi seluruh percobaan dan fase | VERIFIED | U03 |
| RC9-F06 | Jenis nomor daftar HTML dan clipboard | VERIFIED | U08 |
| RC9-F07 | Identitas harness dan fixture per kandidat | VERIFIED | G11 |
| RC9-F08 | Dokumentasi aktif dan perintah reproduksi | VERIFIED | G01, G02 |
| RC9-F09 | Penerimaan perangkat nyata dan hosting | BLOCKED | G12, G13, G14, G15, G16 |

## Hasil per gerbang

| ID | Status | Dasar keputusan |
|---|---|---|
| G01 | PASS | Observasi dan pemeriksaan artefak diterima. |
| G02 | PASS | Observasi dan pemeriksaan artefak diterima. |
| G03 | PASS | Observasi dan pemeriksaan artefak diterima. |
| G04 | PASS | Observasi dan pemeriksaan artefak diterima. |
| G05 | PASS | Observasi dan pemeriksaan artefak diterima. |
| G06 | PASS | Observasi dan pemeriksaan artefak diterima. |
| G07 | PASS | Observasi dan pemeriksaan artefak diterima. |
| G08 | PASS | Observasi dan pemeriksaan artefak diterima. |
| G09 | FAIL | Empat kohort resmi sudah dijalankan. Pemeriksaan gagal pada node-2.json (small-edit/printPayloadMs). Hasil per metrik dan semua sampel tersedia di evidence/rc10/performance/cohort-recount.json. |
| G10 | PASS | Observasi dan pemeriksaan artefak diterima. |
| G11 | PASS | Observasi dan pemeriksaan artefak diterima. |
| G12 | BLOCKED | Clipboard asli dari penyedia yang ditargetkan di Windows belum dapat diukur. Uji Linux lokal tersedia terpisah. |
| G13 | BLOCKED | Dialog Save/Cancel/Retry bersistem operasi dan berkas simpan pengguna tidak tersedia pada perangkat uji. PDF otomatis diukur terpisah. |
| G14 | BLOCKED | Navigasi pembaca layar dengan perangkat bantu pada perangkat sasaran belum dapat diverifikasi. |
| G15 | NOT_RUN | Pemilik memilih ZIP dan pengujian lokal. Tidak ada deployment preview kandidat ini. |
| G16 | BLOCKED | Latihan rollback hosting pada target baik yang dikenal dan persetujuan promosi belum tersedia. Pengujian dilakukan secara lokal. |
| U01 | PASS | Observasi dan pemeriksaan artefak diterima. |
| U02 | PASS | Observasi dan pemeriksaan artefak diterima. |
| U03 | PASS | Observasi dan pemeriksaan artefak diterima. |
| U04 | PASS | Observasi dan pemeriksaan artefak diterima. |
| U05 | PASS | Observasi dan pemeriksaan artefak diterima. |
| U06 | PASS | Observasi dan pemeriksaan artefak diterima. |
| U07 | PASS | Observasi dan pemeriksaan artefak diterima. |
| U08 | PASS | Observasi dan pemeriksaan artefak diterima. |

## Keluaran yang dapat diperiksa

[Unduhan HTML empat template](../examples/rc10/html/) · [PDF matriks](../examples/rc10/pdf/) · [Contoh buku sintetis](../examples/rc10/book/). PDF privat tersedia terpisah kepada pemilik. HTML keluaran asli dan HTML siap cetak memiliki fungsi serta hash masing-masing. Bukti buku membedakan persiapan di UI, pemanggilan cetak dan pembacaan ulang PDF.

Untuk RC9, PDF yang diserahkan melalui helper berisi 1.319 halaman. Pengujian ulang lokal mencocokkan 30.039 blok, 19 marker, tabel 39 baris dengan 117 sel, dan akhir. Jalur Paged.js RC9 memvalidasi 1.311 halaman tetapi satu panggilan penyimpanan gagal. Perakitan 28 bagian diuji dalam pekerjaan terdahulu. Tiga jalur tersebut disimpan sebagai riwayat tersendiri. [Pemeriksaan referensi privat RC9](../evidence/rc10/baseline/rc9-private-book.json).

## Menelusuri atau mengulang

[Kompatibilitas](COMPATIBILITY_RC10.md) · [Performa](PERFORMANCE_REPORT.md) · [Kontrak dan pemeriksaan](RELEASE_ACCEPTANCE.md) · [Batas dukungan](KNOWN_LIMITS.md) · [Panduan pemulihan](RECOVERY.md). Seluruh checksum internal tercantum di SHA256SUMS. Pemeriksaan akhir pada ZIP menggunakan ekstraksi dan build bersih.

## Angka yang diperiksa pada kandidat

| Pemeriksaan | Hasil aktual |
|---|---|
| Unduhan trigonometri | 4 template, masing-masing 231 pasangan visual KaTeX dan MathML dibandingkan dengan RC6. |
| Matriks cetak | 24 konfigurasi, 29 pekerjaan, 26 PDF dihasilkan dan 3 penolakan input sesuai kontrak. |
| Potongan acuan formula pada PDF | 924/924 identik. |
| Buku original-default | PASS, 1284 halaman, 11.005.560 byte PDF. |
| Buku headings-on | PASS, 621 halaman, 2.507.169 byte PDF. |
| Buku long-table-off | PASS, 590 halaman, 2.352.735 byte PDF. |
| Buku paragraphs-off | PASS, 628 halaman, 2.477.831 byte PDF. |
| Buku paragraphs-on | PASS, 628 halaman, 2.477.831 byte PDF. |
| Buku single-paragraph-off | PASS, 600 halaman, 2.224.806 byte PDF. |

## Performa aktual

| Cohort | Sampel termasuk warmup | Status | Metrik di luar ambang |
|---|---:|---|---|
| node-1 | 328 | PASS | Lihat validitas pasangan dalam laporan mentah. |
| node-2 | 328 | FAIL | small-edit/printPayloadMs (median 0.719×, p95 1.201×) |
| recovery-cohort-1 | 300 | PASS | Lihat validitas pasangan dalam laporan mentah. |
| recovery-cohort-2 | 300 | PASS | Lihat validitas pasangan dalam laporan mentah. |

## Kandidat sebelumnya dalam pekerjaan ini

Putaran RC10 pertama tercatat terpisah dengan identitasnya sendiri. PDF novel lulus uji jalur buku setelah percobaan ulang, sementara pengujian pembatalan pertama pada dokumen besar menyisakan sekitar 21,3 MB. Performa terhadap RC6 juga melampaui ambang pada sebagian sampel. Pemeriksaan pada laporan ini dihitung ulang untuk revisi yang diserahkan. [Riwayat pengukuran kandidat sebelumnya](../evidence/history/rc10-first-candidate/).

## Pembatalan dan pemulihan

Pemeriksaan sumber untuk cetak dokumen besar berjalan pada worker lokal. Ketika operasi dibatalkan, aplikasi melepaskan model isi dan referensi frame. Pengujian mengukur waktu dari klik batal hingga editor siap, jeda antara sampel event loop, serta selisih heap sesudah pengumpulan sampah.

| Kasus | Fase lulus | Batal hingga siap terlama | Jeda terpanjang | Kenaikan heap tertahan terbesar |
|---|---:|---:|---:|---:|
| 1.200 paragraf | 11/11 | 55.5 ms | 668.7 ms | 5.08 MiB |
| 217.850 kata | 11/11 | 96.4 ms | 676.3 ms | 2.53 MiB |

[Pembatalan, event dan pengukuran heap](../evidence/rc10/lifecycle/) · [Pembatalan worker saat startup dan komputasi serta percobaan ulang](../evidence/rc10/worker/).
