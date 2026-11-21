# Korpus awal untuk pengembangan

Ada 16 fixture teks/clipboard serta 3 gambar sintetis. Ini **input uji**, bukan hasil website yang telah lulus. Semua status INPUT_READY_RENDER_NOT_RUN.

Gunakan MANIFEST_KORPUS.json untuk hash, tujuan, dan pemetaan ke matriks penerimaan. Pasangan pengganti_A/chart.png dan pengganti_B/chart.png adalah PNG valid berukuran byte sama tetapi isi berbeda, untuk regresi cache gambar.

Fixture 08 adalah clipboard sintetis, bukan bukti kompatibilitas live ChatGPT/Claude/Gemini. Tambahkan capture nyata yang diizinkan sebelum mengiklankan adapter provider. File 15 berisi contoh markup yang harus diperlakukan sebagai data saat diimpor; jangan menjalankan kodenya.

Untuk 10/50/200 halaman, gunakan generator stress di folder skrip dengan jumlah bagian yang sesuai, lalu ukur jumlah halaman aktual setelah pagination. Banyaknya bagian bukan jaminan jumlah halaman. Golden output harus dihasilkan mesin yang diuji dan ditinjau, bukan dibuat sekadar agar implementasi lulus.
