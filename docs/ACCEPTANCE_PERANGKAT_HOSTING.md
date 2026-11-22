# Bukti Windows dan Cloudflare Pages

Gunakan ekstraksi atau checkout baru dari kandidat final. Bangun `dist` menggunakan Node/npm yang ditetapkan. Periksa `node scripts/fingerprint.mjs` dan cocokkan dengan `evidence/rc12/acceptance/start.json`. Semua bukti harus berasal dari putaran dan kandidat tersebut. Catat juga tindakan gagal, versi alat, cakupan aktual dan waktu. Gunakan peramban dengan profil uji terpisah.

## Urutan untuk pemilik proyek

1. Ekstrak ZIP ke folder baru dan cocokkan checksum. Siapkan Windows target beserta penyedia AI, browser dan pembaca layar yang akan dicantumkan sebagai dukungan.
2. Ikuti G12, G13 dan G14 di bawah, termasuk membuka kembali dua PDF yang tersimpan di disk. Simpan hasil publik dari setiap gerbang dalam foldernya sendiri.
3. Untuk G15, gunakan hak tulis ke `karlmarxtrading-cmyk/performa` dan sesi akun Cloudflare yang dapat membuka proyek Pages terkait. Push ke branch preview pada [panduan deployment](DEPLOY_CLOUDFLARE.md). Catat URL permanen, deployment ID, commit dan log build.
4. Di dashboard, identifikasi deployment produksi aktif, deployment sukses yang akan dipulihkan, dampak dan jendela kerja. Kirim identitas tersebut untuk keputusan pemilik sebelum melakukan rollback. G16 memerlukan hasil tindakan yang kemudian diotorisasi.
5. Kembalikan lima folder bukti dengan isi pada tabel, atau hasil `collect` bila sudah menjalankannya. Gunakan login di perangkat sendiri dan kirim hanya materi uji publik. Setelah pengukuran lengkap, jalankan verifier pada identitas yang sama, lalu lakukan rehearsal penuh pada runner Pages untuk A08. Keputusan produksi mengikuti hasil akhir keduanya.

## Satu alur pengumpulan

Di Git Bash, dari root aplikasi, perintah berikut membuat formulir sesuai gerbang. Gunakan folder baru di luar checkout untuk berkas publik yang sudah diperiksa. Pertahankan hasil terdahulu ketika mengulang.

```bash
node scripts/external-acceptance.mjs init G12 ../PF-RC12-G12
node scripts/external-acceptance.mjs init G13 ../PF-RC12-G13
node scripts/external-acceptance.mjs init G14 ../PF-RC12-G14
node scripts/external-acceptance.mjs init G15 ../PF-RC12-G15
node scripts/external-acceptance.mjs init G16 ../PF-RC12-G16
```

Isi `operator.json` dengan build OS, browser/versi, penanda operator, waktu UTC ISO 8601 setelah pengukuran, dan hasil yang dilihat atau didengar untuk setiap butir dalam `notes`. Lampirkan file dengan nama persis pada tabel. Tinjau terlebih dahulu setiap file yang akan masuk repository. Simpan mentahan clipboard, URL percakapan dan data akun di lokasi privat. Paket publik hanya berisi materi uji yang layak dibagikan, perbandingan dan log yang telah diperiksa. Pertahankan catatan redaksi untuk auditor.

| Gerbang | Pengukuran pada target | File publik di sebelah operator.json |
| --- | --- | --- |
| G12 | Clipboard asli dari UI penyedia di Windows, kedua MIME, keutuhan struktur/rumus beserta prosa | capture.json, clipboard.html, clipboard.txt, download.html, oracle.json |
| G13 | A benar-benar tersimpan, Cancel, revisi dan Retry ke B, pembacaan ulang dua PDF | saved-A.pdf, saved-B.pdf, dialog-actions.txt |
| G14 | Pembaca layar dan keyboard, pemulihan data di profil uji | screen-reader.txt, device-actions.txt, roundtrip.pfproj |
| G15 | Preview Pages yang tepat, HTTP, worker, unduhan, luring dan cetak dari studio yang dihosting | pages-build.log, pages-deployment.json |
| G16 | Pemulihan deployment produksi terotorisasi, inspeksi hasil sesudahnya, otorisasi promosi terpisah | rollback-events.txt, restored-inspection.txt, promotion-authorization.txt, restored-index.html, restored-export.html |

Sesudah suatu gerbang memiliki seluruh pengukuran, jalankan `collect` dari root. Contoh berikut memproses G12. Ulangi untuk setiap nomor dan folder yang sesuai.

```bash
node scripts/external-acceptance.mjs collect G12 ../PF-RC12-G12
npm run verify:release
```

Pengumpul memeriksa identitas dan waktu, mencatat perintah serta exit code, menyimpan salinan publik dengan SHA-256, dan menulis receipt setelah pengukuran diterima. G15 juga menjalankan ketiga program pengukur terhadap URL tersebut. Verifier akhir membuka kembali berkas asli dari observasi dan memeriksa checksum serta asal program. Folder percobaan memiliki ID unik. Kirim kembali `evidence/rc12/external/` yang baru, `evidence/rc12/acceptance/observations/` dari percobaan itu dan receipt-nya di `evidence/rc12/acceptance/receipts/`. Untuk perangkat tanpa lingkungan Node/PDF, kembalikan folder publik siap proses; pengukuran perangkat tetap dilakukan di Windows. Pengolah kemudian memakai ekstraksi yang sesuai dan menjalankan `collect`. Catatan manusia menjelaskan apa yang benar-benar didengar/diklik. Hash dan pemeriksaan otomatis menguji berkas yang menyertainya.

## G12 · Clipboard penyedia AI pada Windows

1. Pakai percakapan uji publik, nama provider, metode salin dan versi browser yang akan dinyatakan didukung. Minta jawaban dengan ALFA, OMEGA, teks di sekitar rumus, paling sedikit satu rumus inline dan satu display, serta tabel dua kolom. Periksa juga pindah baris dan marker yang ditampilkan. Bila beberapa provider/metode hendak didukung, kumpulkan hasil per kombinasi, simpan tiap percobaan dan cantumkan cakupan lengkap dalam catatan. Serahkan seluruh folder G12 dalam satu perintah collect dengan menambahkan path setiap kombinasi setelah folder pertama.
2. Gunakan Copy pada provider atau salin seleksi secara nyata. Sebelum clipboard berubah, ambil dua format asli di PowerShell. Lokasi keluaran mentah harus baru dan privat.

```powershell
powershell.exe -NoProfile -STA -File .\docs\verification-tools\capture-windows-clipboard.ps1 -PrivateDirectory "$env:USERPROFILE\Documents\PF-RC12-raw-01"
```

3. Pastikan browser benar-benar menawarkan text/html dan text/plain saat ditempelkan di dialog PaperForma. Catat daftar pada `browserMimeTypes`; parameternya dibaca dari sesi aktual. Lengkapi `provider` dan `copyMethod`. Bandingkan HTML/plain asli, struktur visual provider, posisi/nilai tiap sel, hubungan header, BR dan marker dengan editor, pratinjau serta HTML yang diunduh.
4. Simpan `capture.json` hasil PowerShell, `clipboard.html` dan `clipboard.txt` yang telah diperiksa, serta `download.html` dari UI. Isi `oracle.json` lebih dulu dari sumber provider. Isikan `formulas` berurutan sebagai objek dengan `tex` dan boolean `display`, `tables` sebagai daftar objek tabel berisi caption (null bila absen) dan rows (daftar baris/sel). Pada setiap sel isi tag (huruf besar), scope (null bila absen), text (TeX asli mewakili rumus dan LF mewakili BR), bilangan rowSpan/colSpan, serta headers sebagai daftar koordinat [baris, kolom] berbasis nol yang ditunjuk atribut headers, `breaks` sebagai jumlah BR eksplisit, `listItems` sebagai jumlah LI, dan `orderedProse` sebagai urutan petikan prosa asli yang terdapat pada ketiga representasi. Perbedaan hasil harus dicatat dan ditelusuri sebelum penerimaan.

## G13 · Dialog simpan sistem operasi

Impor `fixtures/device/native-print.md`. Pada dialog browser/OS pilih Save as PDF, simpan A dan buka di pembaca PDF. Segera catat SHA-256 A pada `originalPdfASha256`. Cetak lagi lalu tekan Cancel, periksa folder keluaran dan sumber editor. Tambahkan REVISION-B di akhir dokumen dan simpan hasil Retry ke B. Periksa kembali A serta B, operator/angka pada sel ALFA/BETA, marker 1 dan 2, indentasi kode, baris kosong serta halaman terakhir. Tuliskan urutan tindakan yang benar-benar terjadi pada `nativeActions`, masing-masing dengan `action` (“Save A”, “Cancel”, “Retry and save B”), waktu UTC `at` dan hasil `observed`. Cantumkan pembacaan PDF dan bukti Cancel dalam `dialog-actions.txt`. Pengumpul menjalankan pdfinfo/pdftotext pada dua file dan memeriksa revisi B, penanda sumber serta keutuhan A.

## G14 · Pembaca layar, fokus dan pemulihan

Jalankan seluruh langkah dengan keyboard. Tulis nama dan versi pembaca layar pada `screenReader`. Catat ucapan nyata serta urutan fokus saat membuka dialog, menjelajahi label, mendapatkan progres/error, membatalkan, menekan Escape dan kembali ke editor. Periksa juga sel row/column header, caption, arah navigasi dan tabel tanpa header menggunakan `fixtures/device/clipboard-table-headers.html`. Jalankan undo/redo, ekspor/impor .pfproj, dua tab, reload, kuota penuh, penghapusan data pada profil uji, serta viewport 360 px/zoom. Simpan proyek uji publik dan transkrip bertanggal. Catatan harus menyebut hasil setiap langkah dan bagian yang gagal.

## G15 · Deployment preview sesungguhnya

Gunakan proyek yang terhubung ke karlmarxtrading-cmyk/performa. Buka deployment yang didapat dari push branch preview terotorisasi. Simpan URL permanen deployment, branch, ID deployment, SHA commit source, commit aktual yang dibangun serta SHA commit bukti jika berbeda. Tulis masing-masing di kolom yang sesuai pada formulir. `pages-build.log` harus memuat baris PAPERFORMA_PAGES_BUILD dari build tersebut. Simpan metadata deployment dari dashboard/API pada `pages-deployment.json` dengan bidang `id`, `project_name`, `environment`, `url`, serta `deployment_trigger.metadata.branch` dan `deployment_trigger.metadata.commit_hash`. Salin hanya metadata publik yang dibutuhkan. Jika commit bukti berbeda dari commit source, jalankan collect dari checkout yang memuat kedua commit. Pengumpul memeriksa hubungan induk Git dan kesetaraan input build/tes.

Jalankan pengumpulan di mesin dengan koneksi HTTPS ke deployment, instalasi Node/npm dari lockfile, Chrome/Chromium (PF_CHROME jika perlu) dan Poppler. Pengumpul melakukan verifikasi byte/MIME/CSP/cache, pengecekan matematika via browser, lalu mengimpor fixture publik pada studio hosted. HTML yang benar-benar diunduh dibuka ulang luring dengan pemeriksaan font, rumus dan sel. Kontrol cetak hosted menghasilkan layout yang diidentifikasi oleh receipt UI; Chromium membuat PDF dari byte layout itu dan Poppler membaca hasil fisiknya. Pengukuran ini melengkapi pengujian dialog OS pada G13.

## G16 · Rollback dan otorisasi

Identifikasi deployment produksi yang sedang aktif serta ID deployment produksi sukses yang masih tersedia dan diketahui baik. Catat URL, hash indeks dari target yang dikenal, dampak dan jendela tindakan. Dapatkan persetujuan khusus atas ID asal dan ID tujuan beserta rencana pemulihan. Setelah itu operator dapat menjalankan rollback di dashboard. Catat log/peristiwa yang menunjukkan ID sebelum dan sesudah. Buka URL produksi, simpan byte indeks hasil pemulihan, lalu ekspor ulang fixture publik `native-print.md` di UI produksi. Buka unduhannya luring dan catat hasil pada `restored-inspection.txt`. Catat otorisasi promosi yang terpisah beserta identitas kandidat, lingkungan dan ruang lingkupnya. Lengkapi nama referensi kedua otorisasi. Pengumpul hanya memeriksa hasil operasi, sehingga waktu dan pelaksanaan tetap di tangan operator hosting.

Setelah semua 24 gate PASS pada satu identitas, lakukan rehearsal di Pages sebagaimana tercantum dalam [panduan toolchain](TOOLCHAIN.md). [Repo dan pengaturan build](DEPLOY_CLOUDFLARE.md) · [Cloudflare preview](https://developers.cloudflare.com/pages/configuration/preview-deployments/) · [Cloudflare rollback](https://developers.cloudflare.com/pages/configuration/rollbacks/).
