# PaperForma RC5 · keputusan rilis

**21 November 2026. Layak untuk staging.** Website publik masih melayani RC4. RC5 menghasilkan HTML mandiri dan PDF yang dapat diperiksa. Empat PDF pada korpus campuran belum memenuhi syarat jenis font cetak dan bukti Firefox/WebKit belum tersedia.

## Identitas hasil

| Komponen | SHA-256 |
|---|---|
| ZIP sumber RC4 (905 checksum cocok) | `3b8c833b720c799664d03c4c293bf9645d2a5cc63c3ccd46ba340c6435870074` |
| Input build RC5, termasuk konfigurasi, tes dan fixture | `9263951462ed4545e626a877f3ff196d6db5ff2e427585330972da4e8e9551a3` |
| Pohon dist produksi RC5 | `0987e2ef814b844374f84b2ff26a5be4b4c675fc2dff12423e9cea0a7b69a1cd` |
| Pohon dist QA yang dibangun dari input sama | `32d4c5bef8fb2b12c48419c9462c8880c9fe82418cc006bcc4ec941d948f7ff1` |

Node 24.22.3 dan npm 11.19.1. Situs aktif dan semua 616 path yang beririsan dengan GitHub cocok dengan RC4 pada saat pemeriksaan. Pengujian RC5 memakai dua profil dari sumber yang sama. Profil produksi dipakai untuk alur pengguna, hasil HTML dan pengujian HTTP. Profil QA membuka akses ke HTML berhalaman, inventaris dan waktu internal bagi instrumen pengujian. Hanya profil produksi berada di `dist/` arsip ini. Seluruh path source, konfigurasi, tes dan fixture yang berubah beserta digest sebelum/sesudah tercatat di `evidence/rc5/build/changed-inputs.json`. Pemeriksaan mencakup tinjauan perubahan, validasi mesin, pengujian UI, dan pemeriksaan halaman sampel. Vendor dan seluruh kombinasi perangkat tidak diaudit manual.

## Yang berubah untuk pengguna

- Rumus nilai mutlak tidak menambah kolom tabel GFM. Dolar literal di dalam TeX, rumus sebaris di clipboard dan rumus independen di sebelah MathJax lama tetap memiliki isi serta mode yang benar. Jalur dan judul tautan yang mengandung delimiter tetap utuh. Jika perintah TeX dengan pembuka eksplisit kehilangan penutup, pengguna mendapat nomor baris dan petunjuk delimiter. Tujuh dari delapan kasus baru gagal pada RC4; seluruh delapan lulus pada RC5.
- Penjaga keluar bekerja pada draf yang isinya baru pengaturan. Penghapusan proyek mengosongkan status simpan yang sudah tidak berlaku. Penghapusan basis data yang diblokir tab lain melindungi perubahan yang masih tertunda. Pilihan HTML/plain ditetapkan lagi untuk setiap tempelan dan kartu format dapat dipilih dengan papan ketik tanpa kehilangan fokus.
- Snapshot membatasi penyalinan ke rentang byte milik aset, memeriksa SHA-256 byte aktual dan menjalankan maksimal dua digest aset bersamaan. Pemeriksa keutuhan dan rujukan gambar berbagi hasil parsing tersendiri untuk dokumen biasa. Renderer memiliki hasil parsing independen. Tidak ada cache lintas proyek untuk hasil itu.
- Modul KaTeX diunduh saat rumus diperlukan. Observer contoh beranda dipasang setelah rute studio dipilih agar membuka editor kosong tidak memicu render contoh beranda. Pratinjau dan ekspor berbagi katalog URL font, sehingga browser dapat langsung meminta WOFF2 yang diperlukan tanpa satu modul per nama font. Pengambilan font bersamaan tidak menggandakan URL objek untuk font yang sama.
- Persiapan cetak membatasi dua dekode gambar serentak, memeriksa dimensi intrinsik dan menghentikan proses saat gambar gagal. Pemanggilan cetak berulang saat dialog masih aktif menggunakan satu sesi. Pemeriksa hosting kini menolak manifest kedaluwarsa walaupun nomor versi sama.

## Keputusan A–H

| Gate | Status | Bukti dan batas |
|---|---|---|
| A. Sumber dan data | PASS | Regresi riwayat, penghapusan, status tersimpan, kuota dan konflik tab. E2E meliputi pemulihan proyek, undo, impor ulang dan perpindahan origin. |
| B. Parsing dan matematika | PASS | TeX dan mode dibandingkan dengan fixture, termasuk 21 ekspresi trigonometri dari jalur Markdown dan HTML clipboard. Grafik interaktif tanpa representasi statis tidak direkonstruksi. |
| C. HTML/PDF dan tata letak | FAIL | HTML trigonometri mandiri dapat dirender luring. Tujuh PDF aktual diperiksa. Trigonometri, Einstein dan dokumen 195 halaman lulus; empat dokumen dengan emoji memicu gate font Type 3. |
| D. Performa | PASS | Anggaran startup browser dan snapshot tercapai. Seluruh delapan median analisis Node membaik. Dua p95 Worker pada dokumen kecil memburuk, dirinci di bawah. |
| E. Keamanan dan ketahanan | PASS | Pada lingkup yang diuji: sanitasi, kebijakan URL, batas struktur/arsip/piksel, pembatalan dan simpan. 438 entri SBOM, 255 komponen runtime, nol advisory yang dilaporkan saat pemeriksaan, pemindaian pola rahasia lulus. |
| F. Browser dan aksesibilitas | BLOCKED | 31 dari 33 skenario Chromium lulus. Dua berhenti pada pembukaan file:// yang diblokir kebijakan browser. Keyboard dan axe A/AA lulus pada permukaan yang diuji. Firefox, WebKit, pembaca layar dan ponsel fisik belum diverifikasi. |
| G. Build dan deploy | FAIL | Lokal 184/184 pemeriksaan HTTP dan 179/179 berkas publik cocok. Pada URL produksi, 65 dari 184 pemeriksaan berbeda karena situs masih menyajikan RC4. |
| H. Integritas paket | PASS | Verifikator mengekstrak arsip ke direktori kosong. Instalasi dari lockfile, typecheck, lint, 356 tes Vitest + 9 tes Node, build, pemeriksaan HTTP dan perbandingan seluruh 180 berkas dist lulus. |

## PDF, keterbacaan dan ekspor

Rumus trigonometri, pecahan, akar, matriks Einstein, tabel dan teks penutup diperiksa pada hasil cetak Chromium. PDF yang dihasilkan melalui CDP berasal dari HTML yang diratakan sesudah paginasi. Teks dapat dicari. Dokumen trigonometri berisi tiga halaman, termasuk halaman daftar isi, dan dokumen Einstein satu halaman. Pemeriksaan sampel mencakup raster ketiga halaman trigonometri, halaman Einstein, serta halaman awal, tabel lebar dan halaman terakhir pada dokumen campuran A5. Pada alur produksi, aplikasi menyiapkan satu halaman A4 berisi rumus Einstein dan meminta dialog cetak. Menu cetak dinonaktifkan oleh kebijakan Chromium desktop terkelola. Penyimpanan PDF melalui dialog sistem berstatus BLOCKED. Rincian ada di `evidence/rc5/pdf/native-dialog.json`.

Empat PDF yang gagal adalah dokumen campuran A4 (10 halaman), Letter lanskap (13), A5 (20) dan dokumen 62 halaman. Pemeriksaan jenis font mendeteksi Noto Color Emoji Type 3 pada tiga rangkaian karakter dari sumber, 😀, 🚀 dan 👩‍💻. Font tersebut tersemat; persyaratan tanpa Type 3 tetap gagal. Detail font per halaman dan hash berkas terdapat di `evidence/rc5/pdf/type3-check.json`. Skrip sumber menjaga emoji dalam dokumen. Enam putaran persiapan layout mempertahankan tiga iframe. Heap JS naik 1,2 MiB dari putaran kedua ke keenam dalam satu sesi, sehingga penggunaan memori jangka panjang tidak disimpulkan dari angka itu.

## Performa pada input yang sama

| Ukuran | RC4 | RC5 | Metode |
|---|---:|---:|---|
| Snapshot proyek dengan 10 MiB aset, median | 26,37 ms | 15,18 ms | 40 pasangan Node |
| Snapshot yang sama, p95 | 36,74 ms | 31,20 ms | Seluruh pasangan disertakan |
| Analisis Worker, 472 rumus dan 472 baris tabel, median | 781,7 ms | 638,6 ms | Worker Node, 4 pasangan beban besar |
| Jalur cadangan, data yang sama, median | 806,1 ms | 531,8 ms | EngineClient, tanpa Worker |
| Worker dokumen 6 bagian, p95 | 133,8 ms | 180,5 ms | 20 pasangan; median membaik |
| Worker dokumen 1 bagian, p95 | 38,9 ms | 49,9 ms | 20 pasangan; median membaik |
| Seluruh berkas dalam dist produksi | 281 | 180 | Font tetap terbundel, modul per font diganti satu katalog |

| Pengukuran Chromium, 20 pasangan | RC4 | RC5 |
|---|---:|---:|
| Respons body HTTP saat studio kosong pertama dibuka | 2.585.260 byte | 1.855.906 byte |
| Waktu siap dingin, median / p95 | 782 / 1.319 ms | 464 / 962 ms |
| Waktu siap saat muat ulang dengan cache, median / p95 | 541 / 1.134 ms | 297 / 620 ms |
| Byte muat ulang dengan cache | 32.610 | 32.610 |

Ukuran body dingin turun 28,2%. Ini akumulasi byte respons server lokal tanpa kompresi dan tidak mencakup header HTTP. Waktu di atas diukur pada Chromium desktop lokal, bukan distribusi waktu dari pengguna Cloudflare. Pada kandidat perantara, beranda sempat merender contoh ketika editor kosong dibuka dan p95 muat ulang naik dari 495 menjadi 686 ms. Hasil tersebut disimpan di `evidence/rc5/browser/history/startup-before-router-order.json`. Setelah pemilihan rute didahulukan, seluruh 20 pembukaan dingin pada kandidat penyerahan tidak meminta renderer atau font KaTeX di studio kosong. Uji dokumen trigonometri memastikan modul tetap dimuat untuk materi yang memerlukannya.

P95 snapshot 99,41 ms yang tercatat di laporan RC4 diperoleh dalam sesi pengukuran terdahulu. Angka 36,74 ms berasal dari pengukuran pembanding RC4 pada sesi RC5. Dataset, urutan AB/BA, hasil perulangan dan variasi ada di `evidence/rc5/performance/`. Uji startup mengukur keseluruhan permintaan lewat browser, termasuk pekerja, font dan bagian yang dimuat dinamis.

Uji pengetikan Chromium pada naskah 58.106 byte mengirim 20 ketukan yang digabung menjadi satu render. Pratinjau akhir siap dalam 1598 ms dari awal simulasi pengetikan. Hasil ini mengukur sampai pratinjau, bukan waktu latensi satu tombol. Bukti rinci tersedia di `evidence/rc5/browser/e2e-results.json`.

Delapan uji beban Chromium menghasilkan 3, 12, 52 dan 101 halaman, dua pengulangan per ukuran. Seluruh pemeriksaan isi lulus. Pada 101 halaman, median pratinjau 1.979 ms, paginasi beserta verifikasi 5.004 ms, dan pembuatan PDF 3.060 ms. Lihat `evidence/rc5/browser/perf-matrix.json`.

## Paket dan pengulangan

`evidence/rc5/build/cleanroom-rehearsal.json` mengikat verifikasi percobaan ke arsip perantara yang dinamai dalam berkas itu. Sesudah laporan dan hasil browser lengkap, arsip penyerahan diuji ulang dari awal dengan `scripts/verify-archive.py`. SHA-256 ZIP penyerahan dan hasil uji akhir dilaporkan bersama tautan unduh agar digest tidak menghitung dirinya sendiri. Daftar checksum di root mencakup setiap berkas lain di ZIP. Paket berisi aplikasi dan tes lengkap. Laporan RC4 di `docs/history/rc4` berfungsi sebagai jejak historis. Inventaris lama dan artefak mentah RC4 tetap tersedia di ZIP sumber.

## Keputusan deploy

Gunakan branch preview di GitHub, build `npm run build` dan output `dist`. Jalankan `verify:http` dan `verify:deployment` dari checkout RC5 ke URL preview yang sebenarnya. Untuk penerimaan lintas browser, ulangi pembukaan HTML dari disk dan cetak pada Firefox/WebKit serta periksa font PDF emoji pada perangkat sasaran. [Panduan deploy Git Bash dan rollback](DEPLOY_CLOUDFLARE.md).
