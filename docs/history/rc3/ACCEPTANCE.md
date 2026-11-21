# Matriks penerimaan — 3.0.0-rc.3

Kandidat `candidateSha256 = 82397ea41b8253c9c0b6678ea9d879effeb44e6b1f8f37b3b692c341ec7a5465`. Sumber kriteria: `06_MATRIKS_PENERIMAAN_STATIS.csv` (paket audit 2026-11-20), tanpa kriteria dihapus atau dipersempit.

Status: **LULUS** = seluruh hasil yang diharapkan dibuktikan pada kandidat ini; **SEBAGIAN** = sebagian dibuktikan, bagian yang belum disebut; **NOT VERIFIED (BLOCKED BY ENVIRONMENT)** = memerlukan perangkat, akun, browser asli atau manusia yang tidak tersedia — bagian otomatis yang lulus disebut, tetapi butir TIDAK dianggap lulus; **N/A** = fitur tidak ditawarkan produk.

Rujukan E01–E33 = `evidence/e2e-results.json`. Bila skenario rujukan gagal, status otomatis diturunkan oleh generator dokumen ini.

| ID | Area | Status | Hasil aktual | Bukti |
|---|---|---|---|---|
| ST-QA-01 | build | **LULUS** | Clean-room dari ZIP: `npm ci` → typecheck → lint → 255 unit → build prod & QA; dist deterministik (`2e2caeb32aaa…`), dicocokkan ulang setelah ekstraksi ZIP. | steps.txt, *.build-manifest.json, AUDIT_ZIP.json |
| ST-QA-02 | dependencies | **LULUS** | `npm audit` 0 kerentanan; SBOM 255 paket runtime; lisensi: MIT 189, ISC 43, BSD-3-Clause 9, Apache-2.0 6, OFL-1.1 3, (MPL-2.0 OR Apache-2.0) 1, EPL-2.0 OR GPL-3.0-or-later 1, BSD-2-Clause 1; seluruhnya permisif kecuali elkjs (dependensi Mermaid) EPL-2.0 OR GPL-3.0-or-later — dipakai tanpa modifikasi, notice disertakan di licenses/THIRD_PARTY_NOTICES.txt; kewajiban EPL-2.0 dicatat di KNOWN_LIMITS. Graf impor bundel tanpa jalur backend (verifier). | npm-audit.json, release/SBOM.json, verify-static.log |
| ST-QA-03 | network | **LULUS** | Seluruh skenario mencatat request; nol request ke origin lain (E05 memblokir semua jaringan untuk HTML ekspor). Worker same-origin. | e2e-results.json E01/E05/E18 |
| ST-QA-04 | product | **LULUS** | Inventaris string UI + HTML oleh verifier (kosakata harga/paket/langganan/kuota) dan E2E seluruh tindakan utama (33 skenario) tanpa akun/paywall. | verify-static.log, E01, e2e-results.json |
| ST-QA-05 | source_integrity | **LULUS** | BOM/CRLF/PUA/emoji/combining/𝒳 via Buka berkas; sumber identik; karakter kendali/bidi/lebar-nol kini dilaporkan tanpa diubah. | E04; worker-handler.test.ts |
| ST-QA-06 | clipboard | **SEBAGIAN** | Rich paste (E11), undo/redo (E09), parser nested fences/speaker ambigu (unit). Belum: alur konversi *selection* di browser dan salinan nyata dari aplikasi AI. | E11, E09, tests/unit/core/paste*, conversation* |
| ST-QA-07 | xss | **LULUS** | script/on*/iframe/javascript:/data:/form/CSS eksternal tidak dieksekusi di pratinjau maupun ekspor. | E23 |
| ST-QA-08 | svg_mermaid | **SEBAGIAN** | Mermaid click javascript:, SVG script/foreignObject (E23, unit sanitasi). Belum: korpus filter SVG kompleks/bersarang dan anggaran sumber daya diagram. | E23 |
| ST-QA-09 | zip_security | **SEBAGIAN** | Traversal, path absolut/backslash, duplikat ternormalisasi, symlink, terenkripsi, CRC/ukuran, rasio/jumlah/kedalaman: unit (dipertahankan dari RC3). Belum: korpus adversarial lewat impor browser. | tests/unit/core/assets-zip.test.ts |
| ST-QA-10 | zip_import | **LULUS** | ZIP bersubfolder/berspasi → aset diimpor, gambar tampil, berkas lain dilaporkan. | E12 |
| ST-QA-11 | image_budget | **SEBAGIAN** | Header ekstrem/JPEG rusak/SVG/total proyek ditolak sebelum dekode (unit + E21). Belum: hitung frame animasi GIF/WebP; nilai anggaran belum didukung benchmark perangkat. | E21, static-regressions |
| ST-QA-12 | math_numbers | **SEBAGIAN** | Dokumen Einstein lewat 5 jalur masuk (teks, HTML literal ChatGPT, HTML KaTeX, ubah-fragmen, percakapan): 11 rumus = TeX sumber, mode display/inline sesuai delimiter, \boxed/\frac/\sqrt/pmatrix/\int, mata uang & kode utuh; HTML ekspor luring & PDF (font KaTeX tersemat) — tinjauan visual tangkapan layar. Belum: korpus aligned/cases dan LaTeX invalid di browser. | math-einstein.test.ts, E32, E33, evidence/math/ |
| ST-QA-13 | tables | **LULUS** | Tabel 70 baris & 12 kolom di PDF Chrome/Firefox: setiap sel ditemukan di halaman yang benar; header berulang tidak dihitung ganda; baris per identitas; tabel terpotong/baris berulang terdeteksi (regresi). | pdf-verification.json, pagination-regressions.test.ts |
| ST-QA-14 | navigation | **LULUS** | Struktur halaman datar: label nomor halaman, nomor TOC = halaman heading tujuan, tujuan tautan internal; anotasi tautan internal & eksternal di PDF. | pagination-regressions.test.ts, pdf-verification.json |
| ST-QA-15 | templates | **SEBAGIAN** | A4, Letter lanskap, A5 diverifikasi sampai PDF (BUS-01: sampul, TOC, header, nomor halaman). Belum: matriks pairwise empat templat × kertas × orientasi × brand. | pdf-verification.json |
| ST-QA-16 | html_export | **LULUS** | HTML mandiri via file:// tanpa jaringan di 320/390/768/1440. | E05 |
| ST-QA-17 | html_zip | **SEBAGIAN** | ZIP & publikasi diekstrak aman, dibuka file:// tanpa jaringan (Chrome). Belum: pembukaan ekspor di Firefox/WebKit dan server statis pihak ketiga. | E05 |
| ST-QA-18 | failure_integrity | **SEBAGIAN** | Font diblokir → tanpa byte (E06); batal/Escape + retry (E08); revisi usang ditolak (unit + E25). Belum: injeksi aset lambat. | E06, E08, E25 |
| ST-QA-19 | native_print | **NOT VERIFIED (BLOCKED BY ENVIRONMENT)** | Otomatis: PDF dari mesin cetak Chrome 153 & Firefox 160 atas HTML yang sama dengan isi dialog, 5 kasus 12–196 hlm lulus; window.print()/lifecycle (E07). Dialog native manusia: belum. | pdf-verification.json, E07; prosedur docs/TESTING.md §Manual |
| ST-QA-20 | local_pdf | **N/A** | Tidak ada generator PDF langsung. Prototipe jsPDF/html2canvas diukur dan ditolak (teks 0 %); tidak ada tombol unduh PDF palsu. | pdf-engine-eval.json |
| ST-QA-21 | portable_project | **LULUS** | .pfproj RC3 asli dibuka/dirender/diekspor; paket rusak ditolak; .pfproj 3.0 percakapan dibuka ulang. | rc3-compat.test.ts, E12, E24 |
| ST-QA-22 | concurrency_storage | **LULUS** | Dua tab mengubah proyek sama → konflik, tidak menimpa. | E15 |
| ST-QA-23 | storage_failure | **LULUS** | Kuota origin nyata dipaksa kecil → status "Penyimpanan penuh", isi tetap, paket cadangan terunduh (E30); blocked/unavailable/deleted diinjeksi di unit. | E30, storage tests |
| ST-QA-24 | origin_migration | **LULUS** | Paket .pfproj dari origin A dibuka utuh di origin B (renderInputHash sama); penyimpanan tidak ikut pindah. | E31, docs/MIGRATION.md |
| ST-QA-25 | pagination_completeness | **LULUS** | Matriks 10–1.000 halaman: verifikasi isi lulus di setiap ukuran dan ulangan. | perf-matrix.json, stress-115.json |
| ST-QA-26 | performance | **NOT VERIFIED (BLOCKED BY ENVIRONMENT)** | Diukur di kontainer desktop (Chrome headless): pratinjau ±10 hlm, 20 ketikan → 1 render, median/p95. Android referensi tidak tersedia. | E22, perf-matrix.json |
| ST-QA-27 | accessibility | **NOT VERIFIED (BLOCKED BY ENVIRONMENT)** | axe WCAG 2 A/AA 0 pelanggaran (terang & gelap), keyboard saja, fokus dialog, zoom 200 %. Belum: NVDA/VoiceOver, zoom 400 %. | E17, E27 |
| ST-QA-28 | real_mobile | **NOT VERIFIED (BLOCKED BY ENVIRONMENT)** | Viewport 320/360/390/768 dan zoom 200 % (headless). Perangkat fisik tidak tersedia. | E14, E27 |
| ST-QA-29 | hosting | **NOT VERIFIED (BLOCKED BY ENVIRONMENT)** | Server lokal ala Pages: index/print/assets/MIME/404/deep link. Deploy Cloudflare nyata tidak dilakukan (tanpa akses akun). | static-smoke.json, E02 |
| ST-QA-30 | release_zip | **LULUS** | ZIP rilis diaudit setelah dibentuk dan diekstrak-bangun ulang. | AUDIT_ZIP.json |
| ST-QA-31 | release_gate | **LULUS** | Verifier menolak 9 jenis kerusakan, menerima kontrol bersih; bukti terikat kandidat. | release-gate.json |
| ST-QA-32 | pua_regression | **LULUS** | PUA bersebelahan rumus: parse/pratinjau/ekspor utuh; oracle mendeteksi korupsi. | static-regressions, E04 |
| ST-QA-33 | conversation_detection | **LULUS** | Marker literal di paragraf/kode/komentar tidak memecah pesan; teks luar wrapper dipertahankan. | static-regressions, E16 |
| ST-QA-34 | conversation_selection | **LULUS** | Pilih pesan 2/4/6 → transkrip → paket → buka ulang. | E24 |
| ST-QA-35 | preflight_target | **LULUS** | Kesiapan HTML vs Cetak terpisah, terikat revisi/hash; edit mencabut kesiapan. | E03, E07 |
| ST-QA-36 | dirty_close | **SEBAGIAN** | beforeunload untuk perubahan belum tersimpan; pemulihan setelah muat ulang (E14). Belum: crash tab paksa & siklus hidup seluler. | E14 |
| ST-QA-37 | static_boundary | **LULUS** | Endpoint lama → 404; tidak ada fetch backend. | E02, static-smoke.json |
| ST-QA-38 | no_commercial_limits | **LULUS** | Tanpa batas paket; 1.000 halaman, > 300 temuan diproses. | perf-matrix.json, E13 |
| ST-QA-39 | static_build_graph | **LULUS** | Build tanpa kredensial/binding/folder backend. | build-production.log |
| ST-QA-40 | pages_artifact | **LULUS** | Publish root tanpa _worker.js/functions/_routes.json/Wrangler. | release-gate.json |
| ST-QA-41 | http_headers | **NOT VERIFIED (BLOCKED BY ENVIRONMENT)** | Header CSP/nosniff/referrer/COOP dari _headers di server lokal; Worker, font dan iframe cetak berfungsi di bawah CSP (positif); sumber eksternal ditolak verifier. Header di edge Cloudflare belum diuji. | static-smoke.json, E02, E26 |
| ST-QA-42 | canonical_metadata | **LULUS** | Domain final belum ditentukan → canonical/og:url/robots/sitemap sengaja tidak dibuat; tidak ada domain palsu; isi proyek tidak masuk metadata. | verify-static.log, docs/DEPLOY_CLOUDFLARE.md §5 |
| ST-QA-43 | cache_update | **SEBAGIAN** | Chunk Worker hilang disimulasikan → revisi tetap jadi lewat fallback + banner (E28); HTML no-cache/assets immutable (smoke). Belum: uji dua-build di hosting nyata. | E28, static-smoke.json |
| ST-QA-44 | font_fail_closed | **LULUS** | Font gagal/timeout/rusak × profil ekspor → ExportBlockedError tanpa byte. | static-export.test.ts, E06 |
| ST-QA-45 | print_input_blockers | **LULUS** | Issue input penghalang menolak payload cetak sebelum font. | static-export.test.ts |
| ST-QA-46 | semantic_editing | **SEBAGIAN** | Perbaikan tabel/fence ber-diff (unit RC3 dipertahankan). Belum: korpus semantik baru (indentasi Python, paragraf mirip beda satu angka). | tests/unit/core/repair*, wrapper* |
| ST-QA-47 | asset_cache | **SEBAGIAN** | Ganti gambar bernama & berukuran sama → render memakai isi baru, URL lama tidak muncul (unit). Belum: pemulihan proyek/riwayat setelah penggantian di browser. | asset-replace.test.ts |
| ST-QA-48 | remote_assets | **SEBAGIAN** | Gambar eksternal diblokir di ekspor luring kecuali salinan; CSP connect-src self. Belum: alur izin/cabut izin/CORS/redirect di browser. | exports.test.ts, E05 |
| ST-QA-49 | admission_limits | **SEBAGIAN** | Batas byte/teks/ZIP/riwayat + anggaran piksel ditolak atomik (unit). Belum: impor berturut-turut melewati batas total di browser. | tests/unit/core/budget*, static-regressions |
| ST-QA-50 | local_workers | **LULUS** | Worker: jobId/docVersion, hasil usang & versi beda ditolak, protokol salah ditolak, timeout menghentikan Worker, crash → fallback, gagal muat → fallback langsung, edit saat analisis 540 hlm (E25), sumber tidak keluar perangkat. | client.test.ts, worker-handler.test.ts, E25, E26, E28 |
| ST-QA-51 | glyph_coverage | **LULUS** | Latin/ID/Vietnam/Yunani/Sirilik diekstrak benar dari PDF Chrome & Firefox; PUA & emoji tidak dibundel → FONT_GLYPH_NOT_BUNDLED sebelum ekspor; Type 3 hanya untuk glyph itu. Arab/CJK tidak diklaim. | pdf-verification.json, E04 |
| ST-QA-52 | privacy_canary | **LULUS** | Kanari tidak keluar ke URL/request/konsol. | E18 |
| ST-QA-53 | locale_theme_motion | **LULUS** | ID↔EN, terang/gelap/sistem (mengikuti OS gelap), gerak dikurangi (transisi/animasi 0), isi & angka dokumen tidak berubah. | E10, E27, E29 |
| ST-QA-54 | usability | **NOT VERIFIED (BLOCKED BY ENVIRONMENT)** | Pilot pengguna tidak dapat dilakukan (tanpa peserta). Tidak ada data yang dikarang. | — |
| ST-QA-55 | ui_save_visibility | **LULUS** | Belum disimpan/menyimpan/tersimpan/penuh/konflik terlihat di 360 px & keyboard; paket cadangan dapat dijangkau. | E14, E15, E30 |
| ST-QA-56 | ui_revision_truth | **SEBAGIAN** | Edit dari siap → memproses seketika, pratinjau lama berlabel, hasil usang Worker ditolak (E03, E25). Belum: render baru yang dipaksa gagal di browser. | E03, E25 |
| ST-QA-57 | ui_single_job | **LULUS** | Satu klik = satu pekerjaan; batal saat dokumen panjang; ringkasan di panel. | E03, E08 |
| ST-QA-58 | ui_export_dialog | **LULUS** | Font gagal/batal/Escape di dalam dialog, retry revisi terbaru. | E06, E08 |
| ST-QA-59 | ui_unsaved_form | **LULUS** | Draf brand bertahan ID→EN→ID & tema. | E10 |
| ST-QA-60 | ui_project_undo | **LULUS** | 5× undo / 5× redo tepat; riwayat persisten. | E09, undo-project.test.ts |
| ST-QA-61 | ui_open_paste | **LULUS** | MD/ZIP/PNG/.pfproj lewat satu pintu; PDF/DOCX ditolak spesifik. | E11, E12 |
| ST-QA-62 | ui_complete_lists | **LULUS** | 340 temuan & 27 revisi dijelajah; revisi tertua dipulihkan. | E13 |

Ringkasan: LULUS: 39, SEBAGIAN: 15, NOT VERIFIED (BLOCKED BY ENVIRONMENT): 7, N/A: 1 (total 62).

## Perubahan status dari 3.0.0-rc.1

- Naik ke LULUS: ST-QA-02, 04, 13, 14, 23, 24, 42, 50, 51, 53, 55 (bukti baru: lisensi otomatis, inventaris UI, PDF per sel/struktur halaman, kuota nyata E30, pindah origin E31, Worker, PDF teks per bahasa, gerak dikurangi E29).
- ST-QA-20 tetap N/A: generator PDF langsung dievaluasi dan sengaja tidak dibuat (bukti di pdf-engine-eval.json).
- Butir yang memerlukan dialog cetak manusia, perangkat fisik, pembaca layar, akun Cloudflare atau peserta pilot dipindah dari SEBAGIAN/BELUM ke NOT VERIFIED dengan prosedur di docs/TESTING.md §Manual.
