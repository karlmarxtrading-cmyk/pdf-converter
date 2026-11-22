# PaperForma 3.0.0-rc.11

**Keputusan produksi NO_GO**. Dari 24 gerbang, 19 PASS, 5 BLOCKED, 0 FAIL, 0 NOT_RUN. 6 dari 8 temuan audit tertutup dalam cakupan yang diuji.

| Identitas | Nilai |
| --- | --- |
| Source | `979dfbd939723a8dd305623db0cf019bc963024382109ecc3d20c4a9d54d4876` |
| Dist | `3597a4ad1cb94074f033bd30a6fc3ffe107d2765dc77a87aeb685bf9c4947496` |
| Putaran | `a411c3b4-c630-4461-88ec-54810dbe1328` |
| Commit source lokal | `644a55d9ba4315593bc32a72fe50a100d3b55fa2` |
| Commit preview / deployment Pages | Belum tersedia |

[Ledger dengan akar masalah, regresi, artefak dan identitas per gate](../evidence/rc11/LEDGER.json) · [Putusan verifier](../evidence/rc11/acceptance/all-gates.json) · [Matriks dukungan](COMPATIBILITY_RC11.md).

## Temuan audit

| ID | Hasil | Perubahan dan cakupan bukti |
|---|---|---|
| A01 | **PASS** | Pertahankan representasi HTML aman ketika diperlukan, bandingkan proyeksi dari HTML asli dengan proyeksi setelah konversi sebelum menerima hasil. Fixture terarah termasuk header/body, TeX eksplisit, tabel, dua MIME, teks pendamping, HTML mandiri dan jalur cetak. |
| A02 | **PASS** | Gunakan penanda eksplisit untuk anotasi ambigu dan periksa TeX, mode, urutan serta pemisah teks terhadap input. Whitespace, backtick, dollar, formula bersebelahan, kontrol dan mutasi pada input sintetis. |
| A03 | **PASS** | Pasang CSP per render sebelum mengimpor Mermaid, validasi SVG dan CSS sebelum penyisipan serta pertahankan source diagram bila resource diblokir. Intersepsi Chromium aktual pada preview, ekspor HTML, kedua mode cetak, pengaktifan dan pencabutan persetujuan. |
| A04 | **PASS** | Setel ulang izin jaringan saat membuka proyek yang diimpor. Simpan pilihan penerima untuk pemulihan proyek setempat. Impor, aset lokal, persetujuan penerima, pemulihan IndexedDB dan pencabutan. |
| A05 | **PASS** | Pertahankan dan bandingkan tipe marker per item bersama ordinal, nesting dan referensinya, termasuk pada halaman lanjutan. Input clipboard/HTML dan dua PDF fisik; C. pada halaman 2 dan vii. pada halaman 4. |
| A06 | **PASS** | Ukur batas bawah secara bertahap dan periksa ukuran akhir terhadap 47.185.920 byte. Jalur standar mengukur JSON kompak UTF-8 dari DTO; jalur buku memeriksa DTO dan HTML UTF-8. Satu byte di bawah, tepat pada dan satu byte di atas. Kontrol editor memeriksa penolakan, batal, cleanup dan Retry setelah revisi. |
| A07 | **OPEN** | Bekukan identitas baru, kurangi kerja font yang berulang, lalu ukur ulang termasuk kontrol penolakan bukti dan seluruh gerbang. Putusan agregat aktual berlaku; alasan per gerbang dicantumkan terpisah. |
| A08 | **BLOCKED** | Bootstrap Linux x86_64 tanpa sudo dengan arsip ber-hash, deteksi versi, pemeriksaan asal setiap executable dan interpreter, dan verifier penuh pada jalur produksi. Kualifikasi Linux bersih teruji. Keberhasilan perintah produksi pada akun Pages dan seluruh bukti 24 gerbang belum tersedia. |

## Hasil tiap gerbang

| Gate | Pemeriksaan | Status RC10 | Status RC11 |
|---|---|---|---|
| G01 | Identitas acuan dan checksum | PASS | **PASS** |
| G02 | Instalasi bersih, build, tes dan HTTP | PASS | **PASS** |
| G03 | Unduhan empat template | PASS | **PASS** |
| G04 | Konversi wrapper dan prosa | PASS | **PASS** |
| G05 | Rumus visual, MathML dan mode | PASS | **PASS** |
| G06 | Deteksi perubahan isi | PASS | **PASS** |
| G07 | PDF fisik, glif dan font | PASS | **PASS** |
| G08 | Kode berhalaman, indentasi dan baris kosong | PASS | **PASS** |
| G09 | Benchmark terhadap RC6 | FAIL | **PASS** |
| G10 | Kapasitas, respons dan heap | PASS | **PASS** |
| G11 | Kontrol negatif verifier | PASS | **PASS** |
| G12 | Clipboard penyedia AI asli di Windows | BLOCKED | **BLOCKED** |
| G13 | Dialog Save, Cancel dan Retry pada perangkat sasaran | BLOCKED | **BLOCKED** |
| G14 | Pembaca layar dan pemulihan pada perangkat sasaran | BLOCKED | **BLOCKED** |
| G15 | HTTPS preview di Pages | NOT_RUN | **BLOCKED** |
| G16 | Rollback produksi dan otorisasi | BLOCKED | **BLOCKED** |
| U01 | Cetak buku dari UI | PASS | **PASS** |
| U02 | Respons, batal dan cleanup | PASS | **PASS** |
| U03 | Pengukuran percobaan dan fase | PASS | **PASS** |
| U04 | Pembacaan fisik buku | PASS | **PASS** |
| U05 | HTML luring dan navigasi | PASS | **PASS** |
| U06 | Penolakan kontradiksi kapasitas | PASS | **PASS** |
| U07 | Urutan/mode TeX antar dokumen | PASS | **PASS** |
| U08 | Marker urutan pada keluaran fisik | PASS | **PASS** |

## Bukti dan tindak lanjut

- **G12** — Windows sasaran dan clipboard asli dari antarmuka penyedia AI tidak tersedia pada mesin penguji Linux. Bukti sintetis dan clipboard Linux tidak memenuhi kontrak G12.
- **G13** — Pengujian lokal dapat membuat berkas PDF lewat Chromium headless. Bukti pada perangkat sasaran untuk Save, Cancel, Retry dan pembacaan ulang PDF hasil simpan melalui dialog OS belum diperoleh.
- **G14** — Keyboard/DOM dan pengujian pemulihan editor dapat diukur di Linux. Sesi pembaca layar pada perangkat Windows sasaran dengan catatan ucapan operator belum tersedia.
- **G15** — GitHub menolak operasi penulisan blob ke karlmarxtrading-cmyk/performa oleh integrasi (HTTP 403). Push Git Bash percobaan kering juga membutuhkan autentikasi. Dashboard Pages menampilkan halaman masuk. Tidak ada URL preview, deployment ID atau hasil ekspor hosting kandidat ini.
- **G16** — Target produksi yang diketahui baik dan ID deployment belum dapat diverifikasi di akun Pages. Otorisasi tindakan rollback live dan otorisasi promosi spesifik belum dicatat.

Item BLOCKED membutuhkan bukti pada lingkungan yang dicantumkan. Baca [prosedur Windows dan hosting](ACCEPTANCE_PERANGKAT_HOSTING.md), [toolchain](TOOLCHAIN.md), dan [langkah deploy preview](DEPLOY_CLOUDFLARE.md).

Baseline RC10 dan audit 22 November cocok dengan digest yang diberikan pemilik. Inventaris independen dan hasil verifikasi berada di [direktori baseline](../evidence/rc11/baseline/). Rekam jejak RC10 disimpan di direktori berlabel rc10.

## Apa yang berhasil dibuktikan

Pada instalasi bersih, 638 tes unit dan 11 tes skrip lulus. Toolchain yang diprovisikan dari awal menjalankan 26 tes aturan penerimaan. Chromium menyelesaikan 33 pemeriksaan aplikasi melalui UI. Firefox 153 dan WebKit 26.5 menyelesaikan pratinjau, unduhan, pemuatan HTML luring dan paginasi fixture trigonometri. Percobaan WebKit pertama mendeteksi pustaka Linux yang kurang. Bukti awal dan uji ulang setelah pemasangan pustaka sama-sama disimpan. [Log pengujian](../evidence/rc11/build-tests/) · [Hasil lintas browser](../evidence/rc11/browser/results/).

Empat template mempertahankan urutan dan mode 231 rumus acuan per dokumen, terdiri atas 103 inline dan 128 display. Pengukuran PDF mencakup 24 konfigurasi dan 29 pekerjaan. Sebanyak 26 PDF berhasil diekspor dan tiga masukan memicu penolakan yang diharapkan. Seluruh 924 cuplikan rumus yang diperiksa cocok dengan gambar acuan. Pemeriksaan visual mencakup 59 halaman berbeda dari 32 PDF, termasuk halaman terakhir setiap ekspor matriks. Pada beberapa keluaran lanskap hanya terdapat satu baris penutup pada halaman terakhir. [Matriks PDF](../evidence/rc11/pdf/coverage.json) · [Catatan visual](../evidence/rc11/pdf-review/visual-inspection.json) · [Contoh raster publik](../evidence/rc11/audit/visual/).

Pengujian buku memakai kontrol cetak resmi studio pada Chromium headless dan membaca kembali PDF fisik. Pemeriksa mencocokkan blok sumber, batas kata, tujuan daftar isi, tabel serta akhir naskah. Kolom batas kata menunjukkan jumlah pemisah yang diperiksa di dalam blok teks. Setiap kasus mempertahankan akhir naskah. [Laporan enam buku](../evidence/rc11/book/) · [Contoh keluaran sintetis](../examples/rc11/book/).

| Buku | Halaman PDF | Blok teks terkonfirmasi | Batas kata diperiksa | Batas hilang | Hasil |
|---|---:|---:|---:|---:|---|
| Naskah asli privat, pengaturan bawaan | 1284 | 30039 | 172188 | 0 | PASS |
| Tabel panjang | 590 | 2 | 217848 | 0 | PASS |
| Heading dan daftar isi | 621 | 438 | 217412 | 0 | PASS |
| Paragraf, tanpa daftar isi | 628 | 1092 | 216758 | 0 | PASS |
| Paragraf, dengan daftar isi | 628 | 1092 | 216758 | 0 | PASS |
| Satu paragraf panjang | 600 | 3 | 217847 | 0 | PASS |

PDF asli privat berukuran 11.005.560 byte. Paket publik memuat angka, digest dan hasil pembacaan untuk kasus ini. Naskah, HTML turunan, PDF dan gambar halaman privat disimpan di luar distribusi publik.

Setup toolchain Linux memakai 90 arsip conda dan satu wheel yang terkunci ke SHA-256. Probe menguji konversi Pandoc, impor pustaka, ekstraksi teks dan metadata pada PDF contoh. Laporan npm audit untuk lockfile mencatat nol advisori pada saat pemeriksaan. [Kualifikasi lingkungan bersih](../evidence/rc11/audit/toolchain/) · [Hasil npm audit](../evidence/rc11/build-tests/dependency-audit.json).

## Pengukuran G09 pada RC11

Setiap rasio membagi waktu RC11 dengan waktu RC6 untuk metrik dan cohort yang sama. Tabel ringkas menampilkan rasio terbesar di setiap cohort untuk median dan p95. Kedua kolom dapat merujuk pada metrik yang berbeda. Batas median 1,05 dan p95 1,10 harus dipenuhi pada setiap metrik.

| Cohort | Baris mentah termasuk warmup | Baris gagal | Rasio median terbesar | Rasio p95 terbesar | Hasil hitung ulang |
|---|---:|---:|---|---|---|
| node-1.json | 328 | 0 | 0,867 · long/refreshMs | 0,899 · long/refreshMs | PASS |
| node-2.json | 328 | 0 | 0,872 · long/refreshMs | 0,846 · long/refreshMs | PASS |
| recovery-cohort-1.json | 300 | 0 | 1,022 · trig/previewMs | 1,006 · small/editPreviewMs | PASS |
| recovery-cohort-2.json | 300 | 0 | 1,004 · small/smallPreviewMs | 1,065 · trig/htmlExportMs | PASS |

Pengukuran G10 menghasilkan 12, 52, dan 201 halaman pada tiga ukuran fixture. Kelima pengulangan pada masing-masing ukuran lulus batas yang ditetapkan. Sebanyak 11 dari 11 tahap pembatalan diuji pada fixture biasa maupun besar. [Data kapasitas](../evidence/rc11/performance/capacity.json) · [Sampel mentah dan penghitungan ulang G09](../evidence/rc11/performance/cohort-recount.json).

## Verifikasi independen dari ekstraksi bersih

Sebanyak 2.088 checksum pada ekstraksi masukan diverifikasi sebelum memasang dependensi. Build dari lockfile menghasilkan hash source dan dist yang sama. Setelah provisioning alat PDF pada lingkungan yang bersih, verifier membaca ulang bukti seluruh gerbang dan menghasilkan 19 PASS serta 5 BLOCKED. Keputusan NO_GO dan kode keluar 1 sesuai dengan putaran resmi. Jumlah 2.088 merujuk pada masukan verifikasi ini. Manifest ZIP pengiriman juga mencakup laporan hasil verifikasi. [Bukti verifikasi independen](../evidence/rc11/audit/toolchain/independent-qualification.json).
