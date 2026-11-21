# Identitas GitHub dan Cloudflare Pages

Target yang diperiksa pada 21 November 2026 ialah `https://performa-cwd.pages.dev/`. Semua pemeriksaan URL menggunakan GET. Pemeriksaan repository membaca commit dan pohon GitHub. Perbandingan lokal memakai salinan ZIP RC4 dan kandidat RC5 yang dibangun dari source.

| Bukti | Yang dapat diperiksa |
|---|---|
| `github-vs-rc4.json` | Commit `c44b27f466f8a6483552df3d47b17fc61f458759`, seluruh 673 blob repository, 616 path bersama identik byte demi byte via Git blob hash. Setiap path tambahan di GitHub berada di evidence. |
| `public-rc4-http.json` | 285/285 pemeriksaan URL untuk RC4 lulus. Semua 280 berkas yang dapat diunduh sama dengan dist RC4. Versi di halaman awal `3.0.0-rc.4`, SHA-256 `8509213d91589ed7b112dbfdd244b16f0bdb32f598ec72e2058357d17838bc2a`. |
| `public-vs-rc5-http.json` | 119/184 pemeriksaan URL publik cocok dengan kandidat RC5 `9263951462ed`, dist `0987e2ef814b`. Root masih menyajikan RC4. Seluruh 179 path berkas untuk kandidat diminta, termasuk aset baru yang mengembalikan 404. |
| `observations.json` | Reproduksi pada salinan RC4. Beri komentar pada source index.html tanpa build ulang. Pemeriksa lama tetap meluluskan 285/285 terhadap output lawas dan salah mengaitkan hasil dengan fingerprint source baru. |
| `tests/scripts/static-server.test.mjs` (di root proyek) | Regresi. Pemeriksa baru menolak source lama, output dengan byte berbeda, build QA dan perbedaan versi sebelum menghubungi situs. |

Rujuk `docs/DEPLOY_CLOUDFLARE.md` untuk perintah Git Bash, verifikasi preview, dan rollback. Pengujian HTTP memeriksa identitas dan distribusi file. Pemeriksaan isi hasil ekspor terdapat di bukti browser/PDF. Kandidat dapat memperoleh bukti HTTP produksi setelah Pages menyajikan build yang diuji.
