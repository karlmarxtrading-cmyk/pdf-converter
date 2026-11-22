# Penerimaan lokal dokumen besar

Jalankan perintah dari direktori yang memuat package.json. Simpan alat verifikasi Node sesuai .node-version, Chromium, Pandoc, Python dengan lxml dan PyMuPDF, serta Poppler (pdfinfo, pdftotext). Semua laporan menggunakan identitas hasil build produksi dan ID pada evidence/rc10/acceptance/start.json.

Setelah npm ci dan build produksi, jalankan node scripts/acceptance.mjs start satu kali pada kandidat bersih. Setiap percobaan memiliki nama tersendiri. Bentuk perintah observasi adalah node scripts/acceptance.mjs observe NAMA --out PATH [--out PATH] -- PROGRAM ARGUMEN. Direktori keluaran diperbolehkan. Simpan seluruh hasil pada lokasi bukti atau contoh RC10. Pengukur menautkan identitas sebelum dan sesudah proses, digest skrip, cap waktu, lingkungan, kode keluar, transkrip dan digest byte keluaran. Perintah yang hanya menyalin laporan historis tidak dapat menjadi produsen pengamatan U.

| Gate | Pernyataan yang diuji ulang | Bahan primer |
| --- | --- | --- |
| U01 | Tombol impor, unduhan HTML, hasil cetak buku, kecocokan dokumen yang dicetak, penyimpanan dan pembukaan PDF | Enam laporan book, berkas HTML dan PDF untuk lima bentuk publik |
| U02 | Respons saat sibuk, percobaan berikutnya, pembersihan, batas waktu dan pergantian visibilitas | lifecycle/cancel-stages.json, lifecycle/large-cancel.json untuk paragraphs-217850.md, lifecycle/client-timing.json |
| U03 | Kerja pada setiap attempt dan pass, 0/1/6 repair, terminasi, fase serta batas 14/28 panggilan | accounting/browser.json, accounting/control-flow.json |
| U04 | Urutan isi lengkap, sel, marker, akhir, ukuran halaman, glif, font, footer dan navigasi | Laporan dan PDF U01. Untuk bentuk publik verifier juga menjalankan ulang pembacaan fisik |
| U05 | HTML mandiri luring, struktur dan urutan sumber, rumus empat templat, navigasi dan seleksi | offline/navigation.json, browser/results/trigonometry-downloads.json, empat HTML trigonometri, lima HTML besar dan digest HTML novel |
| U06 | Validator kapasitas harus menerima kontrol valid dan menolak kontradiksi meski seluruh checksum dihitung ulang | accounting/capacity-validator-control.json dibuat oleh scripts/verify-capacity-control.mjs. Kontrol sintetis khusus U06 menguji validator dengan sembilan mutasi pada salinan data. G10 memerlukan pengukuran kapasitas produk |
| U07 | Urutan/mode/TeX A dan B sesudah interleaving dengan eviction dan 18 mutasi berjumlah rumus sama | integrity/interleaved.json |
| U08 | Nilai daftar pada jalur input dan paste, urutan fisik marker termasuk item kosong | ordered-lists/result.json, dua standalone HTML, dua payload HTML dan dua PDF |

Program scripts/record-large-gates.mjs mengumpulkan referensi observasi yang sukses, membuat facts dan menulis receipt per gate. Nama peran dan jalur di dalam program ini adalah kontrak yang dapat dijalankan. Jalankan dengan nol argumen untuk seluruh delapan gate, atau gunakan argumen seperti U05 U08. Untuk pemeriksaan yang terhambat keadaan eksternal tertentu, sertakan alasan spesifik dengan node scripts/acceptance.mjs record Uxx BLOCKED --reason "alasan". Laporan gagal dan parsial tetap berguna untuk diagnosis.

npm run test:acceptance menguji kontrol dan mutasi dengan data sintetis terisolasi. npm run verify:release menilai 24 gate dan menyimpan alasan per gate di evidence/rc10/acceptance/all-gates.json. Kode keluar 1 dan NO_GO menandakan ada kriteria yang masih terbuka. Build produksi Cloudflare memakai evaluasi yang sama. PDF dan sumber novel pribadi dijaga di luar distribusi. Untuk bukti tersebut paket memuat sidik jari, ukuran dan ukuran hasil pemeriksaan oleh proses penerimaan kandidat. Pemeriksaan independen ulang yang memerlukan berkas pribadi dilakukan dengan memasok naskah asli ke pengukur pada lingkungan pemiliknya.
