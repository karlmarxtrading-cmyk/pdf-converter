# Audit independen baseline PaperForma 3.0.0-rc.5

Tanggal: 21 November 2026. Cakupan: ZIP, TXT tempelan, dan screenshot yang diserahkan pada percakapan ini. Dokumen ini merekam **temuan sebelum perbaikan RC6**. Hasil perbaikan harus dibuktikan terpisah pada sumber dan build RC6 final.

## Kesimpulan utama

Kegagalan pada contoh pengguna berhasil direproduksi langsung dari sumber RC5. Naskah TXT sepanjang **15.280 byte, 540 baris** mengandung **231 pasangan calon rumus**: 103 inline dan 128 display. Mesin RC5 mendeteksi **0 rumus**, menghasilkan **0 elemen KaTeX**, dan melaporkan **0 masalah matematika**. Kategori matematika tetap bertanda **Siap**; pemeriksa integritas juga mengembalikan `true`. Karena itu, masalah ini merupakan cacat deteksi format masukan dan cakupan pemeriksa, bukan bukti bahwa komputer pengguna tidak mampu menampilkan matematika.

Bukti pengulangan berada di `baseline-probe.json` dan sumber instrumen `baseline-probe.ts`. Instrumen memakai source RC5 yang tidak dimodifikasi, esbuild, dan DOM jsdom dari dependensi terpasang. Ini pengujian fungsi/node dengan DOM emulasi, **bukan** pengujian clipboard sistem operasi atau bukti visual PDF.

## Integritas seluruh arsip

Inventaris berisi **496 berkas**, total **18.867.067 byte** setelah diekstrak. Seluruh **495 entri SHA256SUMS cocok**; SHA256SUMS sendiri dikecualikan dari daftar yang menghitung dirinya. Tidak ada berkas tak terdaftar. Sidik jari sumber dan pohon `dist` cocok dengan manifest yang disertakan:

- Candidate RC5: `9263951462ed4545e626a877f3ff196d6db5ff2e427585330972da4e8e9551a3`.
- Dist produksi RC5: `0987e2ef814b844374f84b2ff26a5be4b4c675fc2dff12423e9cea0a7b69a1cd`.
- `node scripts/verify-static-release.mjs dist`: lulus, 180 berkas, 9.639.401 byte, berkas terbesar 1.513.070 byte.

Pemeriksaan hash seluruh berkas membuktikan konsistensi paket dengan manifestnya; tidak membuktikan bahwa log historis benar atau semua perilaku aplikasi bebas masalah. Pengujian exact TXT di atas justru menunjukkan celah yang tidak tercakup bukti lama.

| Kelompok | Jumlah |
|---|---:|
| Source (`src`) | 60 |
| Skrip (`scripts`) | 16 |
| Tes (`tests`) | 67 |
| Fixture (`fixtures`) | 37 |
| Build (`dist`) | 180 |
| Dokumen (`docs`, termasuk riwayat) | 37 |
| Bukti RC5 (`evidence`) | 71 |
| Contoh keluaran (`examples`) | 4 |
| Aset/panduan publik (`public`) | 6 |
| Metadata dependensi/lisensi (`release`) | 2 |
| Berkas root | 16 |

Rincian per berkas ada pada `independent-inventory.json`. Kedalaman pemeriksaan dicatat jujur: inventaris/hash seluruh berkas; pencarian pola seluruh source/scripts/tests; pembacaan manual terarah pada 32 berkas utama. Seluruh kode vendor, setiap baris 11.731 baris TypeScript, seluruh halaman PDF historis, dan setiap kombinasi browser **tidak** dinyatakan telah diaudit manual satu per satu.

## Temuan prioritas

### RC6-A01 — Tinggi: delimiter ter-escape tidak masuk pemindai matematika

**Bukti:** `src/core/math.ts:128–153`; `baseline-probe.json`, kasus `userExact`.

Pemindai hanya masuk cabang kurung matematika ketika sebuah backslash langsung diikuti `(` atau `[`. Pada sumber pengguna, delimiter memiliki dua backslash aktual, seperti `\\(\theta\\)` dan `\\[ ... \\]`. Cabang escape melewati dua karakter sehingga pasangan tersebut tidak pernah menjadi `MathSpan`. Rumus tetap menjadi teks biasa setelah Markdown menginterpretasikan escape.

TXT juga memiliki **46 pemisah baris dengan tiga backslash**, **dua empat-backslash sebelum jarak baris opsional**, serta **enam `\_`**. Mengganti seluruh `\\` menjadi `\` secara global dapat merusak pemisah baris LaTeX, contoh kode, jalur, dan literal. Perbaikan harus mengidentifikasi lapisan escape hanya pada rentang formula yang terbukti dan mempertahankan sumber mentah.

**Penerimaan:** 231 formula dari exact TXT, tanpa formula tambahan/duplikat; urutan dan mode 103 inline/128 display sesuai; tidak ada TeX mentah tertinggal di prosa; keenam subskrip serta baris `aligned` diverifikasi semantiknya; code fence, inline code, mata uang, path dan URL tetap literal.

### RC6-A02 — Tinggi: status Siap palsu ketika detektor melewatkan semua rumus

**Bukti:** `src/core/preflight.ts:160–197`; `src/core/integrity.ts:137–155,332–348`; `baseline-probe.json`.

Preflight menganggap kategori core sudah diperiksa setelah render selesai. Ketiadaan issue matematika tidak dibedakan dari ketiadaan formula yang terdeteksi. Oracle integritas memakai parser yang sama untuk model ekspektasi dan model keluaran. Karena kedua jalur sama-sama membaca matematika sebagai teks, integritas lulus tanpa membuktikan bahwa formula dirender.

**Penerimaan:** statistik rumus/normalisasi dan issue yang dapat ditindaklanjuti; pemeriksaan sisa delimiter atau struktur matematika yang mencurigakan di luar kode; oracle fixture independen untuk jumlah, mode, isi TeX dan urutan. Jangan melemahkan pengujian literal hanya agar hasil hijau.

### RC6-A03 — Tinggi: matematika dalam blok HTML langsung tidak dirender

**Bukti:** `src/core/render.ts:446–467`, `src/core/markdown.ts:57–106`; `src/core/integrity.ts:137`; probe `rawDiv`, `rawP`, `rawHtmlTable`.

Masukan `<div>\[x^2+y^2=1\]</div>`, `<p>Formula \(E=mc^2\) ends.</p>` dan tabel HTML langsung masing-masing memiliki satu span terdeteksi tetapi **nol formula dirender**, tanpa issue matematika. Pemulihan matematika literal tersedia di jalur HTML clipboard, bukan jalur Markdown berisi HTML blok. HTML non-tabel dilewatkan oracle keutuhan. HTML tabel dibandingkan sebagai teks mentah, sehingga kasus ini juga lulus integritas.

Contoh satu baris `<box gap={2}>\[x^2+y^2=1\]</box>` merupakan kontrol positif: menghasilkan satu formula dan issue pembungkus yang dilepas. Jadi tidak tepat menyatakan semua tag `<box>` selalu gagal; jenis blok dan posisi baris memengaruhi parsing.

**Penerimaan:** jalur impor berkas, tempel teks, HTML clipboard, pratinjau, HTML mandiri, dan cetak harus menghasilkan semantik formula sama untuk HTML aman. Elemen kode (`pre`, `code`, `kbd`, `samp`), atribut URL dan skrip tetap tidak dianggap rumus. Bila sebuah bentuk belum didukung, laporkan sebagai perlu diperiksa.

### RC6-A04 — Sedang: sumber matematika dalam atribut data diabaikan

**Bukti:** `src/core/clipboard.ts:226–252`; probe `dataLatex`, `dataTex`.

`<span data-latex="x^2">x2</span>` dan padanan `data-tex` menjadi `x2` tanpa rumus dan tanpa diagnostic. Anotasi MathML sudah didukung, tetapi tidak seluruh representasi sumber TeX yang umum pada HTML.

**Penerimaan:** pemulihan atribut TeX yang eksplisit pada elemen matematika, hanya sekali, dengan asal sumber tercatat. Atribut yang mengandung markup aktif tetap data dan tidak boleh menjadi HTML tepercaya.

### RC6-A05 — Sedang: mode display MathJax salah dan kehilangan sumber tidak selalu didiagnosis

**Bukti:** `src/core/clipboard.ts:227`; probe `mathJaxDisplay`, `mathJaxNoTex`.

`<mjx-container display="true">` yang memiliki anotasi TeX dikonversi menjadi inline `$x^2$` karena deteksi hanya memeriksa nilai `block`. Kontainer MathJax tanpa anotasi menjadi `x2` tanpa peringatan, sementara KaTeX/MathML tanpa TeX mempunyai diagnostic khusus.

**Penerimaan:** `display=true`, `display=block`, kelas display dan penanda inline dikenali berdasarkan formatnya; rumus tanpa sumber TeX mendapat peringatan dan tidak diklaim setara dengan sumber matematika.

### RC6-A06 — Sedang: korpus lama tidak mewakili masukan nyata ini

**Bukti:** `fixtures/trigonometry/trigonometry.md` hanya 1.488 byte; `fixtures/trigonometry/expected.json` dan `evidence/rc5/math/README.md` mencatat 21 rumus sintetis. Naskah pengguna 15.280 byte dan 231 rumus dengan escape berbeda.

Gate B pada laporan RC5 harus dibaca sebagai lulus untuk korpus yang diuji. Ia tidak membuktikan seluruh teks AI atau materi trigonometri lengkap pengguna sudah didukung.

**Penerimaan:** simpan exact input sebagai fixture regresi; hasil sebelum/sesudah dan mode setiap formula; keluaran HTML mandiri nyata serta PDF dari jalur paginasi final; pemeriksaan visual persamaan panjang, tabel, subskrip dan pergantian halaman.

### RC6-A07 — Batas dukungan: varian format lain perlu kontrak yang jelas

Probe `mathFence` dan `bareAlign` menunjukkan fenced `math` serta `\begin{align}...\end{align}` tanpa delimiter saat ini hanya kode/teks, tanpa diagnostic. Ini bukan kerentanan; merupakan ketidaklengkapan kontrak format terhadap target lintas AI. `latex`/`tex` di dalam code fence dapat memang dimaksudkan sebagai contoh kode, sehingga jangan mengubah semua fence secara diam-diam.

`src/core/render.ts:592` hanya mendeteksi token sitasi `cite...`, belum keluarga `genui`, `filecite`, atau `url`. Sumber tanpa metadata URL tidak boleh direkonstruksi menjadi tautan karangan.

`src/core/sanitize.ts:17` membuang SVG, MathML mentah, canvas dan widget aktif dari jalur HTML. SVG sebagai aset unggahan mempunyai sanitizer tersendiri (`src/core/assets.ts:99`). Gambar/widget yang tidak ikut clipboard tidak bisa dibuat kembali dari judulnya. Perlu membedakan teks/Markdown yang berhasil diproses, diagram statis yang tersedia, dan komponen UI yang tidak tersedia.

## Keamanan, ekspor dan kemasan yang perlu dipertahankan

Pembacaan kode menemukan pertahanan yang relevan dan sebaiknya tidak dilonggarkan untuk mengejar kompatibilitas:

- `renderTex` memakai `trust:false`, `throwOnError:true`, `maxExpand:1000`, `maxSize:50`, dan batas 10.000 karakter formula. Kegagalan menghasilkan sumber yang di-escape, bukan eksekusi.
- HTML pengguna melalui sanitasi HAST dan DOMPurify. URL aktif/handler dibuang dengan issue. Formula yang dihasilkan KaTeX dimasukkan setelah sanitasi; karena itu sumber TeX harus selalu tetap melalui renderer terbatas tersebut.
- ZIP divalidasi sebelum inflate: path, duplikat, symlink, metode, ukuran, rasio, serta CRC. Masukan berlebih ditolak utuh.
- Build menyertakan Worker, font lokal, notice lisensi, CSP dan halaman cetak. Verifikator statis memastikan tidak ada endpoint backend/QA hook dalam build produksi.
- Data mentah/riwayat tersedia di proyek; ekspor memakai snapshot/revisi yang terikat. UI PDF meminta dialog cetak; aplikasi tidak mengetahui apakah pengguna menyimpan atau membatalkan PDF.

Pemeriksaan ini tidak menyatakan seluruh dependency bebas kerentanan. `npm-audit.json` yang disertakan melaporkan nol advisory pada saat pembuatannya; SBOM mencatat 438 komponen (255 runtime). Tidak dilakukan audit jaringan dependency baru oleh pemeriksa independen ini.

## Status bukti lama yang tidak boleh dibawa sebagai klaim final baru

`docs/RELEASE_REPORT.md` sendiri menyatakan RC5 hanya layak staging. Gate PDF/jenis font gagal pada empat contoh emoji; pengujian Firefox/WebKit belum tersedia. Berkas bukti deployment mencatat URL publik melayani RC4 saat 21 November 2026 pukul 12:34:48 UTC. Ini **catatan historis di dalam ZIP**, bukan hasil memeriksa situs publik sekarang. Deploy kandidat baru memerlukan verifikasi ulang setelah pengguna mengunggahnya.

## Rujukan teknis primer

- CommonMark, backslash escapes dan HTML blocks: https://spec.commonmark.org/0.31.2/#backslash-escapes ; https://spec.commonmark.org/0.31.2/#html-blocks . Semantik escape berbeda menurut konteks; raw HTML/code tidak diperlakukan seperti prosa Markdown.
- KaTeX auto-render: https://katex.org/docs/autorender . Deteksi delimiter terpisah dari render KaTeX, memakai mode display per pasangan, dan mengecualikan tag kode.
- Opsi KaTeX: https://katex.org/docs/options . LaTeX tidak valid atau perintah tidak didukung dapat melempar error; batas macro/ukuran dan `trust` adalah bagian dari pengendalian input.

Dokumentasi tersebut dibuka pada sesi audit ini. Hasil fungsi dan angka pada laporan berasal dari file lokal serta instrumen di atas, bukan disimpulkan dari dokumentasi pihak ketiga.

## Pemeriksaan tambahan terhadap kandidat RC6

Bagian ini merekam source kandidat setelah perbaikan tim; bagian RC5 di atas tetap merupakan hasil baseline. Pemeriksa independen tidak mengubah kode aplikasi. Ia menambahkan `tests/unit/core/rc6-independent.test.ts` sesuai penugasan, serta instrumen/bukti di direktori audit.

Review RC6 membaca perubahan `math-copy.ts`, `markdown.ts`, `render.ts`, `math-diagnostics.ts`, `html-math.ts`, `html-math-source.ts`, `clipboard.ts` dan jalur ekspektasi tabel pada `integrity.ts`. Pemeriksaan ini menemukan regresi nyata berikut, yang kemudian diperbaiki oleh pemilik kode:

| Temuan source kandidat sebelum perbaikan review | Dampak | Hasil pengulangan setelah perbaikan |
|---|---|---|
| Pemulihan raw HTML ikut membaca ulang teks Markdown di antara tag inline; escape yang sudah dibuka CommonMark menjadi formula | Literal seperti dolar yang sengaja di-escape berubah menjadi rumus; pemeriksa integritas menolak ekspor | VERIFIED unit/jsdom. Empat kasus literal di `span`, `strong`, `em` mempertahankan teks dan nol formula. `render.ts:460–487` membedakan rentang HTML blok dari HTML inline. |
| Pencarian anotasi pertama pada pembungkus generik `.math` mengambil satu formula lalu membuang prosa, kode dan formula lain | Kehilangan konten diam-diam saat clipboard dan HTML langsung | VERIFIED unit/jsdom. Kedua formula dan prosa awal/akhir tetap ada; kode tetap literal. `html-math-source.ts:54–98` membatasi satu representasi formula dan meneruskan pembungkus campuran. |
| Setelah kedua formula berhasil dipulihkan, serializer menulis pasangan inline yang berdampingan sebagai `$a$$b$` | Delimiter tengah menjadi ambigu; formula bisa kembali tidak terbaca | VERIFIED unit/jsdom. `clipboard.ts:229–239` memakai delimiter kurung yang tidak ambigu pada formula berdampingan, tanpa menambah spasi pada konten. |
| Pemindaian teks pada pembungkus HTML mendahului pemulihan `data-latex`; teks visual lama mengalahkan sumber eksplisit | Source metadata `x+1` dapat salah menjadi formula visual `y+2` | VERIFIED unit/jsdom. `render.ts:477` mengecualikan formula bersumber eksplisit dari pemulihan teks literal; tes memeriksa sumber eksplisit menang. |

Tes independen akhir: **23 lulus, 0 gagal**, satu berkas pengujian. Perintah aktual:

```sh
npx vitest run tests/unit/core/rc6-independent.test.ts --reporter=json --outputFile=../audit/rc6-independent-final.json
npx oxlint -c .oxlintrc.json --deny-warnings tests/unit/core/rc6-independent.test.ts
```

Lint berkas tes keluar dengan kode 0. Tes juga memeriksa formula raw HTML tidak digandakan, urutan/mode tetap benar, atribut slot palsu tidak memperoleh kepercayaan, skrip/handler/URL aktif tidak masuk HTML hasil, TeX dengan URL berbahaya tetap data, code fence/inline code/currency/URL tidak diproses sebagai formula, dan sumber TeX asli tersimpan terpisah dari payload tampilan yang dipulihkan. Mutasi tanda `+` menjadi `-` terdeteksi pada prosa Markdown, tabel Markdown, tabel HTML literal dan tabel HTML dengan metadata TeX. Ini merupakan pengujian struktur/semantik sumber di jsdom, bukan klaim bahwa kode berbahaya pernah dieksekusi dalam browser nyata.

### Oracle masukan nyata yang independen dari parser aplikasi

`independent-formula-oracle.json` dibangun dari ekstraksi regex khusus **exact input** dan penguraian pola transport yang ditemukan; ia tidak memanggil pemindai atau fungsi normalisasi aplikasi. Instrumen `run-independent-oracle.mjs` dapat dijalankan dari direktori kerja mana pun dengan empat argumen path, memakai dependensi yang sudah terpasang pada proyek:

```sh
node audit/run-independent-oracle.mjs paperforma_rc6 paperforma_rc6/fixtures/rc6/user-trigonometry.md audit/independent-formula-oracle.json audit/rc6-independent-oracle.json
```

Hasil aktual terakhir: hash masukan cocok; **231 formula** terdiri dari **128 display dan 103 inline**; **231 elemen KaTeX**, **0 parse error**, **0 perbedaan** pada payload asli, payload render, anotasi KaTeX dan mode setiap formula. Ditemukan **17 payload yang dipulihkan**, **46 run tiga-backslash**, **dua run empat-backslash**, dan **enam subskrip braced yang di-escape**. Integritas hasil asli lulus; mutasi sengaja pada metadata satu formula ditolak.

`rc6-independent-final.json` menyimpan hasil tes, `rc6-independent-oracle.json` menyimpan hasil oracle. Berkas `rc6-independent-initial.json` dan `rc6-independent-postfix.json` adalah bukti tahap yang memang masih gagal; jangan menggabungkannya sebagai hasil final. Sumber aplikasi dapat terus berubah setelah pengulangan ini, sehingga verifikasi build final tetap tugas integrator.

### Batas yang tetap perlu disebutkan

Belum ada verifikasi visual browser, clipboard sistem operasi, pagination, atau PDF oleh pemeriksa independen ini. Instrumen oracle hanya menguji formula yang muncul pada fixture; ia tidak membuktikan bahwa matematika yang ditulis pengguna benar.

`integrity.ts:161–179` masih melewatkan HTML mentah non-tabel dari perbandingan blok. `math-diagnostics.ts:23` mendeteksi daftar perintah TeX, bukan setiap pasangan delimiter yang mungkin tertinggal. Contoh sintetis formula yang terputus oleh link HTML (`x`, link, lalu `+y` di dalam delimiter) dipertahankan sebagai teks karena pemulihan tidak boleh melintasi batas link; tanpa perintah TeX yang dikenali, diagnostic residual belum memberi peringatan. Karena itu, status Siap tidak boleh dipromosikan sebagai bukti universal bahwa seluruh format dari seluruh AI, widget visual tanpa sumber, atau setiap HTML mentah sudah ekuivalen dengan sumber asli.
