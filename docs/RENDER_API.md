# RENDER_API — modul `src/render` (PaperForma 3.0.0-rc.4)

Impor dari `src/render/index.ts`. Modul ringan: Paged.js, Mermaid, CSS KaTeX, dan berkas font hanya dimuat dengan
`import()` dinamis saat ekspor/paginasi dipanggil (landing tidak memuat font ekspor — PF-029).
Semua fungsi bekerja pada **Snapshot** (`core.makeSnapshot`) + **RenderedBody** (`core.renderBody`); hasil selalu membawa
`snapshot` (revision, renderInputHash, templateVersion, rendererVersion) yang dipakainya.

## 1. Templat (PF-023…028, UX-06)

| Fungsi | Keterangan |
|---|---|
| `TEMPLATES`, `TEMPLATE_IDS`, `listTemplates()`, `getTemplate(id)` | `TemplateDef`: `id, version, name{id,en}, family, summary, legacyStyle, capabilities, tokens, defaults` |
| `templateDefaultSettings(id, base?)` | `Settings` lengkap sesuai katalog (kertas, margin mm, font, ukuran, sampul/TOC/header) |
| `applyTemplate(settings, nextId)` → `{settings, applied[], kept[]}` | `followTemplateDefaults=true`: preset penuh; `false`: hanya id templat berganti, margin/sampul/TOC/kertas/tipografi milik pengguna dipertahankan dan dilaporkan di `kept` (tampilkan di UI). Judul/bahasa/brand kit tidak pernah diubah. |
| `resetGroup(settings, 'paper'\|'typography'\|'structure'\|'running')` | tindakan eksplisit "kembalikan ke rekomendasi" per kelompok |
| `customizedKeys(settings)` | kunci yang berbeda dari rekomendasi (indikator kustom) |
| `pageSizeMm(paper, orientation)`, `PAPER_MM`, `READABILITY` | batas: isi ≥ 9.5 pt, label ≥ 8.5 pt, skala rumus ≥ 0.7 |

Capabilities per templat: `callouts` (EDU-01), `metricCards` + `summaryPanel` (BUS-01), `chapterOpeners` + `endnotes` +
`runningChapterHeader` (EDT-01), `speakerGutter` (CON-01). `twoColumn/sectionLandscape/marginNotes/pageFootnotes` selalu `false` (G4).

Penandaan pengguna yang dikenali (tidak pernah disimpulkan dari isi bebas, teks tidak diubah):
- EDU-01: `> **Konsep:** …`, `> **Contoh 2.** …`, `> **Latihan** …`, `> **Catatan** …`, `> **Rangkuman** …` (juga EN: Concept/Example/Exercise/Note/Summary) → kotak; heading h3–h5 berawalan label sama → penanda heading.
- BUS-01: heading h1/h2 `Ringkasan`/`Ringkasan Eksekutif`/`Executive Summary` → panel ringkasan (di tempatnya, urutan tidak dipindah); `ul` tepat setelah paragraf/heading `Metrik`/`Angka kunci`/`Key metrics` yang tiap butirnya diawali **tebal** (2–6 butir) → kartu metrik.
- Header/footer: teks bebas dengan token `{title} {chapter} {author} {org} {date}`. Nomor halaman di pojok (EDT-01: tengah bawah).
- Brand kit (`snapshot.brandKit`): `accent` (#hex), `headingFont`, `logoAssetId` (aset gambar di snapshot), `orgName`, `footerText` — dipakai sama di keempat templat lewat variabel CSS.

## 2. Ekspor HTML (PF-030, HTM-01…07)

```ts
const guard = new ExportGuard();             // satu per sesi editor
guard.observe(snapshot);                      // panggil untuk snapshot proyek aktif; guard.activate(projectId) saat berganti proyek
const r = await exportHtml({ snapshot, body, profile: 'standalone' | 'zip' | 'publication',
  variant?: 'offline' | 'online', enhancements?: boolean, guard, signal });
// r: { bytes, filename, mime, manifest: RenderManifest, issues, html, status: 'pass'|'confirm', verdict, reviewChecks }
// gagal: ExportBlockedError { issues, failedChecks, verdict } — TIDAK ada byte final
```
- **Validator hasil akhir (QA-01)**: `REQUIRED_CHECKS[profile]` harus `pass` (standalone: `no-scripts`, `no-network-resources`,
  `fonts-embedded`, `size-budget`, `integrity`; zip/publication: `no-scripts`, `no-network-resources`, `relative-files`,
  `fonts-packaged`, `integrity`) dan `verdictOf(issues)` tidak boleh `blocked`. `REVIEW_CHECKS` (`internal-anchors`,
  `glyph-coverage`) yang gagal → `status:'confirm'`: byte ada, UI wajib meminta keputusan eksplisit sebelum mengunduh.
- Kebijakan issue (`src/core/verdict.ts`): `block` = `blocking` atau error lingkup integrity/security; `confirm` = error lain;
  `note` = warning/info.
- `standalone`: satu `.html`, font + gambar tersemat (data:), **tanpa skrip**, CSP `default-src 'none'`. Label UI: "HTML mandiri (luring, tanpa skrip)".
- `zip`: `index.html` + `assets/document.css`, `assets/fonts.css`, `assets/fonts/*.woff2`, `assets/img/<sha>.<ext>` + `manifest.json` (SHA-256 per berkas). Path relatif; diuji dari `file://` dan server statis.
- `publication`: struktur ZIP + metadata SEO (`og:title`, `description` hanya dari subjudul pengguna). `enhancements:true` menambah `assets/enhance.js` (tombol salin kode, berlabel di manifest `scripts:'enhancement'`). `variant:'online'` mengizinkan gambar `https:` eksternal (manifest `network:'external-images'`) — labeli "membutuhkan internet".
- Gambar eksternal pada profil luring diganti penanda terlihat + issue `EXTERNAL_IMAGE_EXCLUDED` (tidak pernah diam-diam).
- `RenderManifest` = `ExportManifest` + `profile, variant, scripts, network, fonts[], files[], issueCount, settings`. `outputHash` = SHA-256 dari `bytes` yang diserahkan. `checks`: `no-scripts`, `no-network-resources`, `internal-anchors`, `relative-files`, `fonts-embedded|fonts-packaged`, `glyph-coverage`, `size-budget`.
- Revisi: bila snapshot lebih baru diamati selama ekspor berjalan, `exportHtml` melempar `StaleExportError` (code `STALE_EXPORT`) — jangan tawarkan unduhan; ulangi untuk snapshot terbaru.

## 3. Paginasi dan cetak lokal (tidak ada PDF server)

```ts
const payload = await buildPrintPayload(snapshot, body, { signal });   // PrintBlockedError bila ada issue penghalang (EN-012), sebelum font dimuat
const { result, frame } = await paginateInFrame(payload, { mount?, onProgress, signal, timeoutMs, keepFrame? });
const session = await preparePrint(payload, { signal, onProgress });   // frame tersembunyi dipertahankan
await session.print();          // 'returned' (afterprint teramati) | 'unknown'; state: prepared → dialog-requested → returned|unknown
session.dispose();              // idempoten; tidak ada pembuangan berbasis timer (EN-005)
const manifest = await localPrintManifest(session.result, settings); // hashOf:'paginated-html', pdfBytes:'not-observed'
```
- Pesan postMessage hanya dari origin sama: `pf-print-ready`, `pf-print`, `pf-print-progress`, `pf-print-result`, `pf-print-error`.
  Kait global `pfPaginate`/`__pfPrintResult` hanya ada di build QA (`VITE_PF_QA=1`).
- `PaginationResult` kini memuat `verification { status:'pass'|'fail'|'timeout', pages, inventory[], lostBlocks }` (EN-006).
  Verifikasi memuat ulang HTML terpaginasi di frame terpisah: timeout → `LAYOUT_VERIFY_TIMEOUT` (blocking); nol halaman →
  `PAGINATION_FAILED`; jumlah halaman berbeda → `LAYOUT_VERIFY_FAILED`; inventaris isi berbeda → `PAGE_CONTENT_CHANGED`
  (lingkup integrity, blocking); blok terpotong → `PAGE_CONTENT_CLIPPED` setelah maks. 6 pemindahan halaman.
  `contentInventory(roots)` / `compareInventory(a, b)` diekspor untuk pengujian.
- TOC: nomor dari peta halaman aktual, paginasi ulang sampai stabil (≤ `maxPasses`, default 4) atau `TOC_UNSTABLE`.
- Kegagalan (`PaginationError.failure.code`): `FONT_TIMEOUT`, `FONT_LOAD_FAILED`, `IMAGE_TIMEOUT`, `IMAGE_LOAD_FAILED`,
  `TOC_UNSTABLE`, `PAGINATION_FAILED`, `ABORTED`, `BAD_PAYLOAD`, `FRAME_TIMEOUT`, `BLOCKING_ISSUES`.
- Issue tata letak: `TABLE_TOO_WIDE`, `TABLE_FITTED`, `MATH_SCALED` (≥70%), `MATH_TOO_WIDE`, `PAGE_OVERFLOW`, `BLANK_PAGE`,
  `TOC_TARGET_MISSING`, `TABLE_CONTENT_CHANGED`.

## 4. Font (PF-029, SEM-11)

`planFonts({html, settings, mode, brandKit?})` → `{faces, missing, issues}`: subset woff2 minimal (unicode-range ∩ cmap nyata dari
`font-coverage.generated.ts`), weight/style yang dipakai templat dan markup, KaTeX hanya kelas yang dirujuk. Karakter di
luar font bawaan (Arab, Ibrani, Thai, Devanagari, CJK, emoji…) → issue `FONT_GLYPH_NOT_BUNDLED` (warning, scope `font`) —
aksara tersebut TIDAK diklaim didukung. Manifest font: `family, weight, style, subset, file, bytes, sha256, license 'OFL-1.1', pkg, version`.
Regenerasi tabel cakupan: `node src/render/tools/gen-font-coverage.mjs`.

## 5. Lain-lain

`prepareBody`/`composeDocument` (pembangun dokumen layar/cetak — pratinjau HTML di aplikasi dapat memakai `composeDocument(..., {mode:'screen'})` dalam iframe sandbox), `docLabels(lang)`, `staticChecks(html, …)`.
Label yang ditulis ke dokumen (Daftar Isi/Contents, lanjutan/continued, peran pembicara) mengikuti `settings.contentLang`, bukan bahasa UI.

## Tambahan audit RC4

- `loadFonts(plan, source, {signal?, timeoutMs?})` menerima pembatalan dan deadline, default 15.000 ms. Pemanggilan dua argumen lama tetap valid. `FontLoadOptions` diekspor; `HtmlExportRequest.fontTimeoutMs` dapat mengatur deadline ekspor. Font gagal atau macet tidak menghasilkan berkas final yang seolah berhasil.
- Perencana font menyertakan teks organisasi/footer BrandKit dan teks fallback dalam KaTeX. Varian Main BoldItalic, Fraktur Bold dan SansSerif Bold/Italic dipilih sesuai markup. Aksara yang tidak dibundel tetap diberi peringatan.
- `ContentInventory.codeText` mempertahankan indentasi dan spasi kode. Marker kode/baris menjaga reassembly fragmen halaman yang sah; tidak menghapus seluruh whitespace kode untuk membuat perbandingan lulus.
- Fragmen URL malformed ditangani sebagai tautan rusak, bukan exception URIError.
- Oracle pengujian PDF membandingkan prosa di sekitar rumus/gambar, caption, tanda negatif dan urutan. Font Type 3 tidak diloloskan melalui pengecualian umum. Bila qpdf tidak tersedia, pemeriksaan content-stream dengan pypdf dicatat sebagai cakupan berbeda, bukan pengganti identik qpdf.
- API ekspor HTML dan persiapan payload sudah diuji pada korpus 21 rumus trig dengan font nyata. Keberhasilan Node/jsdom tersebut tidak membuktikan paginasi visual atau PDF native kandidat; periksa keputusan aktif di RELEASE_REPORT.md.
