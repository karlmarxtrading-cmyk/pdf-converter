> Arsip versi terdahulu. [Laporan aktif RC10](RELEASE_REPORT.md).

# Kompatibilitas PaperForma 3.0.0-rc.9

| Masukan atau tujuan | Cakupan yang diperiksa | Bukti kandidat |
| --- | --- | --- |
| Teks biasa, Markdown GFM dan sumber asli | Impor di studio, pratinjau, unduhan HTML, buka ulang luring, cadangan proyek dan pemeriksaan teks mentah. | evidence/rc9/browser/results dan evidence/rc9/offline |
| Rumus KaTeX dan wrapper campuran | TeX, mode inline/display, MathML, anotasi, cabang visual, teks pendamping, CSS dan font lokal. Empat template memiliki tampilan acuan masing-masing. | evidence/rc9/wrappers, evidence/rc9/integrity, evidence/rc9/browser/results/trigonometry-downloads.json |
| HTML clipboard dan daftar bernomor | Ctrl+C/Ctrl+V Chromium Linux dari halaman HTML, termasuk daftar menurun dan nomor item eksplisit. Identitas penyedia AI dan clipboard sistem target Windows memerlukan pengujian G12. | evidence/rc9/list dan evidence/rc9/browser/results/uat.json |
| Tabel, kode, gambar dan diagram | Struktur sel, urutan dan indentasi kode, gambar lokal, SVG dan Mermaid pada korpus. PDF untuk glif privat tanpa mapping diblokir dengan diagnosis. | evidence/rc9/operations, evidence/rc9/pdf dan examples/rc9 |
| Percakapan | Percakapan, rumus, blok kode dan pemisah pembicara pada korpus yang disertakan. HTML aktual dari semua versi penyedia dapat berbeda. | evidence/rc9/wrappers dan evidence/rc9/pdf-review |
| Buku BUS-01, A4 potret | Empat bentuk sintetis berlabel, satu novel pribadi dan pemeriksaan PDF tersendiri. Beberapa bagian buku dapat dimulai pada halaman baru. Setelan sampel serta status tiap jalur tercatat di ledger. | evidence/rc9/large, evidence/rc9/private-receipts, evidence/rc9/visual |
| Browser dan perangkat | Chromium Linux untuk jalur lengkap yang diukur. Firefox Linux dan WebKit Linux untuk baris yang dicatat pada masing-masing laporan mesin. | evidence/rc9/browser/results |
| PDF dan distribusi | PDF otomatis diukur dari byte aktual. Save/Cancel/Retry melalui dialog native, pembaca layar target, preview Cloudflare dan rollback hosting memiliki gerbang tersendiri. | evidence/rc9/acceptance/decision.json |

Ukuran kata saja tidak menentukan biaya tata letak. Jumlah judul, panjang satu node teks atau sel, jumlah halaman, font dan pengaturan daftar isi juga memengaruhi hasil. Status per bentuk, mesin dan jalur berlaku untuk kandidat dengan identitas di dist.build-manifest.json.
