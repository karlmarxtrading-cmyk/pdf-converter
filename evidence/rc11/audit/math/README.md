# Integritas clipboard dan daftar cetak

## A01

RC10 memasukkan delimiter display multiline ke dalam tabel GFM. Pada header, parser membaca pagar dan pemisah tabel sebagai bagian dari rumus atau teks. RC11 menyimpan tabel itu sebagai blok HTML aman. Marker formula menyimpan TeX asli dan mode di dalam sel aslinya. Perbandingan saat konversi memeriksa urutan rumus, baris, tag sel, span sel, teks dan posisi rumus di dalam tabel display. Pemeriksa render serta ekspor kemudian memeriksa sumber yang telah lolos batas pertama itu.

## A02

Spasi di tepi annotation dahulu diproses bersama spasi prosa. Penulis Markdown kemudian mengeluarkan dollar yang ditolak scanner, atau menafsirkan backtick dalam annotation sebagai sintaks GitHub. RC11 memisahkan whitespace node rumus dari whitespace prosa. Scanner dan parser mempertahankan payload anotasi, dan konversi membaca kembali metadata HTML asli untuk memeriksa hasil serialisasi. Bila karakter tetangga membuat delimiter ambigu, aplikasi mengulangi konversi dari HTML asli dengan blok HTML aman. Perbedaan yang masih terdeteksi menghasilkan kegagalan konversi eksplisit. Editor dan clipboard asli tetap tersedia.

## A05

RC11 melestarikan tipe item, nilai ordinal, tipe daftar induk, struktur bertingkat dan pilihan marker dari HTML. Pemeriksa keluaran HTML dan inventaris paginasi kini membandingkan tipe item. Jalur buku menghormati override marker pada item kosong. Fixture browser merupakan dokumen buatan dengan 84 item, dua jenis anotasi, empat sel, referensi tertulis ke dua marker, dan penanda akhir.

## Bukti dan cara pengulangan

- `rc10-negative.log` merekam 10 kesalahan perilaku pada 12 pengujian dengan source RC10 yang diekstrak terpisah. Dua kontrol lulus. Seluruh kasus menjalankan harness yang sama dengan `tests/unit/render/rc11-clipboard-fidelity.test.ts`. Hash ZIP dan harness ada dalam `scope-sha256.json`.
- Dari root kandidat, jalankan `node node_modules/vitest/vitest.mjs run tests/unit/render/rc11-clipboard-fidelity.test.ts tests/unit/render/rc11-clipboard-guard.test.ts`. Uji mencakup masukan HTML asli beserta MIME teks pendamping, DOM hasil render, HTML mandiri, payload cetak standar, HTML buku, serta delapan contoh korupsi pada hasil konversi yang harus ditolak pemeriksa. Fixture sintetis ini tidak menggantikan clipboard Windows dari penyedia AI.
- `core-regressions.log` mencatat pengujian seluruh suite unit core bersama kedua suite baru. `conversion.log` juga memeriksa kontrol Einstein, KaTeX clipboard, MathML dan MathJax.
- Untuk PDF fisik, dari root kandidat setelah build siap, jalankan `node tests/e2e/rc11-clipboard-print.mjs`. Set `PF_CHROME` ke executable Chromium jika discovery tidak menemukannya. Prasyarat tambahan adalah Poppler `pdftotext`. Direktori keluaran bawaan adalah `evidence/rc11/clipboard-print/`. Runner mengimpor HTML lewat UI aplikasi, menyiapkan kedua mode cetak, mencocokkan hash HTML dengan receipt UI, membuka layout itu secara offline dan membaca kembali PDF yang ditulis melalui Chromium CDP. Batas bukti ini mencakup mesin PDF browser, bukan dialog Save Windows.
