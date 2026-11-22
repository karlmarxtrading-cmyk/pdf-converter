# Mulai memakai PaperForma RC12

Ekstrak ZIP ke folder kosong. Buka Git Bash di folder yang langsung memuat `package.json`. Lihat [keputusan produksi](docs/RELEASE_REPORT.md) sebelum memilih branch tujuan.

## Membuka studio secara lokal

Gunakan Node 24.22.3 dan npm 11.6.0 sampai 11.x. Pada Windows, jalankan perintah di Git Bash.

```bash
sha256sum --quiet -c SHA256SUMS &&
npm ci --include=dev &&
npm run build:pages &&
npm run preview
```

Buka alamat HTTP lokal yang dilaporkan server. Masukkan dokumen, pilih template, periksa preview, lalu buka Terbitkan/Publish untuk menyimpan HTML atau melanjutkan ke dialog cetak PDF. Untuk tes awal, folder `fixtures/device/` memuat satu Markdown pendek dengan rumus, tabel, marker dan kode.

## Memeriksa hasil

- [Keputusan 24 gerbang dan perbaikan audit](docs/RELEASE_REPORT.md)
- [Kontrak pengujian](docs/RELEASE_ACCEPTANCE.md) dan [cara melanjutkan putaran](docs/RECOVERY.md)
- [Prasyarat Python, Pandoc dan Poppler](docs/TOOLCHAIN.md)
- [Prosedur Windows dan bukti dari hosting](docs/ACCEPTANCE_PERANGKAT_HOSTING.md)
- [Deploy GitHub → Cloudflare Pages](docs/DEPLOY_CLOUDFLARE.md)

Berkas `dist/` adalah hasil build statis. Root ZIP juga memuat source, tes, fixture dan bukti untuk membangun ulang aplikasi dan memeriksa identitasnya. Jalankan `python scripts/verify-archive.py /path/ke/ZIP` dari salinan ekstraksi untuk menguji ulang ZIP lengkap pada folder sementara.
