# Izin gambar eksternal

Setiap impor `.pfproj` membuka dokumen dengan gambar eksternal dinonaktifkan. Konten, aset gambar yang disematkan, riwayat, dan tampilan tetap dapat dipulihkan. PaperForma memverifikasi checksum dari pengirim sebelum menetapkan izin lokal. Pemulihan revisi teks atau tampilan memakai keputusan izin penerima saat ini. Proyek yang disimpan di perangkat lewat IndexedDB menyimpan pilihan lokal terakhir. Membuka kembali salinan portabel proyek yang sama tetap memerlukan izin baru.

Pada panel Aset, pengguna dapat mengizinkan gambar HTTPS untuk pratinjau. Pengaturan berlaku juga bagi bentuk gambar dalam Mermaid. Saat izin dicabut, PaperForma melepaskan pratinjau yang lama dan membatalkan renderer Mermaid daring yang masih aktif. Izin sebelumnya mungkin sudah menghasilkan permintaan sebelum pencabutan.

Mermaid menyusun diagram dalam halaman lokal dengan pemuatan gambar dan koneksi jaringan dinonaktifkan. Bentuk gambar memperoleh dimensi dari header yang sudah diperiksa. Ketika pengguna mengizinkan URL HTTPS, pembaca terpisah mengambil respons sekali per URL dalam satu diagram, tanpa kredensial atau redirect. Server gambar harus mengizinkan CORS dan menyajikan MIME raster yang sesuai. Pemeriksaan membatasi jumlah byte saat data masuk. PaperForma memvalidasi header, base64, jenis, lebar, tinggi, serta jumlah piksel, kemudian menyalin byte yang diterima ke SVG sebelum dekode asli browser. SVG dan aturan CSS juga diperiksa sebelum dipasang ke dokumen. Penolakan menampilkan diagnosis dan sumber asli diagram.

Batas per gambar adalah 10 MiB, 16.384 piksel per sisi dan 40.000.000 piksel per raster. Aset proyek, gambar inline dalam dokumen dan gambar pada seluruh diagram berbagi anggaran 30 MiB dan 200.000.000 piksel untuk isi unik. Gambar berulang dihitung melalui digest byte. Diagram yang gagal melepas jatah yang belum disahkan. Pencabutan izin, pembatalan atau penutupan tugas juga membersihkan halaman pembaca beserta permintaan yang sedang berlangsung.

Pengujian browser dapat diulang dari root source sesudah build:

```bash
node tests/e2e/rc11-network-consent.mjs
```

Gunakan `PF_CHROME` untuk menentukan executable Chrome/Chromium. Uji membuka studio produksi, memasukkan diagram dan proyek contoh publik, menjalankan handler izin, membuka kembali proyek yang disimpan, serta memeriksa konten hasil ekspor. Intersepsi permintaan browser menjawab gambar contoh secara lokal saat izin aktif. Host pengujian menggunakan domain .invalid.
