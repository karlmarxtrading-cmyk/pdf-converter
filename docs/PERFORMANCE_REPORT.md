# Laporan performa — 3.0.0-rc.3

Kandidat `82397ea41b8253c9…`, Kontainer Linux, CPU bersama; bukan perangkat referensi. Angka untuk perbandingan relatif antar-kandidat. Browser: Chrome headless (lihat `evidence/toolchain.txt`).

Angka median; dalam kurung p95 (n ≥ 5) atau rentang min–maks (n < 5). Waktu dalam ms; memori dalam MiB. Dokumen sintetis `scripts/generate-stress.mjs` (paragraf + tabel 8 baris per bagian), templat BUS-01 (sampul + daftar isi + header + nomor halaman).

| Bagian | Halaman | n | Pratinjau siap | Worker: parse+render | Utama: sanitasi | Utama: keutuhan | Paginasi (wall) | Pemeriksaan isi | Siap cetak | PDF (Chrome) | Edit ulang → siap | Heap puncak | Jeda event loop maks (pratinjau / paginasi) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 3 | 8 | 5 | 426 (p95 471) | 42 (p95 57) | 3 (p95 4) | 3 (p95 4) | 549 (p95 564) | 42 (p95 51) | 974 (p95 1035) | 165 (p95 189) | 338 (p95 355) | 34 | 55 / 43 |
| 28 | 49 | 5 | 1180 (p95 1400) | 189 (p95 248) | 13 (p95 17) | 14 (p95 19) | 2601 (p95 2656) | 180 (p95 227) | 3752 (p95 4001) | 795 (p95 1029) | 1204 (p95 1446) | 42 | 89 / 114 |
| 57 | 99 | 5 | 2111 (p95 2245) | 315 (p95 359) | 29 (p95 33) | 37 (p95 43) | 4613 (p95 4729) | 329 (p95 424) | 6644 (p95 6855) | 1766 (p95 2032) | 1828 (p95 2348) | 49 | 125 / 225 |
| 116 | 198 | 5 | 2696 (p95 2917) | 471 (p95 546) | 45 (p95 60) | 52 (p95 65) | 8904 (p95 9597) | 665 (p95 748) | 11659 (p95 12514) | 3460 (p95 3734) | 2467 (p95 3788) | 79 | 195 / 533 |
| 292 | 496 | 3 | 4507 (4353–4687) | 1239 (1060–1292) | 101 (95–159) | 191 (191–215) | 27718 (26403–32330) | 1766 (1741–2032) | 32225 (30756–37017) | 8668 (8606–9366) | 4557 (4211–4682) | 102 | 475 / 1083 |
| 585 | 992 | 2 | 7330 (7248–7412) | 1974 (1859–2089) | 188 (156–219) | 697 (585–809) | 98459 (95097–101820) | 2866 (2736–2996) | 105789 (102345–109232) | 24257 (23497–25017) | 7668 (7572–7764) | 176 | 1153 / 2644 |

Verifikasi isi: 8 hlm lulus semua ulangan, 49 hlm lulus semua ulangan, 99 hlm lulus semua ulangan, 198 hlm lulus semua ulangan, 496 hlm lulus semua ulangan, 992 hlm lulus semua ulangan.

## Pembatalan

| Halaman | Escape → status diam | Hasil | Sesi cetak tersisa |
|---|---|---|---|
| 8 | 20 ms | Proses dibatalkan. Sumber dan pengaturan tetap utuh.Coba lagi | None |
| 49 | 50 ms | Proses dibatalkan. Sumber dan pengaturan tetap utuh.Coba lagi | None |
| 99 | 88 ms | Proses dibatalkan. Sumber dan pengaturan tetap utuh.Coba lagi | None |
| 198 | 78 ms | Proses dibatalkan. Sumber dan pengaturan tetap utuh.Coba lagi | None |
| 496 | 73 ms | Proses dibatalkan. Sumber dan pengaturan tetap utuh.Coba lagi | None |
| 992 | 177 ms | Proses dibatalkan. Sumber dan pengaturan tetap utuh.Coba lagi | None |

## Dibandingkan RC1 (dokumen pembanding sama: 115 bagian = 196 halaman)

| Ukuran | RC1 | rc.2 |
|---|---|---|
| Pratinjau siap | 2942 ms | 2754 ms |
| Paginasi (wall) | 9256 ms | 8814 ms |
| Tugas panjang terlama di thread utama saat analisis | 888 ms | lihat E26 Worker: 203 ms jeda maks (fallback tanpa Worker: 1072 ms) |
| Verifikasi isi | lulus | pass |

Catatan: paginasi Paged.js memerlukan DOM dan tetap di thread utama; perbaikan rc.2 untuk paginasi bersifat keutuhan (pemeriksaan per blok, struktur halaman, kode per baris), bukan kecepatan. Kontainer CPU bersama → variasi antar-run ±20 %; bandingkan median, bukan satu angka.

## Dokumen 1.000 halaman

Berhasil dan terverifikasi di lingkungan ini (lihat baris terakhir tabel). Ini bukan jaminan untuk perangkat dengan memori terbatas; kegagalan karena memori/timeout menghasilkan status gagal yang dijelaskan, bukan PDF terpotong.
