# Melanjutkan putaran RC12

1. Ekstrak ZIP ke folder kosong. Cocokkan SHA-256 ZIP dari pengiriman dan jalankan `sha256sum --quiet -c SHA256SUMS` sebelum mengubah berkas.
2. Catat sidik jari `node scripts/fingerprint.mjs`. Bandingkan dengan `dist.build-manifest.json` dan `evidence/rc12/acceptance/start.json`. Lihat daftar gate aktif di [laporan kandidat](RELEASE_REPORT.md).
3. Untuk kandidat, harness dan fixture yang sama, pakai runId tersebut. Simpan setiap percobaan dengan nama observasi baru. Kumpulkan bukti yang belum lengkap sesuai [kontrak](RELEASE_ACCEPTANCE.md) dan [prosedur perangkat/hosting](ACCEPTANCE_PERANGKAT_HOSTING.md). Gunakan `npm run verify:release` untuk menghitung keputusan kembali.
4. Bila source, konfigurasi atau alat uji berubah, simpan salinan putaran lama, bangun ulang, dan gunakan direktori keluaran yang bersih untuk memulai run baru dengan `node scripts/acceptance.mjs start`. Simpan ulang pengukuran yang terikat identitas. Jangan membawa receipt PASS ke identitas baru.
5. Ekstrak dan bangun ulang ZIP yang akan dibagikan. Buat manifest internal yang mengecualikan dirinya dan hitung hash ZIP sesudah pengemasan. Pisahkan naskah sumber dan semua turunan privat dari output publik.

Untuk perubahan hosting gunakan [prosedur rollout dan rollback](DEPLOY_CLOUDFLARE.md). Pemulihan file lokal dan rollback produksi adalah operasi terpisah.
