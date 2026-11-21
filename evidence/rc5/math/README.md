# Keutuhan masukan matematika

Tujuh dari delapan kasus baru gagal pada source RC4. Kedelapan kasus lulus pada kandidat ini. Kontrol kalkulus sudah lulus pada RC4. Uji kelompok terkait pada kandidat meluluskan 95 tes dari tujuh file melalui Vitest dan jsdom. Data uji berasal dari fixture sintetis. Log RC4 dan kandidat berada di folder ini.

| Kasus | Gejala yang direproduksi di RC4 | Pemeriksaan kandidat |
|---|---|---|
| RC5-M01 | Tabel tiga kolom menjadi lima kolom ketika sel berisi nilai mutlak | Empat baris masing-masing tepat tiga sel. TeX nilai mutlak, norma, peluang bersyarat, angka desimal, minus dan derajat diperiksa |
| RC5-M02 | Dolar di dalam TeX memotong rumus. Kata “dan” masuk ke slot rumus berikutnya | TeX asli, rumus sesudahnya, mata uang prosa, kode inline dan tujuan tautan diperiksa |
| RC5-M03 | Skrip data MathJax lama menghilangkan persamaan terpisah dalam paragraf yang sama | Kedua persamaan muncul sekali dan urut. Persamaan visual yang berpasangan dengan skrip tidak berganda |
| RC5-M04 | Tujuan tautan `vol\(1\)` berubah menjadi `vol$1$` | URL dan judul menggunakan hasil parse CommonMark pada sumber asli. Rumus dalam label tetap dirender |
| RC5-M05 | Anotasi KaTeX inline berisi dolar berubah menjadi display setelah clipboard dikonversi | TeX, mode inline dan spasi di kedua sisi dipertahankan |
| RC5-M06 | Dua variasi pembuka TeX tanpa penutup kehilangan garis miring tanpa diagnostic | Saat pembuka diikuti perintah TeX, hasil menampilkan pembuka, nomor baris dan penutup yang perlu ditambahkan. Contoh kode identik dikecualikan |
| RC5-M07 | Kontrol positif pada kedua versi | Heading, kutipan, daftar, tujuh rumus (limit, turunan, jumlah, integral, aligned, cases), urutan akhir, huruf beraksen, karakter gabungan dan simbol numerik diperiksa |

Rangkaian lama yang dijalankan mencakup trigonometri 21 rumus pada Markdown dan clipboard HTML beserta ekspor HTML, contoh Einstein, matriks multiline di tabel HTML, karakter Private Use, code fence, indented code, tautan gambar serta laporan kegagalan KaTeX. Oracle menguji nilai TeX, mode, struktur dan teks. Pengukuran ini tidak menguji clipboard sistem operasi atau paginasi.

Untuk mengulang dari root hasil ekstraksi, jalankan `npm ci` lalu:

```sh
npx vitest run tests/unit/core/rc5-math.test.ts tests/unit/core/rc4-reading-regressions.test.ts tests/unit/core/math-einstein.test.ts tests/unit/core/static-regressions.test.ts tests/unit/core/render.test.ts tests/unit/core/render-acceptance.test.ts tests/unit/render/trigonometry-export.test.ts --maxWorkers=2 --no-color
```

Untuk perbandingan baseline, ekstrak ZIP RC4 dengan SHA-256 `3b8c833b720c799664d03c4c293bf9645d2a5cc63c3ccd46ba340c6435870074` ke folder tersendiri. Tambahkan hanya `fixtures/rc5/` dan `tests/unit/core/rc5-math.test.ts`, lalu jalankan file tes itu melalui Vitest dengan dependensi dari lockfile RC4. Log `baseline.log` berasal dari pengujian source RC4 dengan prosedur setara di direktori kerja terpisah.

Markdown GFM memberi setiap baris fisik tabel satu baris data. Untuk sel dengan matriks atau blok multibaris, gunakan tabel HTML clipboard atau format TeX dalam satu baris sel. Sumber asli dan tata letak umum dokumen tetap tunduk pada batas yang dijelaskan dalam laporan rilis.
