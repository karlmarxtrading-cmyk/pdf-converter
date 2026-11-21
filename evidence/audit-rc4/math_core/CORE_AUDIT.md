# Audit core PaperForma RC3 dan perbaikan RC4

Tanggal: 21 November 2026. Lingkup: parser Markdown/HTML/percakapan, matematika, integritas isi, pratinjau inti, preflight aset, batas struktur, dan hotspot CPU. Ini laporan domain pendukung; hasil rilis final dan seluruh pengujian aplikasi dikelola integrator.

## Kesimpulan

RC3 sudah mampu merender rumus trigonometri literal dalam tabel sederhana. Kontrol `\\(\\sin\\theta=...\\)` yang menyerupai tangkapan layar lulus pada kode RC3. Karena itu, tangkapan layar saja tidak membuktikan bahwa ZIP RC3 yang sama sudah berjalan pada deployment pengguna. Riwayat percakapan sebelumnya memang menunjukkan ketidakcocokan versi deployment. Temuan berikut tetap merupakan cacat kode RC3 yang direproduksi terpisah, sehingga memperbaiki deployment saja belum menyelesaikan seluruh mutu mesin.

Sebelas dari 15 pemeriksaan regresi pembacaan yang sama gagal pada salinan baseline RC3, sedangkan empat kontrol lulus. Setelah perbaikan, korpus regresi diperluas menjadi 21 pemeriksaan dan semuanya lulus; bersama Einstein, konversi HTML, percakapan, dan regresi portabilitas, 62 pemeriksaan pada lima berkas lulus. Tambahan terakhir menguji admission gambar inline: sebelum perbaikan enam kasus gagal dan dua kontrol lulus; setelah perbaikan seluruh 13 kasus admission, 21 kasus pembacaan, dan 22 regresi statis lulus (56 total pada tiga berkas). Ini bukti Node/jsdom, bukan bukti clipboard sistem operasi, browser hidup, atau dialog PDF native.

## Cakupan berkas

`coverage.csv`/`coverage.json` mencatat hash dan cakupan 18 modul: 17 modul yang sudah ada termasuk indeks API dan peninjauan tambahan `assets.ts`, ditambah `src/core/html.ts`. Seluruh modul penugasan diperiksa: math, markdown, clipboard, render, conversation, chars, integrity, offsets, preflight, repair, sanitize, wrapper, util, contracts, limits. Tes core lama dijalankan, dan tes baru menguji hasil yang dilihat pemakai serta keutuhan sumber, bukan sekadar nama fungsi. Pemeriksaan test suite tidak berarti setiap baris setiap berkas tes diulas manual.

Berkas aplikasi asli di `original/repository` tidak dimodifikasi. Pengujian baseline memakai salinan kerja baseline dengan berkas regresi tambahan; kode aplikasi baseline tetap RC3. Bukti original-build identik dikelola integrator. Laporan ini tidak mengklaim semua 520 entri ZIP berada dalam lingkup reviewer domain core; cakupan font, PDF, UI, penyimpanan, build, dan seluruh inventaris digabungkan pada laporan utama.

## Temuan dan koreksi

| ID | Tingkat | Bukti sebelum | Koreksi dan hasil |
|---|---|---|---|
| RC4-M01 | P2 | Rumus literal dalam caption/tabel HTML dengan colspan menghasilkan nol rumus | Baca delimiter pada HAST sebelum serializer Markdown; tabel kompleks menyimpan TeX dalam elemen data aman. Dua rumus, mode, struktur, serta integritas terpelihara. |
| RC4-M02 | P2 | Delimiter yang terpisah oleh strong/em menghasilkan nol rumus | Pemindai menggabungkan rangkaian teks dalam pembungkus inline aman; markup di luar rentang rumus tetap utuh. Tidak menggabungkan batas kode, gambar, tautan atau blok. |
| RC4-M03 | P2 | Label tautan yang berisi TeX tetap mentah | Label tautan diperiksa sendiri; URL dan rumus keduanya dipertahankan. |
| RC4-M04 | P2 | Display math dalam sel tabel atau penekanan menjadi inline | Mode display dipropagasikan pada seluruh keturunan phrasing, bukan hanya anak langsung paragraf. |
| RC4-M05 | P1 | Kode berindentasi dapat berubah dari `\\(x\\)` menjadi `$x$`; AST juga dapat memuat sentinel yang bukan isi asli | CommonMark tetap menentukan blok kode; nilai literal yang tersentuh salinan parse dipulihkan dari parse sumber tanpa masking. Jalur biasa tetap satu parse. |
| RC4-M06 | P1 | HTML pre/code dengan contoh TeX dapat berubah delimiter | Scanner melompati isi literal pre/code/kbd/samp. Kode asli tidak dirender sebagai matematika atau dijalankan. |
| RC4-M08 | P2 | Aset bernama `price$1.png` dianggap hilang oleh preflight dan lookup render | Pulihkan sentinel dolar sebelum resolusi aset, termasuk referensi/alt/raw HTML pada preflight. |
| RC4-M09 | P2 | Tabel HTML dengan `\\left|x\\right|` atau matriks multibaris tidak terjaga sebagai rumus utuh | Bentuk tabel tersebut dipertahankan sebagai tabel HTML aman dengan sumber TeX tersimpan, menghindari konflik pemisah kolom GFM. |
| RC4-I01 | P2, validator | Mengubah URL tautan pada tabel HTML tanpa mengubah label tetap dinyatakan utuh | Signature tabel kini membandingkan URL tautan dan referensi gambar secara berurutan, selain caption, grup baris, sel, colspan/rowspan, dan isi. Penghilangan gambar juga dideteksi. Ini celah pemeriksa yang diperbaiki; bukan klaim renderer sebelumnya benar-benar mengganti URL. |
| RC4-R01 | P1, ketersediaan | Sekitar 20 KB HTML dengan 1.800 div bersarang melempar RangeError sebelum hasil konversi dapat dikembalikan | parse5 membangun tree, kemudian pemeriksaan iteratif menolak kedalaman >256 atau node >400.000 sebelum konversi rekursif ke HAST. Template content ikut diperiksa. Tidak ada pemotongan sumber. |
| RC4-R02 | P1, ketersediaan | Data URL inline dengan header PNG yang mengklaim 100.000×100.000 piksel tetap diterbitkan sebagai img; gabungan enam gambar 36 MP juga lolos jalur render | Ukuran base64 diperiksa sebelum dekode, magic MIME dan dimensi header diverifikasi, maksimum 16.384 piksel per sisi / 40 MP per gambar. Total unik 200 MP digabung dengan aset unggahan dan seluruh pesan percakapan. Pelanggaran menjadi placeholder dan issue blocking sebelum img mencapai DOM. Tidak diperlukan dekode raster nyata atau OOM untuk mereproduksi. |

`RC4-M07` adalah kontrol matriks yang sudah lulus, bukan temuan cacat. `RC4-M10` adalah perlindungan tambahan untuk kode, delimiter sengaja di-escape, dan input aktif; reviewer silang menemukan regresi kbd/samp pada implementasi awal RC4 dan regresi itu diperbaiki sebelum pembekuan. Jangan menghitung kontrol dan regresi sementara sebagai cacat original RC3.

### Catatan implementasi

- `clipboard.ts`: `protectHtmlLiteralMath` menyimpan struktur di luar rentang rumus. Teks pembungkus dan offset kumulatif di-cache; pencarian rentang memakai binary search supaya tidak mengulang pemindaian saudara dari awal untuk setiap rumus. Escaping global tidak digunakan.
- `markdown.ts`: `restoreLiteralNodes` menjaga sampel kode dan HTML asli; `promoteDisplayMath` menangani tabel, label tautan, dan penekanan.
- `math.ts`: pre/code/kbd/samp tidak ditransformasi; batas akhir paragraf diprakomputasi.
- `preflight.ts` dan `render.ts`: sumber referensi dipulihkan sebelum lookup. `preflight` memakai parser HTML yang sudah melewati admission yang sama.
- `integrity.ts`: signature sumber tidak mempercayai atribut internal yang dipalsukan pengguna; signature keluaran memakai referensi asal yang benar. Lookup identitas blok menggunakan Set.
- `assets.ts`: `inspectInlineImage` membaca byte base64 terbatas tanpa Image/canvas/bitmap. SHA-256 isi dipakai untuk deduplikasi dengan aset unggahan; hasil header di-cache pada render lokal maksimum 256 entri / sekitar 2 MiB string referensi. Total pixel berada dalam satu context, sehingga batas tidak di-reset per pesan. Pemeriksaan resource ini bukan decoder gambar lengkap.
- `html.ts`: parsing fragment memakai opsi yang sama dengan rehype-parse, `scriptingEnabled:false` dan lokasi sumber. `VFile` mempertahankan offset percakapan. Raw HTML campuran pada render mendapat admission atas serialisasi seluruh HAST sebelum rehypeRaw, sehingga opening/closing tag yang berada di node terpisah tetap dihitung bersama. Markdown biasa tidak mendapat parse HTML tambahan ini.

## Performa: ruang lingkup dan hasil

Tiga hotspot diperbaiki:

1. RC4-P01: KaTeX untuk TeX dan mode display yang sama dipakai ulang dalam satu pekerjaan render. Maksimum 256 entri dan 1.048.576 unit UTF-16 untuk key/markup/error, kira-kira 2 MiB payload string. Cache dibuang setelah pekerjaan; tidak disimpan antarproyek. Pengaturan KaTeX tetap konstan (trust false, batas expansion, batas size), sehingga key memuat seluruh opsi yang bervariasi, yaitu TeX dan mode display.
2. RC4-P02: keanggotaan ID pada pemeriksaan keutuhan memakai Set, menghilangkan pencarian semua blok untuk setiap blok keluaran.
3. RC4-P03: baris harga dengan banyak `$` tidak memindai seluruh sisa paragraf setiap kali mencari batas akhir. Batas dihitung sekali dari belakang.

Uji mikro berpasangan awal menghasilkan median 135,8 -> 74,2 ms untuk 400 rumus berulang; 781,6 -> 8,54 ms untuk keanggotaan 8.000 blok; 678,6 -> 16,55 ms untuk 10.000 baris mata uang. Semua hasil serial yang dibandingkan sama pada sembilan sampel tiap versi. Ini hasil sebelum admission kedalaman terakhir; integrator akan mengulang runner pada kandidat final, sehingga angka final harus diambil dari bukti akhir integrator. Jangan menggunakan angka ini sebagai janji kecepatan seluruh aplikasi, browser, jaringan, paginasi, atau PDF.

Runner: `node tests/bench/core-reading.mjs /path/baseline /path/output.json`. Warm-up satu kali per versi, sembilan pasangan AB/BA bergantian, input sama, hash keluaran dibandingkan. Pada n=9, p95 empiris adalah sampel maksimum; bukan estimasi tail latency populasi yang kuat.

## Bukti aktual

- `before-reading.txt`: reproduksi awal 7 gagal / 3 lulus.
- `baseline-final-regressions.txt`: salinan baseline RC3 menjalankan 15 kasus identik yang kemudian dikembangkan; 11 gagal / 4 lulus.
- `before-code-variants.txt`: menunjukkan perubahan delimiter kode berindentasi dan raw HTML sebelum koreksi bagian tersebut.
- `before-image-render.txt`: gambar dolar belum ditemukan pada lookup render sebelum perbaikan.
- `before-raw-table-integrity.txt`: injeksi perubahan URL lolos pemeriksa lama. Seleksi `-t RC4-I01` sengaja menjalankan kasus itu saja untuk reproduksi; suite final tidak memakai skip tersebut.
- `depth-probe.json`: RangeError pada 1.800 div sebelum koreksi parser-admission.
- `final-focused.txt`: 62/62 pemeriksaan, lima berkas. Perintah: `npx vitest run tests/unit/core/rc4-reading-regressions.test.ts tests/unit/core/math-einstein.test.ts tests/unit/core/portable-regressions.test.ts tests/unit/core/wrapper-clipboard.test.ts tests/unit/core/conversation.test.ts --reporter=verbose`.
- `typecheck-final.txt` dan `lint-final.txt`: typecheck dan lint domain lulus sebelum patch gambar inline.
- `before-inline-image-budget.txt`: enam gagal / dua kontrol lulus sebelum admission inline.
- `after-inline-image-budget.txt`: 56/56 pemeriksaan pada tiga berkas, termasuk 13 admission gambar. Perintah: `npx vitest run tests/unit/core/inline-image-budget.test.ts tests/unit/core/static-regressions.test.ts tests/unit/core/rc4-reading-regressions.test.ts --reporter=verbose`.
- `typecheck-inline-image.txt` dan `lint-inline-image.txt`: typecheck dan lint sesudah patch gambar inline lulus. Seluruh gate final tetap dijalankan integrator sesudah pembekuan.
- `../render_exports/core-cross-depth-after.json`: reviewer silang menjalankan tiga entrypoint pada 1.800/4.000/8.000 nesting, termasuk template.content: penolakan budget benar, kontrol 64 level diterima, tidak ada RangeError.
- `../render_exports/core-cross-raw-table.json`: rujukan gambar lokal/data/eksternal, fragment, javascript yang diblokir, atribut internal palsu, serta matriks multibaris diperiksa ulang.
- `performance-interim.json` dan `performance-final.json`: hasil mikro sementara sebelum pembekuan final; perhatikan cakupan waktu di atas.

## Lokasi implementasi utama

Lokasi saat pembekuan domain: `clipboard.ts:71` (rentang literal HTML), `markdown.ts:60` (kode literal) dan `:91` (mode display), `math.ts:72` (batas paragraf), `integrity.ts:49` (signature tabel), `html.ts:11` (parse admission), `limits.ts:129` (tree budget), `assets.ts:210` (header data-image), `render.ts:331` (penolakan img sebelum DOM), `render.ts:648` (akumulasi aset/perpesan). Nomor baris merupakan bantuan reviewer, bukan kontrak API.

## API dan dependensi

API pemakai yang ada tetap: `htmlToMarkdown`, `renderBody`, `parseMarkdown`, `assetPreflight`, `parseClipboardConversation`. Penolakan kedalaman menggunakan `BUDGET_EXCEEDED`/`BudgetError` yang sudah ada. `Limits` memperoleh `maxNesting`, `BudgetKind` memperoleh `nesting`. Fungsi baru internal-modul: `checkTreeBudget`, `assertTreeBudget`, `parseHtmlWithinBudget`, `checkHtmlBudget`, `inspectInlineImage`; tidak ditambahkan pada façade `core/index.ts`.

Tiga dependensi yang tadinya transitif kini dinyatakan langsung pada versi yang sudah dikunci: parse5 8.1.1, hast-util-from-parse5 8.0.4, vfile 6.0.3. Perbandingan package-lock dengan original: nol paket baru terpasang dan nol perubahan versi paket terpasang. Ini memperjelas kontrak impor tanpa menambah mesin lain atau memerlukan layanan eksternal.

## Batas yang tetap perlu dinyatakan

- HTML atau rumus tanpa sumber TeX yang dapat dipercaya tidak selalu dapat direkonstruksi menjadi persamaan yang sama. MathML tanpa annotation/alttext TeX dan KaTeX tanpa annotation masih memerlukan tinjauan. Perintah di luar KaTeX ditampilkan sebagai sumber dengan temuan kesalahan.
- Canvas/iframe/widget interaktif yang hanya tersalin sebagai teks tidak membawa gambar, geometri, atau keadaan interaktifnya. Baris seperti “Drag point P” dan “Beri masukan” tidak dihapus atau diganti dengan diagram karangan. Korpus trigonometri adalah transkripsi sintetis dari screenshot, bukan berkas sumber asli dan bukan bukti clipboard nyata.
- Raw HTML di luar tabel mempunyai cakupan pemeriksaan keutuhan yang lebih terbatas daripada Markdown; sumber tetap disimpan dan sanitasi dilaporkan. Signature raw-table kini memeriksa URL/ref gambar, tetapi mutasi atribut alt/title saja belum masuk oracle tersebut. Reviewer tidak menemukan bukti bahwa renderer melakukan mutasi itu; ini batas pemeriksa.
- Penolakan kedalaman/node menghindari stack overflow pada kasus terukur. Ini tidak membuktikan setiap input yang sah di bawah 5 MiB akan cepat pada semua perangkat.
- Admission gambar inline kini memeriksa PNG/JPEG/GIF/WebP tanpa dekode raster. Batas pixel dari header bukan batas penggunaan memori pasti: frame animasi, overhead decoder, SVG unggahan, gambar eksternal dengan izin, dan kemampuan perangkat tidak semuanya direpresentasikan sebagai satu ukuran pixel header. Tidak dilakukan percobaan OOM dan tidak ada jaminan 200 MP aman pada setiap perangkat.
- Semantik tulisan, fakta, kebenaran matematika, kesamaan rendering browser lintas mesin, font universal, serta PDF native tidak dibuktikan hanya oleh tes core. Keluaran KaTeX dipastikan berasal dari TeX yang sama; itu bukan pemeriksaan benar-salah persamaan.

Status seluruh koreksi utama di atas: VERIFIED pada unit/integrasi Node/jsdom dan review silang yang disebutkan. Status browser/clipboard/PDF native pada domain ini: NOT VERIFIED. Tidak ada klaim production ready tanpa pemeriksaan hasil final integrator.


## Penutupan akuntansi sumber tes

Pada tahap final, seluruh 1.170 baris original `tests/e2e/scenarios.mjs` dan seluruh 13 berkas unit core yang belum tercatat dibaca lengkap (14 berkas, 181.957 byte, 2.602 baris). Hash dan cakupan tersedia di `manual-test-review.json`; penilaian assertion dan batasnya di `TEST_SOURCE_REVIEW.md`.

Atas instruksi integrator, hanya harness kandidat diperketat: reset IndexedDB menolak kegagalan, cleanup E14 menutup halaman yang dipertahankan beforeunload, E05 membandingkan isi/font/script ekspor luring, E13 membuktikan 26 revisi dan pemulihan tepat, E17 mewajibkan fokus kembali, E27 menyebut emulasi viewport/DPR secara jelas. `node --check` dan lint lulus. Browser tetap NOT_RUN; kelemahan assertion tidak dihitung sebagai cacat runtime baru. Tidak ada perubahan aplikasi pada tahap ini.
