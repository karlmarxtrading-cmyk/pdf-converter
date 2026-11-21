# Performa — PaperForma 3.0.0-rc.4

## Cakupan pengukuran baru

Node v24.22.3, Linux pada lingkungan bersama; tidak ada SLA perangkat dan tidak ada skor Core Web Vitals yang dikarang. Seluruh sampel disimpan, bukan hanya ulangan terbaik. Kandidat sumber akhir `680c8b5c6cb1ca3948e19c17857682ab6711d3a2fb70430565692f8a0feadd79`.

### Tiga hotspot core

| Operasi Node | Median RC3 → RC4 (ms) | p95 sampel RC3 → RC4 (ms) | Hasil |
|---|---:|---:|---|
| 400 rumus identik berulang | 123,89 → 70,65 | 244,63 → 86,91 | Hash hasil identik |
| Keanggotaan 8.000 blok | 574,06 → 7,71 | 840,11 → 9,97 | Hash hasil identik |
| 10.000 baris mata uang | 683,99 → 16,39 | 715,67 → 46,54 | Hash hasil identik |

Runner `tests/bench/core-reading.mjs`: satu warm-up per versi, sembilan pasangan berurutan AB/BA bergantian, input identik dan hash hasil yang relevan dibandingkan. Pada n=9, p95 empiris merupakan maksimum sampel, bukan estimasi tail latency populasi yang kuat. Kasus rumus membandingkan TeX, mode/slot dan markup KaTeX; bukan seluruh halaman HTML dengan nonce dinamis. Kasus lainnya membandingkan hasil model/scan.

Cache KaTeX dibatasi per pekerjaan; lookup blok memakai Set; batas paragraf diprakomputasi. Tidak ada pemangkasan isi atau pengurangan jumlah rumus untuk mempercepat hasil. Data lengkap: `evidence/audit-rc4/performance-core-final.json`.

### Snapshot

| Snapshot Node | Median RC3 → RC4 (ms) | p95 RC3 → RC4 (ms) |
|---|---:|---:|
| 20.000 karakter | 0,75 → 0,85 | 5,35 → 3,15 |
| 1,08 juta karakter + riwayat | 18,34 → 14,21 | 27,26 → 20,12 |
| Skenario riwayat + 10 MiB buffer aset | 44,75 → 31,72 | 70,03 → 99,41 |

Runner `evidence/audit-rc4/ui_storage/snapshot-benchmark.mjs`: tiga warm-up, 30 pasangan AB/BA, versi renderer/template yang sama secara eksplisit agar hash dapat dibandingkan. Ini mengukur pembuatan snapshot, bukan dekode gambar; buffer aset sintetis 10 MiB bukan corpus raster. Hasil merupakan pengukuran pendukung atas implementasi snapshot yang sama, dilakukan sebelum pembekuan keseluruhan kandidat. Tidak ada sidik jari seluruh kandidat yang direkam pada saat pengukuran snapshot, sehingga jangan menyebutnya bukti seluruh versi akhir. Semua hash identitas yang dibandingkan sama.

Median snapshot riwayat dan gambar membaik, tetapi **p95 skenario gambar meningkat dari 70,03 menjadi 99,41 ms**. Penyebab variasi tidak dibuktikan. Median kecil juga meningkat sekitar 0,09 ms. Angka tidak dibuang atau diganti ulangan yang lebih bagus. Karena itu tidak ada klaim semua dimensi performa membaik.

### Ukuran build

Berkas entry JS utama: gzip level 9 400,04 KiB → 402,15 KiB. Total dist: 9,644,515 → 9,648,088 byte; masing-masing 281 file. Ini ukuran artefak, bukan total request startup aktual. Tambahan validasi dan penjaga integritas memiliki biaya kode yang kecil tetapi tidak nol.

### Yang tidak diukur ulang

Paginasi browser, pembuatan PDF, heap browser, respons keyboard, perangkat fisik dan 1.000 halaman RC4 belum diuji. Tabel RC3 lama di `docs/history/rc3/PERFORMANCE_REPORT.md` adalah histori. Paged.js tetap membutuhkan main thread. Sasaran terbaik berikutnya adalah mengukur p95 dan long task pada browser/perangkat sasaran, kemudian memperbaiki bottleneck yang benar-benar terukur.
