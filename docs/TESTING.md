# Menguji RC12

Gunakan terminal pada root paket dan runtime yang tercatat dalam .node-version. Pemeriksaan berikut berjalan lokal. Untuk tes Chromium, arahkan PF_CHROME ke executable yang tersedia. Pemeriksaan fisik memerlukan Python, PyMuPDF, lxml dan Pandoc untuk oracle sumber GFM.

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build:pages
npm run verify:static
npm run verify:http -- --local
npm run test:gate
npm run scan:secrets
npm run build:qa
npm run test:e2e
npm run test:smoke
npm run verify:release
```

Untuk menjalankan satu berkas Vitest, gunakan contoh berikut.

```bash
npx vitest run tests/unit/render/rc8-final-bytes.test.ts
```

Dari direktori induk, `python scripts/verify-archive.py` dipanggil dengan path skrip dalam ekstraksi dan path ZIP, misalnya `python paperforma/scripts/verify-archive.py PAPERFORMA_STATIC_3.0.0-rc.12_SOURCE_DIST_EVIDENCE.zip`. Skrip memeriksa checksum, memasang dependensi dalam folder baru, menjalankan pemeriksaan kode serta tes, lalu membangun ulang dan membandingkan semua byte dist. Opsi --offline menggunakan cache npm yang sudah terisi.

Simpan hasil ulangan pada ekstraksi terpisah agar receipt yang diserahkan tetap dapat diperiksa. Perintah lengkap yang menghasilkan setiap observasi dicatat dalam evidence/rc12/acceptance/observations/. Perbandingan PDF dan HTML memakai acuan isi dari sumber, unduhan serta PDF fisik. Pengujian performa memerlukan ZIP RC6 autentik. [Kontrak performa](PERFORMANCE_REPORT.md) · [Gerbang penerimaan](RELEASE_ACCEPTANCE.md).

## Koleksi bukti untuk putaran baru

Bangun distribusi produksi dan distribusi QA dari source yang sama sebelum mulai. Pakai salinan kerja baru yang mempertahankan lampiran harness di evidence/rc12/browser. Simpan receipt lama di luar pohon evidence/rc12/acceptance sebelum mengulang. Perintah start menolak penimpaan. Direktori evidence/rc11/ berisi riwayat RC11.

```bash
npm run build:pages
npm run build:qa
node scripts/acceptance.mjs start
```

Tetapkan PF_CHROME ke executable Chromium yang akan diukur dan PF_PYTHON ke Python yang telah diprovisikan. Untuk pengukuran dasar, buat satu arsip terpisah berisi source dan dist kandidat ini dengan scripts/package-release.py. Siapkan PF_BASELINE_ZIP, PF_AUDIT_ZIP dan PF_CANDIDATE_ZIP sebagai path absolut ke arsip sumber RC11, audit RC11 dan kandidat. Untuk buku asli, tetapkan PF_PRIVATE_SOURCE dan PF_PRIVATE_OUT di luar repository. Nomor putaran dan SHA source dapat disalin dari evidence/rc12/acceptance/start.json ke PF_RUN_ID dan PF_SOURCE_SHA.

```bash
"$PF_PYTHON" docs/verification-tools/measure-local-gates.py base --source "$PF_BASELINE_ZIP" --audit "$PF_AUDIT_ZIP" --candidate "$PF_CANDIDATE_ZIP"
"$PF_PYTHON" docs/verification-tools/run-candidate-measurements.py . --run-id "$PF_RUN_ID" --source "$PF_SOURCE_SHA" --chrome "$PF_CHROME"
"$PF_PYTHON" docs/verification-tools/measure-local-gates.py books
"$PF_PYTHON" docs/verification-tools/measure-local-gates.py controls
"$PF_PYTHON" docs/verification-tools/measure-local-gates.py capacity
"$PF_PYTHON" docs/verification-tools/measure-local-gates.py record-books
```

Gunakan --attempt dengan nama baru untuk percobaan ulang pada kolektor measure-local-gates.py. Simpan observasi pertama serta penyebab pengulangan. Jalankan empat cohort G09 sesuai protokol pada mesin tenang, sesudah seluruh kolektor lain selesai. Tambahkan bukti asli dari lingkungan yang dipersyaratkan untuk G12–G16 dan jalankan npm run verify:release agar agregator membuka kembali hasil yang terikat kandidat.
