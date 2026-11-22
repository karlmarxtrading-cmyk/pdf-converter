# Pengukuran performa dan kapasitas

Protokol beku berada di `tests/bench/performance-protocol.json`. Dua cohort independen menggunakan proses, profil browser dan izin pemroses masing-masing. Tiap cohort mengukur 40 pasangan per kasus setelah satu pasangan pemanasan. Urutan awal berlawanan antar-cohort. Persentil memakai nearest rank. Penghitung menyimpan data setelah setiap pengukuran dan menolak pelanggaran ambang. Rincian perangkat, waktu dan beban disimpan bersama data mentah.

| Jalur | Interval yang diukur | Pemeriksaan terpisah |
|---|---|---|
| Chromium produksi | Input sintetis editor sampai pratinjau dan font siap, klik ekspor HTML sampai bukti unduhan, klik pratinjau cetak sampai paginasi siap | Parser independen membandingkan seluruh rumus termasuk struktur visual dan MathML, isi artikel, CSS dan byte WOFF2 terhadap HTML asli. HTML siap dibaca dari Blob aplikasi. Paginasi diperiksa pada HTML datar dari respons cetak. |
| Node dan jsdom | Refresh core, ekspor HTML dan penyusunan payload cetak melalui API yang sama, dengan font lokal | Sumber, metadata rumus, struktur dokumen, CSS dan hash semua font dibandingkan di luar jam ukur. Input panjang dan suntingan singkat memakai expected text/tabel yang dibangun langsung dari fixture. |
| Kapasitas | Lima putaran untuk tiap ukuran 6/30/118 bagian sintetis; rekam jumlah halaman hasil aktual | PDF otomatis dibuat dari keluaran yang lolos verifikasi, lalu pengguna menyunting ulang, membatalkan cetak dan menutup proyek. Sampling CDP di target yang sama mencatat jumlah byte heap JS, waktu pengamatan serta heap setelah GC. |

Pengukuran browser memakai server loopback terpisah per versi, cache HTTP hangat dan iframe aplikasi baru per giliran. Halaman penguji terpisah memantau aksi sintetis pada UI produksi. Dialog simpan asli, jaringan publik, input fisik, memori worker dan RAM proses native berada di luar interval ini. Pengukuran Node memakai satu proses persisten per versi, eksplisit GC di luar interval dan V8 independen; durasi Node dan Chromium disajikan terpisah.

Seluruh file produksi dan source yang menentukan build dihitung ulang di awal dan akhir run. Runner juga mengikat fixture, HTML pengguna yang diterima, oracle independen, kode benchmark, settings, binary browser/Node serta byte pustaka utama yang dipakai pengukuran. Penguji font memeriksa SHA-256 seluruh font BUS-01 yang tersemat dalam dokumen, bukan sekadar format data URI. Delapan mutasi mempertahankan jumlah rumus tetapi mengubah operator, mode, anotasi, struktur visual, urutan, isi, CSS atau byte font.

## Reproduksi

Jalankan dari root kandidat. `../rc6` harus berisi source dan dist RC6 autentik dengan paket dependensi sesuai lockfile. Tetapkan `PF_CHROME` bila diperlukan. Berikan mesin yang stabil dan catat beban eksternal selama pengukuran.

```sh
node tests/bench/performance-oracle-check.mjs
node tests/bench/performance-browser.mjs ../rc6 1
node tests/bench/performance-browser.mjs ../rc6 2
node tests/bench/performance-node.mjs ../rc6 1
node tests/bench/performance-node.mjs ../rc6 2
npm run build:qa
node tests/e2e/perf-matrix.mjs --acceptance --sizes 6,30,118 --reps 5
```

RC6 dipasangkan dengan kandidat untuk menilai perbandingan median 1,05 dan p95 1,10. Setiap kasus dan cohort mendapat keputusan tersendiri. Pelanggaran satu metrik menyebabkan exit nonzero. Nilai maksimum sampel heap target berasal dari CDP Runtime.getHeapUsage.usedSize pada interval nominal 200 ms, termasuk pengamatan setelah GC. Log melaporkan waktu sampel sebenarnya. Ukuran 500 atau 1.000 halaman dan SLA p95 per ukuran memerlukan penelitian tambahan. Lima ulangan ini menetapkan kelangsungan dan SLA per run pada lingkungan yang dicatat.

## Penyempurnaan sesudah profiling

Trace CPU pada kandidat awal menunjukkan pemeriksa integritas mengurai ulang seluruh artikel trigonometri. Satu atribut boolean pada daftar isi ditulis sebagai `open`, sedangkan hasil serialisasi DOM menuliskannya sebagai `open=""`. Kesetaraan DOM tetap benar, tetapi pemeriksa memerlukan jalur normalisasi. Generator akhir menuliskan bentuk kanonik. Pemeriksaan isi dan jalur normalisasi untuk kasus lain tetap aktif.

Ablasi berpasangan pada artikel referensi yang sama mengukur cabang pembandingan itu secara terpisah. Dalam jsdom median turun dari 413,23 menjadi 57,10 ms pada 10 pasangan. Dalam Chromium median turun dari 27,05 menjadi 4,20 ms pada 20 pasangan. Semua pasangan menerima DOM yang sama. Ukuran ini menjelaskan biaya lokal yang dihilangkan. Putusan kecepatan ekspor ujung ke ujung dihitung dari cohort resmi tersendiri. Lihat `toc-ablation.json` dan `toc-ablate-browser.json`.

## Pemeriksaan Chromium tambahan

Kedua proses Chromium resmi berakhir sebelum seluruh pasangan sempat diukur. Kesalahan luar CDP berbunyi `Runtime.callFunctionOn timed out` (180 detik), masing-masing ketika RC6 dan kandidat sedang diukur. Baris sebelumnya, baris galat dan bukti proses resmi tetap tersedia di `cohort-1.json` dan `cohort-2.json`. Pengukuran yang berhenti tidak mencatat snapshot akhir internal. Pembungkus penerimaan secara terpisah memeriksa identitas sebelum dan sesudah perintah.

Prosedur tambahan `docs/verification-tools/browser-recovery-protocol.json` (SHA-256 `8bab7df86397ea5287c8a589603aa51da1c196f78ce1c1cce4a4db30f5161c7f`) ditetapkan sebelum dua proses baru dijalankan. Kedua proses memakai pengontrol `docs/verification-tools/performance-browser-recovery.mjs` (SHA-256 `ab5f5a9ea1d8bfb40da6267aaf7bd9d6ef00343f14e544822b0c2fa38a20fa01`). Pengontrol membuka browser baru untuk kedua versi setiap empat pasangan, melakukan pemanasan kedua versi, dan memakai modul sampel, oracle, dokumen, metrik serta ambang yang sudah dibekukan. Arah awal berlawanan di kedua cohort. Setiap giliran terjadwal dicoba sekali pada data terukur. Galat menyisakan data pasangan parsial dan memicu pemulihan sesi bagi dua versi sebelum pasangan berikutnya. Data tambahan disajikan terpisah dan pemeriksaan asli tetap dinilai dengan protokol aslinya.

```sh
PF_CHROME=/tmp/chromium node scripts/acceptance.mjs observe perf-browser-recovery-1 --out evidence/rc8/performance/recovery-cohort-1.json -- taskset -c 0,1 node docs/verification-tools/performance-browser-recovery.mjs ../rc6 1
PF_CHROME=/tmp/chromium node scripts/acceptance.mjs observe perf-browser-recovery-2 --out evidence/rc8/performance/recovery-cohort-2.json -- taskset -c 2,3 node docs/verification-tools/performance-browser-recovery.mjs ../rc6 2
```

Diagnostik terinstrumentasi pada proses terpisah merekam kemajuan dari editor ke hasil paginasi pada 12 pasangan trigonometri dan satu pasangan pemanasan. Perbedaan waktu serta beban eksternal dari pengukuran resmi membatasi interpretasinya. Data diagnosis mencatat hasil aktual dan batas identifikasi penyebab.
