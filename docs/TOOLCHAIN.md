# Lingkungan verifier PaperForma

Build Pages memakai root repository, output `dist` dan perintah berikut.

```sh
npm ci --include=dev && npm run build:pages
```

Gunakan build image Pages v3, `NODE_VERSION=24.22.3`, `SKIP_DEPENDENCY_INSTALL=1`, dan `PAPERFORMA_PRODUCTION_BRANCH=main` sesuai branch produksi proyek. Biarkan Pages mengisi `CF_PAGES`, `CF_PAGES_BRANCH` dan `CF_PAGES_COMMIT_SHA`. Build preview biasa menghasilkan distribusi statis. Branch rehearsal yang ditetapkan pada lingkungan Preview menjalankan verifier penuh yang sama dengan produksi. Pada branch produksi, perintah yang sama melakukan build, memasang toolchain berikut dalam direktori sementara milik proses, memeriksa hasilnya, lalu memanggil verifier 24 gerbang. Exit nonzero menghentikan publikasi. Gunakan `python3` pada PATH untuk bootstrap atau tentukan interpreter awal melalui `PF_PYTHON`. Bootstrap membutuhkan Python 3.8+ dengan pustaka standar, TLS dan akses unduh. Verifier memakai Python tersendiri dari lock.

| Komponen | Versi dalam lingkungan Linux x86_64 |
| --- | --- |
| Node | 24.22.3 |
| npm | >=11.6.0 dan <12, sesuai engines dan engine-strict |
| CPython | 3.12.14 |
| lxml | 6.1.1 |
| PyMuPDF / fitz | 1.26.6 |
| Pandoc | 3.1.11.1 |
| Poppler PDF utilities | 26.05.0 |
| pypdf | 6.21.4 |
| Pillow | 13.0.0 |

`scripts/toolchain/linux-64.lock.json` memuat ukuran, SHA-256 dan lokasi setiap arsip program, pustaka, bootstrap micromamba serta wheel PyMuPDF. Pemasangan menggunakan unduhan HTTPS conda-forge dan PyPI, memeriksa byte per arsip, kemudian memasang paket secara offline tanpa resolusi versi. Sekitar 151 MB diunduh setiap kali proses kualifikasi dimulai. Paket ini berada di luar `dist` dan dibersihkan saat proses selesai. Program tidak memerlukan sudo. Lock, program bootstrap, pemanggil build dan verifier merupakan bagian dari identitas kandidat. Perubahan terhadap byte-byte tersebut memerlukan build dan run penerimaan baru.

## Rehearsal A08 di Pages

Pertama selesaikan pengujian perangkat, deployment preview biasa, dan rollback yang telah diotorisasi. Pastikan semua 24 receipt lokal diterima. Pada lingkungan **Preview** proyek yang sama, tetapkan `PAPERFORMA_REHEARSAL_BRANCH` ke nama branch rehearsal yang akan dipush. Branch lain dapat tetap dipakai untuk uji G15. Pertahankan `PAPERFORMA_PRODUCTION_BRANCH=main`. Push commit yang memuat source dan bukti yang sudah diperiksa ke branch rehearsal. Perintah build tetap `npm ci --include=dev && npm run build:pages`.

Pages memasok CF_PAGES, CF_PAGES_BRANCH, CF_PAGES_COMMIT_SHA serta CF_PAGES_URL. Build membaca URL native dan mencocokkan commit platform dengan HEAD checkout. Rehearsal dan produksi keduanya melakukan build dari lockfile, provisioning baru, probe PDF/HTML, dan verifier penuh. Sesudah 24 PASS dan identitas cocok, log mencetak PAPERFORMA_PAGES_BUILD, mode, branch, commit, URL, runId, candidate/dist dan durasi. Simpan metadata dashboard termasuk deployment ID dan exit status beserta log lengkap. Periksa URL serta artefak setelah build. Percobaan dengan gerbang tertutup sebagian menghasilkan exit nonzero. Simpan log kegagalan dan lakukan pengukuran ulang pada commit bukti yang sudah dilengkapi. Catat bukti hosting terpisah dari identitas source. Bukti rehearsal di Pages dan persetujuan pemilik diperlukan sebelum promosi. Rujuk [konfigurasi build Pages](https://developers.cloudflare.com/pages/configuration/build-configuration/).

## Pemeriksaan dari host bersih Linux

Gunakan mesin x86_64 dengan glibc (target Pages v3 Ubuntu 22.04 x86_64), akses HTTPS untuk paket, Node/npm sesuai tabel, Python bootstrap dan checkout bersih. Pasang dependensi aplikasi menggunakan lockfile. Pilih perintah sesuai pengukuran.

```sh
npm ci --include=dev
npm run build:pages
node scripts/toolchain/qualified-run.mjs check
node scripts/toolchain/qualified-run.mjs acceptance-tests
node scripts/toolchain/qualified-run.mjs
```

Perintah `check` memasang seluruh toolchain dari awal dan menghasilkan laporan versi dan probe nyata PDF/HTML. `acceptance-tests` juga menjalankan pengujian kontrak. Perintah terakhir memasang ulang, memeriksa dan menjalankan verifier pada bukti serta dist aktual. Status NO_GO mengembalikan exit 1. Rehearsal lokal menggunakan proses yang sama tanpa menyetel variabel internal Pages. Log live dari project Pages tetap diperlukan untuk membuktikan keadaan hosting.

Untuk mereproduksi uji lingkungan kosong yang disertakan, jalankan perintah berikut. Harness mengosongkan HOME dan membatasi PATH ke utilitas build, membuktikan empat modul Python dan CLI verifier belum dapat ditemukan, lalu menjalankan provisioning serta pemeriksaan. Ganti argumen dengan `verify` untuk menguji keputusan 24 gerbang kandidat saat ini dalam lingkungan yang sama.

```sh
python3 tests/scripts/clean-toolchain.py acceptance-tests
```

## Git Bash di Windows

Untuk menjalankan tool native, sediakan Python dan CLI di PATH. Contoh ini memakai Git Bash dengan perintah conda yang sudah tersedia dan shell hook yang sudah diaktifkan. Buat lingkungan verifikasi khusus, lalu jalankan pemeriksaan dari root repository.

```bash
conda create --yes --name paperforma-verify --override-channels -c conda-forge 'python=3.12.14' 'pandoc=3.1.11.1' 'poppler=26.05.0' pip
conda activate paperforma-verify
python -m pip install 'lxml==6.1.1' 'PyMuPDF==1.26.6' 'pypdf==6.21.4' 'Pillow==13.0.0'
export PF_PYTHON="$(python -c 'import sys; print(sys.executable)')"
python scripts/toolchain/check.py
npm run test:acceptance
npm run verify:release
```

`check.py` mengembalikan exit nonzero bila versi pembanding berbeda. Laporannya mencantumkan versi aktual per alat, termasuk ketiga executable Poppler. Path interpreter yang mengandung spasi bisa dipakai lewat `PF_PYTHON`. Pada Windows, executable Pandoc dan Poppler beserta DLL-nya tetap perlu dipasang pada PATH. Lock biner Linux dan hasil pengujian Linux berlaku untuk runner produksi Linux. Penerimaan Windows harus mencatat pengukuran pada perangkat Windows sesungguhnya.

## Penanganan kegagalan

- Checksum atau ukuran berbeda. Periksa akses ke lokasi distribusi yang ada di lock. Unduhan terpotong, file pengganti, atau sertifikat TLS bermasalah akan memblokir build. Jalankan kembali setelah koneksi pulih.
- Gagal impor modul atau menjalankan program. Periksa output versi sebelum pengujian, lokasi executable yang dipilih dan ruang disk sementara.
- Gerbang FAIL, BLOCKED, atau NOT_RUN. Baca alasan tiap gerbang pada laporan penerimaan kandidat aktif. Verifikasi dijalankan ulang setelah bukti atau hasil pengujian yang dituntut tersedia.
- Pergantian versi. Tinjau asal dan checksum paket baru, jalankan bootstrapping dari kosong, probe, pengujian kontrak, bangun ulang dan mulai ulang penerimaan dengan identitas baru.

Rujukan resmi Cloudflare diperiksa pada 22 November 2026. [Build image](https://developers.cloudflare.com/pages/configuration/build-image/) · [Build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/).
