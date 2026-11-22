# Pembacaan sampel PDF trigonometri

Empat PDF hasil jalur cetak produksi PaperForma diperiksa sebagai raster halaman. Sumbernya adalah Markdown trigonometri lengkap, bukan dokumen laporan audit. PDF berasal dari perintah cetak otomatis Chromium atas hasil paginasi yang telah diverifikasi aplikasi. Dialog simpan native dan kondisi printer fisik merupakan jalur berbeda.

| Template/kertas | Halaman fisik yang dilihat | Observasi |
|---|---|---|
| BUS-01 / A4 | 1, 2, 9, 16 | Sampul terpisah, daftar isi bernomor, pecahan dan tabel pada halaman tengah, rangkuman dan paragraf penutup utuh. Nomor cetak setelah sampul mengikuti pengaturan template. |
| EDU-01 / A4 | 1, 2, 10, 19 | Daftar isi menempati halaman awal, dilanjutkan heading dan tabel. Pecahan dan kotak rumus terpisah jelas dan penutup tersedia pada halaman terakhir. |
| EDT-01 / A5 | 1, 2, 11, 20 | Tabel fungsi berlanjut ke halaman kedua dengan heading kolom diulang. Nomor 20 terlihat di tengah bawah halaman penutup. Sel tabel, rumus dan blok ringkasan pada sampel berada di dalam area halaman. |
| CON-01 / Letter lanskap | 1, 2, 10, 19 | Tata letak memakai lembar lanskap, rumus dan tabel pada sampel tetap berada di area isi. Paragraf penutup dan nomor halaman terlihat pada halaman terakhir. |

Pemeriksaan visual merupakan sampel. Oracle PDF yang terlampir memeriksa jumlah halaman, urutan fragmen teks/sel, inventaris rumus, label serta font dan tautan pada berkas yang diuji. Header tabel berulang dipisahkan dari urutan formula sumber. Hasil dokumen campuran, terutama emoji dan area penggunaan privat Unicode, dinilai terpisah.
