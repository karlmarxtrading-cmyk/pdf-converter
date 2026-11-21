# Pemulihan

| Situasi | Yang terjadi / tindakan |
|---|---|
| Penyimpanan otomatis mati (bawaan) | Status “Belum disimpan” selalu terlihat (juga di 360 px). Tutup/muat ulang halaman memicu peringatan browser. Gunakan **Simpan paket kerja (.pfproj)**. |
| Simpan gagal / kuota penuh / diblokir / tidak tersedia | Status merah + pemberitahuan dengan aksi cadangan. Isi tetap di halaman; tidak pernah ditandai tersimpan. |
| Proyek diubah di dua tab | Status “Konflik dua tab”; kedua versi dipertahankan di IndexedDB (salinan konflik). Simpan paket kerja. |
| Proyek dihapus dari tab lain | Status “Dihapus di tab lain”; perubahan tab ini tidak ditulis ulang diam-diam. |
| Salah edit / salah format | **Urungkan/Ulangi** mencakup sumber, pengaturan, templat, brand kit, percakapan dan aset (transaksi proyek). |
| Perlu versi lama | Lainnya → Riwayat revisi: semua revisi tersimpan dapat dijelajah dan dipulihkan sebagai revisi baru. Revisi dari RC3 hanya memuat teks dan diberi label “hanya teks”. |
| Input asli diperlukan | Lainnya → Lihat sumber mentah (input asli tidak pernah ditimpa normalisasi/Undo; dapat diunduh sebagai teks). |
| Ekspor gagal / diblokir / dibatalkan | Hasil terminal ditampilkan di dalam dialog dengan daftar masalah, “Buka pemeriksaan” dan “Coba lagi” (memakai revisi terbaru). |
| Dialog cetak ditutup tanpa menyimpan | Halaman cetak tetap disiapkan; tekan “Cetak lagi”. |
| Membuka proyek lain saat ada perubahan belum tersimpan | Pilihan: simpan paket dulu / lanjut tanpa menyimpan / batal. Urungkan juga dapat kembali ke proyek sebelumnya selama halaman terbuka. |
| Draf PaperForma 1.0 ditemukan | Ditawarkan untuk dibuka sebagai proyek baru; draf asli tidak diubah. |
| Deploy bermasalah | Rollback di Cloudflare Pages (docs/DEPLOYMENT.md §7). |
