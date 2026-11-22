# PaperForma 3.0.0-rc.12

Revisi konversi pindah baris dan tabel pada clipboard, statistik isi dari struktur dokumen, dan pemeriksaan gambar dalam diagram. Perangkat pengumpulan bukti mencakup pratinjau HTTPS, rehearsal Pages dan uji perangkat. [Hasil kandidat dan batas pengujian](docs/RELEASE_REPORT.md).

# PaperForma 3.0.0-rc.11

Perbaikan konversi clipboard matematika/tabel, marker per item, persetujuan resource proyek dan Mermaid, serta batas payload cetak. Toolchain verifikasi PDF dan putaran penerimaan RC11 tersedia terpisah dari hasil historis. [Laporan RC11](docs/RELEASE_REPORT_RC11.md).

# 3.0.0-rc.10

Perubahan dan penerimaan RC10 dicatat di [laporan RC10](docs/RELEASE_REPORT_RC10.md) dan [ledger F01–F09](evidence/rc10/LEDGER.json).

# 3.0.0-rc.9

Pemisahan startup, stall dan deadline cetak, penghitungan percobaan paginasi secara kumulatif, kelompok halaman dokumen besar, pengujian kapasitas dari event mentah, konteks rumus terlepas dan pemeliharaan nomor daftar terbalik. Kontrak dan hasil aktual ada di docs/LAPORAN_RC9.md.

# 3.0.0-rc.8

- Editor mempertahankan prosa, tabel dan struktur di samping rumus dalam HTML campuran. Berkas HTML UTF-8 dapat dibuka, ditinjau dan disimpan bersama salinan sumber awal.
- Ekspor memeriksa isi artikel, urutan blok, TeX asli dan kanonik, mode, dua cabang KaTeX, CSS dan font. Hilangnya rumus, cabang kosong, blok asing atau tambahan isi menghentikan penerbitan.
- Cetak menunjukkan lokasi karakter privat tanpa pemetaan. Font emoji monokrom disematkan bila diperlukan. Label bahasa pada blok kode berpindah bersama baris pertama yang memuat kode.
- Pemeriksaan dan komposisi memakai kembali DOM yang masih cocok dengan byte asli. Progres pencetakan dokumen panjang mengikuti halaman fisik yang selesai, dan editor dapat menangani masukan di antara fase render, verifikasi dan komposisi. Profil, sampel performa dan kapasitas tersedia bersama bukti.
- Gerbang promosi memeriksa keenam belas syarat terhadap satu source dan build. Paket memuat unduhan HTML dari editor, contoh PDF, matriks kompatibilitas, panduan Pages dan latihan rollback lokal. [Keputusan penerimaan RC8](docs/history/rc9/RELEASE_REPORT.md).

# 3.0.0-rc.7

- Ekspor matematika dan pengujiannya memeriksa aturan tata letak KaTeX, versi renderer dan berkas font WOFF2. Cache font dapat pulih setelah respons terpotong.
- Pemeriksa integritas mencakup fragmen HTML mandiri, caption, urutan, tautan, gambar, kode dan perubahan rumus. Untuk batas semantik yang ambigu, editor mempertahankan struktur dan meminta peninjauan.
- Impor clipboard menjaga rumus MathJax berdampingan, prosa di pembungkus rumus, serta metadata tautan dan gambar di tabel.
- Membatalkan pilihan dalam ZIP membatalkan perubahan terkait. Pengguna dapat mengulang persiapan cetak setelah kegagalan sementara. Pergantian proyek membersihkan pratinjau lama dan pengetikan judul terlindung saat editor merender.
- Judul otomatis mengikuti isi heading Markdown. Verifikasi paginasi mengenali pembungkus kosong dari Paged.js pada batas blok kode setelah mencocokkan blok lanjutan dan barisnya.
- Matriks template, dua contoh dari naskah pengguna, uji mutasi, pengukuran performa serta bukti per jalur disertakan. Lihat `docs/RELEASE_REPORT.md`.

# 3.0.0-rc.6 — audit salinan AI dan matematika

- RC6-M01–M04: mengenali delimiter TeX salinan ber-backslash ganda; memulihkan terbatas subskrip, row break dan spacing dengan sumber asli serta jejak perubahan. Fixture TXT pengguna lengkap: 231 rumus, 17 pemulihan isi.
- RC6-M05: padding matematika tidak lagi merusak emphasis CommonMark pada judul yang bersentuhan dengan rumus.
- Fence `math` dan inline matematika GitHub didukung; fence `latex`/`tex`, kode, URL dan mata uang tetap literal.
- RC6-CLIP01–09: sumber HTML/MathML/MathJax, mode display, wrapper AI, tabel merge, rumus bersebelahan serta prosa/multi-rumus dalam pembungkus luas dipertahankan.
- RC6-RENDER: pemulihan rumus literal dalam raw HTML aman; peringatan sumber TeX yang belum dirender, serta pemeriksaan keutuhan formula raw-table.
- RC6-AUD: tes independen meliputi parsing ganda, hilangnya konten, prioritas metadata, sanitasi dan mutasi operator.
- RC6-EXPORT: HTML mandiri aktual dari input lengkap, 12 font WOFF2 nyata, oracle per rumus dan payload persiapan cetak. Browser/paginasi/PDF native belum diverifikasi pada RC6.
- Dokumentasi aktif dipisahkan dari bukti historis; panduan deploy memakai proyek Pages yang sudah terhubung dan tidak mengunci checkout ke commit lama.

# Changelog

## 3.0.0-rc.5

- Rumus yang memuat pipe atau dolar terlindungi dalam tabel dan clipboard. Anotasi MathJax serta konten di sekitarnya dipertahankan. Formula tidak lengkap memiliki petunjuk lokasi.
- Salinan aset saat snapshot hanya mengambil byte yang terlihat; digest aset berjalan dengan konkurensi terbatas.
- Pemuatan modul KaTeX mengikuti isi dokumen. Pratinjau dan ekspor menggunakan indeks URL font yang sama serta berbagi hasil pengambilan font.
- Perbaikan alur simpan/hapus, pengulangan cetak, pemilihan format lewat keyboard dan pilihan sumber saat menempel.
- Verifikasi deployment mengecek keterkaitan antara source, build manifest dan seluruh berkas produksi. Keputusan dan bukti rilis tercatat dalam docs/RELEASE_REPORT.md.

## 3.0.0-rc.4 — 2026-11-21 (audit dan perbaikan)

Perbaikan pembacaan math kompleks, pelestarian literal kode, admission HTML/gambar, aset/undo/riwayat, abort Worker/font, sampul kosong dan header tabel, oracle PDF serta release/deployment gate. Tiga hotspot core dioptimalkan dan snapshot dikurangi pekerjaan berulang. Korpus trig 21 formula dan contoh HTML nyata disertakan.

332 tes Vitest +8 tes Node lulus; build produksi/QA, gate mutasi dan HTTP lokal lulus. Browser/PDF baru diblokir lingkungan; tidak ada klaim produksi penuh. Detail: docs/AUDIT_RC4.md dan docs/RELEASE_REPORT.md. Hasil sebelum RC4 di bawah adalah histori.


## 3.0.0-rc.3 — 2026-11-21 (perbaikan mesin matematika)

Laporan: rumus LaTeX tampil sebagai teks mentah di https://performa-cwd.pages.dev (rc.2), mis. `\[\boxed{E_0=mc^2}\]`,
`\(E_0\)`, `\[\gamma=\frac{1}{\sqrt{1-\frac{v^2}{c^2}}}\]`.

### Akar masalah (direproduksi di browser nyata pada rc.2 — `evidence/history/rc2-*`)
1. **Escape ganda di konversi HTML clipboard → Markdown** (dialog Tempel "Ubah ke Markdown", "Ubah bagian ini ke Markdown",
   impor percakapan). HTML ChatGPT yang memuat delimiter rumus sebagai teks literal diserialisasi remark-stringify dengan
   escape: `\(E_0\)` → `\\(E_0\\)`, `\[` → `\\\[`, `$E$` → `\$E\$` → pemindai rumus tidak lagi mengenalinya.
2. **`\[…\]` / `$$…$$` satu baris dirender inline** (pecahan kecil, rata kiri) di SEMUA jalur, termasuk teks biasa:
   remark-math membaca `$$…$$` dalam satu baris sebagai matematika teks.
3. Spasi sebelum rumus KaTeX hilang saat konversi (`Energi$E_0$`); MathML `alttext` dibuang (a/b → "ab");
   MathJax `<script type="math/tex">` terhapus (isi hilang); "$5 dan diskon 10$" keliru dianggap rumus.

### Perbaikan
- `src/core/clipboard.ts`: delimiter literal di teks dipindai dengan `scanMath` (aturan sama dengan jalur Markdown: mata
  uang, kode, delimiter tak tertutup) dan dikeluarkan **verbatim**; penanda rumus span/div (spasi utuh); TeX dari anotasi
  KaTeX, `alttext` MathML (bila berbentuk TeX), skrip MathJax `math/tex`; display di dalam `<p>` diangkat menjadi blok;
  KaTeX tanpa anotasi → peringatan `CLIPBOARD_MATH_NO_TEX`.
- `src/core/markdown.ts` `promoteDisplayMath`: mode display ditentukan delimiter sumber (dipakai render, model keutuhan
  dan Worker); display di tengah kalimat dirender sebagai span display di dalam paragraf.
- `src/core/math.ts`: perlindungan mata uang "angka + kata biasa" pada `$…$`.
- Dependensi langsung `hast-util-to-mdast` (sebelumnya transitif) untuk handler bawaan.

### Uji
- `tests/unit/core/math-einstein.test.ts` (21 kasus): teks biasa, HTML literal, HTML KaTeX, percakapan, alttext/MathJax,
  `<br>`/sel tabel, mode display, mata uang — TeX hasil = TeX sumber, prosa utuh, kode literal, keutuhan lulus.
- E32 (Chrome nyata): 5 jalur tempel → pratinjau 11 rumus KaTeX, mode display benar, tanpa teks mentah. E33: HTML ekspor
  luring + PDF cetak (font KaTeX tersemat, tanpa TeX mentah). PDF Einstein juga di `test:pdf` (Chrome & Firefox).
- `npm run verify:deployment -- <URL>`: pemeriksaan yang sama terhadap deployment nyata (build produksi, tanpa kait QA).
- Panduan: bagian "Rumus matematika"; teks rasio prototipe PDF dibetulkan menjadi 9–39×.

## 3.0.0-rc.2 — 2026-11-21 (statis)

Dasar: 3.0.0-rc.1. Mengikuti "Perintah lanjutan final — PaperForma ultimate engineering & production release".

### MESIN-36 — Web Worker
- Analisis tanpa DOM dipindah ke `src/engine/engine.worker.ts`: analisis karakter, parsing Markdown/GFM/math, render tahap 1
  (hast → HTML, highlight.js, KaTeX), model keutuhan sumber, hitungan Private Use, rujukan gambar.
- `renderBody` dipecah: `renderStage1` (murni, Worker) + `finishRender` (DOMPurify, atribut pasca-sanitasi, src aset, sisip
  KaTeX; thread utama). Byte aset tidak pernah dikirim ke Worker.
- Protokol `src/engine/protocol.ts`: jobId unik, docVersion (renderInputHash), progress per fase, batal, timeout (Worker
  dihentikan & dibuat ulang), galat, versi protokol, penolakan hasil usang dan hasil dengan versi dokumen berbeda.
- Fallback thread utama dengan jeda antar-fase bila Worker tidak ada, crash berulang, atau **gagal dimuat** (langsung, tanpa
  revisi gagal); banner kompatibilitas menjelaskan.
- Alias `decode-named-character-reference` ke varian tanpa DOM (varian browser memakai `document.createElement`).

### Integritas & paginasi
- Inventaris isi diperluas: urutan blok, teks per blok, heading (teks+level), baris tabel per identitas, plus verifikasi
  struktur halaman di hasil datar: label nomor halaman, nomor halaman daftar isi, tujuan tautan internal.
- Pesan `PAGE_CONTENT_CHANGED` menunjuk blok dan jenis perubahan (hilang/berulang/terpotong/urutan).
- Blok kode panjang dipecah per baris untuk paginasi; perbaikan otomatis dapat memutus sebelum baris tabel yang meluap;
  tanda hubung U+2011 dari Paged.js dihapus di kode dan dinormalisasi di prosa; baris yatim/janda diukur dan dilaporkan.
- Perbaikan: gambar `data:` inline selalu memicu `INTEGRITY_ASSET_CHANGED` (cacat laten RC1, ditemukan uji lintas-browser).
- Analisis karakter kendali/tak terlihat (bidi, lebar-nol, kendali C0/C1, U+FFFD) dilaporkan tanpa mengubah isi.

### PDF
- Evaluasi terukur jalur A (mesin cetak browser) vs jalur B (jsPDF.html, html2canvas→pdf-lib): jalur B ditolak; tidak ada
  tombol unduh PDF palsu.
- Uji PDF nyata dari mesin cetak Chrome & Firefox atas HTML datar terverifikasi (A4, Letter lanskap, A5; 12–196 halaman).

### UI/UX
- Baris "Alur kerja" 1–5 dengan status; progres analisis per tahap; banner kompatibilitas browser; teks bantuan cetak diperbarui.

### Rekayasa rilis
- Lint (oxlint), uji lintas-browser (Chromium/Firefox/WebKitGTK), matriks performa 10–1.000 halaman, gerbang rilis
  memeriksa bundel Worker, skenario E25–E31 (Worker, responsivitas, chunk Worker hilang, gerak dikurangi, kuota penuh, pindah origin).

## 3.0.0-rc.1 — 2026-11-20 (statis)

Dasar: `2.0.0-rc.3` (fingerprint source d569d9a4…). Mengikuti `PAPERFORMA_AUDIT_DAN_ARAHAN_STATIS_20261120`.

### Dihapus (bukan disembunyikan)
- Worker/backend, `/api/*`, akun, sesi, harga, paket, kuota, pembayaran, PDF server, `config/plans.json`,
  `wrangler.jsonc`, staging/promote/ledger tooling, dependensi `@cloudflare/*`, `wrangler`, `pdfjs-dist`.

### Mesin (perbaikan audit)
- **EN-003** Sentinel Private Use dipilih per pemindaian dari titik kode yang tidak ada di sumber; pemulihan terikat
  pemindaian; oracle konservasi PUA independen di pemeriksaan integritas (`INTEGRITY_PRIVATE_USE_CHANGED`).
- **EN-011** Deteksi struktural percakapan memakai atribut elemen nyata; teks di luar wrapper dipertahankan sebagai pesan
  “unknown” + temuan; fallback teks biasa; input nonkosong tidak pernah menghasilkan nol pesan tanpa penjelasan.
- **QA-01** Validator hasil akhir ekspor HTML/ZIP/publikasi: pemeriksaan wajib (skrip, jaringan, font, ukuran, relatif,
  integritas) + kebijakan issue (`block`/`confirm`/`note`). Font gagal/timeout/rusak → `ExportBlockedError`, tanpa byte.
- **EN-012** Issue penghalang lingkup input diteruskan ke payload cetak; persiapan cetak diblokir sebelum font/layout.
- **EN-006** Verifikasi pasca-paginasi fail-closed: timeout = gagal, nol halaman = gagal, jumlah halaman harus sama,
  inventaris isi (teks tanpa spasi, angka, gambar, rumus, tautan, blok) sebelum vs sesudah paginasi harus identik.
- **EN-005/EN-010** Siklus hidup cetak eksplisit (`prepared` → `dialog-requested` → `returned`/`unknown` → `disposed`),
  tanpa pembuangan frame berbasis timer; frame gagal selalu dibuang; satu pengelola paginasi per snapshot.
- **EN-002** Preflight per target (`html` / `print`) dengan identitas revisi; kategori `pdf` tidak disyaratkan untuk cetak.
- **EN-007** Issue font pratinjau dan Mermaid diteruskan ke Pemeriksaan; ID Mermaid unik per job.
- **QA-02** Anggaran piksel dari header sebelum dekode (per gambar dan per proyek); dimensi tak terbaca ditolak.
- **EN-009** Undo transaksi proyek berbatas; riwayat internal ledger dibuang.
- **SA-12** Kait QA (`window.__pf`, `__pfPrintResult`, `pfPaginate`) hanya di build QA.

### UI (UI-01…UI-08)
- Status simpan selalu terlihat (juga 360 px) dengan state nyata, cadangan `.pfproj`, penjaga `beforeunload`, pemulihan
  proyek terakhir, konflik dua tab.
- Kesiapan HTML dan Cetak terpisah, terikat revisi + hash; label turun ke “memproses” seketika saat edit.
- Dialog ekspor menampilkan hasil terminal (siap/diblokir/gagal/dibatalkan) di dalamnya; Escape saat proses = batal.
- Undo/Redo mencakup sumber, pengaturan, templat, brand kit, percakapan, aset; pemulihan revisi penuh.
- Satu pintu “Buka berkas” untuk picker dan drag/drop; format tidak didukung ditolak spesifik.
- HTML clipboard hanya dipakai bila masih sepadan dengan teks yang terlihat; catatan konversi tampil sebelum diterapkan.
- Semua temuan (paging 100, filter, kategori, cari, unduh laporan JSON) dan semua revisi (paging 20) dapat dijangkau.
- Draf brand kit bertahan saat ganti bahasa/tema; judul halaman mengikuti bahasa.
- Beranda baru tanpa klaim komersial; contoh dirender saat terlihat. Header studio dua baris ≤ 1100 px.

### Rilis
- Build statis terverifikasi (`scripts/verify-static-release.mjs`), server lokal ala Pages, E2E Chrome, SBOM.
