# Pemeriksaan keutuhan blok HTML dan rujukan RC7

Oracle memulai setiap kasus dari keluaran render atas sumber sintetis yang sama, lalu mengubah DOM dengan instruksi terpisah. Hasil yang diharapkan ditentukan oleh mutasi yang ditulis di skrip. Keempat kontrol dipertahankan utuh. Sebagian kontrol sengaja merujuk berkas gambar yang belum dimasukkan. Pemeriksaan keutuhan dalam kasus itu memeriksa deskripsi dan rujukan pada placeholder. Status kesiapan aset dinilai terpisah oleh pemeriksa aset aplikasi.

| Pengamatan pada mesin yang sama | RC6 | RC7 |
| --- | ---: | ---: |
| Kontrol yang diterima pemeriksa keutuhan | 4/4 | 4/4 |
| Mutasi yang ditolak pemeriksa keutuhan | 0/17 | 17/17 |
| Blok yang masuk perbandingan pada kontrol pertama | 2 | 3 |
| Fragmen HTML yang dilewati pada kontrol pertama | 1 | 0 |

Tiga belas mutasi terjadi di sekitar blok HTML mandiri. Mutasi mengubah operator, formula, asal TeX, paragraf, urutan elemen, posisi blok, baris tabel, href, gambar, alt, title, caption, dan indentasi kode. Dua mutasi lain mengubah tujuan tautan internal pada Markdown sementara rujukan asli tetap utuh. Dua mutasi terakhir menghilangkan sumber gambar tersemat atau label placeholder yang dapat dibaca.

Kontrol HTML RC7 menghitung 1 formula, 1 tabel dengan 2 sel, 1 tautan, 1 gambar, dan 1 blok kode. Konservasi TeX memakai metadata formula agar representasi visual dan MathML dapat hadir bersamaan. Pemeriksa mencatat judul gambar dan teks alternatif saat aplikasi perlu menampilkan placeholder.

## Cakupan

- Perbandingan berurutan mencakup fragmen HTML tingkat blok yang berdiri sendiri, termasuk beberapa elemen saudara. Parser mempertahankan batas paragraf, daftar, gambar, keterangan, tabel, kode dan tautan.
- Fragmen yang membuka atau menutup wadah di blok Markdown berbeda dan fragmen yang tidak menghasilkan konten aman mandiri dilaporkan melalui `skippedBlocks` dan `INTEGRITY_RAW_HTML_PARTIAL`.
- Markup HTML inline campuran di dalam paragraf Markdown masih mengikuti model perbandingan paragraf yang ada. Atribut presentasi dan perubahan gaya per karakter tidak seluruhnya dibandingkan. Penilaian sanitasi, kebenaran matematika dan visualisasi halaman mempunyai jalur tersendiri.
- Untuk fragment link yang berhasil diselesaikan pada render RC7, tujuan nyata diperiksa terhadap ID hasil resolusi dan harus unik. Tautan yang sejak awal kehilangan tujuan mendapat peringatan struktur. Pada HTML lama yang hanya menyimpan rujukan sumber, pemeriksa hanya dapat mengecek keberadaan dan keunikan target yang ditunjuk.
- Untuk gambar data URI dari sumber, pemeriksa membandingkan identitas rujukan yang digunakan model. Untuk gambar lampiran, ia mengecek rujukan dan keberadaan payload data URI. Verifikasi byte atau hash aset lampiran dan verifikasi isi gambar menggunakan tahap aset/arsip tersendiri. Uji ini tidak memeriksa apakah gambar yang tercetak benar secara visual.
- Bukti berasal dari sumber yang dimuat dengan Vite dan DOM jsdom. Bukti browser/PDF dan bukti keutuhan 231 rumus ada dalam hasil uji masing-masing.

## Menjalankan ulang

Jalankan di akar versi yang ingin diperiksa setelah `npm ci`. Ganti path setelah tanda pengalihan dengan letak skrip RC7 bila menguji RC6.

```sh
node --input-type=module < evidence/rc7/probe-raw-integrity.mjs
```

`raw-integrity-baseline.json` dan `raw-integrity-candidate.json` menyimpan hasil setiap mutasi. Tes regresi aplikasi tambahan terdapat di `tests/unit/core/rc7-raw-integrity.test.ts`.
