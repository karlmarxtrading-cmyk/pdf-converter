# Matriks dukungan PaperForma RC11

Setiap baris menunjukkan cakupan yang dinilai untuk paket 3.0.0-rc.11. Hasil kandidat aktual, hash build dan alasan untuk setiap gate ada di [keputusan penerimaan](../evidence/rc11/acceptance/all-gates.json).

| Masukan dan hasil yang diperiksa | Lingkungan / metode | Bukti yang diperlukan |
| --- | --- | --- |
| Markdown GFM, teks, tabel, daftar, kode, catatan kaki, tautan, aset setempat dan matematika inline/display | Unit parser/serializer, empat template dan Chromium Linux | G02–G08 |
| HTML mentah dan clipboard HTML/plain, posisi sel, prosa serta sumber TeX | Regresi clipboard pada dokumen yang dilabeli sintetis, kemudian provider asli di Windows | G03–G06, G12, U07, U08 |
| HTML mandiri, font lokal, pemuatan ulang secara luring dan navigasi | Unduhan Chromium dan pembacaan kembali dari berkas | G03, U05 |
| Cetak standar, glif, kode multihalaman, margin, keluaran fisik PDF | Matriks otomatis dan PDF hasil Save dari dialog OS | G07, G08, G13 |
| Buku panjang dengan tabel, heading, paragraf dan paragraf tunggal | Lima bentuk publik dari fixture 217.850 kata beserta kontrol privat dengan hash tetap | U01, U04, U05 |
| Pembatalan, percobaan ulang dan respons editor | Studio nyata di Chromium, event loop dan heap sesudah pembatalan | G10, U02, U03 |
| Marker per item dan bertingkat, daftar terbalik, mulai dan nilai item | Clipboard/raw HTML, struktur unduhan, payload dan teks PDF | U08 dan regresi A05 |
| Izin sumber daya eksternal dan impor proyek | Uji grant/revoke, import, render SVG serta intersepsi permintaan browser | A03, A04 |
| Batas muatan cetak UTF-8 45 MiB | Jalur standar dan buku, di bawah, tepat dan di atas batas | A06 |
| Clipboard penyedia AI, dialog simpan sistem, pembaca layar | Windows sasaran, pengguna dan perangkat bantu yang didokumentasikan | G12–G14 |
| Aset, MIME, CSP/cache, ekspor pada HTTPS dan rollback hosting | Preview Pages yang diidentifikasi per deployment dan operasi hosting terotorisasi | G15, G16 |

Bukti terikat pada fixture, versi aplikasi, browser, sistem dan prosedur yang dicatat. Untuk melihat perbedaan antara hasil RC11 dan pengukuran RC10, baca [laporan RC11](RELEASE_REPORT.md) dan [matriks historis RC10](COMPATIBILITY_RC10.md).
