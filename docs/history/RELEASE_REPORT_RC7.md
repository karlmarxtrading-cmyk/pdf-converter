# PaperForma 3.0.0-rc.7

**22 November 2026 · kandidat untuk staging.** RC7 mempertahankan seluruh isi naskah trigonometri yang berhasil diproses pengguna di RC6. Pemeriksaan sekarang menangkap stylesheet matematika kosong, perubahan isi HTML yang sebelumnya terlewat, dan judul dokumen yang memuat penanda Markdown. Hasil PDF dan batas performa berbeda menurut naskah serta browser.

## Perbandingan dengan HTML yang berhasil digunakan

| Pemeriksaan | RC6 BUS-01 milik pengguna | RC7 |
|---|---|---|
| Sumber, mode, TeX kanonik dan anotasi | 231 rumus, 103 inline dan 128 display | Keempat unduhan UI cocok dengan oracle untuk seluruh rumus |
| Isi artikel | 254 blok, 77 heading, 5 tabel, 33 baris dan 115 sel | Struktur dan teks isi cocok setelah navigasi template dipisahkan |
| Pemulihan salinan | 17 isi rumus berbeda dari sumber mentah | Setiap pasangan sebelum/sesudah tersedia di `evidence/rc7/17-pemulihan.json` |
| Judul | Kumpulan Rumus Trigonometri Lengkap | Sama, termasuk saat editor mengambil judul dari heading Markdown tebal |
| Navigasi | 22 tautan daftar isi BUS-01 | 22 tujuan BUS-01 tersedia. Pilihan tampilan templat lain memiliki daftar isi tersendiri. |
| Tipografi matematika | CSS 19.710 byte dan 10 font pada BUS-01. Contoh EDU-01 dari pengujian lama memiliki slot CSS kosong. | Aturan tata letak, isi font, dan representasi KaTeX/MathML diperiksa pada unduhan. BUS-01 memuat 10 font dan EDU-01 12 font. |

Oracle Python membaca byte HTML, mencocokkan teks dan struktur blok serta setiap rumus dengan fixture independen. Pemeriksaan browser membaca font aktif, geometri render, tautan dan status jaringan. Detail tersedia di `evidence/rc7/ui-oracle.json` dan `evidence/rc7-output/`. Salinan asli pengguna di `examples/reference-rc6/` identik dengan file masuk.

## Masalah yang direproduksi dan hasil perbaikan

| Masalah pada RC6 | Perubahan RC7 dan bukti |
|---|---|
| Pipeline Vitest/jsdom mengembalikan CSS KaTeX kosong meski jumlah formula dan font benar. Font dengan header WOFF2 terpotong dapat masuk cache. | Pengujian memuat stylesheet paket yang benar. Ekspor memeriksa aturan fraksi, display, MathML, jenis huruf dan versi. Respons font rusak ditolak dan dapat diambil ulang. Lihat `layout-and-woff2.json`. |
| Oracle menerima kehilangan paragraf, gambar, caption dan rumus atau tujuan tautan yang salah. | Pada 17 mutasi terkontrol, RC6 mendeteksi 0 dan RC7 mendeteksi 17. Keempat kontrol utuh diterima oleh kedua versi. Fragmen HTML yang tidak mandiri diberi peringatan. Lihat `RAW_HTML_INTEGRITY.md`. |
| Konversi clipboard dapat menggabungkan dua rumus MathJax berbeda, kehilangan isi pembungkus atau judul gambar, serta meratakan superskrip menjadi angka biasa. | Parser menjaga bagian independen, label dan struktur semantik. Rumus ambigu tetap dapat diperiksa. Dari 21 tes baru, 12 mereproduksi kegagalan RC6 dan 21 lulus di RC7. Lihat `math-clipboard-results.json`. |
| Pembatalan pemilihan dokumen ZIP tetap mengubah aset. Percobaan ulang cetak dapat berhenti. Pratinjau lama atau judul lama dapat menimpa keadaan editor. | Lima regresi UI dicakup oleh pengujian. Uji browser memeriksa dua tab yang mengedit proyek sama, penolakan simpan akibat kuota, unduh cadangan dan pemulihan sumber tepat di profil kosong. Lihat `evidence/rc7-ux/`. |
| Dokumen campuran EDT/A5 ditolak setelah mesin paginasi membuat pembungkus kode kosong pada batas halaman. | Pemeriksa mengenali pembungkus lanjutan yang kosong hanya jika identitas Paged.js dan blok kode cocok. Seluruh 112 baris kode dibandingkan terurut beserta spasinya. Delapan mutasi atau fragmen tidak sah tetap ditolak. Lihat `a5-code-inventory.json`. |

Proyek tetap menggunakan skema 2. Paket memakai lockfile dari garis rilis RC6 dan memperbarui versi aplikasi ke RC7. Seluruh 551 berkas ZIP awal diinventarisasi, 550 checksum cocok dan identitas build RC6 direproduksi. Pemeriksaan manual difokuskan pada jalur impor, editor, integritas, aset, ekspor, paginasi dan pengujian. Daftar berkas berubah serta inventaris tersedia di `evidence/rc7/`.

## Hasil unduhan dan PDF

| Template | Font pada HTML trigonometri | Kertas PDF | Halaman fisik | Hasil PDF trigonometri |
|---|---:|---|---:|---|
| BUS-01 | 10 | A4 potret | 16 | PASS |
| EDU-01 | 12 | A4 potret | 19 | PASS |
| EDT-01 | 14 | A5 potret | 20 | PASS |
| CON-01 | 9 | Letter lanskap | 19 | PASS |

Untuk HTML, editor membuka berkas asli, mengisi judul otomatis dan menghasilkan byte melalui kontrol unduh. Hasil di keempat template dibuka dalam konteks Chromium terpisah dengan jaringan dimatikan. Font, CSS matematika, urutan rumus, semua fragmen tautan dan nihil permintaan eksternal diperiksa. Proyek contoh dua gambar juga mempertahankan ukuran, teks alternatif, judul dan tujuan tautan. Contoh lepas dapat dibuka dari `examples/rc7/`.

Untuk PDF, tombol cetak aplikasi menghasilkan HTML terpaginasi yang lolos verifikasi aplikasi. Chromium mencetak HTML tersebut ke PDF. Pemeriksa menilai inventaris rumus pada dokumen cetak, jumlah halaman PDF, font tersemat, tautan, urutan teks/sel dan posisi nomor halaman. Salinan kepala tabel yang berulang ditandai dan dihitung tersendiri. Pemeriksaan visual meliputi halaman awal, tengah dan akhir di empat template. Lihat `evidence/rc7/PEMERIKSAAN_VISUAL_PDF.md`. Penekanan tombol cetak diamati di browser terkelola; penyimpanan berkas melalui dialog native belum dikonfirmasi.

**Batas PDF campuran.** Fixture asli sengaja memuat emoji dan karakter Unicode area privat. PDF EDU/A4 (11 halaman), BUS/Letter lanskap (14 halaman) dan EDT/A5 (19 halaman) berhasil dibuat. Pemeriksaan ketat atas teks yang dapat diekstrak dan jenis font tetap **FAIL**. U+E000 dapat terbaca sebagai NUL, dua karakter privat terlihat sebagai kotak, dan emoji dapat dicetak dengan font Type 3. Batas serupa direproduksi pada RC6. Panel aplikasi memberi peringatan cakupan font. Kasus kontrol mengganti hanya karakter uji tersebut dengan label Latin untuk mengisolasi penyebab. Hasil kontrol dan hasil fixture asli disimpan terpisah. Untuk naskah semacam ini, periksa glif langsung pada halaman PDF.

## Browser, clipboard, dan penyimpanan

- **Chromium.** Impor berkas, ekspor melalui kontrol UI, unduh HTML, pembukaan luring, paginasi dan PDF otomatis diuji. Pada 360 piksel panel tidak meluber. Pengujian juga mencakup navigasi keyboard, undo/redo, dua tab yang berkonflik, serta cadangan dan pemulihan setelah kuota ditolak.
- **Firefox 153 dan WebKit WPE 26.5 pada Linux.** Pada BUS-01, kedua mesin mengunduh berkas 902.499 byte yang identik. Seluruh 231 rumus, 10 font dan 5 tabel tersedia luring. Keduanya menghasilkan 16 halaman pada pratinjau cetak. Pengujian lintas mesin ini memeriksa versi, cakupan dan tahap yang tercatat di `evidence/rc7/playwright-*.json`.
- **Clipboard.** Konten sintetis teks biasa dan HTML ditempatkan pada clipboard sesi Chromium, ditempel dengan Ctrl+V dan diperiksa melalui alur konversi editor. Tautan internal, rumus, subskrip dan kode terpelihara. Sesi aplikasi AI pihak ketiga, clipboard fisik milik pengguna, pembaca layar fisik dan Safari di perangkat Apple belum diuji.
- **Penyimpanan.** Dua tab yang menyunting proyek sama menerima status konflik. Saat batas ruang uji menyebabkan penyimpanan gagal, cadangan yang benar-benar diunduh memulihkan sumber identik di profil kosong. Kuota tersebut disetel untuk menguji pemulihan.

Dokumen rilis memisahkan pengujian pada setiap pohon dist. Perubahan terakhir berada di halaman dan chunk cetak; 178 dari 180 berkas produksi sebelumnya identik. `evidence/rc7/final-dist-delta.json` mencantumkan selisihnya. Hasil terkini cetak, HTML, benchmark dan browser mengacu ke pohon tertera di manifest final.

## Pengujian rilis dan cara menggunakan paket

| Pemeriksaan final | Hasil |
|---|---|
| npm ci, typecheck, lint, build produksi dan build QA | PASS |
| Vitest | 496/496, pada 59 berkas |
| Node | 9/9 |
| Uji ujung ke ujung Chromium | 33/33 |
| Smoke build produksi | 12/12 |
| HTTP lokal | 184/184, termasuk pembandingan 179 berkas publik |
| Gate rilis statis | Satu kontrol bersih diterima dan 12 perubahan sengaja ditolak |
| Pemindaian rahasia proyek | Nol temuan pada build dan nol temuan lain di luar nilai uji yang diberi label |
| Runner lintas browser bawaan | Gate gabungan belum lulus. Chromium lulus. Adaptor Puppeteer/BiDi Firefox kehabisan waktu dan driver WebKitGTK tidak tersedia pada runner ini. |
| Pemeriksaan produksi lintas browser dengan Playwright | Firefox 153 dan WebKit WPE 26.5 masing-masing lulus impor, ekspor, pembukaan luring, pemeriksaan rumus/font dan paginasi BUS-01 pada build final. |
| Suite PDF bawaan | 3 dari 7 dokumen lulus, termasuk dokumen 195 halaman. Empat dokumen campuran memunculkan font Type 3. Pemeriksaan memori terpisah lulus. |
| Uji beban tambahan | Tiga dokumen menghasilkan 12, 52 dan 201 halaman. Ketiganya lulus pemeriksaan isi pada satu pengulangan per ukuran. |
| Hosting publik | NOT_RUN. Pekerjaan berakhir pada verifikasi paket lokal. |

Gunakan ZIP untuk branch preview repository yang sudah terhubung. Konfigurasi proyek ini memakai `npm run build`, direktori output `dist` dan Node 24.22.3. Source dan hasil build berada dalam arsip yang sama. [Panduan GitHub → Pages dan rollback](DEPLOY_CLOUDFLARE.md).

Keputusan penerimaan produksi tetap terbuka untuk PDF dengan aksara yang tidak tercakup, dialog simpan native pada perangkat sasaran, dan ambang performa yang dilaporkan per skenario. Bukti clean-room dan digest ZIP distribusi tersedia di berkas verifikasi pendamping.

## Performa pada naskah 231 rumus

Perbandingan dilakukan pada build produksi RC6 dan RC7 dengan BUS-01 dan pengaturan yang sama. Pada tiap putaran berat ada lima pasangan. Angka di bawah adalah median milidetik RC6 → RC7.

| Tindakan | Putaran pertama | Pengulangan | Pengulangan khusus setelah suite E2E |
|---|---:|---:|---:|
| Pratinjau | 916,4 → 1.130,2 | 881,2 → 837,4 | 840,2 → 818,0 |
| Ekspor HTML sampai byte siap diunduh | 178,0 → 194,1 | 159,7 → 173,1 | 151,2 → 146,0 |
| Paginasi | 3.559,2 → 3.734,9 | 2.869,3 → 2.920,1 | 2.831,2 → 2.892,5 |

**Gate performa keseluruhan FAIL.** Pada pengulangan khusus, p95 pratinjau bertambah 16,6% dan p95 paginasi bertambah 12,9%. Pada lima pasangan, p95 empiris adalah pengamatan terbesar. Pada dua putaran Node/jsdom, p95 persiapan cetak juga melampaui batas. Kenaikan median ekspor pada dua putaran awal tidak terulang pada pengukuran terakhir. Uji tambahan mencakup 20 pasangan skenario editor singkat, input panjang, dan heap setelah delapan penyuntingan. [Sampel dan hasil per skenario](../evidence/rc7-perf/HASIL_PERFORMA.md).

Kertas A4 pada benchmark memakai setelan standar BUS-01 dan menghasilkan 15 halaman. Contoh PDF distribusi mengikuti skenario impor dan pilihan publikasi contoh yang menghasilkan 16 halaman. Pembandingan kecepatan memakai pasangan dengan pengaturan yang sama.

Cakupan deteksi integritas dan kasus penambahan karakter privat di luar blok terdaftar dijelaskan di [batas dukungan](KNOWN_LIMITS.md).
