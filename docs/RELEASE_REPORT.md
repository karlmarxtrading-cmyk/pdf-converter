# Laporan rilis — PaperForma 3.0.0-rc.3

**Status: kandidat rilis (bukan rilis stabil).** Semua gerbang yang dapat dijalankan di lingkungan pembuatan lulus; gerbang yang memerlukan dialog cetak manusia, Safari/perangkat fisik, pembaca layar, akun Cloudflare dan pilot pengguna berstatus NOT VERIFIED (lihat §8).

- Kandidat: `candidateSha256 = 82397ea41b8253c9c0b6678ea9d879effeb44e6b1f8f37b3b692c341ec7a5465` — identik di seluruh bukti
- `dist`: `2e2caeb32aaae0223b106b7a116462fb1f0ad5a68216a23073fc1aba3f416487` · `dist-qa`: `557d52a65d99bc80266b368993c7f4276b38ff868bed04e56e756693abd40370`
- Urutan bukti (clean-room, `evidence/steps.txt`): npm-ci ✓ · npm-audit ✓ · typecheck ✓ · lint ✓ · unit-tests ✓ · build-production ✓ · build-qa ✓ · verify-static ✓ · e2e ✓ · static-smoke ✓ · release-gate ✓ · pdf-verify ✓ · cross-browser ✓ · verify-deployment ✓ · stress-115 ✓ · pdf-engine-eval ✓ · perf-matrix ✓ · secret-scan ✓ · sbom ✓

## 1. Ringkasan uji

| Uji | Hasil |
|---|---|
| Unit + integrasi (vitest) | 255/255 lulus, 30 berkas |
| E2E Chrome | 33/33 lulus |
| PDF nyata (Chrome + Firefox) | 7/7 kasus lulus |
| Lintas-browser | chromium: pass, firefox: pass, webkit: pass · HTML isi identik antar-mesin: True |
| Smoke produksi (`dist`) | lulus |
| Gerbang rilis | lulus: 10/10 kasus sesuai harapan |
| Lint · typecheck · npm audit · pemindaian rahasia | lulus · lulus · 0 kerentanan · lulus |

## 2. Perbaikan mesin matematika (laporan: rumus mentah di performa-cwd.pages.dev)

- Akar masalah direproduksi di Chrome nyata pada build rc.2: (1) konversi HTML clipboard → Markdown meng-escape delimiter literal (`\\(E_0\\)`, `\$E\$`) sehingga tidak dikenali sebagai rumus; (2) `\[…\]`/`$$…$$` satu baris dirender inline di semua jalur; (3) spasi sebelum KaTeX hilang, MathML alttext dibuang, MathJax math/tex terhapus, "$5 … 10$" dianggap rumus. Bukti: `evidence/history/rc2-red-math.txt`, `rc2-deployment-math.json`, `rc2-chatgpt-html-literal.png`.
- Setelah perbaikan: unit Einstein + E32 (5 jalur tempel) + E33 (HTML ekspor & PDF) lulus — E32 pass, E33 pass; PDF Einstein Chrome & Firefox: Chrome pass, Firefox pass.
- `npm run verify:deployment -- <URL>` (build produksi, tanpa kait QA): LULUS terhadap http://127.0.0.1:4610 (dist produksi kandidat ini, server ala Pages lokal); terhadap build rc.2 skrip GAGAL (0 rumus, `\( \) \[ \] \boxed \frac` tersisa). **Belum dijalankan terhadap https://performa-cwd.pages.dev** — lingkungan pembuatan tidak dapat menjangkau domain itu dan tidak memiliki akses akun Cloudflare; jalankan setelah deploy rc.3.

- Catatan uji: pada run clean-room pertama rc.3, E25 gagal karena uji membaca iframe pratinjau dokumen ±540 halaman sebelum `srcdoc` baru selesai dimuat (race di uji, aplikasi benar). Uji kini menunggu maks 60 s dan tetap gagal bila edit terakhir tidak pernah tampil; lulus 3/3 berturut-turut lalu lulus di run bukti final ini. E32/E33 gagal di run itu karena folder bukti belum dibuat — diperbaiki di uji.

## 2b. MESIN-36 — Web Worker

- `src/engine/`: `analyze.ts` (fase chars → render → integrity-model → references, tanpa DOM), `handler.ts`, `engine.worker.ts`, `protocol.ts`, `client.ts`.
- Thread utama: DOMPurify + sisip KaTeX (`finishRender`), pemeriksaan keutuhan DOM terhadap model dari Worker, komposisi pratinjau, paginasi Paged.js, cetak.
- Bukti: `worker-handler.test.ts` (Node tanpa DOM), `client.test.ts` (usang/versi/timeout/batal/crash/gagal muat), E25 (edit saat analisis 540 hlm: pekerjaan lama dibatalkan, pratinjau = revisi terakhir), E26 (jeda event loop maks Worker vs fallback, HTML identik), E28 (chunk Worker hilang → fallback tanpa revisi gagal).

## 3. Paginasi dan PDF

- Pemeriksaan kesetaraan isi per blok/heading/baris tabel/urutan + struktur halaman (nomor halaman, daftar isi, tautan internal) pada HTML datar yang dicetak; regresi di `pagination-regressions.test.ts`.
- Kode panjang dipecah per baris; perbaikan otomatis memutus sebelum baris tabel yang meluap; tanda hubung mesin di kode dihapus; baris yatim/janda dilaporkan.
- Cacat laten RC1 diperbaiki: gambar `data:` inline selalu memblokir ekspor (`INTEGRITY_ASSET_CHANGED`).

### Evaluasi jalur PDF (`evidence/pdf-engine-eval.json`)

| Dokumen | Mesin | Waktu (ms) | Ukuran (MiB) | Halaman | Cakupan teks blok |
|---|---|---|---|---|---|
| small (11 hlm) | A: Chrome print engine | 307 | 0.34 | 11 | 0.929 |
| small (11 hlm) | B1-jspdf-html | 2813 | 4.24 | 11 | 0 |
| small (11 hlm) | B2-raster | 2430 | 3.08 | 11 | 0 |
| medium (63 hlm) | A: Chrome print engine | 1366 | 0.74 | 63 | 0.992 |
| medium (63 hlm) | B1-jspdf-html | 25646 | 14.73 | 63 | 0 |
| medium (63 hlm) | B2-raster | 27163 | 28.9 | 63 | 0 |
| large (196 hlm) | A: Chrome print engine | 2344 | 1.56 | 196 | 0.999 |
| large (196 hlm) | B1-jspdf-html | 100747 | — | — | timeout setelah 115 halaman |
| large (196 hlm) | B2-raster | 100418 | — | — | timeout setelah 103 halaman |

Keputusan: jalur A (mesin cetak browser atas halaman terverifikasi). Jalur B menghasilkan halaman raster (teks tidak dapat dicari), berkas jauh lebih besar dan tidak selesai pada 196 halaman dalam batas 100 detik. Tidak ada tombol "Unduh PDF" yang memanggil print. Kolom cakupan teks jalur A memakai pemeriksa sederhana (blok berumus/emoji ikut dihitung); pemeriksa ketat ada di tabel berikut.

## 4. Hasil ekspor PDF nyata (`evidence/pdf-verification.json`)

| Kasus | Halaman | Chrome 153 | Firefox 160 |
|---|---|---|---|
| small-mixed-A4 | 11 | pass · 346 KiB · 260 ms · font 16 (Type 3: 3) · URI 3 / internal 14 | pass · 449 KiB · 5372 ms · font 37 (Type 3: 2) · URI 28 / internal 37 |
| einstein-A4 | 2 | pass · 47 KiB · 84 ms · font 8 (Type 3: 0) · URI 0 / internal 0 | pass · 91 KiB · 1140 ms · font 19 (Type 3: 0) · URI 0 / internal 1 |
| small-mixed-Letter-landscape | 14 | pass · 352 KiB · 277 ms · font 16 (Type 3: 3) · URI 3 / internal 14 | pass · 459 KiB · 5533 ms · font 37 (Type 3: 2) · URI 28 / internal 37 |
| small-mixed-A5 | 21 | pass · 368 KiB · 339 ms · font 16 (Type 3: 3) · URI 3 / internal 15 | pass · 485 KiB · 5922 ms · font 40 (Type 3: 2) · URI 29 / internal 38 |
| medium-30 | 63 | pass · 759 KiB · 934 ms · font 16 (Type 3: 3) · URI 3 / internal 45 | pass · 992 KiB · 9329 ms · font 37 (Type 3: 2) · URI 90 / internal 130 |
| large-115 | 196 | pass · 1600 KiB · 2808 ms · font 3 (Type 3: 0) · URI 0 / internal 116 | pass · 2100 KiB · 16833 ms · font 9 (Type 3: 0) · URI 232 / internal 349 |

Pemeriksaan tiap PDF: qpdf valid, jumlah halaman = paginasi, tidak ada halaman kosong tak terduga, setiap blok teks ditemukan berurutan di halamannya, setiap sel tabel ada, nomor halaman tercetak, font tersemat, anotasi tautan. Memori ekspor berulang: [{"round": 1, "usedMiB": 20.1, "iframes": 7}, {"round": 2, "usedMiB": 20.1, "iframes": 7}, {"round": 3, "usedMiB": 20.4, "iframes": 7}, {"round": 4, "usedMiB": 20.7, "iframes": 7}, {"round": 5, "usedM (pertumbuhan 1.1 MiB).

## 5. Performa

Lihat `docs/PERFORMANCE_REPORT.md` (10–1.000 halaman, median/p95, pembatalan, edit ulang, memori, jeda event loop, perbandingan RC1).

## 6. Kompatibilitas browser (`evidence/cross-browser.json`)

| Mesin | Versi | Status | Dokumen campuran | 50 bagian |
|---|---|---|---|---|
| chromium | Chromium Chrome/153.0.8010.12 | pass | 11 hlm, pass (1109 ms) | 87 hlm, pass (4383 ms) |
| firefox | Firefox firefox/160.0 | pass | 12 hlm, pass (5756 ms) | 87 hlm, pass (5891 ms) |
| webkit | WebKitGTK 2.52.6 (MiniBrowser) | pass | 13 hlm, pass (3932 ms) | 87 hlm, pass (17256 ms) |

Firefox dari paket conda-forge (Linux, headless, WebDriver BiDi); WebKitGTK MiniBrowser (Linux, Xvfb) **bukan** Safari. Cacat lintas-mesin yang ditemukan dan diperbaiki: tabel meluap di Firefox, kode terputus tengah kata dengan tanda hubung tambahan dan baris tabel terbelah di WebKit — semuanya sebelumnya ditolak (fail-closed), kini lulus.

## 7. Keamanan & dependensi

- `npm audit`: 0 kerentanan; SBOM 255 paket runtime (0 lisensi tidak diketahui), lisensi permisif kecuali elkjs (Mermaid) EPL-2.0 OR GPL-3.0-or-later — tanpa modifikasi, notice disertakan.
- CSP `default-src 'self'`, `worker-src 'self' blob:`, `connect-src 'self'`; tidak ada `/api`, telemetri, atau rahasia (secret scan lulus).
- Masukan tidak tepercaya: E23 (script/handler/iframe/javascript:/SVG/Mermaid), karakter kendali/bidi/lebar-nol dilaporkan tanpa diubah, ZIP/gambar dengan anggaran sebelum kerja mahal.

## 8. Status produksi & yang belum dapat diuji

NOT VERIFIED: dialog cetak native (Chrome/Edge/Firefox/Safari), Safari macOS/iOS, perangkat seluler fisik, pembaca layar & zoom 400 %, hosting Cloudflare nyata (header edge, pembaruan versi), pilot pengguna. Prosedur: `docs/TESTING.md` §Manual dan `docs/DEPLOY_CLOUDFLARE.md` §3. SEBAGIAN: lihat `docs/ACCEPTANCE.md`.

Matriks penerimaan: LULUS 39, SEBAGIAN 15, NOT VERIFIED (BLOCKED BY ENVIRONMENT) 7, N/A 1.

## 9. Deploy

GitHub → Cloudflare Pages: build command `npm run build`, output `dist`, `NODE_VERSION=24.22.3`, tanpa Functions/binding/secret. Rinci: `docs/DEPLOY_CLOUDFLARE.md`.
