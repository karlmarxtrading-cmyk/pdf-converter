# GitHub → Cloudflare Pages

## Isi ZIP dan folder untuk build

Ekstrak arsip ke satu folder. Buka folder yang berisi `package.json`, `package-lock.json`, `src/` dan `dist/` sejajar. Folder itu merupakan root proyek. `dist/` berisi situs yang sudah dibangun. Pada alur integrasi Git, Pages mengambil source dari GitHub dan menerbitkan hasil `npm run build` dari `dist/`. Aturan `.gitignore` mengecualikan `dist/`, `node_modules/` dan manifest build lokal.

Prasyarat untuk build ialah Node **24.22.3** dan npm **>=11.6.0 <12**. Pertahankan `engine-strict`. Langkah berikut dapat dijalankan dari root proyek di Git Bash Windows.

```bash
node -v
npm -v
npm ci && npm run typecheck && npm run lint && npm test && npm run build && npm run verify:http -- --local
```

Untuk melihat hasilnya, jalankan `npm run preview` dan buka `http://127.0.0.1:4173`. Aplikasi memerlukan HTTP(S) untuk modul dan Worker. HTML mandiri yang diunduh dari aplikasi dapat dibuka sebagai berkas.

## Mengirim source tanpa menimpa pekerjaan di GitHub

Repository tujuan adalah `https://github.com/karlmarxtrading-cmyk/performa`. Pada pemeriksaan 21 November 2026, branch `main` menunjuk ke `c44b27f466f8a6483552df3d47b17fc61f458759`. ZIP RC4 dan commit ini memiliki isi identik pada semua 616 path yang sama. Daftar perbedaan, termasuk bukti lama yang hanya ada di repository, tersimpan di `evidence/rc5/deployment/github-vs-rc4.json`.

Buka Git Bash di folder hasil ekstraksi. Nama folder checkout di bawah harus belum dipakai. Blok memakai subshell agar kegagalan di tengah menghentikan penyalinan tanpa menutup terminal.

```bash
(
  set -euo pipefail
  pf_source="$PWD"
  test -f "$pf_source/package.json"
  cd ..
  git clone https://github.com/karlmarxtrading-cmyk/performa.git performa-rc5-review
  cd performa-rc5-review
  test "$(git rev-parse HEAD)" = c44b27f466f8a6483552df3d47b17fc61f458759 || {
    echo 'GitHub sudah berubah sejak pemeriksaan. Bandingkan commit baru sebelum memasukkan kandidat.'
    exit 1
  }
  git switch -c paperforma-rc5
  tar -C "$pf_source" --exclude=./node_modules --exclude=./.git --exclude=./dist-qa -cf - . | tar -xf -
  git status --short
)
```

Pada clone baru, `git status` dapat menampilkan source, pengujian dan laporan yang berubah. File ekstra dari commit lama dapat tetap terlacak. Jika HEAD telah maju, buat branch dari HEAD terbaru dan rekonsiliasi perubahannya dengan kandidat. Ketika perubahan dalam branch sudah sesuai:

```bash
cd ../performa-rc5-review
git add -A && git diff --cached --stat
git commit -m "Update PaperForma release candidate" && git push -u origin paperforma-rc5
```

Aktifkan preview untuk branch ini di Pages. Penggabungan ke branch produksi dilakukan setelah preview memiliki identitas build dan hasil ekspor yang sesuai.

## Pengaturan di Cloudflare Pages

| Pengaturan | Nilai |
|---|---|
| Proyek | Pages dengan integrasi Git ke karlmarxtrading-cmyk/performa |
| Framework preset | None |
| Branch produksi | Branch yang terhubung ke produksi, misalnya main |
| Root directory | Kosong jika package.json ada di root repository |
| Environment variable preview dan production | NODE_VERSION = 24.22.3 |
| Build command | npm run build |
| Build output directory | dist |

Pastikan log menunjukkan Node/npm sesuai engines, dependensi lockfile terpasang, pemeriksaan statis lulus dan manifest produksi tercetak. Cocokkan commit di halaman deployment dengan commit sumber. `dist-qa` digunakan untuk pengujian internal.

## Memeriksa preview dan produksi

Dari checkout commit yang persis sama, jalankan `npm ci && npm run build`. Setel `PF_URL` ke URL **preview untuk commit tersebut** di halaman Deployments. Setelah promosi, ulangi terhadap URL publik proyek.

```bash
PF_URL='https://performa-cwd.pages.dev'
npm run verify:http -- "$PF_URL" && npm run verify:deployment -- "$PF_URL"
```

`verify:http` memeriksa kecocokan manifest, fingerprint source, pohon produksi dan konten publik. Kemudian ia membandingkan byte, metadata versi, MIME, CSP, cache, halaman cetak dan 404. Ia menulis `evidence/http-verification-<host>.json` atau `evidence/http-verification-local.json`.

`verify:deployment` menggunakan Chromium melalui Puppeteer. Halaman awal harus identik dengan `dist/index.html`. Pemeriksaan mencoba tiga jalur rumus Einstein menggunakan event clipboard terprogram, memeriksa 11 isi persamaan, mode display, kode, mata uang dan error browser, kemudian menulis `evidence/deployment-math-<host>/results.json`. Untuk path Chrome khusus di Windows Git Bash:

```bash
PF_CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe' npm run verify:deployment -- "$PF_URL"
```

Di PowerShell, setel `$env:PF_CHROME` ke lokasi executable yang terpasang. Bandingkan versi aktual dengan `package.json`. Jika pemeriksaan gagal karena versi atau hash HTML berbeda, periksa commit, branch, root/output dan cache deployment sebelum menyelidiki parser.

## Hasil pengguna dan rollback

Di URL preview, tempel materi dari aplikasi asal atau buka `fixtures/trigonometry/trigonometry.md`, lalu periksa tabel, rumus, kode dan gambar. Unduh HTML dan buka luring. Untuk PDF, siapkan halaman cetak kemudian pilih **Simpan sebagai PDF** dalam dialog browser. Gunakan ukuran kertas sesuai proyek, skala 100%, matikan header/footer browser dan aktifkan grafik latar. Periksa halaman awal/akhir serta baris tabel yang melewati batas halaman.

Data proyek tersimpan per origin di browser. Ekspor cadangan `.pfproj` sebelum perpindahan domain atau rollback, lalu uji bahwa versi tujuan dapat membuka cadangan itu. Tab lama yang kehilangan chunk dapat dipulihkan dengan menyimpan proyek dan memuat ulang. Dokumen utama dan halaman cetak meminta validasi cache kembali. Aset berhash memakai cache immutable.

Untuk rollback, buka proyek Pages → **Deployments** → menu **…** pada deployment produksi sebelumnya yang masih tersedia → **Rollback to this deployment**. Lakukan verifikasi terhadap source dari deployment tujuan. Rollback mengganti build yang disajikan. Cadangan proyek pengguna tetap dikelola di browser masing-masing.

Rujukan Cloudflare, diperiksa 21 November 2026: [build dan root](https://developers.cloudflare.com/pages/configuration/build-configuration/), [versi Node](https://developers.cloudflare.com/pages/configuration/build-image/), [rollback](https://developers.cloudflare.com/pages/configuration/rollbacks/).
