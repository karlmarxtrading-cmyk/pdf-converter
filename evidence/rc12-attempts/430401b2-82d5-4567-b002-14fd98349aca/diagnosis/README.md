# Diagnosis latensi editor kosong

Penghitungan ulang keempat cohort resmi run `430401b2-82d5-4567-b002-14fd98349aca` menemukan satu kegagalan. P95 refresh editor kosong pada cohort Node kedua adalah 8,578648 ms untuk RC12 dan 7,240159 ms untuk RC6. Rasio 1,184870 melebihi ambang 1,10. Seluruh 1.256 observasi mentah dan penghitungan resmi disimpan dalam riwayat penerimaan run tersebut.

Pengukuran di folder ini memakai pasangan salinan RC12 yang sama. Setiap pasangan menggunakan Node, CPU 6–7, isi proyek, setelan dan prosedur pengukuran yang sama. Setiap anak proses menggunakan heap tersendiri. Setiap trial berisi lima pasangan pemanasan dan 80 pasangan terukur dengan urutan bergantian. Pemeriksa membandingkan SHA-256 seluruh HTML pratinjau dan proyeksi isi independen untuk setiap pasangan. Semua 255 pasangan, termasuk pemanasan, menghasilkan HTML dan proyeksi yang identik.

| Percobaan | Median semula → sesudah (ms) | P95 semula → sesudah (ms) |
| --- | ---: | ---: |
| Penelusuran DOM dan pohon Markdown kosong | 4,638 → 3,454 | 11,238 → 7,703 |
| Hash lokal untuk string UTF-8 berukuran maksimal 2.048 byte | 4,411 → 4,379 | 8,796 → 8,091 |
| Kedua perbaikan | 4,659 → 2,520 | 9,753 → 4,796 |

Dalam percobaan gabungan, P95 pengambilan snapshot turun dari 4,802 menjadi 0,376 ms. Penempatan permintaan digest asinkron ke antrean native ikut menambah latensi pada metadata pendek. SHA-256 lokal memakai algoritme yang sama dengan fallback lama. Pengujian memeriksa byte UTF-8 di batas ukuran secara independen dengan SHA-256 native. Aset biner dan string panjang tetap memakai WebCrypto apabila tersedia.

Pemeriksa proses render masih membuat model sumber independen, melakukan sanitasi HTML dan membandingkan keluaran. Sejumlah pemanggilan untuk mencari elemen turunan sekarang memeriksa keberadaan elemen terlebih dahulu. Pohon Markdown tanpa anak selesai setelah semua diagnosis sumber. Tes kontrol memeriksa kehilangan rumus/teks, penambahan teks di luar blok, serta frontmatter dan catatan sitasi pada dokumen yang terlihat kosong. Tambalan yang diterapkan disimpan dalam `proposed-G09.patch`.

Untuk mengulang diagnosis gabungan, siapkan dua checkout RC12 yang memuat lockfile, dependensi dan fixture referensi yang sama. Pada checkout “before”, balikkan tambalan tersebut dari source kandidat sesudah perbaikan dengan `patch -R -p1`. Salin `diagnostic-empty-stage.mjs` ke `tests/bench/` di kedua checkout. Jalankan dari direktori bukti ini dengan `taskset -c 6,7 node compare-stage.mjs /path/before /path/after /tmp/diagnosis.json 80`. Lihat `diagnosis-summary.json` untuk metrik tiap tahap dan identitas setiap berkas ukur. Keputusan gerbang kandidat bergantung pada penerimaan resmi terpisah yang memakai empat cohort penuh.
