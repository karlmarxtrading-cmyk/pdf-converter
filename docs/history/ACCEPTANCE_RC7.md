# Kriteria penerimaan RC7

| Kebutuhan | Bukti yang harus dilihat |
|---|---|
| Baseline benar | Checksum ZIP dan HTML asli pengguna, 550 checksum internal serta identitas source/dist RC6 di `evidence/rc7/` |
| Keutuhan materi | `scripts/verify-trigonometry.py`, oracle RC6 dan berkas ekspor. Urutan TeX asli/kanonik, mode, anotasi, isi artikel dan tujuan tautan harus cocok. |
| Pemulihan dapat ditinjau | 17 perbedaan `raw` → `expected` dalam fixture; sumber asli tersedia dan kategori matematika tetap meminta tinjauan |
| CSS, font dan aset | Aturan KaTeX penting dan versi, byte WOFF2 valid, penolakan font terpotong, decode font, gambar/alt/title serta tautan pada keluaran |
| HTML aman dan terurut | Bukti per mutasi di `evidence/rc7/raw-integrity-candidate.json` dan kontrol utuh; fragmen di luar cakupan ditandai |
| Editor dan pemulihan | Pembatalan ZIP, pergantian proyek, judul dan percobaan ulang; regresi penyimpanan dan aset |
| Browser produksi | Pindah dari kontrol impor → pratinjau → unduhan, periksa byte unduhan, browser dan metode pembukaan aktual |
| PDF | Pisahkan payload, verifikasi halaman, perintah cetak dan PDF yang benar-benar tersimpan. Periksa halaman pertama/akhir, teks, font, tautan dan ukuran media pada file. |
| Performa | Input/template/cache sama; sampel singkat berpasangan, median/p95, pengulangan dan penjelasan hasil yang melampaui batas |
| Paket siap dicoba | Build produksi tanpa kait QA, HTTP, checksum serta build identik dari ZIP. Pengesahan produksi mengikuti hasil browser, cetak dan performa. |

Status aktual dan batas setiap pemeriksaan tercatat di [laporan RC7](RELEASE_REPORT.md). Bukti berlabel RC5 dan RC6 merupakan riwayat versi tersebut.
