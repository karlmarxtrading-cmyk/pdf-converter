# Matriks kompatibilitas RC10

Data berikut berlaku untuk source `774465b21054bfd933b869ea7232d3d59ff8e1fa0422a8d83b18208b08b6abd6` dan build distribusi pada putaran `862feb27-d188-4f90-a381-c64533c2f220`. “Teruji lokal” berlaku untuk fixture dan rute dalam kolom bukti. Kombinasi lain berstatus belum diuji.

| Format | Jalur masukan | Keluaran yang diperiksa | Browser/perangkat | Status dan bukti kandidat |
|---|---|---|---|---|
| Teks biasa, GFM, heading dan kutipan | Editor, buka MD | HTML mandiri dan cetak buku | Chromium Linux | Teruji lokal untuk korpus buku. [Artefak dan oracle](../evidence/rc10/book/) |
| Tabel GFM termasuk sel panjang | File Markdown | Struktur HTML, baris, sel, akhir PDF | Chromium Linux | Teruji lokal pada sampel dokumen besar. [Buku](../examples/rc10/book/) |
| Pagar kode, indentasi, baris kosong, A5 | Markdown dan fixture campuran | HTML dan PDF fisik | Chromium Linux | Teruji lokal. [Matriks PDF](../evidence/rc10/pdf/) |
| Percakapan dan wrapper matematika | Raw HTML, clipboard terstruktur | Teks pendamping, rumus, ekspor HTML | Chromium Linux | Teruji lokal. [Wrapper](../evidence/rc10/wrappers/) |
| Matematika inline/display, escape dan mata uang | Editor Markdown, rich/raw | HTML empat template; PDF trigonometri | Chromium Linux | Teruji lokal. Rumus ambigu tetap perlu ditinjau. [Oracle unduhan](../evidence/rc10/browser/results/) |
| Daftar 1/a/A/i/I, start/reversed/value dan nested | HTML mentah, keyboard copy/paste | Unduhan HTML, payload cetak, marker PDF | Chromium Linux | Teruji lokal. [Kasus daftar](../evidence/rc10/ordered-lists/) |
| Unicode, emoji monokrom dan karakter privat | Berkas dan editor | HTML, PDF fisik serta diagnosis penolakan | Chromium Linux | Teruji lokal. Karakter privat tanpa pemetaan ditolak pada cetak sesuai kebijakan. [Pemeriksaan fisik](../evidence/rc10/pdf/) |
| Gambar lokal, SVG dan diagram Mermaid | HTML impor, Markdown dan aset proyek | HTML luring dan fallback saat ada kesalahan | Chromium Linux | Teruji lokal. [Bukti impor](../evidence/rc10/operations/) |
| Gambar/diagram di PDF pada semua kombinasi dan format | Semua | PDF | Seluruh OS | Belum diuji menyeluruh. Dukungan khusus dibatasi pada artefak fisik yang dicatat. |
| Trigonometri lintas mesin | Editor sumber dan cetak otomatis | Pratinjau, ekspor HTML, pembukaan luring dan paginasi | Firefox Linux / WebKit Linux | Per tahap mengikuti hasil mesin pada [laporan browser](../evidence/rc10/browser/results/). Perangkat Windows/iOS belum dikualifikasi. |
| Clipboard asli dari antarmuka penyedia AI | Keyboard dan dua MIME dari provider nyata | Unduhan akhir | Windows target | BLOCKED. |
| Simpan, batal, ulangi dan pembaca layar | UI sistem dan teknologi bantu | PDF tersimpan, navigasi dan pemulihan | Perangkat target | BLOCKED / BLOCKED. |
| Sajian Pages dan pemulihan produksi | Preview HTTPS dan deployment produksi | Byte aset, HTTP dan ekspor | Proyek Cloudflare yang ada | NOT_RUN / BLOCKED. |

Lihat [hasil seluruh gerbang](RELEASE_REPORT.md) dan [ukuran sampel performa](PERFORMANCE_REPORT.md). Pemeriksaan fisik mengukur teks PDF dan glif atau area yang disebutkan oleh setiap oracle. Penilaian visual bersifat sampel.
