# Performa dan kapasitas RC12

G09 membandingkan RC12 dengan salinan autentik RC6. Dua cohort Node dan dua cohort Chromium masing-masing harus memiliki 40 pasangan terukur untuk setiap alur sesuai protokol. Ukuran yang diperiksa adalah rasio median kandidat/RC6 ≤ 1,05 dan rasio p95 ≤ 1,10 pada **setiap** metrik dan cohort. Warmup, error dan pasangan tidak lengkap dicatat bersama sampel mentah. Protokol, host serta kondisi pengukuran menentukan arti angka yang diperoleh.

G10 mengukur tiga ukuran dokumen dengan lima pengulangan masing-masing, event aktual, waktu edit dan pembatalan serta tren memori. Ukuran yang disebut adalah target fixture. Halaman fisik yang diukur dicatat per pengulangan. Lima pengulangan tidak mendukung klaim SLA persentil.

[Sampel performa dan kapasitas](../evidence/rc12/performance/) · [Hasil dan batas per kandidat](RELEASE_REPORT.md) · [Protokol pengujian](../tests/bench/performance-protocol.json).

## Hasil kandidat yang dibundel

Status G09, G10 dan U02 beserta batas pengujian tersedia dalam [laporan kandidat](RELEASE_REPORT.md).

## Mengulangi empat cohort pada mesin Linux

Ekstrak arsip RC6 autentik pada folder terpisah. Cocokkan SHA-256 arsip dengan `82e6d021c1b042a498440c0ce8957c035eb011f4c1b1fe8c16a450697a52be53`. Instal lockfile dan bangun ulang kedua versi sebelum memulai benchmark. Hash dist RC6 yang disyaratkan adalah `60be475033374b68db3cb1a39efab318ad303d642a652a231564ea302a7770d9`. Catat hash source, dist, browser, driver dan fixture sebagaimana direkam dalam [prasyarat pengukuran](../evidence/rc12/performance/preflight/). Pertahankan seluruh hasil putaran sebelumnya di luar direktori kerja baru.

Dari root kandidat untuk run baru, arahkan `PF_RC6_DIR` ke folder RC6 dan `PF_CHROME` ke Chromium yang sesuai protokol. Hentikan pekerjaan berat lain. Jalankan cohort secara berurutan, pertahankan setiap kode keluar, lalu hitung ulang statistik. Sesi yang diserahkan mencatat afinitas CPU setiap proses dalam `execution-windows.json`. Mesin lain harus mencatat alokasi CPU yang benar-benar tersedia.

```bash
node scripts/acceptance.mjs observe g09-node-1 --out evidence/rc12/performance/node-1.json -- node tests/bench/performance-node.mjs "$PF_RC6_DIR" 1
node scripts/acceptance.mjs observe g09-node-2 --out evidence/rc12/performance/node-2.json -- node tests/bench/performance-node.mjs "$PF_RC6_DIR" 2
node scripts/acceptance.mjs observe g09-browser-1 --out evidence/rc12/performance/recovery-cohort-1.json -- node tests/bench/performance-browser-official.mjs "$PF_RC6_DIR" 1
node scripts/acceptance.mjs observe g09-browser-2 --out evidence/rc12/performance/recovery-cohort-2.json -- node tests/bench/performance-browser-official.mjs "$PF_RC6_DIR" 2
node evidence/rc12/performance/recount.mjs
```

Periksa urutan A/B dan semua warmup, pasangan, kegagalan, batas median/p95 serta oracle keluaran. Catat putusan G09 untuk putaran tersebut dan jalankan `npm run verify:release`.
