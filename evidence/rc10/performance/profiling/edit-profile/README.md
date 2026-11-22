# Profil pratinjau ketika dokumen berubah

Kandidat pertama gagal pada p95 refresh setelah edit kecil di kedua kohort Node. Pengukuran tambahan memisahkan waktu snapshot, analisis, finishRender, validasi, prepareBody dan komposisi. Pada 40 edit kandidat pertama, median/p95 analisis 4,3/10,8 ms dan finishRender 6,1/10,8 ms.

Perubahan pertama pada B membekukan konfigurasi prosesor HTML yang sama dan mengklon cabang DOM formula berulang yang sudah diparse pada pekerjaan yang sama. Perubahan berikutnya memakai kembali string kompilasi KaTeX yang identik hanya untuk dua revisi berurutan dari satu proyek. Cache antarrevisi dibatasi 32 entri dan 65.536 unit UTF-16. Lintasan yang bersamaan dan pergantian proyek menginvalidasi penyimpanan sebelumnya. Dokumen kecil dapat diparse kembali tanpa mencatat perubahan DOM setiap kali pengguna mengetik.

Berkas yang namanya dimulai dengan `b1-` merekam uji perantara sebelum dua perubahan terakhir. Semua 40 pasangan dan pemanasannya tersimpan, termasuk sampel lambat. Pada pilot akhir, p95 small-edit refresh RC6/B 19,31/21,85 ms dan rasio 1,131 melebihi ambang 1,10. Rasio p95 ekspor HTML dan persiapan cetak 0,902 dan 0,856. Seluruh proyeksi keluaran pada 82 lengan pengukuran akhir cocok. Keputusan G09 memakai empat kohort resmi setelah freeze.
