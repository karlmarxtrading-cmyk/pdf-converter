# GitHub, Cloudflare Pages dan pemulihan

Target existing adalah [karlmarxtrading-cmyk/performa](https://github.com/karlmarxtrading-cmyk/performa). Pada pemeriksaan baca-saja 22 November 2026, `main` menunjuk ke `3a4eaf9eeeb710541c13bee34a83ff901c441580` dan package.json di commit itu memuat RC5. Catat commit aktif lagi sebelum melakukan perubahan. Pekerjaan RC8 mencakup ZIP dan pengujian lokal sesuai keputusan pemilik.

## Menyiapkan checkout

Ekstrak ZIP dan gunakan isi direktori yang memuat package.json sebagai root. Jika kelak Anda ingin mengirim ke repository, lakukan pada checkout bersih yang terpisah dari dokumen kerja. Git Bash:

```bash
git clone https://github.com/karlmarxtrading-cmyk/performa.git paperforma-preview
cd paperforma-preview
git switch -c paperforma-rc8-preview
```

Salin isi paket hasil ekstraksi ke root checkout. Pertahankan direktori `.git` dan gabungkan perubahan repository yang lebih baru jika ada. Tinjau `git status --short` dan `git diff --stat`, kemudian jalankan:

```bash
npm ci
npm run build:pages
npm run verify:http -- --local
npm run verify:release
```

`build:pages` menghasilkan `dist/`. Pada Cloudflare Pages versi Git, cabang produksi yang dikonfigurasi harus sama dengan `PAPERFORMA_PRODUCTION_BRANCH`, dengan nilai bawaan `main`. Untuk cabang itu perintah build menjalankan pemeriksaan penerimaan menyeluruh. Setiap gate wajib yang terbuka menyebabkan proses berhenti. Perintah `npm run build` tetap tersedia untuk pengembangan dan rekonstruksi.

Latihan lokal dari ekstraksi bersih sudah menjalankan perintah Pages untuk dua cabang. Preview menghasilkan build statis dan simulasi cabang produksi berhenti pada keputusan penerimaan. [Hasil perintah dan identitas distribusi](../evidence/rc8/operations/promotion-rehearsal.json).

## Pengaturan pada proyek Pages yang sudah terhubung

| Pengaturan | Nilai |
|---|---|
| Directory root | Direktori yang memuat package.json, kosong jika di root |
| Build command | `npm run build:pages` |
| Output directory | `dist` |
| Node | `24.22.3`, periksa log build |
| npm | Versi 11.6.0 sampai sebelum 12 |
| Branch produksi | Cocokkan dengan pengaturan aktif dan variabel di atas |

Persiapan di atas dilakukan secara lokal. Pengiriman branch ke repository publik dan promosi membutuhkan keputusan pemilik. Setelah deployment preview benar-benar tersedia, masukkan URL yang diberikan oleh Pages di Git Bash:

```bash
read -r -p "URL preview Cloudflare Pages: " PF_PREVIEW_URL
npm run verify:http -- "$PF_PREVIEW_URL"
npm run verify:deployment -- "$PF_PREVIEW_URL"
```

Buka materi asli 231 rumus, unduh HTML dan simpan PDF dari dialog cetak. Simpan URL/commit deployment, hasil HTTP, identitas build, hash berkas yang diunduh dan platform. Cocokkan dengan aturan penerimaan G12–G15. [Build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/) · [Preview deployments](https://developers.cloudflare.com/pages/configuration/preview-deployments/)

## Pemulihan

Untuk latihan lokal menggunakan paket autentik RC7, ekstrak RC7 ke direktori sejajar bernama `rc7`, lalu jalankan dari root RC8:

```bash
python scripts/rehearse-rollback.py ../rc7
```

Skrip membuat repository Git sekali pakai di direktori sementara, menyajikan versi lama dan kandidat di loopback, membuat commit pengembalian, lalu membandingkan kembali source, seluruh build dan respons HTTP dengan RC7. Seluruh commit latihan bersifat lokal. Bukti pelaksanaan tersedia di `evidence/rc8/operations/`.

Untuk pemulihan produksi di Pages, pilih deployment **produksi** sebelumnya yang sukses dan masih tersedia di dashboard proyek. Catat ID deployment dan commit sebelum melakukan rollback yang disetujui. Sesudahnya, periksa HTTP, CSP dan isi aset, lalu pulihkan juga source di repository dengan commit pengembalian yang ditinjau. Verifikasi perbedaan penyimpanan editor per origin melalui cadangan .pfproj. Identitas RC7 lokal membuktikan sasaran latihan. ID rollback hosting mengikuti riwayat produksi akun. [Rollback Cloudflare Pages](https://developers.cloudflare.com/pages/configuration/rollbacks/)
