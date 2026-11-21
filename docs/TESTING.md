# Pengujian — 3.0.0-rc.2

Semua bukti ditulis ke `evidence/` dan terikat ke `candidateSha256` (hash isi source, konfigurasi, lockfile, skrip, tes dan
fixture; `scripts/fingerprint.mjs`). Bila salah satu berubah, bukti lama tidak berlaku — jalankan ulang. Dokumen (`docs/`,
`README.md`) tidak termasuk kandidat. Urutan lengkap yang dipakai untuk rilis ini tercatat di `evidence/steps.txt`.

## Perintah

| Perintah | Isi | Bukti |
|---|---|---|
| `npm ci` | instalasi bersih dari lockfile | `evidence/npm-ci.log`, `npm-audit.json` |
| `npm run typecheck` | TypeScript 7 strict | `typecheck.log` |
| `npm run lint` | oxlint, kategori *correctness*, `--deny-warnings` | `lint.log` |
| `npm test` | vitest: unit + integrasi (Node & jsdom); termasuk uji Worker di Node **tanpa DOM** | `unit-tests.log` |
| `npm run build` / `build:qa` | SBOM → Vite → `verify-static-release` | `build-*.log`, `*.build-manifest.json` |
| `npm run test:e2e` | 31 skenario Chrome nyata terhadap `dist-qa` di server ala Pages | `e2e-results.json` |
| `npm run test:smoke` | `dist` produksi: rute, header, deep link, 404, tanpa kait QA | `static-smoke.json` |
| `npm run test:gate` | verifier harus GAGAL pada 10 jenis kerusakan dist (backend, harga, kait QA, `_worker.js`, `functions/`, berkas wajib, CSP, Worker hilang, sumber eksternal) | `release-gate.json` |
| `npm run test:pdf` | PDF nyata dari mesin cetak Chrome & Firefox + pemeriksaan poppler/qpdf; memori ekspor berulang | `pdf-verification.json`, `evidence/pdf/` |
| `npm run test:browsers` | alur inti di Chromium, Firefox (WebDriver BiDi), WebKitGTK (W3C WebDriver) | `cross-browser.json` |
| `npm run test:perf` | matriks performa 10–1.000 halaman, berulang | `perf-matrix.json` |
| `node tests/e2e/stress-pages.mjs 115` | pembanding baseline RC1 (196 halaman) | `stress-115.json` |
| `node tests/e2e/pdf-engine-eval.mjs` | evaluasi jalur PDF A vs B (butuh `PF_EVAL_LIBS` dengan jspdf, html2canvas-pro, pdf-lib) | `pdf-engine-eval.json` |
| `npm run scan:secrets`, `npm run sbom` | pola rahasia; SBOM & lisensi | `secret-scan.json`, `release/SBOM.json` |

Browser tambahan: Firefox via `PF_FIREFOX` (rilis ini: Firefox 160.0 dari paket conda-forge), WebKitGTK via
`PF_WEBKIT_DRIVER`/`PF_WEBKIT_BROWSER` (paket Ubuntu `webkit2gtk-driver`, Xvfb). Tanpa biner tersebut skrip mencatat
`not-available`, bukan lulus.

## Regresi (unit/integrasi)

| Berkas | Cakupan |
|---|---|
| `tests/unit/engine/worker-handler.test.ts` | MESIN-36: penangan Worker di Node tanpa `document`/`window`; urutan progress; hasil dapat diklon; batal; versi protokol; karakter tak terlihat |
| `tests/unit/engine/client.test.ts` | MESIN-36: hasil usang ditolak, versi dokumen, timeout → Worker dihentikan & dibuat ulang, batal, crash berulang → fallback, gagal muat → fallback langsung |
| `tests/unit/render/pagination-regressions.test.ts` | paragraf hilang, halaman terduplikasi, tabel terpotong/baris berulang, heading berubah teks/level, blok bertukar urutan (panjang teks sama), karakter bertukar, nomor halaman salah, daftar isi salah/tujuan hilang, tautan internal rusak, baris kode, tanda hubung mesin, baris tabel terbelah |
| `tests/unit/render/inventory.test.ts` | inventaris isi: pemecahan sah lulus; hilang/duplikat/angka/gambar/rumus gagal |
| `tests/unit/core/static-regressions.test.ts` | EN-003 (PUA), EN-011 (marker percakapan), QA-02 (anggaran piksel), gambar `data:` inline |
| `tests/unit/render/static-export.test.ts` | QA-01 (font gagal → tanpa byte), EN-012 |
| `tests/unit/core/undo-project.test.ts`, `rc3-compat.test.ts` | undo/redo transaksi; paket `.pfproj` RC3 asli |
| `tests/unit/ui/compat.test.ts` | penjelasan kompatibilitas browser |

`evidence/history/rc1-red-on-rc3.txt`: bukti historis RC1 — kasus EN-003/EN-011 gagal pada source RC3 (14/15) sebelum
diperbaiki. Terikat ke kandidat RC1, bukan kandidat ini.

## Aturan normalisasi kesetaraan isi

**Paginasi** (`contentInventory`/`compareInventory`, `src/render/paginate.ts`): isi sebelum paginasi dibandingkan dengan isi
halaman datar yang benar-benar dicetak, bukan sekadar jumlah karakter:
- teks seluruh dokumen tanpa spasi (pemecahan baris/halaman sah);
- urutan blok (`data-block-id`, fragmen berurutan digabung) → hilang/bertambah/berulang/berubah urutan;
- teks per blok → lokasi kehilangan/duplikasi/pemotongan;
- heading berurutan dengan level; jumlah baris per tabel menurut identitas baris (`data-pf-row`);
- angka, gambar (`src`), rumus (`data-tex`), tautan;
- struktur halaman: label nomor halaman tiap halaman, nomor halaman di daftar isi = halaman tujuan, tujuan tautan internal.
Yang dinormalisasi (presentasi sah): spasi; salinan header tabel berulang (`[data-pf-repeat]`); MathML tersembunyi KaTeX;
nomor halaman daftar isi (diperiksa terpisah); tanda hubung U+2011 yang ditambahkan Paged.js di titik putus (`.pagedjs_hyphen`).

**PDF** (`tests/e2e/pdf-verify.mjs`): teks per halaman dari `pdftotext` dibandingkan dengan fragmen blok halaman yang sama,
berurutan. Normalisasi: NFC, huruf kecil (CSS `text-transform`), tanpa spasi/tanda hubung, butir daftar diperiksa satu per
satu (penanda 1./• bukan teks DOM), sel tabel diperiksa per sel, urutan aliran konten (`-raw`) sebagai cadangan bila urutan
baca pdftotext mengelompokkan kolom. Karakter tanpa glyph tersemat (Private Use, emoji berpresentasi emoji) dikeluarkan hanya
bila aplikasi telah melaporkan `FONT_GLYPH_NOT_BUNDLED`; Type 3 juga hanya diterima dalam kondisi itu. Rumus/gambar diperiksa
lewat anotasi/objek, bukan teks.

## Manual (belum dijalankan — status NOT VERIFIED)

Dialog cetak native per browser:
1. Buka `fixtures/mixed-document.md` lewat **Buka berkas**, tunggu siap, **Periksa halaman** → verifikasi "pass", catat N halaman.
2. **Periksa dan ekspor → Cetak / Simpan PDF → Siapkan cetak → Buka dialog cetak**.
3. Tujuan "Simpan sebagai PDF", ukuran kertas sama, skala 100 %, header/footer browser mati, grafik latar aktif → Simpan.
4. Periksa PDF: N halaman; teks "PENUTUP-AKHIR-DOKUMEN" dapat dicari; nomor halaman bawah berurutan; daftar isi menunjuk
   halaman benar; tabel 70 baris lengkap (R001–R070); kode `baris_001`–`baris_110` lengkap; tautan `https://contoh.id/laporan` dapat diklik.
5. Ulangi dengan **Batal** pada dialog: aplikasi menampilkan "dialog ditutup — tidak dapat mengetahui apakah PDF disimpan".
6. Catat browser/versi/OS dan hasil ke `evidence/manual/`.

Pembaca layar (NVDA/VoiceOver): navigasi landmark, tab panel, alur kerja 1–5, dialog ekspor, pengumuman status siap.
Perangkat seluler: alur yang sama di Android Chrome dan iOS Safari, termasuk rotasi dan cetak.
