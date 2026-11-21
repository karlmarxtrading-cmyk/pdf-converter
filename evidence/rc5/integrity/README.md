# Integritas proyek, impor, dan gambar cetak

Pemeriksaan pada 21 November 2026 menggunakan Node 24.22.3, npm 11.19.1, Vitest, jsdom dan fake-indexeddb. Objeknya adalah source kandidat RC5. Uji regresi pembanding memakai source RC4 dari ZIP dengan SHA-256 `3b8c833b720c799664d03c4c293bf9645d2a5cc63c3ccd46ba340c6435870074`.

## Penyimpanan

| Kasus | Hasil RC4 | Hasil RC5 |
|---|---|---|
| Penghapusan diblokir ketika revisi baru menunggu autosave | Penyimpanan masih berisi revisi lama | Revisi baru sudah tersimpan ketika penghapusan ditolak |
| Hapus proyek tersimpan yang masih terbuka | Status autosave kembali ke idle dan tanda simpan lama masih tersedia | Penghapusan membatalkan tanda simpan perangkat. Sumber tetap terbuka dan dapat dicadangkan |
| Ganti judul sebelum memasukkan isi | Penjaga keluar melewatkan draf yang hanya memiliki pengaturan | Penjaga aktif hingga revisi tersimpan. Penjaga kembali aktif sesudah draf dihapus |

Tiga regresi di atas gagal pada kontrol RC4. Berkas `baseline-regressions.json` menyimpan perbedaan nilai aktual. Pada kandidat, 62 pengujian inti, penyimpanan, impor dan antarmuka yang dipilih lulus. Daftar lengkapnya ada di `defensive-tests.json`. Tes antarmuka menggunakan elemen dari `index.html`, handler dari `src/ui/main.ts`, IndexedDB simulasi dan dialog simulasi. Hasil tersebut tidak mengukur dialog native atau kuota aktual perangkat.

Saat proyek dibuka kembali, UI mengosongkan tanda simpan yang berasal dari sesi proyek sebelumnya. Pembacaan proyek dan pemulihan draf lama memeriksa kepemilikan proyek sesudah operasi asinkron. Saat pengguna menghapus seluruh data, UI mematikan simpan otomatis dan menjelaskan bahwa permintaan IndexedDB yang diblokir masih dapat selesai ketika tab lain ditutup.

## Gambar dan anggaran impor

Saat persiapan cetak, HTML dimasukkan dahulu ke elemen template inert. Kandidat meminta dekode sekali per URL gambar unik, dengan maksimal dua permintaan eksplisit berjalan sekaligus. Kegagalan, pembatalan, dan tenggat menghentikan antrean. Aplikasi memeriksa dimensi yang dilaporkan browser dan jumlah piksel unik sebelum melanjutkan ke paginasi. Batas per sisi 16.384 piksel, per gambar 40 juta piksel dan per dokumen 200 juta piksel. Total sebuah animasi, permintaan internal browser dan penggunaan RAM aktual dapat berbeda dari hitungan dimensi intrinsik.

Keempat tes pada `print-image-admission.json` memeriksa batas konkurensi dua, deduplikasi, pembatalan, kegagalan, timeout dan batas dimensi dengan dekoder terkontrol. Tidak ada gambar raksasa yang didekode dalam tes tersebut. Batas ini berlaku pada tahap persiapan cetak. Pemrosesan halaman akhir tetap dijalankan oleh mesin layout dan cetak browser.

Pembacaan kode meliputi validasi input UTF-8 dan anggaran dokumen, impor ZIP dengan CRC dan pembatas ukuran hasil ekstraksi, validasi hash proyek/aset, kebijakan URL serta allowlist sanitasi dan CSP. Sumber mentah dan hasil siap tampil diproses secara terpisah. Korpus regresi lama mencakup ZIP tidak sesuai batas, aset tidak valid, transaksi lintas tab, penyimpanan penuh, hash yang tidak cocok, perubahan nama/path yang bersaing dan pemulihan riwayat. Uji ini memeriksa perilaku yang ditentukan untuk kasus-kasus tersebut. Pemeriksaan tidak mencakup audit manual setiap baris dependensi atau semua format yang dapat didekode browser.

## Dependensi dan distribusi

`npm audit --json` mengembalikan nol advisory pada pemeriksaan tanggal tersebut. Respons asli ada di `npm-audit.json`. SBOM sesuai dengan lockfile yang dipaketkan. Terdapat 438 entri dependensi dengan SHA-512, 255 komponen runtime memiliki bagian pemberitahuan dalam distribusi, dan SBOM tidak memuat lisensi berlabel UNKNOWN. Hash lockfile, SBOM, dan pemberitahuan tersimpan dalam `lock-notices.json`. Daftar advisory dapat berubah setelah tanggal uji.

Jalankan dari root repositori untuk mengulang:

```bash
npm ci
npm test
npm run build
npm run scan:secrets
npm audit --json
```

Pemindaian pola rahasia proyek memeriksa file teks di bawah 8.000.000 byte pada source/build; folder node_modules, .git, fixtures, evidence dan format biner yang tercantum di skrip tidak dipindai. Skrip mencatat nama file dan kategori temuan. Pemeriksaan checksum kandidat akhir dan hasil pemindaian aktual tercantum pada bukti rilis.
