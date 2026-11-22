# Pengukuran performa dan kapasitas

Protokol beku berada di `tests/bench/performance-protocol.json`. Dua cohort Chromium independen memakai profil baru, proses terpisah dan mask CPU 0,1 yang sama, pada waktu berlainan. Dua cohort Node menggunakan proses terpisah. Tiap cohort mengukur 40 pasangan per kasus. Chromium menjalankan satu pasangan pemanasan sebelum tiap blok empat pasangan terukur. Node menjalankan satu pasangan pemanasan per kasus. Urutan awal berlawanan antar-cohort. Persentil memakai nearest rank. Penghitung menyimpan data setelah setiap pengukuran dan menolak pelanggaran ambang. Rincian perangkat, waktu dan beban disimpan bersama data mentah.

| Jalur | Interval yang diukur | Pemeriksaan terpisah |
|---|---|---|
| Chromium produksi | Input sintetis editor sampai pratinjau dan font siap, klik ekspor HTML sampai bukti unduhan, klik pratinjau cetak sampai paginasi siap | Parser independen membandingkan seluruh rumus termasuk struktur visual dan MathML, isi artikel, CSS dan byte WOFF2 terhadap HTML asli. HTML siap dibaca dari Blob aplikasi. Paginasi diperiksa pada HTML datar dari respons cetak. |
| Node dan jsdom | Refresh core, ekspor HTML dan penyusunan payload cetak melalui API yang sama, dengan font lokal | Sumber, metadata rumus, struktur dokumen, CSS dan hash semua font dibandingkan di luar jam ukur. Input panjang dan suntingan singkat memakai expected text/tabel yang dibangun langsung dari fixture. |
| Kapasitas | Lima putaran untuk tiap ukuran 6/30/118 bagian sintetis; rekam jumlah halaman hasil aktual | PDF otomatis dibuat dari keluaran yang lolos verifikasi, lalu pengguna menyunting ulang, membatalkan cetak dan menutup proyek. Sampling CDP di target yang sama mencatat jumlah byte heap JS, waktu pengamatan serta heap setelah GC. |

Pengukuran browser memakai server loopback terpisah per versi, cache HTTP hangat dan iframe aplikasi baru per giliran. Halaman penguji terpisah memantau aksi sintetis pada UI produksi. Dialog simpan asli, jaringan publik, input fisik, memori worker dan RAM proses native berada di luar interval ini. Pengukuran Node memakai satu proses persisten per versi, eksplisit GC di luar interval dan V8 independen; durasi Node dan Chromium disajikan terpisah.

Seluruh file produksi dan source yang menentukan build dihitung ulang di awal dan akhir run. Runner juga mengikat fixture, HTML pengguna yang diterima, oracle independen, kode benchmark, settings, binary browser/Node serta byte pustaka utama yang dipakai pengukuran. Penguji font memeriksa SHA-256 seluruh font BUS-01 yang tersemat dalam dokumen, bukan sekadar format data URI. Delapan mutasi mempertahankan jumlah rumus tetapi mengubah operator, mode, anotasi, struktur visual, urutan, isi, CSS atau byte font.

## Reproduksi

Jalankan dari root kandidat. `../rc6` harus berisi source dan dist RC6 autentik dengan paket dependensi sesuai lockfile. Tetapkan `PF_CHROME` bila diperlukan. Mulai dengan identitas source, dist, dan QA yang sudah dibekukan oleh perintah start pada panduan penerimaan. Jalankan cohort browser satu per satu tanpa beban pengujian berat lain. Selesaikan seluruh pekerjaan yang memproses banyak CPU pada host sebelum membuka browser resmi. Catat load average dan afinitas aktual tiap eksekusi.

```sh
node tests/bench/performance-oracle-check.mjs
PF_CHROME=/tmp/chromium node scripts/acceptance.mjs observe perf-browser-1 --out evidence/rc8/performance/recovery-cohort-1.json -- taskset -c 0,1 node tests/bench/performance-browser-official.mjs ../rc6 1
PF_CHROME=/tmp/chromium node scripts/acceptance.mjs observe perf-browser-2 --out evidence/rc8/performance/recovery-cohort-2.json -- taskset -c 0,1 node tests/bench/performance-browser-official.mjs ../rc6 2
node scripts/acceptance.mjs observe perf-node-1 --out evidence/rc8/performance/node-1.json -- taskset -c 4,5 node tests/bench/performance-node.mjs ../rc6 1
node scripts/acceptance.mjs observe perf-node-2 --out evidence/rc8/performance/node-2.json -- taskset -c 6,7 node tests/bench/performance-node.mjs ../rc6 2
node scripts/acceptance.mjs observe perf-capacity --out evidence/rc8/performance/capacity.json -- taskset -c 0-3 node tests/e2e/perf-matrix.mjs --acceptance --sizes 6,30,118 --reps 5
```

RC6 dipasangkan dengan kandidat untuk menilai perbandingan median 1,05 dan p95 1,10. Setiap kasus dan cohort mendapat keputusan tersendiri. Pelanggaran satu metrik menyebabkan exit nonzero. Nilai maksimum sampel heap target berasal dari CDP Runtime.getHeapUsage.usedSize pada interval nominal 200 ms, termasuk pengamatan setelah GC. Log melaporkan waktu sampel sebenarnya. Ukuran 500 atau 1.000 halaman dan SLA p95 per ukuran memerlukan penelitian tambahan. Lima ulangan ini menetapkan kelangsungan dan SLA per run pada lingkungan yang dicatat.

## Penyempurnaan sesudah profiling

Trace CPU pada kandidat awal menunjukkan pemeriksa integritas mengurai ulang seluruh artikel trigonometri. Satu atribut boolean pada daftar isi ditulis sebagai `open`, sedangkan hasil serialisasi DOM menuliskannya sebagai `open=""`. Kesetaraan DOM tetap benar, tetapi pemeriksa memerlukan jalur normalisasi. Generator akhir menuliskan bentuk kanonik. Pemeriksaan isi dan jalur normalisasi untuk kasus lain tetap aktif.

Ablasi berpasangan pada artikel referensi yang sama mengukur cabang pembandingan itu secara terpisah. Dalam jsdom median turun dari 413,23 menjadi 57,10 ms pada 10 pasangan. Dalam Chromium median turun dari 27,05 menjadi 4,20 ms pada 20 pasangan. Semua pasangan menerima DOM yang sama. Ukuran ini menjelaskan biaya lokal yang dihilangkan. Putusan kecepatan ekspor ujung ke ujung dihitung dari cohort resmi tersendiri. Lihat `toc-ablation.json` dan `toc-ablate-browser.json`.


## Pengendali Chromium

Protokol resmi membekukan pengendali dan aturan siklus hidup melalui SHA-256. Berkas `tests/bench/performance-browser-official.mjs` memeriksa kedua hash, lalu menjalankan `docs/verification-tools/performance-browser-recovery.mjs`. Pengendali memakai browser baru untuk setiap blok empat pasangan. Setelah kedua versi dipanaskan, giliran pertama bergantian RC6/kandidat sesuai nomor putaran dan cohort. Pada galat, pengendali menyimpan giliran yang gagal, mencoba sisi satunya, lalu membuka sesi baru dan memanaskan kedua versi sebelum pasangan berikut. Seluruh pasangan terukur yang terjadwal hanya dicoba sekali. Pelanggaran integritas atau anggaran waktu menggagalkan pemeriksaan terkait.

Nama berkas mentah `recovery-cohort-1.json` dan `recovery-cohort-2.json` berasal dari pengendali yang dikunci hash pada awal kualifikasi. Keabsahan hasil bergantung pada identitas kandidat, ID run, perintah observasi dan keluaran sebelum/sesudah yang tercatat. Diagnostik dan pengukuran pada kandidat terdahulu mempunyai identitas dan laporan tersendiri.

## Perubahan pada kandidat lanjutan

Pada tahap preview yang sudah disanitasi, pemeriksa dan komposer terdahulu mengurai ulang HTML untuk membentuk DOM yang baru. Kandidat ini mempertahankan DOM selama byte sumber yang terikat padanya cocok. Setelah satu komposer mengambil kepemilikannya, komposer lain memperoleh salinan melalui parse dari byte asli. Pengujian mutasi menyertakan perubahan pada HTML sesudah render dan ekspor bersamaan. Sebelum pengukuran rilis, delapan pasangan diagnostik pada naskah trigonometri mencatat median refresh 1.671 → 882 ms dan persiapan cetak 854 → 666 ms terhadap kandidat sebelumnya. Lihat `trig-optimization-ablation.json` dan data pasangan.

Mesin paginasi meneruskan progres fisik dari Paged.js. Dokumen lebih dari ambang kerja yang ditentukan memberi kesempatan event input berjalan di antara proses render, pemeriksaan dan komposisi. Data dua percobaan diagnostik terdapat dalam `pagination-progress-ablation.json`. Keputusan G09 dan G10 mengikuti hasil pengukuran berulang pada identitas rilis.
