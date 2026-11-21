# Pengukuran RC4 dan RC5

Ukuran berkas, latensi fungsi di Node dan waktu yang dialami pengguna di browser mengukur hal berbeda. Tabel hasil utama dan keputusan gate D tersedia di [laporan rilis](RELEASE_REPORT.md).

- [Snapshot dan analisis Worker/fallback](../evidence/rc5/performance/README.md) mencakup dataset, median, p95, variasi, keterbatasan pengukuran dan informasi CPU.
- [Protokol](../evidence/rc5/performance/PROTOCOL.md) memuat jumlah pengulangan, batas materialitas serta metode pengulangan diagnostik.
- [Aset yang dideklarasikan di index.html](../evidence/rc5/build/payload.json) membedakan ukuran mentah dan gzip setiap berkas. Perhitungan ini tidak meliputi request dinamis.
- Bukti jaringan, kecepatan mengetik dan kesiapan pratinjau Chromium terdapat di `evidence/rc5/browser/`. Browser yang mengunduh dokumen matematika tetap memerlukan KaTeX. Kartu contoh di beranda juga dapat memintanya.
