# Cakupan format dan batas RC7

| Jalur | Cakupan yang diuji | Batas yang perlu diperhatikan |
|---|---|---|
| Buka berkas Markdown / teks UTF-8 | Naskah trigonometri asli, 231 rumus berurutan. Fixture memuat rumus inline dan display serta lima tabel. | 17 isi rumus memerlukan pemulihan escape. Editor menyimpan sumber untuk diperiksa penulis. |
| Markdown/GFM | Heading, emphasis, catatan kaki, tabel, tautan, gambar, kode dan daftar. Delimiter dolar dan TeX, fence math, inline matematika GitHub, serta salinan ter-escape memiliki kasus regresi. | Fence latex/tex dipertahankan sebagai kode. Perintah TeX mengikuti dukungan renderer KaTeX. |
| HTML clipboard sintetis | Metadata TeX pada KaTeX, MathML dan MathJax, pembungkus multi-rumus, prosa, kode, rumus berdekatan, sel gabungan, caption, judul tautan dan gambar. | Kombinasi yang tersedia bergantung pada apa yang disalin aplikasi asal. Status per penyedia dan clipboard sistem terdapat pada laporan RC7. |
| TeX melintasi markup | Bila delimiter melintasi tautan, superskrip, atau subskrip dan konversi berisiko mengubah makna, struktur dipertahankan dan diberi peringatan. | Pengenalan sisa TeX memakai heuristik. Persamaan tanpa metadata TeX mungkin hanya memiliki representasi teks. |
| HTML mentah di Markdown | Fragmen aman dan mandiri diperiksa terhadap urutan blok, teks, tanda, formula, gambar, tautan dan atribut relevan. Kode mempertahankan spasi. | Pasangan tag yang terpisah antarblok memerlukan tinjauan. Atribut presentasi arbitrer dan kebenaran matematis berada di luar pembanding. |
| HTML mandiri | Periksa struktur rumus, aturan CSS KaTeX, font WOFF2 tersemat, tautan internal dan isi. | Cakupan glif bergantung pada font dan konten. Hasil untuk satu naskah tidak mewakili semua kombinasi bahasa, gambar dan template. |
| Cetak/PDF | Aplikasi menyiapkan payload, melakukan paginasi di browser, lalu meneruskan perintah cetak. Laporan menyebut tahap yang benar-benar teramati. | Ukuran kertas, skala dan margin dialog cetak turut menentukan hasil tersimpan. |
| Pemulihan proyek | Regresi mencakup penyimpanan lokal, ekspor/impor cadangan, konflik dan riwayat. | Data tersimpan per origin dan profil browser. Uji IndexedDB simulasi dan alur UI fisik memiliki cakupan berbeda. |

Pemuatan awal situs membutuhkan akses ke berkas yang disajikan lewat HTTP(S). Ekspor HTML mandiri mengemas aset yang dibutuhkan untuk membuka hasilnya. Makro LaTeX arbitrer, OCR, impor PDF/DOCX dan pemulihan TeX dari gambar tanpa sumber berada di luar fitur aplikasi. Cakupan hasil tersedia di [laporan rilis](RELEASE_REPORT.md).

Pemeriksaan mutasi juga memiliki batas pada penambahan isi yang tidak terkait dengan blok sumber. Dalam pengujian tambahan, penambahan karakter privat ke paragraf ber-ID terdeteksi. Bila sumber sama sekali tidak mengandung karakter privat, penambahan karakter tersebut ke paragraf baru di luar seluruh blok ber-ID dapat lolos. Karena itu, hasil pemeriksaan integritas tidak dapat digunakan untuk menjamin deteksi setiap perubahan arbitrer pada HTML.
