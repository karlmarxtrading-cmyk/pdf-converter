# PaperForma 3.0.0-rc.6 — audit dan keputusan rilis

**21 November 2026 · kandidat untuk staging.** Bug matematika pada TXT asli berhasil direproduksi dan diperbaiki. RC6 menghasilkan seluruh **231 rumus** melalui renderer dan ekspor HTML. Penerimaan visual aplikasi, paginasi aktual dan PDF native belum dapat dijalankan pada lingkungan audit ini. Situs GitHub/Cloudflare aktif tidak diubah atau diperiksa sebagai bagian dari audit ZIP ini.

## Hasil dari input yang sama

| Ukuran | RC5 unggahan | RC6 perbaikan |
|---|---:|---:|
| Rumus menurut oracle independen | 231 | 231 |
| Rumus yang terdeteksi/dirender | 0 | 231 |
| Inline / display yang dirender | 0 / 0 | 103 / 128 |
| Error parsing formula yang dikenali | 0 karena tidak ada yang dikenali | 0 |
| Perbedaan TeX, urutan dan mode terhadap oracle | Tidak mencakup rumus terlewat | 0 |
| Isi rumus memerlukan pemulihan karakter salinan | Tidak ditangani | 17, dengan catatan |
| Status kategori matematika | READY meskipun semua terlewat | REVIEW karena pemulihan isi |

Bukti: `evidence/rc6/baseline-probe.json`, `rc6-independent-oracle.json`, `fixtures/rc6/user-trigonometry.expected.json` dan manifest contoh. Sumber TXT tetap identik byte: 15.280 byte, 540 baris, SHA-256 `1f4b9345ef5a092c40e66290821f110cee2656a093a889c0f51800bdd54bb16f`.

## Akar masalah

1. **Delimiter berubah pada proses salin.** Naskah menggunakan pasangan backslash ganda seperti `\\(\theta\\)` dan `\\[…\\]`. Scanner RC5 hanya mendukung varian lain dan menganggap seluruh rumus itu teks biasa. KaTeX sudah terpasang; masalah terjadi sebelum mesin rumus menerima input.
2. **Escape juga masuk ke dalam sejumlah rumus.** Pada 17 formula ada pola row break berlebih, subskrip yang di-escape atau spacing yang tersalin. Pemulihan hanya pada konteks yang dikenali: 46 run tiga backslash, 2 run empat backslash sebelum opsi jarak baris, serta 6 escaped braced subscripts. Ini bukan penggantian global seluruh backslash.
3. **Jalur HTML dan Markdown tidak setara.** Rumus literal dalam raw HTML dan sebagian metadata clipboard melewati renderer. Pembungkus luas berisi beberapa formula bisa kehilangan prosa/formula berikutnya; formula bersebelahan bisa diserialisasi ambigu.
4. **Pemeriksaan tidak mendeteksi hal yang tidak diparse.** Nol error ditafsirkan sebagai siap, walau nol rumus dikenali. Korpus pendek RC5 berisi 21 rumus tidak menangkap bentuk escape pada TXT asli; 356 tes baseline tetap lulus.

Screenshot pengguna cocok dengan reproduksi: struktur judul/tabel tampil, tetapi TeX mentah terlihat. Arsip tidak rusak: seluruh 495 checksum yang tercantum cocok.

## Perubahan yang dibuktikan

| ID | Perubahan | Bukti baru |
|---|---|---|
| RC6-M01–M04 | Delimiter salinan, pemulihan body terbatas, sumber/offset asli, fence math dan inline GitHub | `rc6-math-copy.test.ts`, oracle 231 formula |
| RC6-M05 | Sentinel tidak merusak emphasis CommonMark di sebelah rumus | Kasus judul strong/emphasis dan collision |
| RC6-CLIP01–09 | Anotasi dan atribut sumber, MathJax display, wrapper AI, tabel merge, formula bersebelahan | `rc6-clipboard.test.ts` |
| RC6-RENDER | Raw HTML aman, prioritas metadata, diagnostik sisa TeX, oracle raw-table | `rc6-render-compat.test.ts` |
| RC6-AUD | Parsing ganda, kehilangan prosa, wrapper multi-formula, sanitasi dan mutasi operator | 23 tes independen dan runner terpisah |
| RC6-TOC01 | Formula judul tetap masuk daftar isi; heading hanya-rumus dan anchor berfungsi | `rc6-heading-math.test.ts` |
| RC6-EXPORT | HTML mandiri dari sumber asli dengan font nyata; payload persiapan cetak | `rc6-user-export.test.ts` |

Modul utama berubah: `math.ts`, `markdown.ts`, `render.ts`, `clipboard.ts`, `integrity.ts`; helper baru: `math-copy.ts`, `html-math.ts`, `html-math-source.ts`, `math-diagnostics.ts`. Kontrak publik `CoreApi` tetap; ekspor helper internal dan metadata tambahan dijelaskan pada [Core API](CORE_API.md). Daftar perubahan dengan digest sebelum/sesudah berada di `evidence/rc6/changed-files.json`.

Perubahan tampilan tidak menimpa sumber. `data-tex` memuat formula kanonik untuk dirender; `data-source-tex` dan detail temuan mempertahankan sumber salinan dan jenis pemulihan. Kode, URL dan mata uang dilindungi. Sanitasi HTML, batas parsing dan KaTeX `trust:false` dipertahankan. Tes keamanan HTM-05 kini membedakan style sumber yang harus dibuang dari style yang dihasilkan KaTeX; tidak ada sanitizer yang dilemahkan untuk meluluskan tes.

## Validasi final

| Pemeriksaan | Hasil RC6 | Batas |
|---|---|---|
| TypeScript dan lint | PASS | Source pada kandidat final |
| Vitest | **444/444**, 54 berkas, 0 gagal | Node/jsdom; bukan browser visual |
| Tes Node | **9/9**, 0 gagal/skip | Gate hasil, HTTP server, logika oracle PDF |
| Oracle independen | **231/231**, 0 perbedaan, mutasi ditolak | Sintaks/provenance, bukan kebenaran matematika |
| Ekspor HTML aktual | **231 rumus**, 12 font WOFF2, **934.604 byte** | API aktual dengan font nyata; visual browser NOT_RUN |
| Payload persiapan cetak | PASS | Belum menjalankan paginasi atau membuat PDF native |
| Build produksi/statik | PASS; **180 berkas, 9.665.309 byte** | Profil produksi, tanpa kait QA |
| HTTP lokal | **184/184**, **179/179** file publik cocok | Byte, header, MIME, cache dan rute; bukan UI |
| Gate mutasi rilis | **13/13** sesuai harapan | 1 kontrol lolos, 12 kerusakan sengaja ditolak |
| Pemindaian pola rahasia | PASS; 0 temuan build/lain | Pemeriksaan pola, bukan bukti bebas semua secret |
| npm audit | **0 advisory** saat audit | 438 dependensi tercatat; bukan pentest/garansi masa depan |

Perintah dan keluaran final ada di `evidence/rc6/final-validation.json` dan log `final-*`. Tidak ada tes yang sengaja di-skip. Dependensi tidak di-upgrade massal. SBOM dan lisensi diperbarui sesuai versi paket.

HTML contoh ada di `examples/RC6_TRIGONOMETRI_PENGGUNA.html`, SHA-256 `328dbc489d9ba51b77f96d53b1d1c9ed54e53a1066e6b86f2839057b41a85ac1`. Ia dihasilkan API ekspor aplikasi, membawa font nyata, tidak membawa skrip/aset jaringan, mempertahankan 231 sumber formula, dan dapat dibagikan sebagai berkas mandiri. Status ekspor wajib `pass` tetap menyertakan warning pemulihan dan status matematika `review`. Tidak boleh disebut bebas catatan.

## Identitas kandidat

| Komponen | SHA-256 |
|---|---|
| Source/config/public/scripts/tests/fixtures RC6 | `4e96aabbce9771cbedd945068a8ad3d8526fbb717200df11a60c96714ddcc497` |
| Pohon dist produksi RC6 | `60be475033374b68db3cb1a39efab318ad303d642a652a231564ea302a7770d9` |

Node v24.22.3 dan npm 11.19.1. `dist.build-manifest.json` mengikat versi, profil dan sidik jari. Dokumentasi/evidence/examples tidak masuk hash kandidat; `SHA256SUMS` mencakup setiap file paket selain checksum itu sendiri. Verifikator arsip mengekstrak ZIP ke folder bersih, menginstal dari lockfile, menjalankan ulang gate dan membandingkan seluruh byte dist/manifest. Hasil dan digest ZIP final diserahkan terpisah untuk menghindari referensi ke digest arsip itu sendiri.

## Kedalaman audit seluruh unggahan

Ketiga unggahan digunakan: ZIP source RC5, TXT lengkap dan screenshot. Seluruh **496 file arsip** diinventarisasi, diklasifikasi dan di-hash; **495 checksum cocok**, tanpa entri tambahan yang tidak tercakup. Pembacaan manual difokuskan pada **32 file utama** jalur input, parser, renderer, integritas, keamanan, ekspor dan build. **115 file** mendapat pemeriksaan pola statis dan **349 file** lainnya inventaris/hash. Ini bukan klaim membaca setiap baris vendor atau memverifikasi setiap halaman PDF historis. Rincian per berkas tersedia di `independent-inventory.json`.

Bukti RC4/RC5 tetap disimpan di `docs/history/` dan `evidence/rc5/`. Status situs/commit, PDF, performa dan browser dalam laporan lama adalah fakta historis paket asal, bukan hasil RC6.

## Batas dan keputusan produksi

- **Browser visual, clipboard OS/provider, paginasi aktual, PDF native, Firefox/WebKit, perangkat fisik dan deployment RC6: NOT_RUN.** Chromium lokal gagal karena pembatasan socket AF_UNIX/EPERM; browser cloud tidak dapat mengakses localhost dan kebijakan akses menghentikan observasi lanjutan. Tidak ada pengujian browser yang dihitung lulus.
- Raw HTML non-tabel tetap di luar oracle blok terurut. Peringatan sisa TeX menggunakan allowlist terbatas; tidak mendeteksi setiap rumus sederhana yang terpecah batas HTML. KaTeX tidak menjalankan semua paket LaTeX.
- Canvas/widget proprietari, rumus gambar tanpa TeX, OCR, impor PDF/DOCX dan cakupan font semua aksara belum tersedia universal. Format yang masih ada dalam salinan dapat diolah; data yang tidak tersalin tidak dapat dikarang kembali.
- Semua 231 rumus yang dipulihkan cocok dengan oracle sintaks yang ditetapkan, tetapi **kebenaran matematis naskah tidak diaudit**. Sebanyak 17 pemulihan isi memerlukan tinjauan pengguna.

Keputusan: perbaikan source dan ekspor siap dicoba pada staging yang sudah ada. Gunakan branch preview repository `karlmarxtrading-cmyk/performa`, build `npm run build`, output `dist`, Node 24.22.3. [Panduan deploy](DEPLOY_CLOUDFLARE.md) memakai proyek Pages yang telah terhubung; tidak perlu membuat proyek baru. Sebelum produksi, selesaikan [pemeriksaan browser/PDF](TESTING.md) dengan input asli, bukan hanya contoh pendek.

## Rujukan teknis

- [CommonMark: backslash escapes](https://spec.commonmark.org/0.31.2/#backslash-escapes).
- [KaTeX: fungsi yang didukung](https://katex.org/docs/supported.html) dan [opsi keamanan/render](https://katex.org/docs/options.html).
- [Cloudflare: build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/) dan [build image/Node](https://developers.cloudflare.com/pages/configuration/build-image/).

Rujukan luar menjelaskan kontrak format/hosting. Hasil tentang paket PaperForma berasal dari file dan pengujian lokal yang disertakan.
