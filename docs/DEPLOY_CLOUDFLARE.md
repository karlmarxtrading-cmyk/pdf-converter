# Deploy: GitHub → Cloudflare Pages (PaperForma 3.0.0-rc.3)

PaperForma adalah **situs statis murni**. Publish root (`dist/`) berisi HTML, JS (termasuk satu Web Worker modul
`assets/engine.worker-*.js`), CSS, font, gambar, `_headers`, `404.html`, panduan dan lisensi. Tidak ada `_worker.js`,
`functions/`, `_routes.json`, Wrangler, binding (D1/R2/KV/DO/Queues/Browser Run), cron atau secret.
`scripts/verify-static-release.mjs` menggagalkan build bila salah satunya muncul, bila bundel Worker hilang, atau bila CSP hilang
(dibuktikan oleh `evidence/release-gate.json`).

> Status: langkah 1–2 dan seluruh build/uji telah dijalankan **lokal** dari ZIP rilis (lihat `evidence/`). Deploy ke akun
> Cloudflare nyata **belum** dilakukan — tidak ada akses akun di lingkungan pembuatan rilis ini. Langkah 3 wajib dijalankan
> setelah deploy pertama sebelum menyatakan rilis produksi.

## 1. Repository GitHub

```bash
unzip PAPERFORMA_STATIC_PRODUCTION_RELEASE.zip
cd repository
git init && git add -A && git commit -m "PaperForma 3.0.0-rc.3"
git branch -M main
git remote add origin git@github.com:<akun>/<repo>.git
git push -u origin main
```

`.gitignore` sudah mengecualikan `node_modules/`, `dist/`, `dist-qa/`, `*.build-manifest.json`, `.env*`. Pages membangun
`dist/` sendiri; salinan `dist/` di ZIP hanya untuk pembanding hash (lihat §4).

## 2. Proyek Cloudflare Pages

Dashboard Cloudflare → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → pilih repository.

| Pengaturan | Nilai | Dasar |
|---|---|---|
| Framework preset | None | aplikasi Vite tanpa adaptor |
| Production branch | `main` | |
| Build command | `npm run build` | menjalankan SBOM → Vite → `verify-static-release` (gagal = deploy gagal) |
| Build output directory | `dist` | |
| Root directory | (kosong) | |
| Variabel lingkungan | `NODE_VERSION` = `24.22.3` | build image v3 Pages menerima versi Node apa pun lewat `NODE_VERSION` atau `.node-version` (berkas ini sudah ada); bawaan image adalah Node 22 |
| Functions, bindings, secrets | tidak ada | |

Build image Pages memasang dependensi dari `package-lock.json` sebelum build command. Versi Node dipin tepat
(`.node-version`, `engines.node`, `.npmrc` `engine-strict=true`). Untuk reproduksi persis seperti bukti rilis ini gunakan
build command `npx -y npm@11.9.0 ci && npm run build` (npm yang dipakai saat bukti dibuat). Pastikan proyek memakai
**build system v3** (Settings → Build → Build system version).

Tidak diperlukan pengaturan header di dashboard: `public/_headers` disalin ke `dist/_headers` dan memuat CSP
(`default-src 'self'`, `worker-src 'self' blob:`, `connect-src 'self'`), `X-Content-Type-Options`, `Referrer-Policy`,
`Cross-Origin-Opener-Policy`, serta cache `immutable` untuk `/assets/*`.

## 3. Verifikasi setelah deploy (wajib — belum dilakukan untuk kandidat ini)

```bash
BASE=https://<proyek>.pages.dev
curl -sI $BASE/ | grep -iE 'content-security-policy|x-content-type-options|referrer-policy|cache-control'
curl -sI $BASE/print.html | grep -i content-security-policy
W=$(curl -s $BASE/ | grep -o 'assets/main-[^"]*\.js' | head -1); curl -s $BASE/$W | grep -o 'engine\.worker-[A-Za-z0-9_-]*\.js' | head -1
curl -sI $BASE/assets/<engine.worker-...>.js | grep -iE 'content-type|cache-control'   # text/javascript + immutable
curl -s -o /dev/null -w '%{http_code}\n' $BASE/api/pdf        # 404
curl -s -o /dev/null -w '%{http_code}\n' $BASE/tidak-ada      # 404 (404.html)
```

Verifikasi rumus otomatis terhadap URL nyata (Chrome lokal diperlukan):

```bash
npm ci && npm run verify:deployment -- $BASE     # harus "LULUS"; hasil di evidence/deployment-math.json + PNG
curl -s $BASE/ | grep pf-version                   # harus 3.0.0-rc.3 (bukan deployment lama/cache)
```

Lalu di browser (Chrome/Edge, Firefox, Safari):
1. Buka `/` → studio → **Coba contoh**. Status di bawah editor harus berpindah "tahap 1/5 … 5/5" lalu "Revisi … kata";
   tidak boleh ada banner kompatibilitas (kecuali browser memang tidak mendukung fitur yang disebut).
2. **Periksa halaman** → verifikasi isi harus "pass".
3. **Periksa dan ekspor → HTML mandiri** → buka berkas hasil tanpa jaringan.
4. **Cetak / Simpan PDF** → Siapkan cetak → Buka dialog cetak → "Simpan sebagai PDF" → buka PDF: jumlah halaman sama
   dengan laporan, teks dapat dicari, nomor halaman dan daftar isi sesuai.
5. Simpan proyek, muat ulang tab, pastikan proyek pulih.

Untuk mengulang uji otomatis terhadap URL nyata, jalankan server lokal tidak diperlukan: arahkan skrip uji ke URL
(`tests/e2e/lib.mjs` memakai `launch({ dir })` → ganti `base` dengan URL Pages) — atau cukup ikuti daftar manual di atas
dan simpan hasilnya di `evidence/hosting/`.

Catatan: Pages dapat mengalihkan `/print.html` → `/print` (pretty URL). Aplikasi memuat halaman cetak lewat URL relatif yang
tetap dilayani; tetap uji di domain Anda.

## 4. Mencocokkan build Pages dengan build yang diserahkan

Build deterministik: `dist.build-manifest.json` (dan `evidence/dist.build-manifest.json`) mencatat `distTreeSha256` —
SHA-256 atas daftar `path\0sha256(isi)` seluruh berkas `dist/` yang diurutkan (`scripts/fingerprint.mjs`). Untuk
membandingkan, unduh artefak deploy atau bangun ulang lokal dengan Node 24.22.3 + npm 11.9.0 lalu jalankan
`node scripts/fingerprint.mjs`.

## 5. Domain, cache, pembaruan

- Domain final belum ditetapkan → `canonical`, `og:url`, `robots.txt`, `sitemap.xml` sengaja tidak dibuat (ST-QA-42).
- `/assets/*` berhash + `immutable`; `index.html`/`print.html` `no-cache`. Tab yang masih terbuka saat versi baru dideploy
  tetap memakai chunk lama yang sudah dimuat; chunk yang belum pernah dimuat (mis. Worker bila belum dipakai) dapat hilang
  dari deploy baru → klien gagal memuat Worker → aplikasi otomatis memakai fallback thread utama dan menampilkan
  pemberitahuan; muat ulang halaman memulihkan. (ST-QA-43 belum diuji di hosting nyata.)
- Proyek di IndexedDB terikat origin (`*.pages.dev` ≠ domain final). Pindahkan lewat paket `.pfproj` (docs/MIGRATION.md).

## 6. Rollback

Pages → Deployments → pilih deploy sebelumnya → **Rollback to this deployment**. Tidak ada data server; data pengguna tetap
di perangkat masing-masing.
