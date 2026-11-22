# Pengujian RC8

Dari root paket gunakan Node 24.22.3, npm 11.6–11.x dan, untuk pengujian browser, Chromium yang dapat dijalankan. Atur `PF_CHROME` bila browser berada di luar lokasi standar.

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run verify:static
npm run verify:http -- --local
npm run test:gate
npm run scan:secrets
npm run build:qa
npm run test:e2e
npm run test:smoke
npm run verify:release
```

`npm run verify:release` membaca bukti yang diikat pada kandidat. Kode keluar bukan nol dan daftar gate menunjukkan syarat yang masih terbuka. [Kontrak bukti](RELEASE_ACCEPTANCE.md).

Jalankan `node tests/e2e/rc8-rich-export.mjs` untuk menguji impor berkas HTML asli, batal/terapkan, penyimpanan sumber asli, serta unduhan luring berisi rumus, tabel, diagram dan gambar. Gunakan `PF_RICH_REPORT` dan `PF_RICH_EXAMPLES` untuk memilih direktori hasil baru bila ingin menyimpan bukti rilis terdahulu.

Oracle trigonometri memakai fixture 15.280 byte serta contoh BUS-01 pengguna di `examples/reference-rc6/`. Jalankan `python scripts/verify-trigonometry.py` dengan path ke empat HTML keluaran. Pemeriksaan tersebut membandingkan 231 rumus, struktur dokumen, tautan, CSS dan font. Pemeriksaan PDF menggunakan artefak PDF, di samping pemeriksaan HTML sebelum pencetakan.

`python scripts/verify-archive.py` menerima path ZIP distribusi. Verifier mencocokkan SHA256SUMS, mengekstrak ke direktori baru, menghapus dist, menginstal lockfile, mengulang suite source, membangun ulang dan membandingkan seluruh byte output serta manifest. Tambahkan `--offline` jika seluruh dependency sudah ada di cache npm.

Perintah pengamatan yang dipakai untuk setiap gate terdapat di `evidence/rc8/acceptance/`. Laporan kompatibilitas menandai asal sampel dan platform sebenarnya. Angka serta log di direktori RC5–RC7 merupakan catatan versi terdahulu.


## Mengulang perbandingan RC6

Gunakan direktori kerja terpisah dari bukti rilis. Letakkan hasil ekstraksi ZIP RC6 terautentikasi sebagai `../rc6` di samping root kandidat. Pada kedua direktori jalankan `npm ci` dengan lockfile masing-masing dan bangun distribusi. Untuk pengukuran kapasitas bangun juga QA dari source yang sama di direktori kandidat. Bukti G09/G10 resmi mencatat versi Node, browser, mask CPU, identitas sebelum/sesudah dan sampel mentah. [Protokol dan langkah pengukuran](../evidence/rc8/performance/METHODE.md).

## Membaca checksum dan contoh

`SHA256SUMS` memakai SHA-256 atas byte mentah. Dari root ekstraksi di Git Bash atau Linux jalankan `sha256sum -c SHA256SUMS`. Periksa juga SHA-256 ZIP *sebelum* ekstraksi terhadap tanda terima penyerahan. HTML dan PDF pada direktori contoh dapat dibuka langsung. Ekspor ulang di sesi lain bisa memberikan ID dokumen internal Mermaid yang baru; jika itu terjadi, periksa konsistensi referensi internal dan hasil tampilan. Timestamp internal PDF juga dapat mengubah checksum saat dicetak ulang.

### Menjalankan harness rilis G09 dan G10

Langkah berikut dijalankan pada **salinan khusus pengujian** di Linux. Setel `PF_CHROME` ke binary Chromium yang tersedia, pasang dependensi sesuai lockfile di RC6 dan kandidat, lalu jalankan dari root kandidat. Simpan arsip bukti sebelumnya sebelum memulai putaran baru. Masing-masing proses browser memakai profil baru. CPU 0 dan 1 adalah pilihan mesin referensi; gunakan mask yang tersedia pada perangkat Anda dan catat perubahan bila mereplikasi.

```bash
npm run build
npm run build:qa
node scripts/acceptance.mjs start
node scripts/acceptance.mjs observe perf-browser-1 --out evidence/rc8/performance/recovery-cohort-1.json -- taskset -c 0,1 node tests/bench/performance-browser-official.mjs ../rc6 1
node scripts/acceptance.mjs observe perf-browser-2 --out evidence/rc8/performance/recovery-cohort-2.json -- taskset -c 0,1 node tests/bench/performance-browser-official.mjs ../rc6 2
node scripts/acceptance.mjs observe perf-node-1 --out evidence/rc8/performance/node-1.json -- taskset -c 4,5 node tests/bench/performance-node.mjs ../rc6 1
node scripts/acceptance.mjs observe perf-node-2 --out evidence/rc8/performance/node-2.json -- taskset -c 6,7 node tests/bench/performance-node.mjs ../rc6 2
node scripts/acceptance.mjs observe perf-capacity --out evidence/rc8/performance/capacity.json -- taskset -c 0-3 node tests/e2e/perf-matrix.mjs --acceptance --sizes 6,30,118 --reps 5
```

Pada putaran rilis, kedua perintah Chromium berjalan bergiliran, kedua proses Node boleh berjalan bersamaan pada mask terpisah, dan kapasitas kemudian berjalan sendiri. Bila satu perintah mengembalikan kode 1, pertahankan hasilnya dan lanjutkan pengamatan lain. Laporan serta status akhir terbaca melalui [laporan penerimaan](RELEASE_REPORT.md).
