# Bukti audit RC6

Lihat `final-validation.json` untuk hasil dan identitas build. Semua hasil baru adalah source Node/jsdom, ekspor API dengan font nyata, build statis dan HTTP lokal. Browser visual, paginasi, clipboard sistem, PDF native dan deployment aktif RC6 belum diverifikasi.

`baseline-probe.json`, `baseline-tests.log` dan `independent-inventory.json` mereproduksi bug pada ZIP RC5 yang diunggah. `rc6-independent-oracle.json` membandingkan semua 231 rumus pada sumber asli, termasuk provenance, mode, urutan dan mutasi yang sengaja dibuat. `fixtures/rc6/user-trigonometry.expected.json` adalah oracle yang tidak berasal dari scanner aplikasi.

Log `final-*` hanya memuat pengujian akhir. Hasil percobaan perantara tidak diklaim sebagai kelulusan rilis. Bukti historis di `evidence/rc5` tidak diwariskan ke RC6. Hasil verifikasi ZIP final dan SHA-256 ZIP diserahkan terpisah karena arsip tidak dapat memuat digest dirinya sendiri.
