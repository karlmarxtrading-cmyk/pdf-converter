# Audit render dan ekspor RC3 → kandidat perbaikan

Tanggal: 21 November 2026. Cakupan: seluruh 19 berkas `src/render/` (termasuk generator dan data cakupan font), seluruh tes unit render, skrip PDF/verifikasi/stres, serta helper audit baru. Inventaris per berkas dan checksum ada di `coverage.json` (36 berkas termasuk tambahan dan tes trigonometri integrator).

## Kesimpulan

Enam reproduksi unit/integrasi gagal pada RC3 asli untuk lima kelompok cacat. Setelah perbaikan pertama, 63 tes render lulus. Pemeriksaan visual PDF historis kemudian menemukan dua cacat tambahan, keduanya juga direproduksi dan diperbaiki pada source. Hasil render terakhir: 72/72 tes lulus, termasuk dua jalur ekspor trigonometri integrator. Empat tes Node untuk oracle PDF juga lulus. Ini bukti logika/jsdom dan inspeksi PDF historis, bukan bukti browser atau PDF kandidat baru. Root menemukan Chromium tidak dapat mulai karena socket process singleton diblokir lingkungan; paginasi visual, CSS fallback font, dan dialog cetak native kandidat harus tetap berstatus belum diverifikasi sampai dijalankan di browser yang tersedia.

## Temuan dan perbaikan

| ID | Dampak RC3 yang direproduksi | Penyebab | Perbaikan dan bukti |
|---|---|---|---|
| PF-R4-01 | Satu tautan `#%E0%A4%A` melempar URIError saat verifikasi seluruh hasil cetak | `verifyPageStructure` melakukan decodeURIComponent tanpa penanganan kesalahan | Pertahankan fragmen asli lalu laporkan tautan rusak. Regresi malformed anchor lulus. |
| PF-R4-02 | Organisasi Sirilik tidak memilih subset Sirilik; footer CJK luput dari peringatan | Pemilihan font hanya melihat isi dan sebagian Settings, tidak BrandKit | `PlanInput.brandKit` mencakup organisasi/nama/footer; HTML dan payload cetak meneruskannya. Tes memeriksa font nyata dan peringatan di kedua jalur. |
| PF-R4-03 | CJK dalam `\\text{中文}` tidak mendapat peringatan glyph; beberapa varian KaTeX bold/italic tidak dipilih | `textForFonts` membuang seluruh `.katex`; pemetaan kelas KaTeX kurang lengkap | Teks fallback KaTeX tetap diperiksa; CSS memakai font Unicode bundel; pilih Main BoldItalic, SansSerif Bold/Italic dan Fraktur Bold sesuai kelas. Tes CJK dan inventaris font lulus; visual CSS belum diuji di browser. |
| PF-R4-04 | Abort tidak menyelesaikan ekspor bila pemuat font tidak pernah selesai | Abort hanya diperiksa setelah `await loadFonts`; pengambilan font tanpa deadline | `loadFonts(plan, source, {signal, timeoutMs})`, timeout default 15 detik, listener/timer dibersihkan; HTML dan cetak meneruskan signal. Fetch font browser punya timeout 15 detik agar kegagalan tidak meracuni cache selamanya. Tes sumber macet selesai dibatalkan dan deadline menghasilkan issue penghalang. |
| PF-R4-05 | Validator menerima perubahan indentasi Python dan dua spasi di literal kode menjadi satu | Inventaris membuang semua whitespace tanpa membedakan prosa/kode | Identitas kode/baris stabil dan `codeText` membandingkan whitespace utuh; fragmen halaman sah tetap dapat digabung. Dua reproduksi mutasi kode dan kontrol fragmentasi sah lulus. Ini kelemahan validator yang terbukti, bukan bukti bahwa Paged.js selalu mengubah indentasi. |
| PF-R4-06 | Pemeriksaan PDF dapat melewatkan prosa berdekatan rumus, caption tabel, minus angka, dan urutan raw extraction | Seluruh blok berumus/gambar dilewati; normalisasi menghapus ASCII `-`; fallback raw hanya `includes` | Helper `pdf-oracle.mjs` membagi prosa sekitar rumus/gambar, mencakup caption, mempertahankan tanda negatif, dan mensyaratkan satu urutan ekstraksi lengkap. 4 uji oracle lulus. `pdf-verify.mjs` juga memeriksa jumlah raster image, tujuan hyperlink, dan menolak Type 3 tanpa penerimaan massal dari satu warning. |
| PF-R4-07 | PDF lama memiliki cover kosong; default BUS saat ini juga mengeluarkan cover tanpa metadata | `cover=true` langsung membuat cover, walaupun seluruh teks/identitas/logo kosong | Cover dihilangkan hanya bila tidak ada metadata yang benar-benar terlihat dan tidak ada logo; source serta pengaturan tetap sama. Dua tes gagal sebelum fix, enam tes kontrol/regresi lulus sesudah fix. |
| PF-R4-08 | Header kolom kunci pada tabel A5 yang dibagi menjadi putih di atas abu-abu terang | Selector `th.pf-repeat-key` menimpa latar header BUS tanpa mengganti warna putih teksnya | Tint pengulangan hanya untuk `td`; header mempertahankan pasangan warna template. Satu regresi DOM/CSS gagal sebelum fix dan lulus setelahnya; warna header normal dan stripe isi tetap sama. |

Perubahan kriteria PDF itu sengaja lebih ketat. Dokumen emoji/Private Use dapat gagal syarat Type 3; peringatan glyph bukan pembuktian bahwa semua glyph Type 3 di PDF benar. `visualReview` tetap NOT_RUN pada hasil skrip otomatis; uji teks tidak membuktikan bentuk pecahan/akar atau keterbacaan gambar.

## API dan berkas

- `fonts.ts`: `FontLoadOptions` baru; `loadFonts` menerima opsi ketiga opsional; `PlanInput.brandKit` opsional. API lama tetap dapat dipanggil dengan dua argumen.
- `exports.ts`: `HtmlExportRequest.fontTimeoutMs` opsional; signal tiket ExportGuard diteruskan sampai pemuatan font.
- `print-payload.ts`: signal dan deadline pemuatan font berlaku sebelum payload dikirim.
- `font-assets.ts`: deadline fetch font; kegagalan dibuang dari cache agar dapat dicoba lagi.
- `paginate.ts`: field `ContentInventory.codeText`, marker kode/baris stabil, decoder anchor toleran input rusak.
- `css.ts`: font bundel untuk teks KaTeX yang menggunakan fallback.
- `index.ts`: ekspor tipe FontLoadOptions.
- `tests/unit/render/audit-rc4.test.ts`: 9 regresi/kontrol baru.
- `tests/e2e/pdf-oracle.mjs` dan `.test.mjs`: helper dan 4 tes Node; perintah `node --test tests/e2e/pdf-oracle.test.mjs`.
- `tests/e2e/inspect-pdf.py`: pembaca struktur dan objek anotasi pypdf strict; operator content stream benar-benar diurai melalui `stream.operations`, bukan hanya decode byte. Memerlukan Python + pypdf. Jika qpdf tidak ada, laporan mengatakan NOT_RUN untuk qpdf, tidak mengaku kesetaraan cakupan pemeriksaan.
- `tests/e2e/pdf-verify.mjs`: oracle teks/anotasi lebih ketat; pemeriksaan memori hanya lulus jika setiap putaran juga berhasil melakukan paginasi terverifikasi dengan halaman nyata dan tanpa issue blocking.
- `tests/e2e/stress-pages.mjs`: integrator juga memperbaiki exit code; kegagalan layout/verifikasi/halaman/console sekarang exit nonzero.

## Bukti aktual

1. `baseline-red.json`: 0/6 lulus, 6/6 gagal untuk gejala cacat (bukan fixture error). Salinan enam tes yang dijalankan ada di `baseline-regressions.test.ts`; untuk reproduksi, tempatkan sementara pada `tests/unit/render/` dalam checkout RC3 yang sudah `npm ci`.
2. `after-first.json`: 60/60 lulus setelah perbaikan pertama.
3. `final-unit.json`: 63/63 lulus, 8 berkas unit render.
4. `pdf-oracle-tests.log`: 4/4 lulus melalui Node test runner dan jsdom; mencakup caption tabel. `pdf-oracle-caption-red.log` menyimpan kegagalan assertion caption sebelum perbaikan tersebut.
5. `font-coverage-regeneration.log`: tabel cmap diregenerasi dari paket yang terpasang; hasil identik byte demi byte dengan data cakupan RC3.
6. `lint-final.log`: oxlint tanpa peringatan kode render. Typecheck pada saat pengujian sempat tertahan error tes UI milik agen lain (`review-state.test.ts`, deklarasi jsdom); integrator menjalankan ulang pemeriksaan global setelah semua perubahan selesai.
7. `inspect-pdf.py` berhasil membaca dua halaman, nol URI dan nol internal annotation pada PDF Einstein Chrome yang disertakan RC3. Ini hanya uji helper terhadap artefak lama; bukan PDF kandidat.
8. `final-visual-regression-unit.json`: 72/72 unit render lulus setelah PF-R4-07/08; `typecheck-after-visual-fixes.log` dan `lint-after-visual-fixes.log` lulus. Baseline terpisah: `blank-cover-red.json` (2 gagal, 4 kontrol lulus) dan `table-contrast-red.json` (1 gagal).
9. `pdf-visual-history/FINDINGS.md`: 29 halaman PDF historis dirender melalui Poppler 150 dpi, dengan enam contact sheet berlabel arsip RC3. Dua cacat layout di atas dikonfirmasi dari visual dan source. PUA fallback tetap menjadi batas yang nyata; eksperimen jsPDF kehilangan teks terlihat dan tidak diperlakukan sebagai jalur produksi.

## Peninjauan silang perubahan core

Peninjauan ini membaca source perubahan agen core tanpa menulis source di luar kepemilikan render. Agen core memperbaiki dua temuan yang direproduksi selama pemeriksaan silang:

1. Literal `\(x\)` / `\[y\]` di `<kbd>` dan `<samp>` sempat kehilangan delimiter pada konversi clipboard baru. Guard literal kini mencakup keduanya. `core-cross-review.json` dan `core-cross-review-after.json` menyimpan sebelum/sesudah; kode dan delimiter setelah perbaikan utuh. Lima probe marker palsu, event handler, javascript URL, teks HTML dalam TeX, dan format inline menghasilkan nol elemen/atribut aktif pada DOM hasil. Ini pemeriksaan output jsdom, bukan bukti eksekusi browser.
2. Guard kedalaman pertama sempat berjalan setelah konversi parse5→HAST yang rekursif, sehingga 1.800/4.000/8.000 `<div>` masih melempar `RangeError` (`core-cross-depth.json`, `core-cross-depth-stack.log`). Agen core mengganti jalur admission dengan parse5 tree lalu traversal iteratif sebelum HAST. `core-cross-depth-after.json` memeriksa 10 input: `<div>` dan `<template>` pada kedalaman 64/256/1.800/4.000/8.000, masing-masing melalui clipboard, raw HTML render, dan conversation import. Kontrol 64 diterima; input berlebih ditolak dengan hasil budget yang benar, tanpa RangeError. `template.content` juga ikut dihitung. Pekerjaan ini bukan benchmark browser.

`core-cross-raw-table.json` memeriksa signature tabel terhadap rujukan gambar lokal/data/external, href fragment, href berbahaya yang dinonaktifkan, metadata sumber palsu, dan rumus matriks multiline. Rujukan tetap cocok pada keluaran normal; metadata sumber palsu tidak dipercaya. Batas yang dicatat: signature gambar memeriksa referensi, belum membandingkan perubahan `alt`/`title`; mutasi alt dapat lolos oracle itu. Tidak ditemukan bukti renderer menghilangkan alt dalam kasus yang diuji. Guard konservatif menolak signature `.pf-math[data-tex]` palsu setelah sanitasi.

Jalur penggabungan formula lintas inline wrapper sudah memakai cache teks dan pencarian offset biner; kekhawatiran pemindaian ulang semua sibling untuk setiap formula diselesaikan oleh agen core. Timing diagnostik sebelum itu tersimpan di `clipboard-cross-perf.json` dan tidak dipakai sebagai klaim performa browser atau skor produksi.

## Batas yang tetap ada

- Mesin KaTeX tidak menjalankan seluruh distribusi/paket LaTeX; perintah tidak didukung harus tetap dilaporkan.
- CJK, Arab dan font yang tidak dibundel belum mendapat jaminan output luring. Perbaikan mendeteksinya lebih lengkap, tidak mengarang dukungan font.
- PDF keluar melalui dialog cetak browser. Dokumen tidak diubah menjadi screenshot raster demi mengklaim tombol unduh PDF.
- Paged.js tetap menggunakan DOM thread utama. Profil kinerja baru dan stres visual tidak dapat dinyatakan lulus tanpa browser kandidat.
- `pdf-engine-eval.mjs` adalah eksperimen pembanding dengan pustaka eksternal opsional; hasil prototype lama bukan bukti rilis baru.
- Browser fisik/Safari, pembaca layar, dialog native, dan Cloudflare pemilik belum diuji oleh subaudit ini.
