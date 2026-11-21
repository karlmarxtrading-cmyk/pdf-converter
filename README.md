# PaperForma 3.0.0-rc.4 — audit dan perbaikan mesin dokumen

PaperForma mengolah Markdown, teks UTF-8, HTML clipboard, percakapan, ZIP naskah + gambar dan proyek `.pfproj` menjadi HTML atau halaman cetak. PDF disimpan melalui dialog cetak browser. Pemrosesan dokumen berjalan di perangkat pengguna, tanpa akun atau backend.

**Status: kandidat yang telah diperbaiki dan diuji pada tingkat kode, ekspor HTML, paket dan HTTP lokal. Belum disertifikasi untuk produksi umum.** Pengujian browser/PDF baru tidak dapat dijalankan di lingkungan audit; hasil browser RC3 disimpan sebagai bukti historis. Keputusan lengkap dan hasil aktual: [docs/RELEASE_REPORT.md](docs/RELEASE_REPORT.md).

## Yang diperbaiki

- Rumus literal di tabel kompleks/caption, label tautan, markup inline terpecah dan mode display di sel/daftar/emphasis.
- Delimiter serta indentasi contoh kode tetap literal; URL gambar bertanda dolar tetap dikenali.
- Batas struktur HTML dan gambar inline sebelum pekerjaan berisiko; data tidak dipotong diam-diam.
- Font BrandKit/KaTeX, pembatalan dan timeout ekspor, keutuhan spasi kode setelah paginasi, dan oracle PDF.
- Pergantian proyek saat impor aset berlangsung, alias nama gambar, undo/redo, pemulihan riwayat dan dialog perbandingan besar.
- Tiga hotspot CPU dan pekerjaan snapshot berulang; angka pengukuran dengan batasnya ada di [docs/PERFORMANCE_REPORT.md](docs/PERFORMANCE_REPORT.md).
- Pemeriksa versi, hasil uji, aset build dan HTTP deployment. Website lama atau berkas yang tidak sama dengan `dist` akan dilaporkan gagal.

## Jalankan

Node **24.22.3**, npm **>=11.6.0 <12**. Audit ini memakai npm **11.19.1**. Versi Node dipin; jangan menonaktifkan `engine-strict` untuk menutupi EBADENGINE.

```bash
node -v
npm -v
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run verify:http -- --local
npm run preview
```

Buka `http://127.0.0.1:4173/`. Build yang dipublikasikan adalah **`dist`**, bukan `index.html` sumber di root. Build QA di `dist-qa` memuat kait pengujian dan tidak boleh dipublikasikan.

## Uji kasus gambar pengguna

Buka `fixtures/trigonometry/trigonometry.md` melalui **Buka berkas**. Dua ekspor HTML mandiri hasil API aktual ada di `examples/`. Korpus berisi 21 rumus dan mempertahankan tulisan “Drag point P”/“Beri masukan”. Ini transkripsi sintetis dari tangkapan layar, bukan salinan clipboard asli. Grafik interaktif yang tidak ikut dalam masukan tidak direkonstruksi atau dikarang.

## Deploy GitHub → Cloudflare Pages

Salin **isi folder `repository` dari ZIP** ke root checkout sehingga `package.json` berada di root. Pertahankan folder `.git` milik checkout yang sudah ada. Gunakan Node `24.22.3`, build command `npm run build`, output `dist`. Petunjuk lengkap: [docs/DEPLOY_CLOUDFLARE.md](docs/DEPLOY_CLOUDFLARE.md).

Sesudah preview deployment aktif:

```bash
npm run verify:http -- https://NAMA-PROYEK.pages.dev
npm run verify:deployment -- https://NAMA-PROYEK.pages.dev
```

Perintah kedua memerlukan Chrome/Chromium/Edge lokal; bila perlu atur `PF_CHROME` ke executable browser. Pemeriksa HTTP tidak memerlukan browser dan tidak menyatakan PDF telah diuji.

## Struktur bukti

- `evidence/audit-rc4/`: pemeriksaan baru, reproduksi sebelum/perbaikan, pengukuran dan inventaris seluruh ZIP masukan.
- `evidence/history/rc3/` dan `docs/history/rc3/`: bukti/dokumen asli, **bukan** status kandidat RC4.
- `dist.build-manifest.json`: identitas sumber dan hasil produksi.
- `docs/AUDIT_RC4.md`: temuan, keputusan teknis, risiko yang tersisa.
- `docs/TESTING.md`: pengujian yang dapat diulang dan alur manual sebelum rilis.
- `docs/KNOWN_LIMITS.md`: batas format, font, kapasitas, browser dan PDF.

Tidak ada klaim “membaca setiap format” atau “tercepat di dunia”. Jika format/glyph tidak didukung atau integritas tidak dapat dibuktikan, aplikasi melaporkan kondisi itu; sumber asli dipertahankan.
