# Pengujian Chromium RC5

Chromium 156.0.8078.79 (Debian Linux) membuka server HTTP lokal yang menjalankan dua build. Profil produksi memuat kode publik. Profil QA menambahkan pembacaan state untuk memeriksa apakah pratinjau, hasil paginasi dan riwayat sesuai dengan revisi yang aktif.

| Uji | Hasil di Chromium |
| --- | --- |
| Produksi, `static-smoke.json` | 12 dari 12 pemeriksaan lulus. Studio merender isi, koneksi hanya ke server lokal, dan kait QA tidak tersedia. |
| QA, `e2e-results.json` | 31 dari 33 skenario lulus. E05 dan E33 berhenti ketika kebijakan browser desktop menolak navigasi `file://` dengan `ERR_BLOCKED_BY_ADMINISTRATOR`. Berkas JSON menyimpan hasil mentah beserta penyebabnya. |
| Impor, penyimpanan dan pembatalan | E08–E16 dan E24–E31 mencakup pembatalan, ulang cetak, undo/redo, sunting setelah tempel, impor berkas, riwayat, dua tab, pergantian proyek, Worker gagal, kuota, dan pemulihan pada origin lain. E08 berhasil mengulangi paginasi menjadi 52 halaman. |
| Aksesibilitas | E17 melaporkan nol temuan axe WCAG 2 A/AA di beranda, studio, dan dialog ekspor. E27 menguji Tab, Shift+Tab, Enter, Escape, fokus kembali ke pemicu, mode gelap, lebar 320 CSS px, dan emulasi 683 CSS px/DPR 2. Zoom native, pembaca layar dan perangkat fisik belum dinilai oleh skrip. |
| Mesin browser, `cross-browser.json` | Chromium memakai Worker dan memverifikasi isi pada paginasi 10 dan 86 halaman. Firefox serta WebKitGTK tidak tersedia di lingkungan ini. Perbandingan tiga mesin berstatus BLOCKED. |
| Kontrol studio, `studio-controls.json` | Tiga regresi yang ditemukan di RC4 lulus pada RC5 melalui event antarmuka di jsdom. |

Jalankan perintah berikut dari root proyek untuk mengulangi pemeriksaan otomatis.

```bash
npm run build
npm run build:qa
npm run test:smoke
npm run test:e2e
npm run test:browsers
node tests/e2e/startup-comparison.mjs /path/to/rc4/dist
node tests/e2e/perf-matrix.mjs --sizes 1,6,30,59 --reps 2
node evidence/rc5/browser/production-flow.mjs
```

Puppeteer memakai instalasi Chromium lokal. Atur `PF_CHROME` jika lokasinya berbeda. Pemeriksa lintas mesin menerima `PF_FIREFOX`, `PF_WEBKIT_DRIVER`, dan `PF_WEBKIT_BROWSER`. Skrip E2E mencatat lokasi tangkapan layar sementara saat dijalankan ulang. Bukti yang dikemas di sini berupa laporan JSON serta keluaran HTML aktual.

## Respons editor dan aksesibilitas

Dalam E22, 20 ketukan pada sumber 58.106 byte menghasilkan satu render setelah debounce. Pratinjau revisi terakhir siap dalam 1.598 ms. Pada E26, hasil HTML Worker dan fallback memiliki panjang dan SHA-256 yang sama. Jeda event loop terbesar mencapai 388 ms saat memakai Worker dan 1.313 ms ketika memakai fallback. Keduanya mengandung long task. Pengukuran satu skenario tersebut digunakan untuk diagnosis, dengan angka berpasangan dan pengulangan terpisah di bawah.

Pemeriksaan E13 membuka lebih dari 300 temuan serta memulihkan revisi lewat antarmuka riwayat. Pemeriksaan E27 berpindah dari awal halaman ke editor dalam 14 Tab dan kembali ke ekspor dalam 7 Shift+Tab. Setelah Escape, fokus kembali ke tombol ekspor. Layar selebar 320 CSS px dan emulasi 683 CSS px memiliki kelebihan lebar 0 px untuk beranda dan studio.

Hasil terikat ke sumber `9263951462ed4545e626a877f3ff196d6db5ff2e427585330972da4e8e9551a3` dan build QA `32d4c5bef8fb2b12c48419c9462c8880c9fe82418cc006bcc4ec941d948f7ff1`. Hash build produksi dapat dicocokkan di `static-smoke.json`. Pengujian dilakukan pada loopback lokal.


## Pembukaan studio produksi

Perbandingan memakai profil browser baru untuk setiap pengukuran dingin, lalu reload pada profil yang sama untuk pengukuran hangat. RC4 dan RC5 memakai perangkat, resolusi, server lokal tanpa kompresi dan protokol yang sama. Setiap urutan bergantian AB/BA. Setelah satu pemanasan per build, terdapat 20 pasangan terukur per kondisi. Waktu siap mencakup pemuatan hingga pratinjau awal terisi. Jumlah permintaan serta byte respons aktual mencakup Worker dan font hingga jaringan tenang.

| Kondisi | RC4 median / p95 siap (ms) | RC5 median / p95 siap (ms) | RC4 byte median | RC5 byte median |
| --- | ---: | ---: | ---: | ---: |
| Dingin | 782 / 1319 | 464 / 962 | 2585260 | 1855906 |
| Hangat | 541 / 1134 | 297 / 620 | 32610 | 32610 |

Jumlah permintaan dingin pada sampel pertama adalah 35 untuk RC4 dan 11 untuk RC5. Studio RC5 yang kosong tidak mengunduh modul atau font KaTeX pada sampel ini. Long task terpanjang per kunjungan dingin memiliki median 155,5 / 118,5 ms dan p95 257 / 241 ms (RC4 / RC5). Anggaran awal menetapkan rasio median waktu siap ≤1,20, rasio p95 ≤1,25 dan rasio byte median ≤1,01. Hasil perbandingan ini **PASS**. Semua sampel, daftar permintaan dan ukuran body tersimpan di `startup.json`. Waktu dan total jaringan seluler atau Cloudflare dapat berbeda.

## Dokumen panjang

Dua pengulangan tiap ukuran, memakai generator teks, heading, dan tabel panjang tanpa rumus maupun gambar. Korpus rumus, gambar dan angka per fase tersedia dalam pengujian terpisah. Semua waktu pada tabel ini merupakan median milidetik. P95 tidak dihitung untuk dua ulangan. Uji memakai build QA untuk membaca fase mesin dan Paged.js.

| Bagian | Byte UTF-8 | Halaman | Pratinjau | Paginasi sampai verifikasi | PDF | Setelah suntingan | Status isi |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | 4921 | 3 | 437 | 593 | 147 | 382 | PASS |
| 6 | 29096 | 12 | 541 | 1062 | 277 | 436 | PASS |
| 30 | 145136 | 52 | 1301 | 2685 | 1649 | 1129 | PASS |
| 59 | 285351 | 101 | 1979 | 5004 | 3060 | 1859 | PASS |

`perf-matrix.json` memuat waktu parsing, penataan, pemuatan kembali, ekspor, pembatalan, long task dan heap untuk masing-masing pengulangan. Jumlah halaman merupakan hasil paginasi aktual.

## Ekspor dan clipboard pada build produksi

| Pemeriksaan | Hasil |
| --- | --- |
| formatRadiogroupAndUndo | PASS |
| trustedRichClipboardAndStaleChoice | PASS |
| html-zip | PASS |
| html-publication | PASS |
| standaloneMathOffline | PASS |

Skrip membuka hasil unduhan mandiri sebagai dokumen dalam memori pada tab yang sudah luring. Jalur pembacaan berkas `file://` di browser terkelola tetap diblokir. Versi ZIP diuji dengan menyajikan berkas hasil ekstraksi lewat HTTP lokal serta memblokir origin lain. Lihat `production-flow.json` dan HTML aktual `trigonometry-standalone.html`.

Pemeriksa deployment matematika pada server HTTP **lokal** menghasilkan 3/3 jalur lulus. Setiap jalur memeriksa meta versi, SHA-256 index, rumus Einstein, mode inline/display, kode serta mata uang. Lihat `local-deployment-math.json`.

Sebelum pembetulan urutan router, studio kosong juga mengunduh modul TeX dan empat font KaTeX untuk contoh beranda. Angka lengkap terdapat di `history/startup-before-router-order.json`. Pada pengukuran antara tersebut p95 hangat naik dari 495 menjadi 686 ms meskipun median turun dari 420,5 menjadi 367,5 ms. Kegagalan anggaran ini dipertahankan sebagai hasil historis.
