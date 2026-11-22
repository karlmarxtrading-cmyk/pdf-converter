# PaperForma 3.0.0-rc.12 · laporan penerimaan

**Keputusan produksi NO_GO.** Dari 24 gerbang, 19 PASS, 5 BLOCKED dan 0 FAIL. Empat temuan RC11 lulus pengujian fungsional dalam cakupan di bawah.

| Identitas | Nilai |
| --- | --- |
| Putaran | `cc0938e1-655c-4975-ae25-773dec283b8f` |
| Source | `3a3ee3e24ce43548a31386f1141638a567a59c7a161b7200de0945f0b5b62460` |
| Dist | `1aede97a9168d8d2e4e703afc1d3f1272e3575d2eb8535f60a4ab3dfdad01e39` |
| Lockfile | `12b75fb5648c192b83655e2a154581468518cb8bb209cb29d3106d62d377fec4` |
| Commit source lokal | `1a3e315ad11ce0672ac02750bb01a85de6ffbdf4` |
| Commit preview dan deployment aktual | Belum tersedia |

[Ledger dan daftar bukti](../evidence/rc12/LEDGER.json) · [Checklist audit](../evidence/rc12/CHECKLIST_GO.csv) · [Putusan verifier](../evidence/rc12/acceptance/all-gates.json) · [Cakupan kompatibilitas](COMPATIBILITY_RC12.md).

## Perubahan yang diverifikasi

| Temuan | Perilaku yang diuji | Bukti sebelum dan sesudah |
| --- | --- | --- |
| F11-01 | Pertahankan teks dan BR eksplisit. Bandingkan proyeksi asli dengan hasil konversi. Marker display di dalam paragraf memakai pembungkus yang sah sehingga browser mempertahankan persamaan di blok asal. Pindah baris, tanda baca, backslash, nilai TeX, mode, urutan dan jalur ekspor. Kontrol mutasi memeriksa apakah perubahan sengaja terdeteksi. | [Bukti](../evidence/rc12/audit/clipboard/closure.json) |
| F11-02 | Pakai HTML aman ketika peran dan hubungan sel tidak dapat dituliskan secara utuh dalam GFM. Pertahankan scope, span, caption, posisi dan references ke header. Pada hasil offline, kedua sel suhu menunjuk header waktu dan ruang yang sesuai. Tabel kedua tetap berisi empat TD. Pohon aksesibilitas Chromium mengonfirmasi peran. Ucapan pembaca layar Windows diukur melalui G14. | [Bukti](../evidence/rc12/audit/clipboard/closure.json) |
| F11-03 | Hitung elemen pada pohon dokumen setelah sanitasi, dengan satu representasi untuk tiap rumus. Hubungkan statistik dan tombol ekspor pada revisi yang telah selesai. Tes editor dan dialog Chromium beserta kontrol besar 217.850 kata. Definisi penghitungan ada di docs/CORE_API.md. | [Bukti](../evidence/rc12/audit/stats/finding.json) |
| RC11-SEC-01 | Periksa jenis, byte, dimensi, piksel dan anggaran gabungan sebelum dekode. Pertahankan sumber asli apabila gambar tidak diterima. Sepuluh tes terarah dan pengamatan browser Chromium pada data aman. Baseline bersumber dari pemeriksaan source dan stub audit. Bukti sesudah perbaikan memakai dekoder asli Chromium, pratinjau, HTML, cetak standar, buku, pembatalan dan Retry. | [Bukti](../evidence/rc12/audit/raster/receipt.json) |

Pengujian A01–A06 diulang pada kandidat ini melalui clipboard, kedua jalur cetak, izin gambar, impor proyek, marker daftar dan batas muatan UTF-8 sebesar 45 MiB. [Hasil regresi](../evidence/rc12/audit/regressions/receipt.json).

Percobaan RC12 pertama menemukan regresi pada dokumen clipboard berisi 21 rumus. Browser memisahkan persamaan display dari paragrafnya karena pembungkus blok. Setelah pembungkus diperbaiki, source, build, alat, fixture dan pengukuran diikat pada putaran baru. [Percobaan yang digantikan](../evidence/rc12-attempts/5ebf3e65-cee4-4bcc-af1e-22c784dbffc8/attempt.json).

## Tes dan hasil ekspor

Instalasi dari lockfile, typecheck, lint dan build dari ekstraksi bersih selesai. Suite menghasilkan **663 Vitest, 13 tes Node dan 26 kontrak penerimaan**, total 702. Baseline RC11 mencatat 638 + 11 + 26 = 675. Uji terarah yang muncul di beberapa laporan hanya dihitung sekali pada total suite. Sebanyak 184 file dist identik setelah dibangun kembali. [Log build](../evidence/rc12/build-tests/clean-build.log).

Chromium menghasilkan 26 PDF pada 29 pekerjaan dan 24 konfigurasi. 3 kasus memicu penolakan yang diharapkan. Sebanyak 924/924 cuplikan rumus cocok dengan acuan. Pemeriksaan visual mencakup 56 halaman unik dari 31 PDF. [Matriks PDF](../evidence/rc12/pdf/coverage.json) · [Pemeriksaan visual](../evidence/rc12/pdf-review/visual-inspection.json) · [Contoh HTML dan PDF](../examples/rc12/).

| Buku | Halaman | Blok dikonfirmasi / sumber | Batas kata hilang / diperiksa | Penutup cocok |
| --- | ---: | ---: | ---: | --- |
| Heading dengan daftar isi | 621 | 438 / 438 | 0 / 217.412 | Ya |
| Tabel panjang | 590 | 2 / 2 | 0 / 217.848 | Ya |
| Naskah asli privat | 1.284 | 30.039 / 30.039 | 0 / 172.188 | Ya |
| Paragraf tanpa daftar isi | 628 | 1.092 / 1.092 | 0 / 216.758 | Ya |
| Paragraf dengan daftar isi | 628 | 1.092 / 1.092 | 0 / 216.758 | Ya |
| Paragraf tunggal | 600 | 3 / 3 | 0 / 217.847 | Ya |

Uji antarmuka pada putaran ini meluluskan 33/33 skenario. Pada dokumen 196 halaman, E26 mengukur jeda event loop maksimum 86 ms dengan worker dan ambang 400 ms. [Hasil UI lengkap](../evidence/rc12/user-suite/ui-e2e.json).

Putaran RC12 kedua mencatat 416 ms saat banyak suite berjalan dan 94 ms pada pengulangan terisolasi di kandidat saat itu. Satu percobaan otomatis pada batas cetak 45 MiB kehabisan waktu sebelum memperoleh sampel. Pada pengulangan di kandidat tersebut, seluruh enam batas cetak lulus. Keputusan putaran itu tetap NO_GO karena p95 refresh editor kosong 8,579 ms dibandingkan 7,240 ms pada RC6, melebihi batas rasio 1,10. Seluruh 1.256 baris mentah putaran itu dipertahankan. [Riwayat putaran kedua](../evidence/rc12-attempts/430401b2-82d5-4567-b002-14fd98349aca/).

Buku menggunakan kontrol cetak studio. PDF hasilnya dibuka kembali dan dibandingkan terhadap sumber dengan pemeriksa independen. Untuk naskah privat, paket hanya membawa ukuran, digest dan hasil pemeriksaan. [Enam laporan buku](../evidence/rc12/book/).

## Performa terhadap RC6

Metadata teks sepanjang maksimum 2.048 byte UTF-8 menggunakan implementasi SHA-256 yang sudah disediakan aplikasi. Nilai digest diperiksa terhadap implementasi independen. Pencarian elemen DOM yang pasti kosong dilewati setelah pemeriksaan sumber dan sanitasi semula. Pada diagnosis sebelum pembekuan, 80 pasangan pratinjau menghasilkan HTML identik. [Diagnosis dan data mentah](../evidence/rc12-attempts/430401b2-82d5-4567-b002-14fd98349aca/diagnosis/README.md).

| Kelompok ukur | Jumlah baris mentah | Baris gagal | Status pemeriksa independen |
| --- | ---: | ---: | --- |
| node-1.json | 328 | 0 | PASS |
| node-2.json | 328 | 0 | PASS |
| recovery-cohort-1.json | 300 | 0 | PASS |
| recovery-cohort-2.json | 300 | 0 | PASS |

Seluruh baris, warmup, pengulangan, median dan p95 tersedia untuk tiap metrik. [Sebelum dan sesudah perbaikan](../evidence/rc12/audit/performance-fix/official-before-after.json) · [Perhitungan kembali G09](../evidence/rc12/performance/cohort-recount.json).

## Keputusan per gerbang

| Gerbang | Cakupan | Hasil | Bukti |
| --- | --- | --- | --- |
| G01 | Identitas dan checksum | PASS | [Receipt](../evidence/rc12/acceptance/receipts/G01.json) |
| G02 | Instalasi/build/tes/HTTP | PASS | [Receipt](../evidence/rc12/acceptance/receipts/G02.json) |
| G03 | Unduhan empat template | PASS | [Receipt](../evidence/rc12/acceptance/receipts/G03.json) |
| G04 | Wrapper dan prosa | PASS | [Receipt](../evidence/rc12/acceptance/receipts/G04.json) |
| G05 | Rumus/mode/MathML | PASS | [Receipt](../evidence/rc12/acceptance/receipts/G05.json) |
| G06 | Deteksi perubahan isi | PASS | [Receipt](../evidence/rc12/acceptance/receipts/G06.json) |
| G07 | PDF/glif/font | PASS | [Receipt](../evidence/rc12/acceptance/receipts/G07.json) |
| G08 | Kode multihalaman | PASS | [Receipt](../evidence/rc12/acceptance/receipts/G08.json) |
| G09 | Performa terhadap RC6 | PASS | [Receipt](../evidence/rc12/acceptance/receipts/G09.json) |
| G10 | Kapasitas/respons/heap | PASS | [Receipt](../evidence/rc12/acceptance/receipts/G10.json) |
| G11 | Kontrol negatif verifier | PASS | [Receipt](../evidence/rc12/acceptance/receipts/G11.json) |
| G12 | Clipboard provider asli Windows | BLOCKED | [Receipt](../evidence/rc12/acceptance/receipts/G12.json) |
| G13 | Dialog OS Save/Cancel/Retry | BLOCKED | [Receipt](../evidence/rc12/acceptance/receipts/G13.json) |
| G14 | Screen reader + pemulihan | BLOCKED | [Receipt](../evidence/rc12/acceptance/receipts/G14.json) |
| G15 | HTTPS preview Pages | BLOCKED | [Receipt](../evidence/rc12/acceptance/receipts/G15.json) |
| G16 | Rollback produksi + otorisasi | BLOCKED | [Receipt](../evidence/rc12/acceptance/receipts/G16.json) |
| U01 | Cetak buku dari UI | PASS | [Receipt](../evidence/rc12/acceptance/receipts/U01.json) |
| U02 | Respons/batal/cleanup | PASS | [Receipt](../evidence/rc12/acceptance/receipts/U02.json) |
| U03 | Observasi percobaan/fase | PASS | [Receipt](../evidence/rc12/acceptance/receipts/U03.json) |
| U04 | PDF buku fisik | PASS | [Receipt](../evidence/rc12/acceptance/receipts/U04.json) |
| U05 | HTML offline/navigasi | PASS | [Receipt](../evidence/rc12/acceptance/receipts/U05.json) |
| U06 | Kontradiksi kapasitas ditolak | PASS | [Receipt](../evidence/rc12/acceptance/receipts/U06.json) |
| U07 | Urutan dan mode TeX | PASS | [Receipt](../evidence/rc12/acceptance/receipts/U07.json) |
| U08 | Marker daftar fisik | PASS | [Receipt](../evidence/rc12/acceptance/receipts/U08.json) |

## Bukti yang masih diperlukan

Untuk G12–G14, jalankan clipboard penyedia AI, Save/Cancel/Retry dan pembaca layar pada Windows sasaran. Untuk G15, diperlukan akses tulis repository dan akses ke proyek Pages agar tersedia deployment preview HTTPS. Untuk G16, identifikasi dua deployment produksi yang tepat dan peroleh persetujuan pemilik sebelum rollback. Pada simulasi Git lokal, RC11 dipulihkan dari RC12 dan identitas source serta dist RC11 cocok kembali. Pengukuran hosting untuk G16 tetap memerlukan peristiwa dari Pages. [Simulasi Git lokal](../evidence/rc12/external/local-git-rollback.json). A07 masih OPEN. A08 memerlukan rehearsal penuh di runner Pages proyek tersebut setelah 24 gerbang lulus. [Panduan pengambilan bukti dan berkas yang dikembalikan](ACCEPTANCE_PERANGKAT_HOSTING.md) · [Pengaturan proyek, preview dan rollback](DEPLOY_CLOUDFLARE.md).

## Verifikasi independen dan isi ZIP

Ekstraksi independen memeriksa 2.928 checksum pada snapshot pengukuran. Instalasi dari lockfile dan build Pages lokal menghasilkan 184 file distribusi dengan total 10.246.030 byte. Toolchain Linux menjalankan probe HTML/PDF dan verifier penuh. Verifier membaca ulang bukti, menghasilkan 24 baris identik dengan putusan kanonis, dan mengembalikan exit 1 sesuai NO_GO. [Log dan receipt independen](../evidence/rc12/audit/hosting/independent-qualification.json).

Pemeriksaan pra-pengemasan membaca setiap anggota arsip dan proyek bersarang, mencocokkan checksum, mencari sampel teks naskah, digest keluaran privat dan pola kredensial. SHA-256 ZIP penyerahan dan hasil verifikasi ekstraksi final disampaikan bersama unduhan. Untuk mengulangnya, gunakan `scripts/verify-archive.py` terhadap ZIP, lalu jalankan verifier dari ekstraksi baru. [Hasil pemindaian](../evidence/rc12/packaging/pre-delivery-privacy.json).
