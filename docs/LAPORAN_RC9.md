> Arsip versi terdahulu. [Laporan aktif RC10](RELEASE_REPORT.md).

# PaperForma 3.0.0-rc.9 · Hasil kandidat lokal

Keputusan promosi **NO_GO**. Sumber dan dist siap diperiksa dan dijalankan lokal. Pemeriksaan terhadap semua bagian paket sesudah ekstraksi dijalankan dengan scripts/verify-archive.py. Checksum setiap berkas ada di SHA256SUMS.

Sumber kandidat 37277f20b922b1a6a9f734b0d69e96a61a8298a6d71aad24a86fd53731178bc9   
Dist 876bae95926bce4b4730864c66598f4192cf64c36c0ab02214dd9c3693656b0a   
Run c6de85a8-9f22-4683-b0d7-e20bc02fc245 

## Kasus naskah asli

Aplikasi menghitung 217.850 kata, satu tabel, nol rumus dan nol gambar pada Markdown unggahan berukuran 1.659.854 byte. Naskah diproses tanpa suntingan. Hash sumber 88901d44a592ead82c757b65f57ce26e5f0003598a7a74064d6921439dbd0454. Setelan awal BUS-01, A4 potret, sampul dan daftar isi aktif. Nomor revisi historis 6b96f92e5455 belum dapat dipulihkan dari Markdown. Impor baru mengikat byte sumber yang sama pada proyek baru.

RC8 memiliki deadline mutlak 180 detik. Kontrol waktu mengonfirmasinya. Uji browser RC8 dari unggahan asli masih memberi progres menjelang batas pengamatan. Kandidat perantara menemukan duplikasi pada kutipan multi-baris yang terpotong antarlaman. Kandidat final mempertahankan kutipan pendek ini utuh ketika muat di halaman baru, membatasi penyimpanan grup halaman dan mempertahankan kapitalisasi judul. Mesin memeriksa inventaris isi, target daftar isi, pemotongan dan nomor halaman pada dokumen lengkap.

Tombol Cetak menghasilkan 1311 halaman tervalidasi. Percobaan menulis seluruh PDF Paged.js sekali panggil gagal pada Page.printToPDF. Bukti jalur alternatif dari halaman cetak yang sama ada di evidence/rc9/private-receipts. Status perbandingan PDF bertahap dengan sumber adalah **TRUE**. PDF pribadi dari HTML mandiri mempunyai 1.319 halaman dan lolos pemeriksaan 30.039 blok berisi teks, 19 penanda daftar serta dua pengulangan kepala tabel. Salinan PDF sebelumnya diganti setelah penanda empat digit ditemukan terpotong. Pencetakan ini dilakukan otomatis di Chromium. Dialog Save bawaan sistem belum terverifikasi.

## Kapasitas nyata

| Bentuk | Daftar isi | Halaman PDF | Semua teks cocok |
| --- | --- | ---: | --- |
| headings | on | 630 | True |
| long-table | off | 591 | True |
| paragraphs | off | 628 | True |
| paragraphs | on | 628 | True |
| single-paragraph | off | 614 | True |

Uji membandingkan Markdown yang dibaca Pandoc dengan HTML dari klik ekspor dan karakter PDF yang dibuka kembali. Normalisasi NFC dan spasi tata letak dipakai. Perbedaan variasi presentasi Unicode dijelaskan di laporan fisik. Karakter konten, angka, urutan, dan akhir dokumen diperiksa. Bukti sampel halaman ada di evidence/rc9/visual.

## Regresi dan perbaikan mesin

Empat template diuji melalui unduhan HTML. Acuan trigonometri memuat 231 rumus, 254 blok dan 17 pemulihan. Pemeriksaan mencakup 103 rumus inline, 128 display, anotasi dan MathML, CSS, font tersemat serta urutan konten. Matriks PDF reguler menghasilkan 26 PDF dan menahan 3 kasus glif privat tanpa pemetaan. Hasil per gerbang mengikat observasi dan hash artefak. Buku asli memuat font Type 3 untuk sebagian panah dan simbol, serta fallback Liberation Sans untuk sejumlah subskrip dan tanda pertidaksamaan. Temuan ini dibatasi pada artefak buku asli.

Pada uji interaksi studio Chromium, 33 dari 33 skenario lulus. Profil QA memeriksa status internal. Unduhan HTML trigonometri serta cetak dokumen besar memakai build produksi. Uji navigasi dan seleksi teks luring mencakup keenam HTML.

## Gerbang G01–G16

| Gerbang | Status |
| --- | --- |
| G01 | PASS |
| G02 | PASS |
| G03 | PASS |
| G04 | PASS |
| G05 | PASS |
| G06 | PASS |
| G07 | PASS |
| G08 | PASS |
| G09 | FAIL |
| G10 | PASS |
| G11 | PASS |
| G12 | BLOCKED |
| G13 | BLOCKED |
| G14 | BLOCKED |
| G15 | NOT_RUN |
| G16 | BLOCKED |

## Gerbang dokumen besar

| Gerbang | Status | Bukti dan batas |
| --- | --- | --- |
| U01 | FAIL | Satu panggilan cetak untuk novel gagal menyimpan PDF. Perakitan 28 kelompok dapat menyelesaikan berkas di luar tombol standar. Empat bentuk sintetis, variasi daftar isi dan dokumen pemilik dinilai terpisah. Hasil cetak langsung, penyimpanan bertahap dan HTML mandiri tercatat per rute. Identitas revisi dari tangkapan layar tetap tidak terverifikasi. |
| U02 | FAIL | Pengujian watchdog terkontrol dan pembatalan 11 tahap di studio terekam. Sebagian persiapan DOM serta serialisasi berjalan sinkron. Batas waktu pemulihan selama bagian sinkron dan siklus background/foreground untuk semua perangkat belum dibuktikan. |
| U03 | FAIL | Kontrol 14/28 serta browser Paged.js dengan 0/1/6 repair dan TOC hidup/mati lulus. Durasi tersedia per putaran dan beberapa fase kumulatif. Durasi terpisah untuk setiap fase di setiap percobaan yang dibuang belum lengkap. |
| U04 | FAIL | Penggabungan 28 kelompok menghasilkan buku aktual dengan 31 tautan dan 19 penanda daftar terverifikasi. Font Type 3 dan fallback ikut tercatat pada naskah asli. Penyimpanan satu operasi gagal. PDF fisik dari Paged.js untuk tiap bentuk disimpan dan dibuka ulang. Hasil novel serta normalisasi dicatat secara terpisah. Pemeriksaan dialog sistem tetap berada di G13. |
| U05 | PASS | HTML produksi dibuka luring di Chromium. Seluruh urutan kata dan struktur tabel dibandingkan dengan sumber. Navigasi, seleksi, aset dan contoh trigonometri memiliki pemeriksaan terpisah. |
| U06 | PASS | Satu kontrol valid serta enam kontradiksi kapasitas diperiksa. Uji keputusan G10 mengikat ulang bukti yang dimutasi dan mencapai validator detail. |
| U07 | PASS | Pemeriksaan A dan B dijalankan berselang serta serentak, termasuk setelah 160 kunci referensi. Enam perubahan rumus berjumlah tetap ditolak pada string dan dua bentuk DOM. |
| U08 | PASS | Daftar terbalik dengan dan tanpa nilai awal, nomor eksplisit, nested dan wrapper matematika ditelusuri dari HTML. Penyalinan dengan keyboard pada Chromium Linux dan PDF marker menghasilkan 7, 4, 3 serta 2, 1. |

## Performa terhadap RC6

Ambang setiap metrik adalah median ≤1,05× dan p95 ≤1,10× atas RC6. Pengukuran mentah mencakup warmup, AB/BA dan percobaan gagal. Tidak ada penyisihan outlier.

| Cohort | Status | Observasi termasuk warmup | Metrik yang melampaui ambang |
| --- | --- | ---: | --- |
| node-1.json | FAIL | 328 | small-edit/printPayloadMs (0.851× / 1.323×) |
| node-2.json | FAIL | 328 | trigonometry/printPayloadMs (1.065× / 0.865×), small-edit/htmlExportMs (0.728× / 1.468×), empty-core/refreshMs (0.778× / 1.108×) |
| recovery-cohort-1.json | FAIL | 300 | trig/htmlExportMs (0.981× / 1.318×) |
| recovery-cohort-2.json | PASS | 300 | Lihat status dan insiden mentah |

Ledger A01–A09, RC8-01–RC8-09, status dan pemetaan gerbang terdapat pada evidence/rc9/LEDGER.json. Matriks format dan mesin tersedia di COMPATIBILITY_RC9.md. Jalur GitHub, Cloudflare Pages dan rollback dijelaskan di README_MULAI_DI_SINI.md.

