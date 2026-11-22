# GitHub → Cloudflare Pages untuk PaperForma RC12

Tujuan adalah repository `karlmarxtrading-cmyk/performa`, dengan produksi pada `main` sesuai keterangan pemilik. Saat pemeriksaan, HEAD GitHub pada `main` adalah `3a4eaf9eeeb710541c13bee34a83ff901c441580` dan package.json berisi RC5. Dashboard Pages meminta login. Nama proyek, deployment produksi aktif, domain dan aturan branch pada akun harus dibaca dari dashboard. Lihat [keputusan rilis](RELEASE_REPORT.md).

## Konfigurasi proyek yang perlu dicocokkan

| Pengaturan | Nilai untuk kandidat ini |
| --- | --- |
| Project | Proyek Pages yang sudah terhubung dengan repository tujuan |
| Production branch dan PAPERFORMA_PRODUCTION_BRANCH | main |
| Preview branch | paperforma-rc12-preview, aktifkan build preview untuk branch ini |
| Framework dan root | None/custom, root kosong bila package.json berada pada root Git |
| Build image | v3 Linux x86_64 |
| Build command | `npm ci --include=dev && npm run build:pages` |
| Build output directory | `dist` |
| Runtime | `NODE_VERSION=24.22.3`; npm sesuai engines, >=11.6.0 dan <12 |
| Dependency install | `SKIP_DEPENDENCY_INSTALL=1` karena build command menjalankan npm ci |
| Variabel dari Cloudflare | CF_PAGES, CF_PAGES_BRANCH dan CF_PAGES_COMMIT_SHA diisi platform |

Atur variabel untuk lingkungan yang sesuai. Build produksi memasang toolchain PDF ber-versi, memverifikasi hash semua unduhan dan menjalankan verifier penerimaan. Periksa ukuran serta prasyarat pada [panduan toolchain](TOOLCHAIN.md). Verifier produksi menilai bukti untuk hash source dan dist yang sedang dibangun. Lihat hasil uji dari ekstraksi bersih dan batas cakupannya pada laporan kandidat. [Hasil lengkap dan cakupan pengujian](RELEASE_REPORT.md).

## Git Bash Windows · menyiapkan branch preview dari ZIP

Mulai di **folder ekstraksi baru yang kosong sebelum unzip**, berisi package.json pada root. Jangan gunakan checkout harian untuk perintah ini. Blok berikut memverifikasi seluruh isi, membuat branch preview lokal dengan riwayat `main` sebagai parent, lalu menampilkan perubahan. Git mereset index dari parent dan mempertahankan isi folder ekstraksi. Pengaman SHA berhenti jika `main` berubah sejak pemeriksaan.

```bash
(
  set -e
  test -f package.json && test -f SHA256SUMS
  test ! -e .git
  sha256sum --quiet -c SHA256SUMS
  git init -b paperforma-rc12-preview
  git remote add origin https://github.com/karlmarxtrading-cmyk/performa.git
  git fetch origin main
  test "$(git rev-parse FETCH_HEAD)" = 3a4eaf9eeeb710541c13bee34a83ff901c441580 || {
    echo "main telah berubah. Tinjau perubahan upstream sebelum melanjutkan."
    exit 1
  }
  git reset --mixed FETCH_HEAD
  git add -A
  git diff --cached --stat
  git status --short
)
```

Tinjau daftar staged. Sesuaikan perubahan milik pengguna yang tidak berkaitan sebelum commit. Pastikan tidak ada dokumen privat, berkas rahasia atau node_modules yang dilacak. `.gitignore` berlaku untuk file belum dilacak. Git tetap melacak file yang telah masuk index sampai penanganan eksplisit. Pada checkout Git, `dist` dan `dist.build-manifest.json` biasanya dibangun kembali dari source. SHA256SUMS pada ZIP juga mencakup file distribusi yang tidak dilacak Git. Verifikasi checksum lengkap dilakukan pada ekstraksi ZIP.

```bash
git branch --show-current
git diff --cached --stat -- src scripts tests
git commit -m "Prepare PaperForma 3.0.0-rc.12 for Pages preview" &&
git push -u origin paperforma-rc12-preview
```

Catat hasil `git rev-parse HEAD` setelah commit. Jika source dan bukti dikirim dalam satu commit dari ZIP, gunakan SHA commit GitHub itu untuk `sourceCommit` serta `deploymentCommit` setelah log Pages mengonfirmasinya. SHA source dan dist PaperForma harus tetap cocok dengan `evidence/rc12/acceptance/start.json`. Commit persiapan lokal pada laporan rilis mengidentifikasi riwayat kerja pembuat paket.

Gunakan push biasa. Bila branch tujuan telah ada dan Git menolak non-fast-forward, bandingkan commit dan gunakan nama preview baru yang diizinkan Pages. Periksa log build dan salin URL deployment tetap beserta deployment ID. URL alias branch dapat berpindah setelah push berikutnya.

## Memeriksa URL preview

Dari source dan lockfile yang sama, jalankan build lokal dan verifikasi. Untuk pengujian browser, tentukan CHROME_PATH jika Chromium/Chrome tidak terdeteksi.

```bash
npm ci --include=dev && npm run build:pages
read -r -p 'URL deployment HTTPS dari dashboard: ' PF_PREVIEW_URL
npm run verify:http -- "$PF_PREVIEW_URL" &&
npm run verify:deployment -- "$PF_PREVIEW_URL"
```

Simpan hasil unduhan HTML melalui UI, verifikasi PDF, respons 404, worker, font, MIME, CSP dan cache sesuai [G15](ACCEPTANCE_PERANGKAT_HOSTING.md). Simpan SHA commit source, SHA commit bukti, URL dan deployment ID sebagai bidang terpisah. Konfigurasi hosting belum terverifikasi sebelum pengujian pada akun dan deployment itu berhasil.

## Rehearsal terpisah pada Pages

Setelah bukti perangkat, preview dan rollback lengkap serta 24 gerbang lulus secara lokal, buat branch rehearsal pada commit bukti yang telah ditinjau. Di lingkungan **Preview** setel `PAPERFORMA_REHEARSAL_BRANCH` ke nama branch rehearsal tersebut. Nama branch produksi dan variabel `CF_*` harus mencerminkan keadaan hosting asli. Push branch rehearsal pada proyek yang sama. Build menggunakan perintah biasa, memasang toolchain yang terkunci dan menjalankan verifier produksi pada runner Pages. Simpan ID deployment, URL, SHA dari Git, log build dan durasi. Cocokkan identitas yang dilaporkan dengan source, dist dan putaran pengujian. Uji alamat deployment tetap tersebut sebelum menilai A08.

## Promosi dan rollback

Produksi memerlukan 24 PASS, penutupan empat temuan RC11, bukti A07–A08 dan persetujuan pemilik. Catat target pemulihan produksi yang masih tersedia dan diketahui baik sebelum promosi. Sesudah otorisasi live untuk ID yang ditentukan, buka **Workers & Pages → proyek → Deployments**, pilih deployment produksi yang sesuai, jalankan rollback, kemudian cek kembali identitas serta ekspor pada URL produksi. Catat hasil dan selaraskan riwayat Git agar push berikutnya tidak menerapkan revisi yang sedang dipulihkan.

Dokumentasi resmi ditinjau 22 November 2026. [Build dan output](https://developers.cloudflare.com/pages/configuration/build-configuration/) · [Build image](https://developers.cloudflare.com/pages/configuration/build-image/) · [Preview deployment](https://developers.cloudflare.com/pages/configuration/preview-deployments/) · [Rollback](https://developers.cloudflare.com/pages/configuration/rollbacks/).
