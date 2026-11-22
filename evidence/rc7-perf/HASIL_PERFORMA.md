# Perbandingan performa PaperForma RC6 dan RC7

**Gate performa keseluruhan masih FAIL.** Pada putaran CPU lebih tenang, median ekspor HTML 231 rumus tercatat 146,0 ms pada RC7 dan 151,2 ms pada RC6. Kenaikan median dari dua putaran pertama tidak terulang. Pada putaran tenang ini p95 pratinjau dan paginasi melewati batas 10%. P95 persiapan cetak Node/jsdom juga melewati ambang pada dua putaran. Karena itu kesetaraan performa untuk seluruh alur belum terbukti.

Sumber pengukuran lengkap terdapat dalam JSON di folder ini. Waktu diukur dalam milidetik. Kolom p95 memakai peringkat terdekat. Dengan lima observasi, p95 merupakan nilai maksimum sampel. Gate ketat menyelidiki kenaikan median >5% atau p95 >10%. Dua putaran yang menembus ambang median yang sama atau ambang p95 yang sama dicatat FAIL. Perubahan arah antarputaran dicatat VARIABEL dan tidak cukup untuk menyatakan setara.

## Node.js dan jsdom

Seluruh pengukuran menggunakan CSS KaTeX dan font yang sama pada kedua versi. Dengan input 231 rumus, HTML BUS-01 berbobot 902295 byte pada RC6 dan 902295 byte pada RC7. Digest konten body untuk ekspor HTML dan payload cetak, digest CSS, beserta susunan digest font cocok di kedua versi untuk kasus uji ekspor. Sebelum membandingkan durasi, runner memeriksa 231 nilai TeX, mode, representasi sumber dan hasil ekspornya.

| Skenario | Metrik | n pasangan per putaran | Median RC6 → RC7, ulangan | Perubahan median, awal / ulang | Perubahan p95, awal / ulang | Hasil |
| --- | --- | --- | --- | --- | --- | --- |
| empty-core | refreshMs | 24 | 8.23 → 7.56 | +17.1% / -8.2% | +99.3% / -11.2% | VARIABEL |
| empty-core | parseAndRenderMs | 24 | 1.19 → 1.35 | -11.5% / +13.4% | -21.8% / -13.8% | VARIABEL |
| empty-core | integrityModelMs | 24 | 0.30 → 0.27 | -4.3% / -9.6% | -31.4% / -6.6% | PASS |
| empty-core | retainedHeapMiB | 24 | 45.1 → 45.2 | +0.0% / +0.1% | +0.1% / +0.1% | PASS |
| small-edit | refreshMs | 24 | 21.6 → 22.1 | +1.0% / +2.2% | -14.8% / -5.9% | PASS |
| small-edit | parseAndRenderMs | 24 | 3.64 → 3.62 | +0.2% / -0.6% | +3.6% / +43.8% | VARIABEL |
| small-edit | integrityModelMs | 24 | 0.85 → 0.82 | -1.9% / -3.9% | -1.3% / +77.1% | VARIABEL |
| small-edit | editedRefreshMs | 24 | 15.7 → 15.2 | +0.4% / -3.3% | -8.4% / +2.3% | PASS |
| small-edit | htmlExportMs | 24 | 36.4 → 35.5 | +1.9% / -2.4% | -2.6% / +312.4% | VARIABEL |
| small-edit | printPayloadMs | 24 | 7.31 → 7.04 | +1.3% / -3.8% | +31.1% / +139.1% | FAIL |
| small-edit | retainedHeapMiB | 24 | 48.9 → 48.9 | +0.2% / +0.2% | +0.2% / +0.1% | PASS |
| trigonometry | refreshMs | 5 | 948.9 → 963.9 | +26.5% / +1.6% | +5.6% / +11.4% | VARIABEL |
| trigonometry | parseAndRenderMs | 5 | 89.8 → 93.7 | -4.1% / +4.3% | -36.0% / +95.3% | VARIABEL |
| trigonometry | integrityModelMs | 5 | 26.4 → 29.9 | -2.5% / +13.5% | +0.8% / +220.2% | VARIABEL |
| trigonometry | htmlExportMs | 5 | 1,052.7 → 1,127.9 | +1.6% / +7.1% | +16.5% / +0.7% | VARIABEL |
| trigonometry | printPayloadMs | 5 | 523.6 → 559.4 | -8.3% / +6.8% | +14.9% / +36.4% | FAIL |
| trigonometry | retainedHeapMiB | 5 | 75.6 → 75.8 | -0.1% / +0.3% | -5.5% / +2.5% | PASS |
| long | refreshMs | 5 | 370.2 → 347.5 | -0.6% / -6.1% | +5.5% / -30.0% | PASS |
| long | parseAndRenderMs | 5 | 127.1 → 120.2 | +3.4% / -5.5% | -8.4% / -56.0% | PASS |
| long | integrityModelMs | 5 | 73.4 → 71.4 | +10.9% / -2.8% | +22.3% / +0.1% | VARIABEL |
| long | retainedHeapMiB | 5 | 54.9 → 54.8 | -0.2% / -0.2% | -0.2% / -0.1% | PASS |

Pengukuran heap di tabel memakai MiB sesudah GC. Pengukuran lain memakai milidetik. Permintaan GC, pemeriksaan keluaran, dan waktu IPC dikeluarkan dari durasi operasi. Heap proses Node terisolasi per versi. Pengukuran profil browser memiliki tabel tersendiri.

## Pemeriksaan penyebab pada 231 rumus

Pemeriksa tambahan mengisolasi tahap pada DOM yang sama, berisi 15.591 elemen dan 254 blok. Pada 20 pasangan, pengecekan sisa TeX turun dari 1,53 menjadi 0,82 ms, sedangkan pengambilan model blok berubah dari 13,39 menjadi 13,04 ms. Dokumen ini tidak memiliki blok raw HTML yang mengaktifkan pemeriksaan baru. Enam pasangan menempatkan pemrosesan DOM finishRender dan prepareBody pada kisaran ratusan ms pada kedua versi. Bukti rinci ada di `jsdom-phase-profile.json` dan `jsdom-phase-method.md`. Sampel fungsi ini tidak menghapus temuan lonjakan p95 end-to-end pada kedua putaran.

Pemeriksaan tambahan mengulang pembacaan header sepuluh font aktual dari ekspor BUS-01. Median waktu pemeriksaan lengkap per set font berubah dari 0,00018 ms menjadi 0,00078 ms di Node, dengan 32 pasangan batch. Biaya header terukur ini jauh di bawah selisih p95 persiapan cetak jsdom. Penyebab lonjakan yang tersisa belum terisolasi. Lihat `font-header-profile.json` untuk semua sampel.

## Pengikatan ke source final

Fingerprint source saat pengukuran Node cocok dengan salinan yang dipakai untuk pembandingan. Penelusuran esbuild dari entri benchmark menemukan 44 input, termasuk CSS mentah dan lockfile. Setiap input memiliki SHA-256 yang sama di source yang diukur dan source final. Perubahan berikutnya pada penamaan di UI dan verifikasi halaman cetak tidak mengubah kode yang dijalankan oleh benchmark Node. Lihat `node-source-equivalence.json`.

## Berkas data

- `calibrate.json`, `compare.json`, `repeat.json` memuat seluruh pemanasan, sampel runtime Node, statistik per putaran, identitas source, dan parameter. Properti compiledManifestAtRun mencatat build yang ada saat proses mulai. Identitas kode yang benar-benar diukur oleh benchmark Node adalah fingerprint source per revisi di properti fingerprint.
- `browser-calibrate.json` memuat kalibrasi mandiri di Chromium cloud 156. Pengukuran berpasangan final memakai HeadlessChrome 153 dengan dua origin lokal.
- `PERFORMANCE_BUDGET.md` menjelaskan perhitungan dan batas investigasi.



## Chromium produksi, perbandingan final

Hasil di bawah memakai source fed74962c5c0f7df7a478e91e30bf53111c7db458009b06ac955e03b5b6b5f5b dan pohon dist 9d2ce6c321ffd305614859932cb8b8fc8cdad73f4f6d5b53b46eec2ddc86d234. Pengukuran build sebelum perbaikan paginasi tersimpan dalam pre-pagination-fix dan dikeluarkan dari tabel penerimaan rilis.

Engine HeadlessChrome/153.0.8010.0, Node v24.22.3. Setiap versi berjalan pada origin HTTP lokalnya sendiri. Runner memverifikasi source revisi yang dirender, jumlah rumus dan kesiapan font, serta isi Blob untuk ekspor 231 rumus. Tab Halaman memanggil print.html dan aset yang sesuai dengan versi aplikasi. Pembukaan editor memakai cache HTTP hangat dan proses browser yang sudah aktif. Kedua origin memiliki konteks browser terpisah. Satu pemanasan per versi per kasus, dilanjutkan urutan AB/BA bergantian. Lihat identitas pohon build di berkas sampel.

| Pengukuran | Pasangan | Median RC6 → RC7 | p95 RC6 → RC7 | Perubahan median / p95 | Ulangan median / p95 | Status |
|---|---:|---:|---:|---|---|---|
| small.emptyReadyMs | 20 | 109.3 → 111.8 | 1052.3 → 913.9 | +2.3% / -13.2% | +1.0% / -5.9% | PASS |
| small.smallPreviewMs | 20 | 318.7 → 316.6 | 570.9 → 650.0 | -0.7% / +13.9% | +0.1% / -23.3% | VARIABEL |
| small.editPreviewMs | 20 | 283.8 → 281.4 | 473.6 → 428.8 | -0.8% / -9.5% | +0.0% / +26.9% | VARIABEL |
| trig.previewMs | 5 | 916.4 → 1130.2 | 1208.4 → 1484.3 | +23.3% / +22.8% | -5.0% / -12.9% | VARIABEL |
| trig.htmlExportMs | 5 | 178.0 → 194.1 | 219.7 → 269.0 | +9.0% / +22.4% | +8.4% / -39.8% | FAIL |
| trig.pageReadyMs | 5 | 3559.2 → 3734.9 | 4037.2 → 4158.8 | +4.9% / +3.0% | +1.8% / -2.8% | PASS |
| long.previewMs | 5 | 837.9 → 985.4 | 1066.0 → 1045.7 | +17.6% / -1.9% | +4.2% / +11.2% | VARIABEL |
| memory.edit1AfterGcMiB | 3 | 5.2 → 5.3 | 5.2 → 5.3 | +0.7% / +0.7% | — | PASS |
| memory.edit4AfterGcMiB | 3 | 5.3 → 5.3 | 5.3 → 5.3 | +0.7% / +0.7% | — | PASS |
| memory.edit8AfterGcMiB | 3 | 5.5 → 5.6 | 5.5 → 5.6 | +0.9% / +0.9% | — | PASS |

Durasi menggunakan ms. Heap menggunakan MiB dari Runtime.getHeapUsage setelah GC eksplisit. Tiga pasangan memantau revisi ke-1, ke-4 dan ke-8 pada instance editor yang sama. Runtime.getHeapUsage mencakup V8 halaman pengukuran dan frame aplikasi di target tersebut. Isi heap renderer tidak mewakili total RAM sistem atau heap worker lain.

Pengukuran durasi ekspor mencakup validasi aplikasi hingga tautan unduh tersedia. Harness menangkap Blob dari tautan unduh asli dan menunda verifikasi isi sampai setelah pewaktu berhenti. Paginasi mengukur waktu setelah memilih tab Halaman hingga aplikasi melaporkan jumlah halaman dan lintasan. Pengukuran itu terpisah dari penyimpanan PDF native.

Kalibrasi terpisah pada Chromium cloud 156 ada dalam browser-calibrate.json. Karena engine, host dan latensinya berbeda, angka ini tidak dimasukkan dalam statistik HeadlessChrome.

Berkas headless-calibrate.json, headless-compare.json dan headless-repeat.json memuat seluruh sampel termasuk pemanasan. headless-summary.json memuat median, p95, min–maks dan IQR per kelompok.

### Pengukuran setelah suite E2E selesai

Lima pasangan tambahan memakai dua build final yang sama, satu pemanasan per versi dan satu browser baru. Hanya naskah asli 231 rumus dijalankan. Kondisi ini mengurangi persaingan CPU dengan rangkaian E2E. Kolom p95 merupakan maksimum lima sampel.

| Metrik | Median RC6 → RC7 (ms) | Perubahan | p95 RC6 → RC7 (ms) | Perubahan |
|---|---:|---:|---:|---:|
| previewMs | 840.2 → 818.0 | -2.6% | 925.8 → 1079.4 | +16.6% |
| htmlExportMs | 151.2 → 146.0 | -3.4% | 170.9 → 177.9 | +4.1% |
| pageReadyMs | 2831.2 → 2892.5 | +2.2% | 2949.7 → 3329.3 | +12.9% |

Dua putaran pertama menunjukkan kenaikan median ekspor HTML 9,0% dan 8,4%. Pada putaran ketiga angkanya turun 3,4%. Hasil berkisar menurut putaran, sehingga penyebab regresi median yang konsisten pada aplikasi belum terbukti. P95 pratinjau dan paginasi tetap perlu ditinjau. Ketiga putaran menghasilkan 15 halaman dan dua lintasan di kedua versi, dengan BUS-01/A4 dan pengaturan yang sama. Semua sampel putaran ketiga ada di `quiet-trig/headless-repeat.json`.

Uji fungsi tambahan memakai 24 pasangan dengan file HTML BUS-01 yang persis sama untuk membandingkan fungsi staticChecks pada Chromium. Median berada di 55,3 ms (RC6) dan 57,3 ms (RC7), dengan variasi p95 67,1 ms dan 232,1 ms. Pengukuran ini mencakup pembuatan pohon dokumen inert, pemindaian seluruh elemen serta CSS yang wajib diperiksa. Pengukuran tersebut belum memisahkan biaya allocator/GC dari biaya pemindaian DOM. Data lengkap ada pada `export-check-profile.json`.

Rilis kemasan memperbaiki penyalinan direktori pengukuran saat `dist` berupa tautan simbolis. Sidik jari source kemasan berubah menjadi `99b799225ac28add26bdda08cb59724a431dedd4728b4e465d6a0646dbf75f73`. Seluruh 180 berkas `dist` hasil build identik dengan build yang diukur.
