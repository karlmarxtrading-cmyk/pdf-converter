# Penerimaan pada perangkat sasaran

Lembar ini adalah prosedur. Hasil uji tersimpan terpisah menurut kandidat dan perangkat. Untuk setiap sesi, catat tanggal beserta zona waktu, identitas build pada `dist.build-manifest.json`, SHA-256 paket yang diekstrak, versi OS, versi browser, versi pembaca layar jika dipakai, dan format keluaran yang dipilih.

## G12 · Input pada Windows dan perangkat lain yang dinyatakan didukung

1. Jalankan build kandidat dari server lokal sesuai README. Catat browser target, status clipboard dan asal sampel yang memang dapat digunakan. Pakai materi uji dalam akun yang sudah diizinkan dan tidak mengandung data pribadi.
2. Salin sampel dari aplikasi asal dengan Ctrl+C. Pilih sampel yang memuat prosa dan rumus, tabel, kode atau sitasi. Tempel di antara dua kalimat editor. Pastikan kedua kalimat di luar seleksi masih ada. Ulangi lewat dialog Tempel dan pilihan masukan yang tersedia.
3. Periksa sumber teks dan HTML dari menu sumber, catat MIME aktual dan simpan sumber mentah yang diperlukan dengan persetujuan pemiliknya. Cocokkan rumus, operator, urutan paragraf, atribusi pesan, angka nol awal, indentasi, dan tujuan tautan pada hasil yang diunduh.
4. Catat hasil per format dan platform. Kelulusan format bersumber dari keluaran yang diperiksa. Nama penyedia dan riwayat pengguna saja tidak membuktikan versi clipboard tertentu.

## G13 · Dialog Save as PDF

1. Impor `fixtures/rc6/user-trigonometry.md`, pilih BUS-01, A4 tegak dan pengaturan publikasi yang tercatat. Buka Periksa dan ekspor, pilih Cetak / Simpan PDF dan selesaikan tinjauan. Catat hash hasil paginasi dan jumlah halaman yang diperlihatkan aplikasi.
2. Buka dialog cetak native. Sekali batalkan. Pastikan editor tetap berisi naskah asli dan hasil lama tidak ditawarkan sebagai berkas baru. Ulangi persiapan. Pada dialog cetak pilih tujuan PDF, cocokkan ukuran dan orientasi, lalu simpan ke nama baru di folder uji.
3. Buka PDF yang benar-benar tersimpan di pembaca PDF. Cocokkan jumlah halaman dengan tanda terima studio, periksa sampul, halaman yang memuat pecahan dan tabel, judul penutup, pemilihan/penyalinan teks, posisi nomor halaman, dan urutan sampel. Uji cetak ulang setelah satu revisi teridentifikasi dan baca berkas keduanya.
4. Simpan kedua PDF, hash masing-masing dan pengamatan perubahan, beserta versi browser, waktu, setelan dan identitas kandidat. Pada Windows, PowerShell dapat membaca hash dengan `Get-FileHash -Algorithm SHA256 -LiteralPath 'C:\Uji\hasil.pdf'` setelah path diganti ke nama berkas uji yang sebenarnya. Beri status terbuka bila belum ada keluaran yang dapat dibaca ulang.

## G14 · Fokus, zoom dan ucapan

Dengan keyboard dan pembaca layar yang dipakai pada perangkat sasaran, jalankan impor, pemilihan template, tinjau kesalahan, ekspor, batal dan retry. Periksa urutan fokus, label kontrol, judul dialog dan pengembalian fokus setelah dialog ditutup. Dengarkan status simpan lokal, kuota dan ekspor. Ulangi pada zoom browser aktual 200%, lalu pada viewport sempit 360 piksel. Catat nama kontrol atau kalimat status yang tidak bisa ditemukan atau tidak diumumkan, langkah reproduksi dan dampaknya terhadap penyelesaian tugas. Simpan hasil aktual secara terpisah dari pemeriksaan axe dan pohon aksesibilitas otomatis.
