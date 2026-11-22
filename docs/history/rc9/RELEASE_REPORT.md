# PaperForma 3.0.0-rc.8 · 22 November 2026

**Keputusan promosi NO_GO.** Paket dapat dijalankan secara lokal dari `dist/`. Batas keputusan meliputi bukti performa, perangkat, dialog native, aksesibilitas, hosting dan rollback yang dirinci di bawah.

| Identitas | SHA-256 |
|---|---|
| Source kandidat | `0ecf3b0981925fd3c42fb49e1756b6ac99900ebfe330b94d7ded617194864064` |
| Pohon `dist` | `bd329e6b849839b5fd4c5e6ba51e3ee55d98fa607261dee1fbfbad62dd770436` |
| Naskah trigonometri pengguna | `1f4b9345ef5a092c40e66290821f110cee2656a093a889c0f51800bdd54bb16f` |

[Identitas RC6, RC7 dan audit](../evidence/rc8/input/identity.json) · [Ledger dan perintah per temuan](../evidence/rc8/LEDGER.json) · [Putusan yang dapat dihitung ulang](../evidence/rc8/acceptance/decision.json).

Pada 16 syarat rilis, 10 PASS, 1 FAIL, 4 BLOCKED, 1 NOT_RUN. Komputasi pada 560 pasangan RC6/kandidat menghasilkan keluaran setara. Seluruh batas kapasitas terpenuhi pada 12, 52 dan 201 halaman. G09 terbuka karena dua ukuran p95 Chromium dan waktu persiapan cetak trigonometri di Node. Lihat tabel median/p95 per alur. G12–G16 merinci kualifikasi perangkat dan layanan eksternal.

## Hasil yang dapat dibuka

- [HTML trigonometri EDU-01](../examples/rc8/html/EDU-01.html) mempertahankan 231 rumus, 12 font tersemat, 254 blok dan 17 pemulihan. Pembanding memakai subtree KaTeX visual dan MathML, TeX sebelum/sesudah pemulihan, mode dan anotasi. BUS-01, EDT-01 serta CON-01 mempunyai 10, 14 dan 9 font sesuai template. Keempat unduhan dibaca kembali secara luring.
- [PDF trigonometri BUS-01 A4](../examples/rc8/pdf/trigonometry-BUS-01-A4-portrait.pdf) dan [PDF kode EDT-01 A5](../examples/rc8/pdf/mixed-supported-EDT-01-A5-portrait.pdf) dibuat menggunakan jendela cetak yang disiapkan oleh studio dan mesin PDF otomatis Chromium. Dari 29 kasus, 26 menghasilkan PDF untuk pengguna dan tiga menolak fixture asli yang memuat karakter privat tanpa pemetaan. Empat PDF trigonometri dibandingkan dengan acuan RC7 pada seluruh 924 cuplikan rumus dan 74 halaman.
- [Contoh berkas pelajaran .htm](../examples/rc8/KELAS-HTML.html) dan [diagram bersama gambar](../examples/rc8/DIAGRAM-DAN-GAMBAR.html) berasal dari alur Buka berkas. Studio menyimpan byte sumber asli meski HTML ditata ulang. [Contoh percakapan](../examples/rc8/content/percakapan.html) memuat empat pesan dengan atribusi. [Matriks kompatibilitas](COMPATIBILITY_RC8.md).

## Temuan A01–A09

| ID | Prioritas | Status | Temuan audit | Gate |
|---|---|---|---|---|
| A01 | P1 | **PASS** | Teks mandiri di dalam wrapper rumus campuran dapat hilang tanpa peringatan | G04 |
| A02 | P1 | **PASS** | Formula kosong/rusak dapat lolos pemeriksaan integritas dan ekspor HTML | G05 |
| A03 | P1 | **PASS** | Prosa tambahan di luar blok sumber dapat lolos sebagai keluaran utuh | G06 |
| A04 | P1 | **FAIL** | Gate kesetaraan performa belum terpenuhi | G09 |
| A05 | P2 | **PASS** | Gerbang rilis dan pengikatan bukti benchmark belum lengkap | G11 |
| A06 | P2 | **PASS** | Karakter PUA berubah menjadi kotak pada PDF campuran asli | G07 |
| A07 | P3 | **PASS** | Label kode kosong terpisah dari baris pertama pada A5 | G08 |
| A08 | P2 | **PASS** | Bukti kapasitas, responsivitas, dan label puncak memori perlu diperbaiki | G10 |
| A09 | P2 | **BLOCKED** | Penerimaan native PDF, platform sasaran dan hosting belum ditutup | G12, G13, G14, G15, G16 |

## Penerimaan kandidat

| Gate | RC7 | RC8 | Perubahan dan hasil | Batas verifikasi |
|---|---|---|---|---|
| G01 · Paket dan identitas | PASS | **PASS** | Memverifikasi SHA-256 arsip RC6, RC7 dan audit, nama/path, CRC, daftar internal, sumber asli dan HTML acuan. | Paket di dalam receipt local-build adalah arsip kandidat awal dengan source/dist identik. Seluruh isi ZIP distribusi dan rebuild final diperiksa lagi secara terpisah setelah pemaketan. |
| G02 · Build dan suite dasar | PASS | **PASS** | Rebuild bersih dari lockfile, pemeriksaan TypeScript, lint, 573 tes Vitest dan 9 tes Node, HTTP 185 jalur, mutasi rilis dan pemindaian rahasia. Seluruh 181 berkas dist beserta manifest identik. | Pengujian HTTP dilaksanakan di loopback. Hasil suite browser dan kinerja memakai gate sendiri. |
| G03 · Baseline trigonometri | PASS | **PASS** | Unduhan produksi pada empat template. Setiap hasil mempertahankan 231 rumus (103 inline, 128 display), 17 pemulihan dan 254 blok. Seluruh cabang visual serta MathML, anotasi, isi dokumen, CSS dan byte font dicocokkan; EDU-01 mempertahankan 12 font. | Cakupan kesetaraan adalah korpus pengguna dan profil template yang ditentukan. Jumlah font yang diperlukan berbeda antar-template. |
| G04 · Isi wrapper campuran A01 | FAIL | **PASS** | Dua jalur raw HTML dan clipboard mempertahankan anak semantik di wrapper rumus. Sebanyak 24/24 kasus lulus pada RC8. Sebanyak 20/24 kasus gagal pada RC7. | Cakupan keluarga wrapper, kontrol ambigu dan multiple-math tercantum per baris dalam fixture. Untuk masukan ambigu editor memberi tahu pengguna. |
| G05 · Representasi rumus A02 | FAIL | **PASS** | Pemeriksaan ekspor menolak formula kosong, perubahan satu operator atau mode, hilangnya cabang visual/MathML, anotasi, CSS dan font rusak. Kontrol valid dapat diekspor. | Pemeriksaan menyatakan kesetiaan representasi pada sumber. Kebenaran matematika penulis berada di luar cakupan. |
| G06 · Cakupan seluruh isi A03 | FAIL | **PASS** | Pemeriksaan seluruh artikel memblokir tambahan teks, ID asing atau duplikat, perubahan angka, urutan, tabel, kode dan dekorasi yang menyamar. Termasuk kasus definisi Markdown yang tidak ditampilkan. | Pengecualian untuk dekorasi berasal dari struktur yang dibuat renderer dan konten tepercaya yang tepat. |
| G07 · Kontrak glyph PDF A06 | FAIL | **PASS** | Memblokir PDF untuk U+E000/U+F8FF tanpa mapping dan memperlihatkan lokasi. Memeriksa urutan emoji, ketercarian teks, font PDF dan tanpa Type 3 pada kontrol. Dua asal fixture tetap terpisah. | Pada tiga konfigurasi asli PDF diagnostik masih memperlihatkan glif kotak. Artefak ini tersimpan di evidence, di luar keluaran yang diizinkan. Native Save ada di G13. |
| G08 · Paginasi kode A07 | FAIL | **PASS** | Membersihkan fragmen cetak kosong; label bahasa dan label lanjutan mengikuti baris yang tercetak. Memeriksa 112 baris kode termasuk indentasi serta baris kosong, 70 baris tabel dan 60 nilai tabel lebar. | Korpus bersama mencakup 4 template × 3 ukuran × 2 orientasi; tiap kombinasi mempunyai fixture terdaftar. Bukti visual rinci EDT/A5 dan empat PDF acuan tersedia. |
| G09 · Performa A04 | FAIL | **FAIL** | Mengurangi pemeriksaan ulang pada revisi yang sama, pemrosesan font dan biaya membaca ulang artikel saat atribut open daftar isi diserialisasi. Mengukur dua cohort RC6/RC8 berpasangan dengan oracle lengkap. Saat satu revisi diproses, aplikasi menggunakan DOM yang sudah dihasilkan untuk menghindari pekerjaan rangkap pada sumber panjang. | Ambang per metrik dan per cohort adalah rasio median ≤1,05 dan p95 ≤1,10. Waktu CPU, cache dan variasi host berlaku untuk lingkungan pengukuran. Semua pasangan tetap tercantum. |
| G10 · Kapasitas/memori A08 | NOT_RUN | **PASS** | Mengukur lima pengulangan di masing-masing tiga ukuran, dari preview dan PDF hingga edit ulang, pembatalan dan penggunaan heap pada target halaman. Mesin meneruskan progres dari halaman fisik yang selesai dan memberi waktu pada editor di antara fase dokumen besar. | Nilai puncak adalah maksimum sampel JS heap pada target yang sama. Tidak mencakup memori native atau worker; lima ulangan tidak cukup untuk menyatakan p95 produksi. |
| G11 · Gerbang rilis A05 | FAIL | **PASS** | Gerbang terpisah memeriksa hash aktual dua sisi pengamatan, fixture, settings, oracle lengkap, bukti per gate dan statistik mentah. Sebanyak 15 kontrol mutasi telah diuji. Build produksi Pages lokal berhenti bila keputusan NO_GO. | Ini merupakan gerbang promosi di aplikasi. Penerapan konfigurasi di layanan hosting dinilai dalam G15 dan G16. |
| G12 · Browser dan clipboard nyata A09 | NOT_RUN | **BLOCKED** | Chromium Linux menjalankan salin/tempel keyboard dengan dua MIME nyata dari fixture sintetis. Linux Firefox dan WebKit memuat, mengekspor dan membuka kembali HTML identik secara luring. | Perangkat Windows, macOS/iOS, Android dan sesi penyedia AI nyata yang diminta belum tersedia. |
| G13 · Simpan PDF native A09 | BLOCKED | **BLOCKED** | Menguji ketersediaan jalur native Chromium headed serta perangkat desktop untuk Save/Cancel/Retry dan pembacaan kembali byte PDF. | Layar dan soket layanan display lokal tidak dapat dibuka. PDF mesin cetak otomatis di G07–G08 tetap dapat diunduh dalam paket. |
| G14 · Operasi data dan aksesibilitas | NOT_RUN | **BLOCKED** | Menguji operasi clipboard dan .pfproj, investigasi kuota, dua tab, konflik/penghapusan, Undo/Redo, keyboard, fokus dan aksesibilitas otomatis. | Sesi pembaca layar dan zoom native pada perangkat sasaran belum dapat diverifikasi. Pemeriksaan otomatis memiliki cakupan terpisah. |
| G15 · Preview/hosting A09 | NOT_RUN | **NOT_RUN** | Memeriksa HTTP/MIME/headers lokal serta konfigurasi build untuk branch preview dan produksi di salinan terpisah. | Pemilik memilih ZIP dan pengujian lokal. Tidak ada URL Cloudflare aktual untuk kandidat ini. |
| G16 · Rollback dan persetujuan rilis | NOT_RUN | **BLOCKED** | Latihan rollback pada repositori Git sementara mengembalikan source RC7, 180 berkas dist dan seluruh 184 pemeriksaan HTTP. | Tidak ada promosi publik, otorisasi rollback hosting atau latihan terhadap deployment produksi. Pemilik membatasi pekerjaan pada ZIP dan pengujian lokal. |

## Performa dan kapasitas terukur

Angka berikut membandingkan kandidat terhadap RC6 pada mesin Linux yang sama. Rasio 1,00 berarti waktu yang sama. Batas pada setiap baris dan cohort adalah median ≤1,05 dan p95 ≤1,10. Ringkasan dihitung dari seluruh sampel.

| Alur Node/jsdom · 40 pasangan per cohort | Median C1 | p95 C1 | Median C2 | p95 C2 |
|---|---:|---:|---:|---:|
| Trigonometri · perbarui | 0,797× | 0,780× | 0,758× | 0,828× |
| Trigonometri · ekspor HTML | 0,651× | 0,672× | 0,618× | 0,656× |
| Trigonometri · siapkan cetak | 1,173× | 1,298× | 1,145× | 1,103× |
| Dokumen panjang · perbarui | 0,790× | 0,849× | 0,860× | 1,010× |
| Edit singkat · perbarui setelah edit | 0,742× | 0,788× | 0,661× | 0,705× |
| Edit singkat · ekspor HTML | 0,836× | 0,746× | 0,829× | 0,749× |
| Edit singkat · siapkan cetak | 0,940× | 0,734× | 0,742× | 0,629× |
| Dokumen kosong · perbarui | 0,618× | 0,619× | 0,826× | 0,824× |

Kedua cohort Node menyelesaikan empat jenis dokumen dengan 40 pasangan per jenis. Keluaran seluruh pasangan setara menurut oracle. Waktu ekspor HTML trigonometri mencakup verifikasi pada byte akhir.


Pengukuran browser recovery-cohort-1.json · trig 40 pasangan lengkap, long 40 pasangan lengkap, small 40 pasangan lengkap. Status FAIL.

| Alur Chromium | Median RC8/RC6 | p95 RC8/RC6 |
|---|---:|---:|
| trig · previewMs | 0,982× | 1,147× |
| trig · htmlExportMs | 0,882× | 0,897× |
| trig · pageReadyMs | 1,024× | 1,046× |
| long · previewMs | 0,958× | 0,889× |
| small · smallPreviewMs | 0,998× | 1,028× |
| small · editPreviewMs | 1,002× | 1,210× |

Pengukuran browser recovery-cohort-2.json · trig 40 pasangan lengkap, long 40 pasangan lengkap, small 40 pasangan lengkap. Status PASS.

| Alur Chromium | Median RC8/RC6 | p95 RC8/RC6 |
|---|---:|---:|
| trig · previewMs | 0,962× | 1,008× |
| trig · htmlExportMs | 0,869× | 0,866× |
| trig · pageReadyMs | 0,985× | 1,044× |
| long · previewMs | 0,960× | 0,991× |
| small · smallPreviewMs | 0,996× | 1,038× |
| small · editPreviewMs | 0,997× | 0,955× |

| Halaman aktual | PDF terverifikasi | Seluruh SLA dipenuhi | Preview terlama | Siap cetak terlama | Jeda terlama* | Maks. sampel heap target |
|---:|---:|---:|---:|---:|---:|---:|
| 12 | 5/5 | 5/5 | 0,522 s | 1,640 s | 0,357 s | 25,797 MiB |
| 52 | 5/5 | 5/5 | 1,115 s | 3,809 s | 0,287 s | 38,867 MiB |
| 201 | 5/5 | 5/5 | 2,741 s | 16,270 s | 0,668 s | 86,497 MiB |

*Jeda antara dua pengamatan event loop di antara fase pratinjau, layout dan edit ulang. Angka heap adalah byte JS target halaman pada interval sampling. Memori native, worker serta alokasi di sela sampel berada di luar pengukuran.

Ukuran yang memenuhi seluruh pemeriksaan kapasitas dalam lima pengulangan pada mesin ini: 12, 52, 201 halaman. Ukuran di atas maksimum yang diuji belum memiliki bukti.

## Alur pengguna

Seluruh 33 skenario dari suite QA pada build yang berasal dari source final lulus. Pada E26, jeda terpanjang saat analisis dengan Worker adalah 238 ms. Pemeriksaan smoke pada build produksi lulus. Keempat HTML trigonometri, contoh lain dan PDF diuji melalui build produksi tersendiri. [33 skenario beserta hasil](../evidence/rc8/user-suite/chromium-e2e.json) · [Smoke](../evidence/rc8/user-suite/smoke.json).

Pada dokumen 118 bagian, klik serta Enter mengarahkan fokus ke judul terakhir di dalam pratinjau yang sama. Drag mouse menghasilkan seleksi START_SECTION_0118. Pemeriksaan ini juga mempertahankan 1.888 sel tabel. Find native OS belum diujikan. [Bukti nav dan seleksi](../evidence/rc8/operations/preview-navigation.json).

## Verifikasi dan kelanjutan

Dari root ekstraksi jalankan `npm ci`, `npm run build` dan `npm run verify:release`. Keputusan membaca ulang hash sumber, dist, fixture, oracle, protokol, unduhan dan hasil. Lihat [instruksi menjalankan aplikasi](../README_MULAI_DI_SINI.md), [kriteria penambahan bukti](RELEASE_ACCEPTANCE.md), [prosedur perangkat](../evidence/rc8/browser/PENERIMAAN_PERANGKAT.md) dan [panduan Pages dan rollback](DEPLOY_CLOUDFLARE.md). Catatan pemulihan memisahkan pekerjaan terukur dari bukti eksternal yang masih diperlukan.

`SHA256SUMS` mencakup setiap anggota ZIP kecuali daftar itu sendiri. SHA-256 ZIP dan hasil ekstraksi final dicantumkan dalam tanda terima penyerahan. Pemeriksaan dilakukan pada salinan baru dan menghapus dist sebelum build. Receipt G01–G02 di dalam paket mencatat verifikasi kandidat sebelum seluruh bukti ditambahkan.
