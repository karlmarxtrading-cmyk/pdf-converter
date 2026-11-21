# Performa snapshot dan analisis

## Snapshot proyek

RC4 yang dibangun dari arsip asal menggunakan salinan terstruktur seluruh buffer penyokong sebuah view, termasuk byte di luar rentang aset. Dengan sepuluh buffer 1 MiB, profil RC4 mencatat median 4,33 ms untuk deep clone dan 12,10 ms untuk hashing aset secara serial; penghitungan identitas isi memerlukan 6,65 ms lagi. Pengukuran komponen dilakukan terpisah, sehingga jumlah median tidak sama persis dengan satu panggilan. Data: `profile-rc4.json`.

RC5 menyalin rentang byte yang terlihat sebelum menunggu operasi asinkron, menduplikasi view yang sama hanya sekali, dan menghitung SHA-256 aktual atas salinan. Maksimal dua digest aset berjalan bersamaan untuk satu snapshot. Identitas sumber dan isi independen juga dihitung bersamaan. Memulai snapshot baru tetap memeriksa byte terkini. Pada sepuluh view 4 KiB dari sepuluh buffer 1 MiB, kapasitas byte yang tersimpan di sepuluh view snapshot turun dari 10 MiB menjadi 40 KiB. Ini ukuran buffer aset terjangkau di snapshot, bukan total heap.

Tolok ukur berpasangan 40 kali pada Node 24.22.3:

| Skenario | Median RC4 / RC5 (ms) | p95 RC4 / RC5 (ms) |
|---|---:|---:|
| Teks 20.000 karakter | 0,53 / 0,38 | 1,27 / 0,72 |
| Teks 1,08 juta karakter dan riwayat 5,1 juta karakter | 11,06 / 8,53 | 18,93 / 13,28 |
| Riwayat yang sama dengan 10 MiB aset | 26,37 / 15,18 | 36,74 / 31,20 |
| Riwayat yang sama dengan 10 subview 4 KiB | 15,49 / 8,17 | 28,86 / 21,71 |

Untuk 10 MiB aset, median turun 42,4% dan p95 turun 15,1%; sasaran penurunan 10% tercapai untuk keduanya. Keempat pasangan beban menghasilkan hash mentah, isi, input render dan daftar hash byte yang identik di semua pengulangan. P95 RC4 99,41 ms di rilis sebelumnya berasal dari sesi lain. Sesi berpasangan pertama sebelum kenaikan identitas versi juga terekam: p95 aset 90,15 / 52,42 ms. Semua sampel ada di `paired-before-version-bump.json` dan `paired.json`. Variasi antarsesi pada mesin bersama membatasi proyeksi ke perangkat pengguna.

## Menjalankan ulang

Dari root kandidat yang telah menjalankan `npm ci` dengan Node sesuai `.node-version`, tetapkan jalur baseline ke direktori `repository` dari ZIP RC4:

```sh
RC4="../baseline/repository"
node evidence/rc5/performance/snapshot.mjs "$RC4" . profile rc4-profile.json
node evidence/rc5/performance/snapshot.mjs "$RC4" . compare paired-new.json
node evidence/rc5/performance/engine-phases.mjs "$RC4" engine-phases-new.json
```

`PROTOCOL.md` mencatat anggaran sebelum pengukuran. Berkas hasil mencantumkan versi runtime, model CPU dan hash berkas implementasi yang diuji. Snapshot menggunakan opsi versi renderer dan templat yang disamakan agar makna input hash sebanding. Model pengukuran engine memeriksa seluruh hash keluaran semantik untuk formula, urutan heading, struktur dan model integritas, di samping mencocokkan TeX dan mode terhadap fixture. Hash ini tidak mencakup seluruh byte HTML yang memiliki nonce.


## Analisis dokumen pada kandidat final

Pada dokumen biasa, renderer memproses sumber mentah. Pemeriksa keutuhan membangun pohon Markdown tersendiri dari sumber mentah dan menjalankan batas ukuran/struktur yang sama. Pemeriksa rujukan gambar memakai pohon milik pemeriksa keutuhan. Dua pemeriksaan berbagi satu hasil penguraian selama satu pekerjaan; pohon tersebut dapat dilepas dari memori setelah pekerjaan selesai. Setiap revisi berikutnya mengurai ulang sumber. Percakapan tetap diperiksa sesuai pemilihan dan urutan pesan, dan HTML mentah yang berisi gambar tetap diperiksa dengan batas HTML tersendiri.

Pengujian kesetaraan baru membandingkan blok, ID, hitungan karakter Private Use, temuan rujukan relatif, definisi referensi, HTML gambar eksternal, perubahan aset dan seleksi pesan. Pengujian dijalankan bersama pengujian mesin, pemeriksaan gambar, dan anggaran: 32 tes lulus; typecheck dan lint lulus.

Hasil kandidat `11e800988402cfa171bc86a591ffdba08bf9c0c532319454180175549d151460`, dengan pemeriksaan kesesuaian komponen di `component-binding.json`. Pengukuran dimulai setelah build, pemeriksaan tipe, lint dan suite unit selesai. Rekonstruksi clean-room ditunda sampai pengukuran selesai. Data lengkap ada di `engine-phases.json`.

| Bagian / rumus | Jalur | Pasangan | Median analisis RC4 / RC5 (ms) | p95 analisis RC4 / RC5 (ms) | Median fase rujukan RC4 / RC5 (ms) |
|---:|---|---:|---:|---:|---:|
| 1 / 8 | Worker Node | 20 | 24,3 / 21,4 | 38,9 / 49,9 | 4,0 / 0,1 |
| 1 / 8 | Fallback | 20 | 20,7 / 18,2 | 50,5 / 27,8 | 3,2 / 0,0 |
| 6 / 48 | Worker Node | 20 | 96,2 / 81,1 | 133,8 / 180,5 | 20,2 / 0,2 |
| 6 / 48 | Fallback | 20 | 77,8 / 56,3 | 107,4 / 96,0 | 18,6 / 0,1 |
| 30 / 240 | Worker Node | 4 | 436,3 / 387,7 | 596,4 / 532,0 | 98,9 / 0,9 |
| 30 / 240 | Fallback | 4 | 617,6 / 448,3 | 792,0 / 494,6 | 167,3 / 0,8 |
| 59 / 472 | Worker Node | 4 | 781,7 / 638,6 | 824,4 / 724,5 | 206,8 / 1,0 |
| 59 / 472 | Fallback | 4 | 806,1 / 531,8 | 891,9 / 567,4 | 209,9 / 1,0 |

Seluruh delapan median menurun dan seluruh signature isi cocok antara RC4 dan kandidat final. Untuk 59 bagian, 472 rumus dan 472 baris tabel, median jalur worker turun 18,3% dan jalur cadangan turun 34,0%. Dua p95 worker kecil naik (1 dan 6 bagian). Pada n=4 p95 merupakan maksimum sampel. Data Node memisahkan fase analisis dan pengiriman pekerjaan; ukuran sekitar 1/10/50/100 halaman mengikuti kelas beban generator dan tidak menyatakan jumlah halaman tercetak.

## Analisis dokumen sebelum perbaikan pembacaan AST

Fixture 1/6/30/59 bagian terdiri dari 5.134 / 30.374 / 151.589 / 298.068 byte UTF-8, 8 / 48 / 240 / 472 rumus, tabel dengan masing-masing 8 baris data, serta 0 gambar. Keluarga ukuran mengikuti generator dokumen panjang; halaman PDF aktual bergantung tata letak. Worker menjalankan handler produksi di Node worker_threads dengan adapter pesan. Fallback memakai EngineClient yang sama di thread pemanggil, termasuk jeda default antarfase. Keduanya menyelesaikan analisis dan terlebih dahulu dibandingkan dengan daftar rumus yang diharapkan. Tidak ada kegagalan isi pada sampel.

| Bagian | Jalur | Pasangan | Median RC4 / RC5 (ms) | p95 RC4 / RC5 (ms) |
|---:|---|---:|---:|---:|
| 1 | Worker Node | 20 | 27,8 / 27,0 | 61,8 / 85,2 |
| 1 | Fallback | 20 | 20,7 / 21,6 | 30,2 / 27,6 |
| 6 | Worker Node | 20 | 125,7 / 259,4 | 242,5 / 740,9 |
| 6 | Fallback | 20 | 86,0 / 87,8 | 108,7 / 114,9 |
| 30 | Worker Node | 4 | 568,6 / 468,9 | 704,4 / 514,8 |
| 30 | Fallback | 4 | 394,8 / 367,7 | 413,8 / 401,5 |
| 59 | Worker Node | 4 | 1.049,8 / 869,9 | 1.808,6 / 963,7 |
| 59 | Fallback | 4 | 819,2 / 1.027,2 | 1.327,7 / 1.903,1 |

Pada n=4, p95 merupakan maksimum sampel. Semua waktu pertama, sampel mentah, ringkasan tiap fase, identitas sumber, dan signature hasil tersedia di `engine-before-ast-sharing.json`. Data antara sebelum pembekuan kode disimpan di `engine-phases-before-freeze.json`. Selama matriks primer, dua build, Vitest dan pekerjaan QA browser juga memakai lingkungan yang sama. Urutan AB/BA mengimbangi urutan tetapi tidak mengisolasi penjadwalan CPU dan GC. Distribusi p95 tidak boleh diproyeksikan sebagai SLA.

Dua median di atas ambang penyelidikan. Pada 6 bagian di worker, median waktu render / integritas / rujukan naik dari 51,0 / 27,9 / 22,4 menjadi 74,5 / 68,9 / 49,4 ms, dan kenaikan terjadi pada kelompok pengulangan tertentu. Uji terpisah pada satu CPU yang sama dengan urutan awal dibalik (20 pasangan) memberi median 140,0 / 133,1 ms dan median CPU thread 94,5 / 90,9 ms. Pada fallback 59 bagian, diagnostik 8 pasangan memberi median 1.278,4 / 1.305,2 ms (+2,1%); median waktu CPU thread 946,3 / 1.023,3 ms (+8,1%). P95 sampel diagnostik fallback masih naik 1.479,1 / 1.691,4 ms. Rute parser yang sama juga memeriksa delimiternya pada setiap render, pembuatan model integritas dan pengumpulan rujukan. Data menunjukkan variabilitas waktu nyata dan biaya CPU yang tersisa, namun tidak mengisolasi komit penyebab perubahan waktu. Hasil diagnostik ada di `engine-diagnostic-before-ast-sharing.json`. Seluruh sampel antara dipertahankan; klaim seluruh variasi dokumen menjadi lebih cepat belum terbukti.

Untuk diagnostik pada Linux, gunakan inti bernomor terendah yang diizinkan (0 pada pengukuran ini):

```sh
taskset -c 0 node evidence/rc5/performance/engine-phases.mjs "$RC4" engine-diagnostic-new.json --diagnostic
```

Pemindahan penjadwalan contoh beranda sesudah pemilihan rute mengubah fingerprint situs pada pengemasan akhir. Verifikasi ulang SHA-256 seluruh modul yang diukur ada di `component-binding.json`. Modul Node untuk kedua tolok ukur identik dengan yang diuji. Uji Chromium dilakukan ulang pada dist akhir.
