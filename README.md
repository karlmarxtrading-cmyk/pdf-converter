# PaperForma 3.0.0-rc.5

Studio dokumen statis untuk menyiapkan materi, memeriksa rumus dan mengunduh HTML mandiri atau mencetak PDF. Seluruh isi naskah diproses di perangkat pengguna. Pilih **Buka berkas** untuk Markdown, teks UTF-8, paket proyek atau arsip naskah dengan gambar. Gunakan **Tempel** untuk materi percakapan dan HTML clipboard. Periksa pratinjau dan panel temuan sebelum mengekspor.

**Kandidat untuk staging.** [Keputusan rilis dan gate A–H](docs/RELEASE_REPORT.md) merinci apa yang telah dibuktikan dari paket ini. Buka [contoh trigonometri mandiri](examples/TRIGONOMETRI_markdown.html) untuk melihat hasil 21 rumus, atau buka sumbernya di aplikasi dari `fixtures/trigonometry/trigonometry.md`. Contoh PDF dan pemeriksaan halaman tersedia di `evidence/rc5/pdf/`.

## Ekstrak dan jalankan

Ekstrak ZIP ke folder kosong. Di root folder terdapat `package.json`, `src/` dan `dist/`. Pakai Node **24.22.3** dan npm **11.6.0 hingga sebelum 12**. Di Git Bash, PowerShell, macOS atau Linux, jalankan:

```sh
npm ci
npm run build
npm run preview
```

Buka `http://127.0.0.1:4173/`. Untuk menguji hasil ZIP tanpa menginstal dependensi proyek, jalankan `node scripts/serve-dist.mjs dist 4173` jika Node sudah terpasang. Halaman aplikasi memerlukan HTTP(S). HTML mandiri hasil ekspor membawa font dan gambar lokal di dalam satu berkas.

## GitHub dan Cloudflare Pages

Masukkan isi folder hasil ekstraksi ke **root checkout**. Langkah Windows untuk membuat branch preview, memeriksa perubahan dan rollback ada di [panduan deploy](docs/DEPLOY_CLOUDFLARE.md). Cloudflare Pages menggunakan `npm run build`, output `dist`, dan variabel `NODE_VERSION=24.22.3`. Folder `dist/` yang disertakan berguna untuk membandingkan hasil build atau mencoba situs secara lokal. Pada alur Git, Pages membangunnya kembali. Hanya isi `dist/` yang disajikan kepada pengunjung.

## Verifikasi

```sh
npm run typecheck
npm run lint
npm test
npm run verify:http -- --local
```

`SHA256SUMS` mencatat semua berkas lain dalam ZIP. Dengan Python 3.11+ dan Node/npm yang sesuai, perintah berikut mengekstrak arsip yang dipilih ke folder bersih, memeriksa seluruh checksum, menginstal dependensi, menjalankan tes, lalu membandingkan setiap byte hasil build.

```sh
python scripts/verify-archive.py ../PAPERFORMA_STATIC_3.0.0-rc.5.zip
```

## Format dan penyimpanan

Markdown/GFM, TeX KaTeX, HTML clipboard yang disanitasi, gambar lokal dan proyek `.pfproj` memiliki jalur impor tersendiri. HTML yang sudah dirender memerlukan anotasi TeX untuk memulihkan rumus secara persis. Label widget yang tersalin tetap menjadi teks. PDF, DOCX dan OCR sebagai input berada di luar cakupan. Pada alur cetak, PaperForma menyiapkan halaman, lalu pengguna memilih tujuan **Simpan sebagai PDF** pada dialog browser. Untuk pindah domain atau perangkat, unduh cadangan `.pfproj` terlebih dahulu.

- [Batas dukungan](docs/KNOWN_LIMITS.md)
- [Performa dan data sampel](docs/PERFORMANCE_REPORT.md)
- [Pengujian dan reproduksi](docs/TESTING.md)
- [Pemulihan data](docs/RECOVERY.md)
