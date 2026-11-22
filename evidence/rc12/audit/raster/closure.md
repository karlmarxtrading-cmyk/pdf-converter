# RC11-SEC-01 · Pemeriksaan gambar Mermaid sebelum dekode

## Baseline RC11

Laporan audit yang diserahkan pemilik mengamati pengukuran gambar pada Mermaid melalui stub Image. Pada tahap tata letak, RC11 menyerahkan URL ke pemuat gambar sebelum memeriksa SVG hasilnya. Inspeksi source RC11 mengonfirmasi jalur tersebut. Metode awal dan digest source tercantum pada baseline-inspection.json.

## Perubahan RC12

Renderer memakai adapter pengukur dimensi untuk bentuk gambar pada Mermaid terkunci. Browser memblokir semua pemuatan gambar dan koneksi jaringan pada dokumen tata letak. URL HTTPS yang telah disetujui diteruskan oleh aplikasi ke pembaca byte CORS terpisah. Pembaca memeriksa jenis dan panjang respons, menghentikan stream saat melewati batas, serta membatalkan permintaan ketika izin dicabut. PaperForma juga membatasi satu pembacaan sumber raster per diagram pada satu waktu. Diagram yang gagal menampilkan source aslinya dan penyebab penolakan.

Semua gambar SVG pada hasil tata letak diperiksa dalam template yang masih terlepas. Byte gambar harus lolos pemeriksaan base64, MIME aktual, header, sisi, piksel dan anggaran isi unik sebelum diteruskan ke dekoder browser. SVG final memuat salinan byte yang diperiksa. Anggaran dokumen menggabungkan gambar biasa, aset proyek serta gambar diagram. Jatah untuk diagram baru disahkan hanya sesudah validasi dan pengujian dekoder berhasil. Pembatalan, izin yang dicabut dan penutupan melepaskan frame serta sinyal pekerjaan terkait.

## Bukti

- baseline-inspection.json mengikat diagnosis sumber RC11 dengan digest laporan audit dan file terkait.
- final-unit.log menguji batas sisi, piksel, byte, total antardiagram, pengulangan, jenis MIME, header, data rusak dan pembatalan. Fixture berukuran 7, 8 dan 9 piksel memakai batas pengujian kecil.
- final-browser.json berasal dari UI studio pada dist produksi. Uji membuka preview, mengunduh HTML mandiri serta membaca kembali HTML dan frame kedua jalur cetak. Dekoder native tetap aktif dan setiap panggilannya dicatat. Pembatalan dan Retry diperiksa setelah perubahan source.
- Uji izin HTTPS, pencabutan serta pemulihan proyek tercatat pada pengukuran jaringan RC12 terpisah. Preview hosting, dialog Save OS dan pembaca layar masing-masing memerlukan bukti pada lingkungan sasarannya.
