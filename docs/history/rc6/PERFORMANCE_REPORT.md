# Performa: status RC6 dan bukti historis

Tidak ada benchmark browser atau perbandingan performa RC6 yang dinyatakan terverifikasi dalam audit ini. Durasi tes Node/jsdom tidak mewakili waktu pemuatan, respons editor, paginasi atau PDF di perangkat pengguna.

Pengukuran RC4/RC5 tetap tersedia di [laporan historis RC5](history/rc5/RELEASE_REPORT.md) dan `evidence/rc5/performance/`. Dataset, median, p95 dan keterbatasannya tidak boleh digunakan untuk mengklaim peningkatan RC6. Ukuran dist RC6 tercatat dalam bukti build/statik yang baru.

Untuk pengukuran baru, jalankan build QA dan `npm run test:perf` pada browser yang dapat diluncurkan, simpan semua sampel, serta ikat hasil ke `candidateSha256` kandidat. Bandingkan pada dataset/perangkat yang sama.
