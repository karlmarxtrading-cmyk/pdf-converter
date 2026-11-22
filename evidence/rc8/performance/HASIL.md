# Performa dan kapasitas kandidat final

**G09 FAIL · G10 PASS**. Kandidat `0ecf3b0981925fd3c42fb49e1756b6ac99900ebfe330b94d7ded617194864064` diperiksa pada run `d58c2ce4-cce6-45dc-a95c-e615f8660e14`. Perbandingan G09 memakai source dan dist RC6 autentik. G10 memakai build QA dari source kandidat yang sama.

## Cakupan dan data mentah

Dua proses Chromium terpisah menjalankan cohort berurutan pada mask CPU 0,1. Setiap blok empat pasangan menggunakan browser segar dan pemanasan kedua versi. Setiap metrik memiliki 40 pasangan terjadwal per cohort. Urutan awal dibalik antara cohort, dengan 20 AB dan 20 BA per kasus. Dua cohort Node menggunakan proses independen dan pemanasan tiap kasus. Setiap JSON memuat waktu, digest keluaran dan catatan galat dari setiap giliran.

| Berkas data | Kasus | Giliran terukur | Pasangan dengan digest sama | Galat terukur | Pemanasan | Putusan waktu |
|---|---|---:|---:|---:|---:|---|
| recovery-cohort-1.json | trig | 80 / 80 | 40 / 40 | 0 | 20 | FAIL |
| recovery-cohort-1.json | long | 80 / 80 | 40 / 40 | 0 | 20 | PASS |
| recovery-cohort-1.json | small | 80 / 80 | 40 / 40 | 0 | 20 | FAIL |
| recovery-cohort-2.json | trig | 80 / 80 | 40 / 40 | 0 | 20 | PASS |
| recovery-cohort-2.json | long | 80 / 80 | 40 / 40 | 0 | 20 | PASS |
| recovery-cohort-2.json | small | 80 / 80 | 40 / 40 | 0 | 20 | PASS |
| node-1.json | trigonometry | 80 / 80 | 40 / 40 | 0 | 2 | FAIL |
| node-1.json | long | 80 / 80 | 40 / 40 | 0 | 2 | PASS |
| node-1.json | small-edit | 80 / 80 | 40 / 40 | 0 | 2 | PASS |
| node-1.json | empty-core | 80 / 80 | 40 / 40 | 0 | 2 | PASS |
| node-2.json | trigonometry | 80 / 80 | 40 / 40 | 0 | 2 | FAIL |
| node-2.json | long | 80 / 80 | 40 / 40 | 0 | 2 | PASS |
| node-2.json | small-edit | 80 / 80 | 40 / 40 | 0 | 2 | PASS |
| node-2.json | empty-core | 80 / 80 | 40 / 40 | 0 | 2 | PASS |

## Waktu terukur

Rasio adalah durasi kandidat dibagi RC6. Batas median adalah 1,05 dan p95 adalah 1,10. Putusan diterapkan pada setiap metrik dan cohort. p95 memakai nearest rank.

| Cohort | Kasus | Metrik | N RC6 / RC8 | Median RC6 → RC8 (ms) | Rasio | p95 RC6 → RC8 (ms) | Rasio | Ambang |
|---|---|---|---:|---:|---:|---:|---:|---|
| recovery-cohort-1 | trig | previewMs | 40 / 40 | 869.8 → 854.0 | 0.982 | 1042.4 → 1195.2 | 1.147 | FAIL |
| recovery-cohort-1 | trig | htmlExportMs | 40 / 40 | 179.0 → 157.9 | 0.882 | 241.5 → 216.7 | 0.897 | PASS |
| recovery-cohort-1 | trig | pageReadyMs | 40 / 40 | 2814.8 → 2881.7 | 1.024 | 3105.1 → 3246.5 | 1.046 | PASS |
| recovery-cohort-1 | long | previewMs | 40 / 40 | 935.7 → 895.9 | 0.958 | 1113.7 → 990.2 | 0.889 | PASS |
| recovery-cohort-1 | small | smallPreviewMs | 40 / 40 | 344.0 → 343.5 | 0.998 | 386.7 → 397.4 | 1.028 | PASS |
| recovery-cohort-1 | small | editPreviewMs | 40 / 40 | 285.2 → 285.9 | 1.002 | 295.5 → 357.5 | 1.210 | FAIL |
| recovery-cohort-2 | trig | previewMs | 40 / 40 | 881.6 → 848.2 | 0.962 | 993.3 → 1001.3 | 1.008 | PASS |
| recovery-cohort-2 | trig | htmlExportMs | 40 / 40 | 187.0 → 162.5 | 0.869 | 262.5 → 227.3 | 0.866 | PASS |
| recovery-cohort-2 | trig | pageReadyMs | 40 / 40 | 2954.0 → 2909.9 | 0.985 | 3199.4 → 3338.9 | 1.044 | PASS |
| recovery-cohort-2 | long | previewMs | 40 / 40 | 930.7 → 893.7 | 0.960 | 1135.6 → 1125.6 | 0.991 | PASS |
| recovery-cohort-2 | small | smallPreviewMs | 40 / 40 | 336.7 → 335.4 | 0.996 | 365.3 → 379.3 | 1.038 | PASS |
| recovery-cohort-2 | small | editPreviewMs | 40 / 40 | 286.8 → 285.8 | 0.997 | 307.2 → 293.4 | 0.955 | PASS |
| node-1 | trigonometry | refreshMs | 40 / 40 | 991.2 → 789.8 | 0.797 | 1238.2 → 965.9 | 0.780 | PASS |
| node-1 | trigonometry | htmlExportMs | 40 / 40 | 1093.9 → 712.2 | 0.651 | 1263.5 → 848.7 | 0.672 | PASS |
| node-1 | trigonometry | printPayloadMs | 40 / 40 | 512.4 → 601.1 | 1.173 | 617.0 → 800.7 | 1.298 | FAIL |
| node-1 | long | refreshMs | 40 / 40 | 508.1 → 401.5 | 0.790 | 595.2 → 505.1 | 0.849 | PASS |
| node-1 | small-edit | editedRefreshMs | 40 / 40 | 14.0 → 10.4 | 0.742 | 18.4 → 14.5 | 0.788 | PASS |
| node-1 | small-edit | htmlExportMs | 40 / 40 | 32.0 → 26.7 | 0.836 | 43.4 → 32.4 | 0.746 | PASS |
| node-1 | small-edit | printPayloadMs | 40 / 40 | 6.6 → 6.2 | 0.940 | 10.0 → 7.4 | 0.734 | PASS |
| node-1 | empty-core | refreshMs | 40 / 40 | 7.4 → 4.5 | 0.618 | 14.9 → 9.2 | 0.619 | PASS |
| node-2 | trigonometry | refreshMs | 40 / 40 | 1023.7 → 776.4 | 0.758 | 1229.7 → 1018.2 | 0.828 | PASS |
| node-2 | trigonometry | htmlExportMs | 40 / 40 | 1122.0 → 692.9 | 0.618 | 1368.8 → 897.9 | 0.656 | PASS |
| node-2 | trigonometry | printPayloadMs | 40 / 40 | 523.2 → 598.9 | 1.145 | 668.0 → 737.0 | 1.103 | FAIL |
| node-2 | long | refreshMs | 40 / 40 | 476.4 → 409.6 | 0.860 | 566.9 → 572.8 | 1.010 | PASS |
| node-2 | small-edit | editedRefreshMs | 40 / 40 | 16.9 → 11.2 | 0.661 | 22.7 → 16.0 | 0.705 | PASS |
| node-2 | small-edit | htmlExportMs | 40 / 40 | 33.1 → 27.4 | 0.829 | 44.4 → 33.3 | 0.749 | PASS |
| node-2 | small-edit | printPayloadMs | 40 / 40 | 8.2 → 6.1 | 0.742 | 12.2 → 7.7 | 0.629 | PASS |
| node-2 | empty-core | refreshMs | 40 / 40 | 6.4 → 5.3 | 0.826 | 10.9 → 9.0 | 0.824 | PASS |

## Ulangan kapasitas

| Bagian | Halaman per run | PDF terverifikasi | Preview / sunting maks. (ms) | Cetak siap maks. (ms) | Batal maks. (ms) | Jeda UI / kemajuan maks. (ms) | Heap maks. tersampel (byte) | Drift pascatutup (byte) | Pelampauan per SLA |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---|
| 6 | 12, 12, 12, 12, 12 | 5 / 5 | 522 / 647 | 1640 | 332 | 357 / 442 | 27050264 | -2617108 | Semua terpenuhi |
| 30 | 52, 52, 52, 52, 52 | 5 / 5 | 1115 / 1040 | 3809 | 72 | 287 / 441 | 40755132 | 628420 | Semua terpenuhi |
| 118 | 201, 201, 201, 201, 201 | 5 / 5 | 2741 / 2659 | 16270 | 272 | 668 / 946 | 90699128 | 2633500 | Semua terpenuhi |

SLA menghitung jeda UI pada fase preview, sunting, dan layout. Pembatalan dinilai sejak permintaan batal sampai UI kembali siap. CDP mencatat byte heap JS pada target browser yang sama serta waktu sampel sebenarnya. Batas drift setelah proyek ditutup adalah 8 MiB. Lima pengulangan per ukuran mendukung penilaian per putaran. Persentil per ukuran dan perilaku pada 500/1.000 halaman belum diukur.

Chromium headless shell 153.0.8010.0 (SHA-256 `53a15d6c3a3d27dfb54c4ba60278b1683136f70cf1e67e989da7dfbd3d451ef0`) menggerakkan UI produksi. Keluaran HTML dan hasil paginasi dibandingkan dengan oracle independen di luar jam pengukuran. Penyimpanan PDF melalui dialog native memiliki pemeriksaan tersendiri. Data kualifikasi kandidat sebelumnya, termasuk dua timeout pada pengontrol persisten, disimpan sebagai riwayat iterasi.
