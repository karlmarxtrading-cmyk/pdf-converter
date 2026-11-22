# Menjalankan pemeriksaan buku RC12

Gunakan Node 24.22.3, Chromium, Pandoc, Python dan PyMuPDF. Pasang dependensi dengan npm ci, bangun distribusi dengan npm run build:pages, lalu tetapkan PF_CHROME jika perlu. Gunakan ekstraksi kerja tersendiri untuk mengulang pengujian. Bukti yang diserahkan tetap tersedia di arsip asli.

Setelah memulai putaran dengan `node scripts/acceptance.mjs start`, jalankan pengujian UI dari root untuk lima contoh publik berikut. Setiap kasus mengimpor sumber di studio, mengunduh HTML mandiri, menyiapkan HTML cetak buku, menjalankan perintah cetak browser dan membuka kembali byte PDF.

```bash
node docs/verification-tools/capture-product-book.mjs headings-on
node docs/verification-tools/capture-product-book.mjs long-table-off
node docs/verification-tools/capture-product-book.mjs paragraphs-off
node docs/verification-tools/capture-product-book.mjs paragraphs-on
node docs/verification-tools/capture-product-book.mjs single-paragraph-off
```

Untuk novel, tetapkan PF_PRIVATE_SOURCE ke sumber asli dan PF_PRIVATE_OUT ke folder di luar seluruh pohon aplikasi. Jalankan `node docs/verification-tools/capture-product-book.mjs original-default`. Pembacaan PDF otomatis memakai dokumen cetak yang byte-nya identik dengan unduhan resmi. Dialog native memakai gerbang G13. File fisik dan halaman privat tetap berada di luar paket aplikasi.

Nama program yang memuat standalone, partition atau verified-groups merekam metode diagnostik sebelumnya. Bukti penerimaan tombol cetak buku menggunakan jalur capture-product-book. Perintah observe dengan nama dan keluaran yang dipakai pada kandidat tersedia di evidence/rc12/acceptance/observations/.
