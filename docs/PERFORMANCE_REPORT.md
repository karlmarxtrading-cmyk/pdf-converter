# Laporan performa — 3.0.0-rc.2

Kandidat `5e649307531114cb…`, Kontainer Linux, CPU bersama; bukan perangkat referensi. Angka untuk perbandingan relatif antar-kandidat. Browser: Chrome headless (lihat `evidence/toolchain.txt`).

Angka median; dalam kurung p95 (n ≥ 5) atau rentang min–maks (n < 5). Waktu dalam ms; memori dalam MiB. Dokumen sintetis `scripts/generate-stress.mjs` (paragraf + tabel 8 baris per bagian), templat BUS-01 (sampul + daftar isi + header + nomor halaman).

| Bagian | Halaman | n | Pratinjau siap | Worker: parse+render | Utama: sanitasi | Utama: keutuhan | Paginasi (wall) | Pemeriksaan isi | Siap cetak | PDF (Chrome) | Edit ulang → siap | Heap puncak | Jeda event loop maks (pratinjau / paginasi) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 3 | 8 | 5 | 380 (p95 396) | 42 (p95 43) | 4 (p95 5) | 3 (p95 8) | 546 (p95 607) | 45 (p95 51) | 932 (p95 995) | 175 (p95 180) | 342 (p95 368) | 38 | 55 / 53 |
| 28 | 49 | 5 | 1086 (p95 1202) | 177 (p95 194) | 10 (p95 12) | 14 (p95 21) | 2219 (p95 2605) | 144 (p95 211) | 3300 (p95 3773) | 736 (p95 756) | 979 (p95 1344) | 41 | 59 / 116 |
| 57 | 99 | 5 | 1878 (p95 1955) | 266 (p95 330) | 21 (p95 26) | 31 (p95 33) | 4289 (p95 4305) | 286 (p95 317) | 6127 (p95 6241) | 1568 (p95 1591) | 1716 (p95 2282) | 46 | 102 / 189 |
| 116 | 198 | 5 | 2610 (p95 2878) | 447 (p95 493) | 38 (p95 45) | 50 (p95 53) | 8415 (p95 8487) | 511 (p95 696) | 10986 (p95 11365) | 3107 (p95 3405) | 2326 (p95 3440) | 73 | 188 / 446 |
| 292 | 496 | 3 | 4183 (4013–4279) | 999 (910–1043) | 99 (95–118) | 224 (218–293) | 24236 (23082–24314) | 1592 (1550–1809) | 28249 (27361–28497) | 8660 (8288–8771) | 4192 (4094–4195) | 102 | 503 / 929 |
| 585 | 992 | 2 | 7081 (6865–7296) | 1930 (1895–1964) | 170 (165–174) | 653 (649–657) | 80075 (77165–82985) | 3173 (3045–3300) | 87156 (84030–90281) | 22508 (21914–23101) | 7463 (7458–7467) | 154 | 1097 / 2072 |

Verifikasi isi: 8 hlm lulus semua ulangan, 49 hlm lulus semua ulangan, 99 hlm lulus semua ulangan, 198 hlm lulus semua ulangan, 496 hlm lulus semua ulangan, 992 hlm lulus semua ulangan.

## Pembatalan

| Halaman | Escape → status diam | Hasil | Sesi cetak tersisa |
|---|---|---|---|
| 8 | 14 ms | Proses dibatalkan. Sumber dan pengaturan tetap utuh.Coba lagi | None |
| 49 | 74 ms | Proses dibatalkan. Sumber dan pengaturan tetap utuh.Coba lagi | None |
| 99 | 35 ms | Proses dibatalkan. Sumber dan pengaturan tetap utuh.Coba lagi | None |
| 198 | 69 ms | Proses dibatalkan. Sumber dan pengaturan tetap utuh.Coba lagi | None |
| 496 | 61 ms | Proses dibatalkan. Sumber dan pengaturan tetap utuh.Coba lagi | None |
| 992 | 100 ms | Proses dibatalkan. Sumber dan pengaturan tetap utuh.Coba lagi | None |

## Dibandingkan RC1 (dokumen pembanding sama: 115 bagian = 196 halaman)

| Ukuran | RC1 | rc.2 |
|---|---|---|
| Pratinjau siap | 2942 ms | 2722 ms |
| Paginasi (wall) | 9256 ms | 8276 ms |
| Tugas panjang terlama di thread utama saat analisis | 888 ms | lihat E26 Worker: 159 ms jeda maks (fallback tanpa Worker: 926 ms) |
| Verifikasi isi | lulus | pass |

Catatan: paginasi Paged.js memerlukan DOM dan tetap di thread utama; perbaikan rc.2 untuk paginasi bersifat keutuhan (pemeriksaan per blok, struktur halaman, kode per baris), bukan kecepatan. Kontainer CPU bersama → variasi antar-run ±20 %; bandingkan median, bukan satu angka.

## Dokumen 1.000 halaman

Berhasil dan terverifikasi di lingkungan ini (lihat baris terakhir tabel). Ini bukan jaminan untuk perangkat dengan memori terbatas; kegagalan karena memori/timeout menghasilkan status gagal yang dijelaskan, bukan PDF terpotong.
