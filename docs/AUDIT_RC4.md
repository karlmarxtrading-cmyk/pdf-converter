# Audit menyeluruh PaperForma — RC3 ke RC4

Tanggal: 21 November 2026. Objek audit adalah ZIP PaperForma yang diunggah dalam permintaan ini, bukan DYNANCA atau repository lain.

## 1. Keputusan utama

**RC3 belum cukup andal untuk disebut membaca setiap tulisan dan menghasilkan PDF terbaik tanpa batas.** Audit menemukan cacat pembacaan, keutuhan kode, aset/riwayat, pembatalan, batas sumber daya, serta kelemahan pemeriksa rilis. Perbaikan sudah diterapkan dalam kandidat **3.0.0-rc.4** yang disertakan bersama source, build, tes, contoh HTML dan bukti.

Statusnya kandidat perbaikan yang dapat dibangun dan diuji di staging. **Produksi umum belum disertifikasi**, sebab browser/PDF baru dan Cloudflare milik pengguna belum dapat diverifikasi. Ini tidak menghapus pekerjaan yang sudah selesai; batas bukti dinyatakan agar keputusan deploy tidak bergantung pada klaim palsu.

## 2. Seluruh arsip diperiksa dengan metode yang sesuai

Input `PAPERFORMA_STATIC_3.0.0-rc.3_MATH_FIX.zip` mempunyai **520 file**, ukuran 7.225.319 byte. SHA-256: `0fa8d22b396789b9396c8a9124aba95cdd9ac5f8717367cc1552d149dc39abaf`. Seluruh 518 checksum yang tercantum cocok; arsip tidak dimodifikasi. Tidak ditemukan path ganda/traversal pada pemeriksaan struktur arsip.

| Kelompok | Pemeriksaan aktual |
|---|---|
| Seluruh 520 file | Inventaris path, ukuran, SHA-256 dan metode review per file |
| 57 file runtime | 56 source dibaca lengkap; tabel cakupan font terbangkit diregenerasi dan identik |
| 30 tes unit +2 helper, 10 skrip browser | Source dibaca; unit dijalankan; eksekusi browser kandidat dibedakan tegas |
| 281 file dist RC3 | Dibangun ulang dari source RC3 dan identik byte demi byte |
| 104 WOFF2 dan 14 PNG | Font didekode dengan FontTools; PNG divalidasi |
| 11 PDF lama | Struktur dan ekstraksi teks; enam PDF ditinjau visual pada 29 halaman |
| Dokumen, konfigurasi, lockfile, lisensi | Dokumen/config dibaca; lock/SBOM diperiksa terstruktur dan melalui audit dependensi |

Cakupan visual PDF: tiga dokumen lengkap dan tiga sampel halaman; lima PDF lain hanya struktur/teks. JavaScript minifikasi/vendor divalidasi melalui build dan hash; tidak diklaim setiap baris vendor diaudit manual. Inventaris lengkap ada di `evidence/audit-rc4/audit-file-coverage.csv` dan JSON padanannya.

## 3. Mengapa rumus pada gambar masih tampak mentah?

Screenshot memperlihatkan delimiter seperti `\(…\)` dan `\[…\]`, serta perintah trigonometri, pecahan dan akar yang tampil sebagai teks. Namun kontrol tabel trigonometri sederhana **sudah lulus pada source RC3 yang diunggah**. PDF Einstein lama juga menunjukkan rumus yang ter-render. Oleh karena itu tidak tepat menyimpulkan semua screenshot disebabkan satu bug yang sama.

Log pengguna sebelumnya menunjukkan `version:null` pada deployment dan perilaku yang berbeda dari kandidat. Itu alasan kuat untuk memeriksa identitas build, tetapi audit ini tidak memperoleh clipboard asli atau membuktikan keadaan live URL sekarang. Dua faktor harus dipisahkan: build yang benar-benar disajikan hosting dan jalur konversi yang benar-benar menerima masukan.

Di sisi source, beberapa kasus lanjutan memang gagal dan sudah direproduksi: formula di caption/tabel colspan, formula yang terpecah oleh markup inline, formula di label tautan, display math di sel/penekanan, serta tabel dengan garis vertikal/matriks multibaris. Perbaikannya bekerja pada parser/struktur, tanpa menghapus escape secara global.

Korpus transkripsi screenshot berisi **21 formula**. Dua jalur—Markdown dan HTML clipboard—menghasilkan sumber TeX dan mode yang diharapkan, lolos pemeriksaan keutuhan, lalu diekspor melalui API aktual dengan font nyata. File contoh terdapat di `examples/`. Uji ini bukan rekaman clipboard OS atau bukti visual semua browser.

Tulisan “Drag point P” dan “Beri masukan” tetap dipertahankan. Sebuah screenshot atau clipboard yang hanya menyimpan label tidak membawa grafik interaktif, koordinat, canvas atau state widget. Aplikasi tidak mengarang gambar pengganti.

## 4. Temuan penting dan perbaikan

| Masalah yang dikonfirmasi | Tindakan yang sudah dilakukan |
|---|---|
| TeX literal gagal pada struktur HTML tertentu | Pengenalan math lintas inline aman, caption, tabel kompleks dan label link; mode display dipertahankan |
| Contoh kode berubah delimiter/indentasi | Lindungi indented code dan pre/code/kbd/samp; oracle paginasi menjaga whitespace kode |
| Gambar salah setelah pindah proyek, replace atau undo | Token generasi proyek, pemilihan berdasarkan path, commit/undo atomik dan riwayat alias |
| HTML nesting dan gambar inline lolos batas | Admission struktur sebelum konversi rekursif; batas byte/MIME/dimensi/piksel bersama sebelum img |
| Font hilang/macet dan varian math/brand tidak lengkap | Font plan diperluas; abort/deadline 15 detik; gagal tidak menghasilkan berkas final palsu |
| Sampul kosong | Omit sampul jika tidak ada metadata terlihat/logo; isi dan pengaturan sumber tidak diubah |
| Header kolom terpecah terlalu pucat | Latar penanda hanya untuk sel isi; header mempertahankan pasangan warna templat |
| Oracle PDF/gate dapat meloloskan kekurangan | Periksa prosa/caption/minus/urutan; wajibkan versi, semua engine dan hasil terminal yang benar |
| Perbandingan revisi besar mengunci UI | Diff async dengan batas kerja; fallback menampilkan dua teks lengkap dan unduhan |
| Lifecycle Worker menyisakan listener/hasil usang | Cleanup listener, generasi disposal, penjagaan instance, penanganan kirim gagal/late cancel |

Detail **41 entri temuan/peningkatan** tersedia di `findings.json`, laporan core, render dan UI/storage. Jumlah itu mencakup performa serta penguatan validator, bukan 41 kerentanan keamanan atau 41 bug runtime kritis. Prioritas P1/P2 adalah prioritas audit internal, bukan skor CVSS.

Pemeriksa PDF lama melewatkan prosa di dekat rumus, caption, tanda minus dan sebagian urutan. Sekarang oracle lebih ketat. Beberapa hasil lama yang dahulu diberi PASS dapat gagal jika diperiksa dengan aturan baru; kegagalan tersebut harus ditelusuri, bukan diselesaikan dengan melonggarkan kriteria.

## 5. Performa yang benar-benar diukur

| Operasi Node | Median RC3 → RC4 (ms) | p95 sampel RC3 → RC4 (ms) | Hasil |
|---|---:|---:|---|
| 400 rumus identik berulang | 123,89 → 70,65 | 244,63 → 86,91 | Hash hasil identik |
| Keanggotaan 8.000 blok | 574,06 → 7,71 | 840,11 → 9,97 | Hash hasil identik |
| 10.000 baris mata uang | 683,99 → 16,39 | 715,67 → 46,54 | Hash hasil identik |

Node, satu warm-up, sembilan pasangan AB/BA per kondisi, input dan hash hasil dibandingkan. Pada n=9, p95 adalah maksimum sampel. Perbaikan berasal dari cache KaTeX terbatas per pekerjaan, Set untuk lookup blok, dan prakomputasi batas paragraf. Angka ini **bukan** percepatan seluruh website atau proses PDF.

| Snapshot Node | Median RC3 → RC4 (ms) | p95 RC3 → RC4 (ms) |
|---|---:|---:|
| 20.000 karakter | 0,75 → 0,85 | 5,35 → 3,15 |
| 1,08 juta karakter + riwayat | 18,34 → 14,21 | 27,26 → 20,12 |
| Skenario riwayat + 10 MiB buffer aset | 44,75 → 31,72 | 70,03 → 99,41 |

Snapshot memakai tiga warm-up dan 30 pasangan. Hash identitas sama. Median riwayat/gambar membaik, tetapi p95 gambar memburuk dan median kecil naik sekitar 0,09 ms. Penyebab variasi belum terbukti; data tidak dibuang. Detail metodologi dan batas fingerprint snapshot tercantum di PERFORMANCE_REPORT.md.

Berkas JS utama gzip bertambah dari 400,04 menjadi 402,15 KiB. Penjaga integritas menambah sedikit kode. Tidak ada klaim “tercepat di dunia”, semua ukuran membaik, atau paginasi 1.000 halaman kandidat baru sudah diukur.

## 6. Pengujian akhir dan reproduksi

| Pemeriksaan | Hasil baru |
|---|---|
| TypeScript dan lint | Lulus |
| Vitest | 332/332, 41 berkas |
| Oracle/gate/server Node | 8/8 |
| Build produksi dan QA | Lulus pada kandidat yang sama |
| Gate artefak | Kontrol diterima, 12 mutasi ditolak |
| HTTP lokal | 285/285; 280 berkas cocok SHA-256 |
| Clean-room source/dist | Instalasi/test/build lulus; 281 dist identik |
| E2E browser | BLOCKED_BY_ENVIRONMENT sebelum skenario |
| PDF baru / native print / Cloudflare pemilik | NOT_RUN |

Baseline RC3 sendiri lulus 255 tes lama; regresi baru tetap menemukan cacat. Jadi jumlah tes bukan bukti cukup tanpa kasus dan oracle yang tepat. Beberapa assertion lama diperkuat: font/isi/script ekspor, semua revisi riwayat dan pemulihan sumber tepat, fokus dialog, cleanup DB. Skenario viewport/DPR diberi label emulasi, bukan zoom native.

Chromium lokal gagal karena operasi socket/process tidak diizinkan. Browser terpisah tidak dapat menjangkau localhost. Tidak dilakukan bypass kebijakan; unit tidak disebut E2E dan PDF lama tidak disebut PDF baru. Log kegagalan disertakan.

Kandidat: `680c8b5c6cb1ca3948e19c17857682ab6711d3a2fb70430565692f8a0feadd79`. Dist: `03e0a565c52b2a514eb01e878e7f0ca3c31a1a7cc04b9a4a8c90dc53d2390a1d`. Clean-room memvalidasi arsip kandidat sebelum bukti/dokumen final; ekstraksi paket akhir harus menunjukkan source fingerprint dan seluruh dist identik dengan kandidat yang diuji.

## 7. Batas produk yang tetap penting

Dukungan input bukan semua format: PDF/DOCX/OCR belum tersedia. KaTeX bukan implementasi seluruh paket LaTeX. Font Latin/Indonesia, Yunani, Sirilik dan simbol math dibundel; RTL/CJK/Thai/Devanagari/emoji/PUA tidak dijamin. Oracle memeriksa keutuhan, bukan membenarkan persamaan atau fakta naskah.

PDF dihasilkan melalui mesin cetak browser. PaperForma tidak mengetahui byte PDF yang akhirnya disimpan; PDF/A, PDF/UA dan tagging lengkap belum disertifikasi. Paginasi tetap memakai main thread. Batas header gambar tidak membuktikan seluruh memori decoder/frame animasi/SVG aman untuk setiap perangkat.

Batas tambahan: oracle raw-table belum mencakup seluruh mutasi alt/title; riwayat lama tidak dapat mengembalikan byte gambar yang tidak pernah disimpan. Data IndexedDB terikat origin. Bukti jaringan E18 bukan inspeksi semua body request; tes timer E26 bukan latensi keyboard fisik.

## 8. Langkah deploy yang konkret

Salin isi `repository/` ke root checkout; pertahankan `.git`. Node 24.22.3, npm >=11.6.0 <12. Jalankan npm ci, typecheck, lint, test, build. Cloudflare Pages: build command `npm run build`, output `dist`; tidak memerlukan Functions atau secret.

Setelah preview aktif, jalankan `npm run verify:http -- https://URL-PREVIEW.pages.dev`, kemudian `npm run verify:deployment -- https://URL-PREVIEW.pages.dev` memakai browser lokal. Versi harus tepat RC4 dan semua berkas sesuai; HTTP 200 tidak cukup.

Sebelum produksi umum, uji clipboard asli, HTML luring dan PDF tersimpan pada browser/perangkat sasaran. Periksa formula, tabel, kode, font, jumlah halaman, tautan serta akhir dokumen. Setelah gate ini selesai, keputusan rilis dapat diperbarui berdasarkan hasil nyata. Panduan lengkap dan rollback berada di DEPLOY_CLOUDFLARE.md; semua 62 ID penerimaan tetap ada di ACCEPTANCE.md.

## 9. Bukti dan rujukan

Bukti utama: RELEASE_REPORT.md, PERFORMANCE_REPORT.md, KNOWN_LIMITS.md, inventaris 520 file, findings.json, log final/cleanroom, serta laporan domain di evidence/audit-rc4. Histori RC3 disimpan terpisah. PDF laporan audit ini adalah dokumen penjelasan, **bukan** contoh PDF yang dihasilkan mesin PaperForma RC4.

Rujukan konfigurasi primer diperiksa 21 November 2026: [Cloudflare build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/), [Node override](https://developers.cloudflare.com/pages/configuration/build-image/), [static headers](https://developers.cloudflare.com/pages/configuration/headers/), [KaTeX options](https://katex.org/docs/options.html), [KaTeX supported functions](https://katex.org/docs/supported.html). Temuan produk bertumpu pada source dan pengujian paket, bukan artikel pihak ketiga.
