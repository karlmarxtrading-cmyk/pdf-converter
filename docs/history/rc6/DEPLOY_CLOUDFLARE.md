# PaperForma RC6: GitHub → Cloudflare Pages

Proyek Pages sudah terhubung menurut konfirmasi pengguna. Gunakan proyek tersebut untuk repository `https://github.com/karlmarxtrading-cmyk/performa`; tidak perlu membuat proyek baru. Audit ZIP ini tidak membaca HEAD GitHub terbaru, tidak push, dan tidak mengubah deployment aktif. Log pengguna sebelumnya menunjukkan push ke **main**, bukan master. Jangan mengunci pembaruan ke commit historis `c44b27f`.

## Menyiapkan pembaruan

Ekstrak ZIP RC6 ke folder terpisah yang kosong. `package.json`, `src/`, `public/`, `scripts/`, `tests/`, `fixtures/` dan `dist/` berada di root. Simpan pekerjaan lokal yang masih diperlukan sebelum menyalin file. Gunakan branch preview dari checkout GitHub terbaru; bandingkan perubahan dengan `evidence/rc6/changed-files.json` dan rekonsiliasi jika repository telah berubah sejak ZIP RC5.

Contoh dari Git Bash di checkout pengguna:

```bash
cd ~/Downloads/TERPENTING/"PDF PERFORMA"/REPO
git status --short
git branch --show-current
git remote -v
```

Pastikan checkout dan remote benar, serta pekerjaan lokal sudah disimpan. Pada checkout bersih yang mengikuti `main`:

```bash
git switch main
git pull --ff-only origin main
git switch -c paperforma-rc6
```

Salin **isi root** folder ekstraksi RC6 ke root checkout. Pertahankan direktori `.git` checkout. `dist/` siap dicoba lokal tetapi dikecualikan dari Git: Pages membangunnya lagi dari source. Jangan menyalin `node_modules/` dari komputer lain.

## Memverifikasi kandidat lokal

Node **24.22.3**, npm **>=11.6.0 <12**; pertahankan `engine-strict`.

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run verify:http -- --local
npm run preview
```

Buka `http://127.0.0.1:4173/`. Uji input **fixtures/rc6/user-trigonometry.md** melalui Buka berkas, periksa 231 rumus serta 17 rumus yang isi salinannya dipulihkan, lalu coba ekspor. Aplikasi memerlukan HTTP(S); HTML mandiri dapat dibuka sebagai berkas.

Setelah meninjau isi perubahan:

```bash
git status --short
git diff --stat
git add -A
git diff --cached --stat
git commit -m "Fix PaperForma AI Markdown and math import for RC6"
git push -u origin paperforma-rc6
```

Langkah tersebut membuat branch preview. Penggabungan ke `main` dilakukan setelah preview diperiksa. Jangan force-push atau menimpa perubahan yang belum direkonsiliasi.

## Pengaturan Pages yang sama

| Pengaturan | Nilai kandidat |
|---|---|
| Repository | karlmarxtrading-cmyk/performa |
| Branch produksi | main, sesuai branch produksi yang benar pada proyek Anda |
| Branch preview | paperforma-rc6, bila preview branch diaktifkan |
| Framework preset | None; build command ditetapkan eksplisit |
| Root directory | Kosong bila package.json ada di root |
| Build command | npm run build |
| Build output | dist |
| Environment preview/production | NODE_VERSION = 24.22.3 |

Cloudflare menyediakan pemilihan root/build output dan override Node melalui `NODE_VERSION` atau `.node-version`. Log build harus menunjukkan versi engines yang sesuai dan exit 0. Jika instalasi otomatis tidak memakai lockfile seperti yang dibutuhkan, gunakan `SKIP_DEPENDENCY_INSTALL=1` dengan build command `npm ci && npm run build`; pastikan perubahan itu diterapkan konsisten pada preview/production.

## Memeriksa URL hasil

Ambil URL preview yang benar dari deployment commit tersebut. Dari checkout yang identik, bangun ulang kemudian jalankan (ganti URL contoh):

```bash
PF_URL='https://URL-PREVIEW-ANDA.pages.dev'
npm run verify:http -- "$PF_URL"
npm run verify:deployment -- "$PF_URL"
```

`verify:http` membandingkan versi, manifest kandidat, byte file publik, MIME, CSP, cache, halaman cetak dan 404. Ia tidak menjalankan browser atau menguji PDF. `verify:deployment` membutuhkan Chrome/Chromium dan menguji fixture Einstein melalui event terprogram. Tambahkan uji manual input RC6 asli dan clipboard aplikasi AI yang Anda gunakan; smoke Einstein bukan pengganti 231 rumus.

HTML metadata harus menunjukkan `3.0.0-rc.6`. Periksa commit/branch/root/output jika hasil berbeda. Audit ini tidak mengasumsikan URL produksi tertentu atau menyatakan versi situs aktif saat ini.

## Produksi, cetak dan rollback

Setelah preview diterima, gabungkan perubahan ke branch produksi `main` sesuai alur repository. Periksa deployment yang baru serta ekspor HTML luring. Untuk PDF, siapkan cetak lalu pilih Simpan sebagai PDF: ukuran kertas sesuai proyek, skala 100%, header/footer browser mati dan background aktif. Periksa rumus panjang, tabel lintas halaman, teks awal/akhir dan font.

Ekspor cadangan `.pfproj` sebelum perpindahan origin atau rollback. Cloudflare memungkinkan rollback ke deployment produksi sukses yang masih tersedia; preview bukan target rollback. Pilih target melalui menu tindakan deployment, lalu verifikasi hasil terhadap source target tersebut. Cadangan proyek tetap dikelola browser pengguna.

Rujukan resmi diperiksa 21 November 2026: [build dan root](https://developers.cloudflare.com/pages/configuration/build-configuration/), [Node dan instalasi](https://developers.cloudflare.com/pages/configuration/build-image/), [rollback](https://developers.cloudflare.com/pages/configuration/rollbacks/).
