# Hasil performa dan kapasitas

G09 **FAIL** pada kandidat yang diukur. Kedua cohort Chromium resmi terhenti sebelum 40 pasangan dan anggaran relatif dilampaui pada sebagian metrik Node. G10 **FAIL**. Aplikasi menyelesaikan paginasi dan menghasilkan PDF pada 15 dari 15 ulangan. Pada 201 halaman, sebagian ulangan melampaui batas jeda antarkemajuan atau jeda UI.

## Keutuhan pasangan dan eksekusi

Kolom pasangan setara menghitung keluaran dua versi dengan oracle sukses dan digest yang sama, di luar pemanasan. Kolom giliran mencakup setiap percobaan terukur dari kedua versi, termasuk galat. Setiap JSON menyimpan hasil per giliran, identitas proses dan waktu asli.

| Jalur dan cohort | Kasus | Pasangan setara / target | Giliran terukur | Galat terukur | Giliran pemanasan |
|---|---|---:|---:|---:|---:|
| cohort-1 | trig | 15 / 40 | 32 | 1 | 2 |
| cohort-1 | long | 0 / 40 | 0 | 0 | 0 |
| cohort-1 | small | 0 / 40 | 0 | 0 | 0 |
| cohort-2 | trig | 7 / 40 | 16 | 1 | 2 |
| cohort-2 | long | 0 / 40 | 0 | 0 | 0 |
| cohort-2 | small | 0 / 40 | 0 | 0 | 0 |
| node-1 | trigonometry | 40 / 40 | 80 | 0 | 2 |
| node-1 | long | 40 / 40 | 80 | 0 | 2 |
| node-1 | small-edit | 40 / 40 | 80 | 0 | 2 |
| node-1 | empty-core | 40 / 40 | 80 | 0 | 2 |
| node-2 | trigonometry | 40 / 40 | 80 | 0 | 2 |
| node-2 | long | 40 / 40 | 80 | 0 | 2 |
| node-2 | small-edit | 40 / 40 | 80 | 0 | 2 |
| node-2 | empty-core | 40 / 40 | 80 | 0 | 2 |
| recovery-cohort-1 | trig | 39 / 40 | 80 | 2 | 22 |
| recovery-cohort-1 | long | 40 / 40 | 80 | 0 | 20 |
| recovery-cohort-1 | small | 40 / 40 | 80 | 0 | 20 |
| recovery-cohort-2 | trig | 40 / 40 | 80 | 0 | 20 |
| recovery-cohort-2 | long | 40 / 40 | 80 | 0 | 20 |
| recovery-cohort-2 | small | 40 / 40 | 80 | 0 | 20 |

Puppeteer kehabisan waktu menunggu jawaban CDP atas Runtime.callFunctionOn dalam dua pengukuran resmi. Pada cohort pertama galat terjadi pada RC6 di putaran 15. Pada cohort kedua galat terjadi pada kandidat di putaran 7. Pemeriksaan terakhir di luar proses tetap mengikat berkas kandidat. Tidak tersedia snapshot akhir internal dari kedua proses yang terhenti. Pengontrol diagnostik menyelesaikan 12 pasangan trigonometri plus pemanasan, dan tidak mengidentifikasi penyebab internal galat.

Dua pengukuran tambahan menggunakan browser baru setelah empat pasangan, pemanasan per blok dan modul sampel serta oracle yang sama dengan proses resmi. Setiap pasangan asli dipertahankan dalam data milik prosesnya. Prosedur lengkap dan checksum tertera di METHODE.md.

## Waktu pada cohort yang menyelesaikan seluruh kasus

Rasio membagi durasi kandidat dengan RC6. Batas median 1,05 dan p95 1,10 berlaku untuk setiap metrik dan setiap cohort. Keluaran Node dan Chromium berasal dari jalur terukur yang berbeda. p95 menggunakan nearest rank.

| Jalur dan cohort | Kasus | Metrik | Sampel RC6 / RC8 | Median RC6 → RC8 (ms) | Rasio median | p95 RC6 → RC8 (ms) | Rasio p95 | Ambang waktu |
|---|---|---|---:|---:|---:|---:|---:|---|
| node-1 | trigonometry | refreshMs | 40 / 40 | 1188.7 → 1526.1 | 1.284 | 1720.0 → 1894.3 | 1.101 | FAIL |
| node-1 | trigonometry | htmlExportMs | 40 / 40 | 1246.8 → 893.1 | 0.716 | 1724.6 → 1435.0 | 0.832 | PASS |
| node-1 | trigonometry | printPayloadMs | 40 / 40 | 596.3 → 720.9 | 1.209 | 1010.1 → 1189.6 | 1.178 | FAIL |
| node-1 | long | refreshMs | 40 / 40 | 551.0 → 561.8 | 1.020 | 711.6 → 758.1 | 1.065 | PASS |
| node-1 | small-edit | editedRefreshMs | 40 / 40 | 14.6 → 15.8 | 1.076 | 29.3 → 27.5 | 0.939 | FAIL |
| node-1 | small-edit | htmlExportMs | 40 / 40 | 36.3 → 27.4 | 0.754 | 48.1 → 43.2 | 0.898 | PASS |
| node-1 | small-edit | printPayloadMs | 40 / 40 | 8.1 → 7.2 | 0.896 | 11.3 → 14.1 | 1.248 | FAIL |
| node-1 | empty-core | refreshMs | 40 / 40 | 6.3 → 6.5 | 1.037 | 11.4 → 11.5 | 1.015 | PASS |
| node-2 | trigonometry | refreshMs | 40 / 40 | 1143.2 → 1374.9 | 1.203 | 1594.6 → 1701.0 | 1.067 | FAIL |
| node-2 | trigonometry | htmlExportMs | 40 / 40 | 1233.5 → 977.3 | 0.792 | 1635.3 → 1314.0 | 0.804 | PASS |
| node-2 | trigonometry | printPayloadMs | 40 / 40 | 607.7 → 698.5 | 1.149 | 938.2 → 1035.1 | 1.103 | FAIL |
| node-2 | long | refreshMs | 40 / 40 | 549.5 → 533.3 | 0.970 | 722.6 → 732.1 | 1.013 | PASS |
| node-2 | small-edit | editedRefreshMs | 40 / 40 | 17.9 → 17.3 | 0.963 | 35.7 → 25.2 | 0.704 | PASS |
| node-2 | small-edit | htmlExportMs | 40 / 40 | 35.1 → 29.5 | 0.842 | 51.0 → 41.1 | 0.807 | PASS |
| node-2 | small-edit | printPayloadMs | 40 / 40 | 8.5 → 8.3 | 0.977 | 14.2 → 14.0 | 0.986 | PASS |
| node-2 | empty-core | refreshMs | 40 / 40 | 7.7 → 8.6 | 1.110 | 12.6 → 13.8 | 1.094 | FAIL |
| recovery-cohort-1 | trig | previewMs | 39 / 39 | 984.8 → 976.8 | 0.992 | 1595.4 → 1775.8 | 1.113 | FAIL |
| recovery-cohort-1 | trig | htmlExportMs | 39 / 39 | 192.1 → 174.4 | 0.908 | 383.8 → 532.9 | 1.388 | FAIL |
| recovery-cohort-1 | trig | pageReadyMs | 39 / 39 | 3089.9 → 3235.4 | 1.047 | 4108.3 → 5247.2 | 1.277 | FAIL |
| recovery-cohort-1 | long | previewMs | 40 / 40 | 964.5 → 947.0 | 0.982 | 1376.7 → 1325.2 | 0.963 | PASS |
| recovery-cohort-1 | small | smallPreviewMs | 40 / 40 | 341.5 → 333.5 | 0.977 | 793.1 → 379.1 | 0.478 | PASS |
| recovery-cohort-1 | small | editPreviewMs | 40 / 40 | 286.9 → 288.1 | 1.004 | 370.9 → 518.7 | 1.398 | FAIL |
| recovery-cohort-2 | trig | previewMs | 40 / 40 | 1005.3 → 949.2 | 0.944 | 1643.2 → 1849.3 | 1.125 | FAIL |
| recovery-cohort-2 | trig | htmlExportMs | 40 / 40 | 196.1 → 183.7 | 0.937 | 389.9 → 331.2 | 0.849 | PASS |
| recovery-cohort-2 | trig | pageReadyMs | 40 / 40 | 3431.1 → 3272.0 | 0.954 | 6311.0 → 5530.0 | 0.876 | PASS |
| recovery-cohort-2 | long | previewMs | 40 / 40 | 967.2 → 979.1 | 1.012 | 1389.8 → 1326.3 | 0.954 | PASS |
| recovery-cohort-2 | small | smallPreviewMs | 40 / 40 | 335.0 → 336.9 | 1.006 | 454.6 → 550.3 | 1.211 | FAIL |
| recovery-cohort-2 | small | editPreviewMs | 40 / 40 | 289.4 → 288.4 | 0.997 | 324.1 → 403.5 | 1.245 | FAIL |

## Kapasitas terukur

Setiap ulangan mengukur ulang buka proyek, ekspor cetak, emisi PDF, sunting, batal, tutup, dan heap sesudah GC pada target yang sama. Maksimum heap adalah nilai tertinggi yang diobservasi dalam byte; setiap data mentah berisi waktu permintaan serta waktu observasi. Seluruh PDF di tabel berasal dari pengujian otomatis.

| Bagian | Halaman | PDF terverifikasi | Preview terlama (ms) | Sunting terlama (ms) | Cetak siap terlama (ms) | Batal terlama (ms) | Jeda UI terlama¹ (ms) | Jeda kemajuan terlama (ms) | Heap maks. tersampel (byte) | Drift pascatutup (byte) |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 6 | 12 | 5 / 5 | 599 | 502 | 1743 | 95 | 253 | 421 | 26128176 | +901808 |
| 30 | 52 | 5 / 5 | 1143 | 1152 | 3851 | 112 | 418 | 1108 | 40911548 | -2174948 |
| 118 | 201 | 5 / 5 | 3471 | 3486 | 18977 | 216 | 2546 | 5968 | 94538176 | +824624 |

¹ Fase preview, sunting, dan layout sesuai SLA yang dibekukan. Pembatalan juga memiliki batas khusus dari permintaan batal hingga UI kembali siap.

| Bagian | SLA yang dilampaui | Putaran |
|---:|---|---|
| 6 | Semua terpenuhi | — |
| 30 | Semua terpenuhi | — |
| 118 | progressGap | 1, 3, 4 |
| 118 | responsiveness | 2, 3, 4, 5 |

Lima ulangan per ukuran membuktikan penyelesaian dan mencatat pelampauan SLA per putaran pada konfigurasi ini. Persentil kapasitas per ukuran belum ditetapkan. Batas 500 atau 1.000 halaman belum diukur. Semua kasus dijalankan pada Linux dengan CPU bersama. Data mentah melaporkan afinitas dan load average.
