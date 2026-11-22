# Pemeriksaan penerimaan produksi

Jalankan dari root paket dengan versi Node dan npm yang dinyatakan di package.json. Perintah berikut membaca semua receipt G01–G16 untuk satu putaran pengujian dan mengembalikan exit code 0 hanya bila seluruh syarat lulus. Tanpa bukti yang diperlukan, exit code 1 mencegah promosi.

```sh
npm run verify:release
npm run test:acceptance
```

## Mengikat hasil ke kandidat

1. Setelah semua perubahan source, fixture, pengaturan, oracle dan harness selesai, bangun aplikasi dengan `npm run build`. Jalankan `node scripts/acceptance.mjs start` sekali. Catatan start memuat UUID putaran, hash aktual source dan dist, oracle independen, fixture, harness, pengaturan performa, lockfile, HTML acuan dan identitas runtime. Saat memulai putaran baru, simpan direktori acceptance lama sebagai riwayat di luar jalur penerimaan aktif.
2. Jalankan pengukuran memakai `observe`. Setiap pengukuran mempunyai nama unik dan dapat menunjuk satu atau beberapa direktori/berkas keluaran dengan `--out`. Perintah anak wajib menulis hasil terukur ke jalur tersebut. Observer memeriksa identitas sebelum dan sesudah perintah, mencatat exit code, hash binary/argumen berkas dan transcript, lalu menghitung hash berkas keluaran baru atau yang baru ditulis pada saat perintah berjalan. Hasil dari versi lama di folder sama tidak diambil sebagai bukti baru. Perintah dan argumennya disimpan, sehingga gunakan variabel environment untuk kredensial.
3. Tulis fakta per gate sebagai JSON di `evidence/rc8/`. Masukkan daftar nama pengukuran pada `observations` dan objek `checks`. Untuk setiap nama pemeriksaan pada `scripts/acceptance-policy.mjs`, tetapkan `{"pass": true, "evidence": "jalur/relatif/hasil"}` hanya jika hasil pengamatan benar-benar mendukung pernyataan tersebut. Satu hasil boleh mendukung beberapa syarat jika datanya mencakup semuanya. Bukti manual memerlukan artefak yang diberikan operator dengan identitas target serta hasil nyata. Operator bertanggung jawab atas keaslannya. SHA-256 mendeteksi perubahan byte dan tidak mengesahkan tanda tangan pihak ketiga.
4. Simpan pernyataan penerimaan dengan `node scripts/acceptance.mjs record Gxx PASS jalur/fakta.json`. Untuk persyaratan yang tidak terpenuhi, simpan status aktual dengan `node scripts/acceptance.mjs record Gxx BLOCKED --reason 'alasan yang teramati'`. Status lain ialah FAIL dan NOT_RUN. Hasil agregat juga menandai receipt yang hilang, rusak atau usang dengan alasan.
5. Setelah pengukuran dan pengemasan, jalankan `npm run verify:release -- verify --out evidence/rc8/acceptance/decision.json` untuk menulis keputusan eksplisit. Jalankan ulang dari hasil ekstraksi bersih. Pada rilis yang terhambat, exit code 1 adalah hasil pemeriksaan yang benar. Branch produksi harus menjalankan gate sebagai syarat promosi. Preview tetap dapat dibangun dan diuji dengan langkah terpisah.

Bentuk perintah observer dari root proyek adalah `node scripts/acceptance.mjs observe NAMA --out JALUR_HASIL -- PERINTAH ARGUMEN`. JALUR_HASIL berada di `evidence/rc8/` atau `examples/rc8/`. Isi nama, jalur, perintah dan argumen dengan nama berkas dan perintah yang akan dijalankan. Observer dijalankan langsung tanpa shell implisit. Bila diperlukan beberapa perintah, panggil skrip yang versinya dapat diperiksa.

## Data khusus

| Gate | Data wajib di samping observations dan checks |
|---|---|
| G03 | `html` berisi empat jalur ke unduhan produksi aktual. Oracle Python/lxml membandingkan setiap raw TeX, mode, anotasi, cabang visual KaTeX dan MathML, urutan, isi blok, CSS, font, judul dan versi terhadap kontrol yang dibekukan. Setel PF_PYTHON jika Python 3 dengan lxml tersedia melalui executable lain. |
| G07, G08 | `pdfs` memuat jalur PDF aktual yang dibaca dan diikat selama pengamatan. Laporan pendamping mendokumentasikan kebijakan karakter, evaluasi halaman fisik, kode dan label. |
| G09 | `browser` dan `node` masing-masing memuat dua jalur JSON berurutan untuk cohort 1 dan 2. Pemeriksa mengulang perhitungan median dan p95 dari pasangan mentah setiap alur, membandingkan identitas RC6 dan kandidat, urutan AB/BA dan digest oracle setiap pasangan. |
| G10 | `capacity` menunjuk data ukuran dan pengulangan. Pemeriksa membandingkan SLA terhadap protokol yang sudah dibekukan dan memeriksa nilai maksimum sampel heap terhadap deret byte mentah. |
| G13 | `method` sama dengan native-browser-save-dialog. Catat `platform`, `browser`, `cancelObserved`, `retryObserved`, `pdf`, `pages` dan `extractedTextSha256`. Poppler (pdfinfo dan pdftotext) menghitung ulang jumlah halaman serta hash byte dari `pdftotext -layout PDF -`. |
| G15 | `url` adalah URL preview HTTPS yang sebenarnya, `httpReport` menunjuk JSON dari verify-http pada host tersebut. Seluruh status, jumlah berkas dan identitas harus cocok. Bukti operasi browser aktual tetap diperlukan. |
| G16 | `previewUrl`, `rollbackId` dan `authorizationRef` menyatakan target preview, target rollback nyata, dan referensi otorisasi promosi. Laporan drill harus menyertakan target dan hasil pemulihan. |

## Siklus browser pada G09

Setiap cohort Chromium menjalankan tiga alur. Per alur terdapat sepuluh blok dan empat pasangan pengukuran per blok. Sebelum mengukur tiap blok, driver membuka proses Chromium baru, menghangatkan kedua versi, dan mencatat dua hasil pemanasan secara terpisah. Urutan kedua versi bergantian pada 40 pasangan terukur. Perintah untuk cohort 1 dan 2 adalah `node tests/bench/performance-browser-official.mjs ../rc6 1` dan `node tests/bench/performance-browser-official.mjs ../rc6 2`. Tetapkan PF_CHROME pada executable Chromium yang akan diukur.

Pemeriksa menghitung hash byte driver dan dokumen prosedur di `docs/verification-tools/` saat memulai, sebelum dan sesudah perintah, serta saat memeriksa penerimaan. Kedua hash harus identik dengan nilai yang dibekukan dalam `tests/bench/performance-protocol.json` dan nilai yang dicatat driver. Dalam setiap alur, pemeriksa menghitung kembali nomor blok, nomor putaran, urutan AB/BA serta status dan digest keluaran untuk seluruh 100 pengamatan, termasuk 20 hasil pemanasan. Kerusakan target, kegagalan memulai sesi, hasil pemanasan berbeda, percobaan tambahan, baris hilang atau urutan yang berubah menggagalkan gate. Restart setelah kegagalan dapat menyelesaikan pengukuran lain, sementara kegagalan asal tetap tersimpan. Ambang median 1,05 dan p95 1,10 berlaku terpisah untuk tiap metrik di masing-masing cohort. Pengukuran Node memakai metode pasangan semula.

Checksum ZIP distribusi adalah tanda terima terpisah karena menyimpan digest ZIP di dalam ZIP tersebut akan membentuk ketergantungan sirkular. Pemeriksaan release atas source/dist dan bukti tersedia setelah ekstraksi. Verifikasi isi arsip dan rebuild identik dilakukan terpisah dengan scripts/verify-archive.py.
