# PaperForma 3.0.0-rc.9

Website statis untuk mengubah Markdown, teks, dan HTML clipboard menjadi HTML mandiri atau dokumen cetak. Seluruh pemrosesan dokumen berjalan di browser. Buka halaman aplikasi melalui HTTP lokal atau HTTPS. Berkas HTML hasil ekspor dapat dibuka langsung.

## Menjalankan aplikasi

Gunakan Node 24.22.3 dan npm 11. Dari direktori yang memuat package.json jalankan perintah berikut.

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run test:acceptance
npm run build:pages
npm run verify:http -- --local
npm run preview
```

Buka http://127.0.0.1:4173. Impor Markdown, periksa pratinjau dan pilih **Ekspor**. Untuk PDF, periksa nomor halaman serta status verifikasi, lalu gunakan tombol pembuka dialog cetak. Untuk menyimpan semua sumber asli dan setelan, pilih cadangan proyek .pfproj.

## Folder dan keputusan rilis

Source ada di src, aset lokal di public, output Pages di dist. Pengujian tersedia di tests, sumber uji di fixtures, contoh ekspor di examples/rc9 dan bukti di evidence/rc9. Bukti dengan nomor rilis sebelumnya adalah riwayat. Calon penerbit dapat mengecek checksum dengan `sha256sum -c SHA256SUMS`. Untuk membangun ulang dan membandingkan setiap byte dari ekstraksi sementara gunakan `python scripts/verify-archive.py /path/paket.zip`. Batas dokumen besar ada di docs/KONTRAK_DOKUMEN_BESAR_RC9.md.

Status pengukuran dan keputusan akhir dicatat dalam evidence/rc9/LEDGER.json. Jika berkas itu belum tersedia, paket adalah salinan pemulihan dan pengukuran masih berlangsung. Sumber asli dan PDF novel pribadi berada di luar ZIP website.

## GitHub dan Cloudflare Pages

Repo yang digunakan pemilik adalah karlmarxtrading-cmyk/performa. Akar build adalah direktori package.json. Perintah build Pages adalah npm run build:pages dan direktori output adalah dist. Samakan runtime dengan .node-version dan cabang produksi dengan PAPERFORMA_PRODUCTION_BRANCH (default main). Simpan source serta lockfile. Jangan menempatkan arsip pengiriman, naskah, .pfproj pribadi atau ekspor novel ke repo publik. Hanya isi dist disajikan oleh Pages.

Setelah ada otorisasi untuk tahap hosting, unggah kandidat ke cabang preview di proyek Pages yang sudah terhubung. Pada URL preview uji identitas file, MIME, header, worker, font, halaman print serta ekspor. G15 memerlukan bukti pada URL kandidat itu. Untuk G16 identifikasi deployment baik yang tercatat, uji rollback sesuai izin dan simpan bukti identitas hasil pemulihan. Promosi produksi memerlukan semua gate G dan U. Periksa kembali ekspor di URL produksi sesudah promosi.

Untuk rollback lokal, ekstrak ZIP versi yang telah diverifikasi ke direktori terpisah, periksa SHA256SUMS, jalankan build dan pemeriksaan HTTP lokal. Simpan cadangan .pfproj dari naskah terlebih dahulu. Pada Pages gunakan deployment baik yang identitasnya sudah diketahui pemilik dan periksa ulang hash dist serta hasil ekspor setelah pemulihan.

### Menyiapkan folder di Git Bash

Ekstrak ZIP ke folder kosong. Buka Git Bash pada folder yang memuat package.json, lalu jalankan pemeriksaan lokal.

```bash
sha256sum -c SHA256SUMS
npm ci
npm run build:pages
npm run verify:http -- --local
npm run preview
```

Untuk promosi setelah mendapat izin, buka proyek Pages yang terhubung dengan repo di atas. Atur root ke direktori package.json, perintah build ke `npm run build:pages` dan output ke `dist`. Tinjau konfigurasi cabang produksi dan hasil G01–G16 serta U01–U08 sebelum mengubah cabang itu. Rincian resmi tersedia pada [konfigurasi build Cloudflare Pages](https://developers.cloudflare.com/pages/configuration/build-configuration/).

Pada latihan rollback hosting, simpan ID deployment produksi sebelumnya yang berhasil, masih tersedia, dan telah diuji. Gunakan menu rollback pada deployment tersebut, lalu cocokkan identitas aset, font, jalur cetak dan ekspor aktual di alamat produksi. Rincian resmi tersedia pada [rollback Cloudflare Pages](https://developers.cloudflare.com/pages/configuration/rollbacks/).
