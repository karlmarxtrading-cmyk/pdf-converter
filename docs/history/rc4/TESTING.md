# Pengujian PaperForma 3.0.0-rc.4

## Prinsip bukti

`candidateSha256` meliputi sumber, konfigurasi, lockfile, public, skrip, tes dan fixture. `docs/` dan laporan tidak masuk hash kandidat; seluruh file paket tetap mendapat checksum. Hasil browser RC3 dipisahkan di `evidence/history/rc3`. Jangan mengganti label NOT_RUN dengan PASS hanya karena kode sudah diperbaiki.

## Perintah

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run build:qa
npm run verify:static
npm run test:gate
npm run scan:secrets
npm run verify:http -- --local
```

`npm test` menjalankan Vitest dan tes Node untuk oracle PDF, result gate dan server. Tes Node/jsdom tidak mengukur CSS layout browser. Gate rilis memiliki kontrol bersih dan 12 mutasi yang wajib ditolak. Log final dan metadata aktual ada di `evidence/audit-rc4` serta `RELEASE_REPORT.md`.

Browser nyata dibutuhkan untuk:

```bash
npm run test:e2e
npm run test:smoke
npm run test:pdf
npm run test:browsers
npm run test:perf
npm run verify:deployment -- https://URL-PREVIEW.pages.dev
```

`PF_CHROME`/`CHROME_PATH` dapat menunjuk executable Chromium/Chrome/Edge. Windows, macOS dan Linux memiliki deteksi lokasi umum. Firefox/WebKit membutuhkan binary/driver yang dijelaskan dalam skrip. Browser tidak tersedia dan error peluncuran harus menghasilkan kegagalan/NOT_RUN, tidak dihitung lulus. qpdf dan Poppler diperlukan untuk cakupan PDF penuh; fallback pypdf diberi label cakupan terpisah.

## Regresi yang wajib dipertahankan

- Trigonometri: 21 formula dalam Markdown dan HTML clipboard, caption/colspan, formula terpisah markup, link label, display di sel/emphasis, matriks dan garis vertikal; kode/mata uang dan sumber tetap sama.
- Admission: HTML bersarang ekstrem ditolak sebelum rekursi konversi; inline raster bertanda dimensi ekstrem, MIME salah, dimensi nol, ukuran base64 berlebih, agregat 200 MP lintas pesan/aset; tanpa dekode raster berbahaya pada tes.
- Aset: pindah proyek atau membuka ulang proyek saat impor berjalan, batch paralel, penggantian path yang sama, dua alias byte identik, undo ditolak tanpa menghabiskan stack, riwayat rusak dan batas piksel proyek.
- Ekspor: font gagal/macet/batal, font BrandKit dan KaTeX, kode berubah indentasi, fragmen tautan malformed; tidak ada unduhan final pada error blocking.
- Worker: abort listener dilepas, hasil worker lama diabaikan, dispose membatalkan fallback, postMessage gagal dibersihkan, late cancellation tidak membesar tanpa batas.
- Bukti rilis: formula yang benar tetapi versi lama/null harus gagal; page error harus gagal; suite browser kurang satu engine tidak boleh lulus; paginasi/PDF gagal tidak boleh keluar dengan status sukses.

## Corpus dan contoh yang disediakan

`fixtures/trigonometry/expected.json` memuat TeX/mode yang diharapkan. `tests/unit/render/trigonometry-export.test.ts` memakai font nyata dan API ekspor/payload. Untuk menghasilkan ulang contoh:

```bash
PF_EXAMPLE_DIR=examples npx vitest run tests/unit/render/trigonometry-export.test.ts
```

Pada PowerShell, set `$env:PF_EXAMPLE_DIR='examples'` dahulu. File contoh adalah output API aktual; belum ada klaim bahwa tampilannya sudah diverifikasi pada seluruh browser.

## Pemeriksaan manual sebelum produksi

1. Buka fixture trigonometri dan Einstein melalui Buka berkas. Uji pula tempelan nyata HTML/plain dari ChatGPT dan editor teks.
2. Pastikan tidak ada `\(`, `\[`, `\frac` yang tampil mentah di luar contoh kode; jumlah, mode, nilai formula benar. Mata uang dan kode tidak berubah menjadi matematika.
3. Buka fixture mixed-document: periksa tabel 70 baris, kode berindentasi, tautan, judul dan font. Uji dokumen tanpa metadata sampul, tabel lebar A5/landscape dan label kolom kunci.
4. Ekspor HTML mandiri, putuskan jaringan, buka hasil; font/gambar/tabel harus tetap ada. Periksa keutuhan dengan sumber.
5. Siapkan halaman cetak. Pilih Simpan sebagai PDF pada dialog native; kertas sama, skala 100%, header/footer browser mati, background aktif. Verifikasi jumlah halaman, pencarian teks, nomor halaman, tautan, TOC, gambar, kode dan akhir dokumen.
6. Uji Batal/ulangi, font lambat/gagal, edit saat analisis, penyimpanan dua tab, cadangan/impor origin kedua. Catat hasil dan kegagalan aktual.
7. Ulangi pada browser/perangkat yang didukung termasuk keyboard virtual dan pembaca layar. Bukti perangkat nyata tidak dapat diganti viewport emulator saja.

## Normalisasi yang dibolehkan

Paginasi boleh memecah baris/halaman dan mengulang header tabel yang ditandai. Teks prosa dinormalisasi untuk perubahan presentasi yang terdokumentasi; kode tetap dibandingkan termasuk spasi/indentasi menggunakan penanda per baris. Jumlah/urutan blok, angka, formula, tautan dan gambar tetap diuji.

Oracle PDF mengambil fragmen prosa di sekitar math/gambar serta caption, memerlukan urutan yang benar, dan tidak menghilangkan tanda minus hanya agar angka cocok. Karakter tanpa glyph hanya dikecualikan bila caller memberi keputusan eksplisit. Font Type 3 atau anotasi/gambar hilang tidak mendapat kelulusan umum. Validasi PDF ini lebih ketat daripada oracle historis.
