# PaperForma 3 — studio dokumen statis

PaperForma menyusun materi Markdown, teks, percakapan AI, ZIP (naskah + gambar) dan proyek `.pfproj` menjadi dokumen
rapi, lalu menyimpannya sebagai **HTML** (mandiri, ZIP, publikasi) atau mencetaknya ke **PDF lewat dialog cetak browser**.
Semua pemrosesan berjalan di browser. Tidak ada akun, harga, paket, kuota, backend API, telemetry, atau pengiriman isi dokumen.

Versi: `3.0.0-rc.3` — kandidat rilis (perbaikan mesin matematika: rumus dari ChatGPT tidak lagi tampil mentah). Semua gerbang yang dapat dijalankan otomatis lulus; dialog cetak native, Safari/perangkat
fisik, pembaca layar dan hosting Cloudflare nyata belum diverifikasi (lihat `docs/RELEASE_REPORT.md`, `docs/KNOWN_LIMITS.md`).

Analisis dokumen berjalan di **Web Worker** (MESIN-36) sehingga editor tetap responsif; paginasi diverifikasi isi per blok,
heading, baris tabel, nomor halaman dan daftar isi sebelum cetak diizinkan.

## Menjalankan

Prasyarat: Node **24.22.3** dan npm **11.9.0** (`engine-strict=true`). Tidak ada kredensial atau variabel lingkungan yang dibutuhkan.

```bash
npm ci                 # dari package-lock.json
npm run typecheck      # tsc --noEmit
npm run lint           # oxlint (correctness, nol peringatan)
npm test               # vitest: unit + integrasi + regresi audit + Worker tanpa DOM
npm run build          # SBOM/notice → vite build → verifikasi statis → dist/
npm run preview        # server lokal ala Cloudflare Pages (dist/, _headers, 404) di http://127.0.0.1:4173
npm run build:qa       # dist-qa/ dengan kait QA (window.__pf) untuk E2E; JANGAN dideploy
npm run test:e2e       # Chrome headless (puppeteer-core) terhadap dist-qa → evidence/e2e-results.json
npm run test:smoke     # build produksi dist/ di Chrome → evidence/static-smoke.json
npm run test:gate      # verifier harus menolak dist yang dirusak
npm run test:pdf       # PDF nyata dari mesin cetak Chrome (+ Firefox bila PF_FIREFOX) diperiksa poppler/qpdf
npm run test:browsers  # alur inti di Chromium, Firefox, WebKitGTK (bila tersedia)
npm run test:perf      # matriks performa 10–1.000 halaman
```

E2E memerlukan Chrome/Chromium lokal (`PF_CHROME=/path/ke/chrome` bila tidak di `/usr/bin/google-chrome`).

## Deploy (GitHub → Cloudflare Pages)

Build command `npm run build`, output directory `dist`, root `/`, environment `NODE_VERSION=24.22.3`.
Tanpa Functions, Cloudflare Worker, binding, atau secret (Web Worker browser adalah aset statis biasa). Rincian, verifikasi pasca-deploy dan rollback: `docs/DEPLOY_CLOUDFLARE.md`.

## Struktur

| Path | Isi |
|---|---|
| `src/engine/` | MESIN-36: Web Worker analisis (protokol, klien dengan batal/timeout/penolakan hasil usang, fallback) |
| `src/core/` | Mesin murni: impor, tempel, percakapan, Markdown/GFM, matematika, sanitasi, integritas, aset, ZIP, proyek, riwayat, undo, penyimpanan IndexedDB, preflight |
| `src/render/` | Templat, font, Mermaid, komposisi HTML, ekspor HTML/ZIP, paginasi Paged.js, persiapan cetak lokal |
| `src/ui/` | Aplikasi (beranda + studio), i18n ID/EN, tema |
| `public/` | `_headers` (CSP & keamanan), `404.html`, panduan, lisensi |
| `scripts/` | build, verifikasi statis, fingerprint, SBOM, server lokal ala Pages, generator stres |
| `tests/unit/` | vitest (jsdom) |
| `tests/e2e/` | skenario browser nyata dan smoke produksi |
| `fixtures/` | korpus, fixture proyek RC3 |
| `evidence/` | hasil uji aktual kandidat ini (ditulis oleh perintah di atas) |
| `release/` | SBOM dan notice pihak ketiga hasil `scripts/sbom.mjs` |

## Dokumen

`docs/RELEASE_REPORT.md` · `docs/PERFORMANCE_REPORT.md` · `docs/DEPLOY_CLOUDFLARE.md` · `docs/KNOWN_LIMITS.md` · `docs/PRIVACY.md` · `docs/TESTING.md` · `docs/ACCEPTANCE.md` ·
`docs/MIGRATION.md` · `docs/RECOVERY.md` · `docs/CORE_API.md` · `docs/RENDER_API.md` · `docs/TEMPLATES.md` · `CHANGELOG.md`.
