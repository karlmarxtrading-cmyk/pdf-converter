> Arsip versi terdahulu. [Laporan aktif RC10](RELEASE_REPORT.md).

# Cara membaca hasil PDF RC8

Untuk cetak, pilih **Ekspor → Cetak / Simpan PDF**. PaperForma memuat font lokal dan memaginasi naskah pada ukuran kertas serta orientasi yang dipilih. Setelah pemeriksaan berhasil, tombol **Buka dialog cetak** membuka pilihan printer/PDF milik perangkat. Saat dialog ditutup, aplikasi dapat mengetahui bahwa dialog kembali. Berkas yang benar-benar tersimpan harus diperiksa dari folder tujuan.

## Karakter privat dan emoji

PDF memerlukan bentuk glif yang dapat dipertanggungjawabkan. Unicode menyediakan area penggunaan privat pada tiga bidang. Karakter dari area tersebut dapat mempunyai arti berbeda pada setiap font asal. PaperForma menunjukkan kode, serta nomor baris bila karakter literal dapat ditemukan dalam sumber editor. Karakter privat tanpa pemetaan menghalangi penerbitan PDF. Pratinjau halaman, ekspor HTML dengan catatan dan **Simpan paket kerja** tetap tersedia. Untuk menerbitkan versi teks, simpan proyek sumber dan ubah salinan menggunakan padanan yang Anda ketahui. Statistik contoh dengan label Latin membandingkan dua dokumen yang berbeda.

Noto Emoji menyediakan bentuk monokrom yang dimuat saat diperlukan. Bentuk hitam putih pada hasil cetak mempertahankan teks Unicode. Pada fixture pengujian, karakter 😀, 🚀 dan urutan 👩‍💻 termasuk ZWJ diperiksa terpisah pada teks PDF. Pemeriksaan juga membaca font yang sebenarnya tertanam serta kebijakan tanpa Type 3. Dukungan untuk urutan emoji lain bergantung pada cakupan font dan perilaku mesin cetak. Arab, CJK dan aksara lain yang membutuhkan font perangkat memiliki catatan cakupan pada panel pemeriksaan.

## Kode yang berpindah halaman

Label bahasa tampak bersama baris pertama blok. Saat Paged.js membagi satu blok di beberapa halaman, hanya fragmen tanpa isi dengan pasangan lanjutan dari blok yang sama yang dibersihkan. Baris sumber yang sengaja kosong mempunyai identitas tersendiri. Pada halaman berikutnya, label lanjutan muncul setelah halaman sebelumnya memuat baris kode.

## Memeriksa bukti

Jalankan dari folder yang memuat `package.json` setelah `npm ci` dan `npm run build`. Pengujian memerlukan Chromium, Python dengan pypdf dan PyMuPDF, serta Poppler dengan perintah `pdftotext` dan `pdffonts`. Setel `PF_CHROME` jika Chromium belum ditemukan pada lokasi baku.

```sh
node tests/e2e/rc8-pdf.mjs
```

Hasil UI serta PDF akhir tersedia dalam `examples/rc8/pdf` dan `evidence/rc8/pdf`. Matriks mencakup empat template, tiga ukuran kertas dan dua orientasi. Setiap baris menyebut fixture, pengaturan, status dan hash PDF. Dokumen diagnostik yang dihasilkan peneliti dari pratinjau yang ditolak disimpan terpisah di `evidence/rc8/pdf/diagnostics`. Pengujian otomatis menggunakan mesin cetak Chromium pada HTML terpaginasi. Hasil pemeriksaan dialog simpan native, browser lain, hosting dan persetujuan promosi memiliki bukti tersendiri.

Pemeriksaan fisik membaca teks, font, geometri halaman serta area rumus dari PDF. Pada empat pengaturan rujukan, raster tiap area rumus dibandingkan dengan PDF RC7 yang berhasil pada naskah yang sama. File `physical-verification.json` mencatat hasil tiap rumus. Pada pengaturan baru, bukti memadukan oracle TeX dari sumber, piksel tinta pada wilayah rumus, glif font KaTeX pada PDF, pemeriksaan urutan teks dan halaman. Status reproduksi byte, tampilan, kemampuan ekstraksi, dan dialog simpan mempunyai arti berbeda.
