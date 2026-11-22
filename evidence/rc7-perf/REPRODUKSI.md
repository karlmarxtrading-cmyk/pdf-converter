# Menjalankan kembali pengukuran

Siapkan dua direktori terpisah berisi ekstraksi RC6 dan kandidat, kemudian jalankan `npm ci` di masing-masing direktori. Gunakan Node dan npm yang diizinkan oleh package.json. Build produksi kedua versi perlu tersedia bersama dist.build-manifest.json di root masing-masing.

Dari root kandidat, jalankan perintah berikut. Ganti ../rc6 dengan lokasi ekstraksi baseline. CHROME_PATH dapat diarahkan ke browser Chromium yang tersedia jika tidak ada dalam PATH.

```bash
node tests/bench/rc7-paired.mjs ../rc6 calibrate
node tests/bench/rc7-paired.mjs ../rc6 compare
node tests/bench/rc7-paired.mjs ../rc6 repeat
node tests/bench/rc7-browser-paired.mjs ../rc6 calibrate
node tests/bench/rc7-browser-paired.mjs ../rc6 compare
node tests/bench/rc7-browser-paired.mjs ../rc6 repeat small,trig,long
```

Nama keluaran pengukuran tetap. Salin bukti rilis terdahulu sebelum mengulang di folder yang sama. Runner peramban menyimpan hasil di evidence/rc7-perf/headless-*.json. Status COMPLETE menyatakan pengambilan sampel selesai. Verdict mengenai ambang performa dihitung per metrik dari data itu. Jika lingkungan membatasi peluncuran peramban, file hasil mencatat status dan error aktual.
