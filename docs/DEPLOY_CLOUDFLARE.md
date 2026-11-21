# Deploy PaperForma 3.0.0-rc.4 ke Cloudflare Pages

## Keputusan dan susunan folder

Paket dapat dimasukkan ke repository dan dibangun sebagai situs statis. Rilis publik tetap memerlukan pemeriksaan browser/PDF dan URL Cloudflare nyata. Audit ini tidak mengubah repo GitHub atau akun Cloudflare Anda.

Ekstrak ZIP. Salin **isi `repository/`** ke root checkout repo; `package.json`, `package-lock.json`, `index.html`, `src/` dan `public/` harus sejajar di root. Jangan menimpa atau menghapus `.git` dari checkout yang sudah ada. `dist/` dalam ZIP adalah hasil pembanding; `.gitignore` mengecualikannya karena Pages membangun ulang dari sumber.

## Verifikasi lokal sebelum push

Node 24.22.3 dan npm >=11.6.0 <12 diperlukan. Audit menggunakan npm 11.19.1. Bila muncul EBADENGINE, perbaiki versi Node melalui installer/manajer versi yang benar-benar terpasang. Perintah `nvm` hanya bekerja bila NVM sudah dipasang; jangan menghapus aturan engines.

```bash
node -v
npm -v
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run verify:http -- --local
```

`npm ci` memakai lockfile; peringatan deprecated tidak sama dengan kerentanan yang terkonfirmasi. Peringatan kebijakan install scripts harus dibaca; jangan menyetujui semua skrip secara otomatis. `npm audit` pada lingkungan lain/tanggal lain dapat berubah.

Tinjau `git status --short` dan `git diff --stat` sebelum commit/push ke repo yang benar. Repo yang pernah Anda gunakan: `karlmarxtrading-cmyk/performa`. Tidak diperlukan repository baru atau force push untuk rilis ini.

## Pengaturan Pages

| Pengaturan | Nilai |
|---|---|
| Framework preset | None |
| Branch produksi | branch yang memang terhubung ke proyek Anda, biasanya `main` |
| Root directory | kosong bila `package.json` ada di root repo |
| Node | `NODE_VERSION=24.22.3` (juga ada `.node-version`) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Functions/binding/secret | tidak diperlukan |

Untuk kontrol instalasi eksplisit dalam build command dapat digunakan `npm ci && npm run build`; Pages juga memiliki langkah instalasi dependensi. Pastikan log build menunjukkan Node/npm dalam rentang engines, instalasi sukses, verifier statis lulus dan fingerprint kandidat tercetak. Jangan mengirim root source atau `dist-qa` sebagai publish directory.

Jika proyek lama menampilkan koneksi Git terputus, pulihkan koneksi repo/branch dari pengaturan proyek yang sama dan jalankan deployment baru. Pastikan commit deployment sama dengan commit yang baru dikirim. HTTP 200 saja tidak membuktikan versi benar.

## Verifikasi preview yang sebenarnya

Jalankan dari checkout **kandidat yang sama dengan build yang hendak diperiksa**, setelah `npm run build`:

```bash
npm run verify:http -- https://NAMA-PROYEK.pages.dev
npm run verify:deployment -- https://NAMA-PROYEK.pages.dev
```

`verify:http` membandingkan SHA-256 seluruh berkas publik dengan `dist` lokal, versi `pf-version`, MIME, CSP, nosniff, cache, halaman cetak dan 404. Perubahan byte oleh transformasi edge akan terdeteksi; selidiki sebabnya, jangan otomatis mengabaikan kegagalan.

`verify:deployment` memakai browser nyata dan menguji tiga jalur rumus Einstein: HTML literal, HTML KaTeX dan editor teks. Versi harus tepat `3.0.0-rc.4`; rumus/mode harus sama; tidak boleh ada teks TeX mentah tak semestinya atau page error. Browser yang tidak tersedia adalah kegagalan/tes belum dijalankan, bukan kelulusan.

Pada Windows, deteksi browser mencari Chrome/Edge pada lokasi umum. Jalur khusus di Git Bash:

```bash
PF_CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe' npm run verify:deployment -- https://NAMA-PROYEK.pages.dev
```

Sesuaikan hanya bila file itu benar-benar ada. Di PowerShell, gunakan `$env:PF_CHROME` dengan path executable aktual.

## Pemeriksaan manusia sebelum rilis umum

1. Buka fixture trig 21 rumus dan Einstein, bandingkan struktur rumus, pecahan, akar, matriks, angka dan teks kode dengan sumber. Gunakan penempelan nyata dari aplikasi sumber yang akan didukung.
2. Ekspor HTML mandiri, buka luring, pastikan font/gambar/tautan tersedia.
3. Periksa halaman → siapkan cetak → dialog **Simpan sebagai PDF**. Ukuran kertas harus cocok, skala 100%, header/footer browser mati, grafik latar aktif. Buka PDF tersimpan: teks dapat dicari, isi/tabel/kode lengkap, tidak ada sampul kosong tak disengaja, jumlah halaman sesuai.
4. Uji simpan/reload proyek, dua tab, undo/redo gambar, pembatalan ekspor dan kegagalan font. Coba Chrome/Edge, Firefox, Safari serta perangkat sasaran.
5. Simpan `.pfproj` sebelum perpindahan origin atau rollback. Data IndexedDB terikat origin; `pages.dev` dan custom domain berbeda penyimpanan.

## Cache, pembaruan, rollback

`public/_headers` menjadi `dist/_headers`; dokumen utama dan URL `/print` menggunakan `no-cache`, aset berhash menggunakan `immutable`. Tidak ada service worker. Tab lama dapat masih memegang aset dari deployment lama; simpan proyek dan muat ulang jika chunk baru gagal dimuat. Fallback Worker menjaga analisis tetap dapat dilakukan, tetapi kecepatan dapat turun.

Rollback mengembalikan build situs, bukan mengembalikan penyimpanan browser pengguna. Lakukan cadangan `.pfproj` terlebih dahulu; uji pembukaan cadangan pada versi tujuan. Gunakan deployment sebelumnya yang telah diverifikasi. Jangan menghapus proyek Cloudflare hanya untuk mengganti versi aplikasi.

## Rujukan konfigurasi

Diperiksa 21 November 2026: [Build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/), [Build image / Node override](https://developers.cloudflare.com/pages/configuration/build-image/), [Custom headers](https://developers.cloudflare.com/pages/configuration/headers/). Dokumen provider tidak membuktikan deployment milik Anda telah diuji; bukti URL aktual tetap diperlukan.
