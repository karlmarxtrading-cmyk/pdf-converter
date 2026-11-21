# Batas yang diketahui — 3.0.0-rc.3 (statis)

Status: **kandidat rilis**, bukan rilis stabil. Semua gerbang yang dapat dijalankan di lingkungan pembuatan lulus
(lihat `docs/RELEASE_REPORT.md`), tetapi gerbang di tabel pertama memerlukan perangkat, akun, atau manusia yang tidak
tersedia. Status butir-butir itu **NOT VERIFIED / BLOCKED BY ENVIRONMENT**, bukan lulus.

## Belum terverifikasi (memblokir status produksi)

| Butir | Yang sudah dibuktikan otomatis | Yang belum | Prosedur |
|---|---|---|---|
| Deployment nyata performa-cwd.pages.dev setelah perbaikan rumus | `verify:deployment` lulus terhadap build produksi lokal dan GAGAL (mendeteksi bug) terhadap build rc.2 | Menjalankan skrip ke URL deployment setelah deploy rc.3 (lingkungan ini tidak dapat menjangkau domain tersebut) | `npm run verify:deployment -- https://performa-cwd.pages.dev` |
| Hosting Cloudflare Pages nyata | Server lokal yang menerapkan `_headers`/404 seperti Pages; build dari ZIP bersih cocok hash | Deploy ke akun Cloudflare, header & MIME di edge, pembaruan versi saat tab terbuka | `docs/DEPLOY_CLOUDFLARE.md` §3 |
| Dialog cetak native | PDF dari mesin cetak **Chrome 153** dan **Firefox 160** (headless) atas HTML datar yang sama dengan yang dibuka dialog: valid, jumlah halaman, teks per halaman, nomor halaman, font, tautan (`evidence/pdf-verification.json`); `window.print()` dan lifecycle (E07) | Dialog native Chrome/Edge/Firefox/Safari, pilihan "Simpan sebagai PDF", pengaturan skala/margin oleh pengguna | Daftar periksa `docs/TESTING.md` §Manual |
| Safari macOS/iOS | Mesin **WebKitGTK 2.52** (MiniBrowser, Linux): alur inti + paginasi + verifikasi isi lulus (`evidence/cross-browser.json`) | Safari sebenarnya (WebKit Apple, font sistem, cetak iOS) | Uji manual di Mac/iPhone |
| Perangkat seluler fisik & memori terbatas | Viewport 320/360/390/768, zoom 200 % (Chrome headless) | Android/iOS fisik, keyboard lunak, rotasi, cetak seluler, tekanan memori nyata | ST-QA-28 |
| Pembaca layar | axe-core WCAG 2 A/AA tanpa pelanggaran (terang & gelap), alur keyboard saja (E17, E27) | NVDA/JAWS/VoiceOver/TalkBack | Sesi manual ST-QA-27 |
| Clipboard penyedia AI nyata | `ClipboardEvent` sintetis dan fixture HTML | Salinan nyata dari aplikasi AI terbaru | Fixture baru per penyedia |
| Pilot pengguna | — | 0 peserta | ST-QA-54 |

## Batas produk (dinyatakan, tidak disembunyikan)

- **PDF**: PaperForma tidak membuat byte PDF sendiri. Prototipe PDF di browser (jsPDF.html, html2canvas → pdf-lib) diukur dan
  ditolak: 0 % teks dapat diekstrak (halaman menjadi gambar), berkas 9–39× lebih besar, 9–28× lebih lambat, dan tidak selesai
  pada dokumen 196 halaman dalam 100 detik (`evidence/pdf-engine-eval.json`, `docs/RELEASE_REPORT.md` §PDF). PDF dihasilkan
  oleh mesin cetak browser dari halaman yang sudah dipaginasi dan diverifikasi. Aplikasi tidak dapat mengetahui apakah berkas
  disimpan; manifest cetak menyimpan hash HTML terpaginasi (`pdfBytes: not-observed`). PDF/A, PDF/UA, bookmark, CMYK: tidak.
- **Impor**: Markdown/teks UTF-8, HTML tempelan, ZIP (naskah + gambar), `.pfproj`, gambar PNG/JPEG/WebP/GIF/SVG. PDF,
  DOCX/ODT/RTF dan OCR **tidak didukung** dan ditolak dengan pesan spesifik.
- **Font**: Latin/Indonesia, Latin Extended, Vietnam, Yunani, Sirilik dan simbol matematika dibundel. Arab/RTL, CJK, Thai,
  Devanagari, emoji berwarna dan karakter Private Use **tidak** dibundel → temuan `FONT_GLYPH_NOT_BUNDLED`; di PDF karakter
  itu dicetak dengan font sistem sebagai glyph Type 3 (emoji) atau kotak `.notdef` (Private Use) dan **tidak dapat dicari
  sebagai teks**. Pemeriksaan PDF mengecualikan karakter tersebut secara eksplisit dan hanya bila aplikasi sudah melaporkannya.
- **Paginasi** (Paged.js 0.4.3):
  - Widow/orphan tidak ditegakkan mesin; paragraf terbelah yang menyisakan satu baris dilaporkan (`LAYOUT_WIDOW_ORPHAN`, info).
  - Bila mesin memutus kata di tengah (terjadi di WebKit), Paged.js menambah U+2011. Di kode tanda itu **dihapus**; di prosa
    diperlakukan sebagai tanda pemenggalan presentasional dalam pemeriksaan isi (aturan terdokumentasi).
  - Baris tabel dapat terbelah antarhalaman di WebKit (isi lengkap, terverifikasi).
  - Bila isi tidak dapat dipaginasi tanpa terpotong/berubah setelah ≤ 6 perbaikan otomatis (putus sebelum blok/baris tabel),
    cetak **ditolak** dengan penjelasan dan saran (lanskap, matikan daftar isi, pecah tabel) — tidak pernah dicetak terpotong.
  - Dua kolom, bagian lanskap, catatan margin, catatan kaki per halaman: tidak tersedia.
- **Web Worker (MESIN-36)**: parsing, render tahap 1 (termasuk KaTeX dan highlight), model keutuhan, analisis karakter dan
  rujukan gambar berjalan di Worker. Sanitasi akhir (DOMPurify), pemeriksaan keutuhan DOM, komposisi pratinjau, **paginasi
  Paged.js** dan cetak tetap di thread utama karena memerlukan DOM. Pada dokumen ratusan halaman paginasi tetap membuat UI
  tersendat; angka per ukuran di `docs/PERFORMANCE_REPORT.md`. Bila Worker tidak tersedia atau gagal dimuat, analisis
  berjalan di thread utama dengan jeda antar-tahap dan banner menjelaskannya.
- **Kapasitas**: diukur sampai 992 halaman A4 (paginasi ±80 s, siap cetak ±87 s, heap puncak ±154 MiB, jeda UI terpanjang ±2 s
  saat paginasi; `docs/PERFORMANCE_REPORT.md`) di Chrome headless kontainer — bukan jaminan untuk perangkat lain. Batas byte masukan/aset/proyek (`src/core/limits.ts`) tetap berlaku; masukan berlebih ditolak utuh.
- **Gambar**: anggaran dari header sebelum dekode — maks 16.384 px per sisi, 40 MP per gambar, 200 MP per proyek. Jumlah frame
  animasi GIF/WebP belum dihitung.
- **Undo** sesi: 200 transaksi / 24 Mi karakter sumber unik; riwayat revisi persisten 100 revisi / 6 MiB (yang tertua dipangkas,
  revisi aktif tidak pernah dipangkas). Revisi buatan RC3 hanya dapat dipulihkan sebagai teks (diberi label).
- **Gambar eksternal https**: pratinjau saja bila diizinkan; ekspor luring dan cetak memerlukan salinan yang diunggah.
- **Penyimpanan**: IndexedDB per origin; pindah domain memerlukan paket `.pfproj`.
- **Domain final** belum ditentukan: tidak ada `canonical`, `og:url`, `robots.txt`, `sitemap.xml`.
- **Rumus**: KaTeX (bukan MathJax) — perintah di luar dukungan KaTeX (mis. `\\newcommand` lintas dokumen, paket LaTeX khusus)
  ditampilkan sebagai sumber dan dilaporkan `MATH_PARSE_ERROR`. Rumus dari HTML tanpa sumber TeX (KaTeX tanpa anotasi, MathML
  tanpa alttext TeX) dipertahankan sebagai teks + peringatan `CLIPBOARD_MATH_NO_TEX`. `$…$` yang diawali angka dan memuat
  kata biasa diperlakukan sebagai mata uang; tulis rumus seperti itu dengan `\\(…\\)`.
- **Lisensi**: elkjs (dependensi Mermaid untuk tata letak diagram) berlisensi EPL-2.0 OR GPL-3.0-or-later; dipakai tanpa
  modifikasi dan notice-nya disertakan (`licenses/THIRD_PARTY_NOTICES.txt`). Distribusi ulang dengan modifikasi elkjs
  memerlukan kepatuhan EPL-2.0. Lisensi runtime lain permisif (MIT/ISC/Apache-2.0/BSD/OFL-1.1).
- **Lint** memakai oxlint (kategori *correctness*, nol peringatan). typescript-eslint tidak dipakai karena belum mendukung
  TypeScript 7 yang dipakai proyek.

## Yang dihapus dari RC3

Akun, sesi, harga, paket, kuota, pembayaran, endpoint `/api/*`, PDF server (Browser Run), ledger Durable Object, D1/R2,
cron, admin token, staging/promote tooling. Tidak ada flag tersembunyi yang menghidupkannya kembali.
