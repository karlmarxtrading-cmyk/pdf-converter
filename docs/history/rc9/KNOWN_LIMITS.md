# Batas dukungan PaperForma RC8

| Kasus | Perilaku dan pemulihan |
|---|---|
| Berkas HTML | Studio mengimpor isi badan dokumen UTF-8 melalui tinjauan. Metadata halaman, stylesheet asli dan konten aktif berada di salinan sumber. Tata letak mengikuti template PaperForma. |
| Matematika | Parser mendukung sintaks dalam matriks kompatibilitas. Rumus ambigu atau gagal mempunyai lokasi dan sumber yang dapat ditinjau. Salinan sebelum dan sesudah pemulihan dapat diperiksa. |
| Tabel dan kode | Pelestarian struktur dan spasi diuji pada fixture yang dirujuk. Tampilan lebar bergantung pada kertas dan skala. |
| Karakter privat | Kode Unicode privat hanya bermakna dengan font atau pemetaan pembuatnya. Jalur cetak membatasi keluaran yang tidak dapat dipertanggungjawabkan. Gunakan panel sumber untuk mencari lokasi atau menyimpan naskah asli. |
| Emoji dan bahasa | Ketersediaan glif mengikuti font, rangkaian karakter dan browser. Contoh positif untuk satu emoji, alfabet atau perangkat hanya berlaku untuk yang diperiksa. |
| Gambar dan diagram | Aset yang diizinkan dapat disematkan. Diagram Mermaid yang gagal dikonversi menampilkan sumber beserta keterangan. |
| Masukan besar | Batas byte, pohon, tabel, gambar dan proyek diperiksa terpisah. Kapasitas serta waktu tunggu yang diukur tersedia di laporan. Jumlah halaman bergantung pada naskah dan pengaturan. |
| Platform dan PDF | PDF otomatis, dialog Simpan native, WebKit Linux, Safari Apple dan browser Windows memiliki catatan penerimaan terpisah. |
| Penyimpanan | Cadangan .pfproj membawa sumber dan aset. IndexedDB berlaku untuk origin dan profil browser yang menyimpannya. |

Lihat [hasil pengujian dan status rilis](RELEASE_REPORT.md) serta [matriks format](COMPATIBILITY_RC8.md). Pemeriksaan integritas memastikan isi menurut kontrak format. Kebenaran akademis suatu pernyataan atau rumus tetap mengikuti sumber penulis.
