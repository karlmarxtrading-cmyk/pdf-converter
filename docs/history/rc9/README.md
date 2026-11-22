# PaperForma 3.0.0-rc.9

Mulai dari [README_MULAI_DI_SINI.md](README_MULAI_DI_SINI.md) untuk menjalankan aplikasi, lokasi bukti dan alur GitHub ke Cloudflare Pages. Baca [laporan kandidat](docs/LAPORAN_RC9.md) dan [matriks kompatibilitas](docs/COMPATIBILITY_RC9.md) sebelum promosi.

## Dokumentasi rilis terdahulu

# PaperForma

Studio dokumen statis untuk mengolah teks, Markdown, salinan percakapan dan berkas HTML menjadi HTML mandiri atau halaman cetak. Dokumen diproses di browser pengguna.

**[Panduan mulai untuk Windows dan Git Bash](README_MULAI_DI_SINI.md)**

| Keperluan | Buka |
|---|---|
| Status produksi dan temuan A01–A09 | [Laporan RC8](docs/RELEASE_REPORT.md) |
| Dukungan masukan, browser dan format keluaran | [Matriks kompatibilitas](docs/COMPATIBILITY_RC8.md) |
| Contoh HTML dan PDF dari kandidat ini | [Contoh RC8](examples/rc8/) |
| Menjalankan pengujian atau memeriksa paket | [Pengujian](docs/TESTING.md) |
| Konfigurasi Cloudflare Pages dan latihan pemulihan | [Deployment dan rollback](docs/DEPLOY_CLOUDFLARE.md) |

Di dalam ZIP, `dist/` dapat langsung disajikan melalui `node scripts/serve-dist.mjs dist 4173`. Untuk mengubah aplikasi, gunakan source dan lockfile di root. Hasil dari versi terdahulu tersimpan di direktori yang mencantumkan nama versi.
