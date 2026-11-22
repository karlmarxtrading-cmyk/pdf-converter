# Pengujian PaperForma 3.0.0-rc.6

## Prinsip bukti

`candidateSha256` mengikat source, konfigurasi, lockfile, public, skrip, tes dan fixture. `docs/`, `examples/` dan `evidence/` tidak masuk hash kandidat, tetapi semua berkas paket masuk `SHA256SUMS`. Bukti baru disimpan di `evidence/rc6/`; bukti RC5 tetap historis. Hasil akhir dan jumlah tes tercatat di `evidence/rc6/final-validation.json`.

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run verify:static
npm run verify:http -- --local
npm run scan:secrets
```

`npm test` menjalankan Vitest serta 9 tes Node untuk result gate, server lokal dan oracle PDF. Tes oracle PDF menguji logika pembanding; itu bukan bukti PDF baru dibuat oleh aplikasi. Node/jsdom tidak mengukur CSS layout, clipping halaman, clipboard sistem atau dialog cetak.

## Input nyata dan oracle independen

`fixtures/rc6/user-trigonometry.md` identik byte dengan TXT unggahan: 15.280 byte, 540 baris, SHA-256 `1f4b9345ef5a092c40e66290821f110cee2656a093a889c0f51800bdd54bb16f`. Korpus memiliki 231 rumus: 103 inline, 128 display. Sebanyak 17 isi rumus memerlukan pemulihan karakter salinan.

`fixtures/rc6/user-trigonometry.expected.json` dibuat terpisah dari parser aplikasi. Semua hasil dibandingkan menurut urutan, sumber asli, sumber kanonik, anotasi KaTeX dan mode. Oracle sengaja memutasi satu rumus untuk memastikan kerusakan ditolak. Runner tambahan disertakan di `evidence/rc6/run-independent-oracle.mjs`:

```sh
node evidence/rc6/run-independent-oracle.mjs . fixtures/rc6/user-trigonometry.md fixtures/rc6/user-trigonometry.expected.json evidence/rc6/repeated-oracle.json
```

Untuk membuat ulang contoh melalui API ekspor aktual dan file font nyata:

```sh
PF_EXAMPLE_DIR=examples npx vitest run tests/unit/render/rc6-user-export.test.ts
```

PowerShell: set `$env:PF_EXAMPLE_DIR='examples'` sebelum perintah. Contoh HTML mencakup 231 rumus, 12 font WOFF2 tersemat, sumber asli dan catatan pemulihan. Manifest menyatakan browser visual, paginasi serta PDF native `NOT_RUN`. Korpus pendek 21 rumus dari RC5 tetap menjadi regresi tambahan, bukan pengganti input asli.

## Pemetaan regresi baru

| ID | Berkas tes | Yang dibuktikan |
|---|---|---|
| RC6-M01–M05 | `tests/unit/core/rc6-math-copy.test.ts` | Delimiter salinan, pemulihan terbatas, sumber/offset, tabel, code/currency, sintaks GitHub/math-fence, emphasis dekat rumus |
| RC6-CLIP01–09 | `tests/unit/core/rc6-clipboard.test.ts` | Metadata, anotasi, display, wrapper, kode, tabel merge, multi-rumus, formula bersebelahan |
| RC6-RENDER | `tests/unit/core/rc6-render-compat.test.ts` | HTML literal, temuan sisa TeX, unsupported command, sanitasi dan mutasi tabel |
| RC6-AUD | `tests/unit/core/rc6-independent.test.ts` | Kasus independen: duplikasi, kehilangan prosa, parsing ganda, prioritas metadata, keamanan dan operator berubah |
| RC6-TOC01 | `tests/unit/core/rc6-heading-math.test.ts` | Label rumus pada judul, heading hanya-rumus, anchor dan tautan daftar isi |
| RC6-EXPORT | `tests/unit/render/rc6-user-export.test.ts` | HTML mandiri aktual, font nyata, payload persiapan cetak, provenance dan sumber tetap sama |

## Pemeriksaan browser/PDF sebelum produksi

1. Buka fixture asli RC6 melalui **Buka berkas**, lalu uji tempelan plain/HTML yang benar-benar disalin dari aplikasi AI. Periksa rumus, daftar isi, tabel serta teks awal/akhir.
2. Bandingkan 231 rumus dan mode 103 inline/128 display. Tinjau 17 pemulihan isi pada panel temuan. Kode, URL dan mata uang harus tetap literal.
3. Ekspor HTML, putuskan jaringan, lalu buka hasil. Periksa pecahan, matriks, subskrip, font, tautan, tabel lebar dan daftar isi.
4. Siapkan halaman cetak. Uji A4 dan ukuran sasaran lainnya, tabel lintas halaman dan rumus panjang. Pastikan tidak ada clipping/isi hilang.
5. Simpan PDF lewat dialog native: ukuran kertas sesuai proyek, skala 100%, header/footer browser mati dan background aktif. Periksa pencarian teks, nomor/urutan halaman, font dan akhir dokumen.
6. Ulangi browser/perangkat sasaran, akses keyboard, pembaca layar, pembatalan, cadangan/impor proyek dan konflik dua tab. Catat hasil sebenarnya.

Skrip browser tersedia: `test:e2e`, `test:smoke`, `test:pdf`, `test:browsers`, `test:perf` dan `verify:deployment`. Jalankan `npm run build:qa` sebelum skrip yang membutuhkan kait QA. Browser yang gagal diluncurkan tidak dihitung PASS. Uji deployment Einstein yang tersedia merupakan smoke test tambahan; ia tidak menggantikan uji input RC6 asli.

## Verifikasi ZIP bersih

```sh
python scripts/verify-archive.py ../PAPERFORMA_STATIC_3.0.0-rc.6_AUDITED.zip --offline
```

Verifikator memeriksa path/checksum, mengekstrak ke folder sementara, memasang lockfile, menjalankan typecheck/lint/seluruh tes/build/HTTP, lalu membandingkan seluruh byte dist dan manifest. Untuk instalasi daring hapus `--offline`. Log akhir dan identitas ZIP dilaporkan bersama penyerahan; digest ZIP tidak dapat dimasukkan ke dalam dirinya sendiri.
