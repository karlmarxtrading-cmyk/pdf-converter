# Pemeriksaan PDF RC5

Sumber kandidat `9263951462ed4545e626a877f3ff196d6db5ff2e427585330972da4e8e9551a3`. Ketujuh berkas `.chrome.pdf` di folder ini merupakan keluaran mesin cetak Chromium pada HTML hasil paginasi. Laporan mentah `pdf-verification.json` memakai path dari direktori kerja saat pengujian. Berkas bernama sama disertakan di sini.

| Dokumen | Halaman | Pemeriksaan ketat |
|---|---:|---|
| Trigonometri A4 | 3 | Lulus |
| Einstein A4 | 1 | Lulus |
| Dokumen besar | 195 | Lulus |
| Campuran A4 | 10 | Gagal pada jenis font emoji |
| Campuran A5 | 20 | Gagal pada jenis font emoji |
| Campuran Letter lanskap | 13 | Gagal pada jenis font emoji |
| Dokumen menengah | 62 | Gagal pada jenis font emoji |

Pembacaan PDF dengan pypdf, jumlah halaman, penanaman font, penanda blok dan sel, penomoran dan pemeriksaan halaman kosong lulus pada tujuh PDF. Pemeriksaan tautan serta gambar dilakukan sesuai isi dokumen. Pemeriksaan tambahan Poppler dan ekstraksi per halaman mengidentifikasi Noto Color Emoji sebagai font Type 3. `type3-check.json` mencatat hash setiap PDF dan temuan font. qpdf belum tersedia untuk pemeriksaan tambahan.

Gambar JPG berisi hasil raster halaman sampel. Pada trigonometri, halaman pertama berisi daftar isi. Halaman kedua memuat tabel fungsi dan identitas, kemudian persamaan dan penanda penutup berlanjut ke halaman ketiga. Pada Einstein, matriks, tabel, blok kode dan kalimat terakhir terlihat di satu halaman. Pada A5, sampel menunjukkan daftar isi, tabel lebar di halaman 8 dan penutup dengan catatan kaki di halaman 20. Pemeriksaan visual terbatas pada halaman sampel. Pengujian otomatis memeriksa penanda isi di seluruh dokumen.

`native-dialog.json` mencatat percobaan dari antarmuka produksi. Aplikasi memverifikasi satu halaman A4 dan memanggil dialog cetak. Perintah cetak Chromium dinonaktifkan pada profil desktop terkelola dan tidak ada PDF yang tersimpan melalui dialog sistem. Ukuran heap pada enam pengulangan layout tercantum di kasus terakhir `pdf-verification.json` beserta jumlah iframe.
