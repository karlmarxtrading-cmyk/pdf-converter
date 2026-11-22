# Cakupan dukungan RC6

RC6 memperbaiki parser dan impor matematika pada input nyata pengguna. Keputusan dan hasil pengujian ada di [laporan rilis](RELEASE_REPORT.md). Dukungan lintas AI berarti mengenali format salinannya; tidak ada jaminan semua widget, seluruh sintaks dan semua browser dapat dipulihkan sempurna.

## Format dan matematika

| Masukan | Perilaku RC6 | Batas |
|---|---|---|
| Markdown/GFM | Judul, daftar, tabel, kutipan, kode, tautan, gambar, catatan kaki | Isi tetap mengikuti sintaks sumber; teks ambigu tidak selalu dapat ditebak |
| TeX ber-delimiter | `$…$`, `$$…$$`, `\(…\)`, `\[…\]`; inline GitHub dollar/backtick | Perintah harus didukung KaTeX |
| Salinan delimiter ganda | Pasangan `\\(…\\)` / `\\[…\\]` dipulihkan jika menyerupai matematika | Heuristik terbatas; sumber asli dan catatan pemulihan disimpan |
| Blok `math` | Dirender sebagai rumus display | Blok `latex`/`tex` tetap kode literal agar contoh sintaks tidak berubah |
| HTML yang menyimpan TeX | Anotasi KaTeX/MathJax, atribut sumber, MathML ber-sumber TeX | Bukan konversi umum semua MathML/gambar rumus menjadi LaTeX |
| HTML literal | Rumus dalam blok HTML, tabel, wrapper inline aman | Batas semantik seperti tautan dapat memutus pemulihan satu formula |
| Clipboard | Teks/HTML, tabel ber-merge, sumber rumus dan mode display | Pengujian fixture tidak menyertifikasi clipboard OS/provider nyata |
| File lain | `.md`, `.markdown`, `.txt`, ZIP naskah/aset, `.pfproj`, gambar | Impor PDF, DOCX/ODT/RTF dan OCR belum didukung |

Sumber mentah tidak ditulis ulang. Pemulihan baris matriks, subskrip dan perintah spasi hanya berlaku pada konteks salinan yang dikenali. Catatan `MATH_COPY_RECOVERED`/`CLIPBOARD_MATH_RECOVERED` mencatat perubahan; pengguna perlu meninjau pemulihan isi rumus. KaTeX berjalan dengan `trust: false` dan batas ekspansi/ukuran. Perintah yang tidak didukung menghasilkan temuan dan sumber masih ditampilkan. Perbaikan sintaks tidak membuktikan kebenaran matematis rumus.

Pemeriksa sisa TeX mendeteksi sejumlah perintah umum dan memberikan `MATH_UNRENDERED_SOURCE`, tetapi bukan detektor semua ekspresi matematika. Rumus sederhana yang terpecah oleh batas HTML semantik dapat tetap literal tanpa peringatan ini. Parser tidak boleh mengubah setiap backslash atau setiap dolar dalam prosa, kode, URL dan mata uang.

## Keutuhan isi dan elemen AI

- Oracle independen menguji 231 rumus pada TXT asli, termasuk urutan, TeX asli, TeX hasil pemulihan, anotasi KaTeX dan mode inline/display. Ia juga harus menolak mutasi rumus yang disengaja.
- Pemeriksaan keutuhan aplikasi membandingkan blok yang didukung. Tabel HTML termasuk sumber rumus mendapat pemeriksaan, tetapi **raw HTML non-tabel berada di luar perbandingan blok terurut**. Alt/title gambar dalam seluruh varian raw-table belum tercakup sempurna.
- Wrapper presentasi AI yang dikenali dipertahankan sebagai teks/blok aman. Canvas, grafik interaktif, komponen proprietari atau bagian yang tidak masuk clipboard tidak dapat direkonstruksi dari labelnya. Skrip/atribut aktif tetap dibuang.
- Pemeriksaan bukan pemeriksaan fakta, ejaan atau pembuktian matematika. Peringatan tidak dihapus agar status menjadi hijau. Ekspor bisa lolos pemeriksaan wajib sambil tetap membawa catatan yang perlu ditinjau.

## Browser, PDF, font dan performa

- Pengujian RC6 yang berhasil adalah Node/jsdom, ekspor HTML melalui API aktual, font nyata, build statis dan HTTP lokal. **Pratinjau browser, paginasi aktual, clipboard OS dan PDF native RC6 belum diverifikasi.** Peluncuran/akses browser audit dibatasi lingkungan. Bukti RC5 tidak membuktikan RC6.
- Aplikasi menyiapkan halaman dengan Paged.js dan membuka dialog cetak. Aplikasi tidak menerima byte PDF final atau mengetahui apakah pengguna menyimpannya. Tidak ada sertifikasi PDF/A, PDF/UA, CMYK atau tagging aksesibel lengkap.
- Font bawaan mencakup Latin/Indonesia, Latin Extended, Vietnam, Yunani, Sirilik dan simbol KaTeX. Arab/RTL, CJK, Thai, Devanagari, emoji berwarna dan Private Use belum memiliki cakupan lengkap. Peringatan glyph tetap berlaku.
- Paginasi membutuhkan DOM dan berjalan pada thread utama. Worker menangani analisis, bukan seluruh layout. Benchmark RC4/RC5 bersifat historis; tidak ada klaim peningkatan kecepatan RC6 tanpa pengukuran baru.
- Batas 5 MiB teks, kedalaman struktur 256 dan admission ZIP/aset/proyek bukan jaminan kapasitas setiap perangkat. Input berlebih ditolak utuh. Gambar dibatasi 16.384 px/sisi, 40 MP/gambar dan 200 MP agregat; header valid tidak membuktikan semua byte/dekode aman atau murah.
- Pengujian aksesibilitas, Firefox/WebKit, pembaca layar, ponsel fisik, keamanan menyeluruh dan deployment produksi RC6 belum disertifikasi.

## Data dan operasi

IndexedDB terikat origin. Unduh cadangan `.pfproj` sebelum pindah domain, rollback atau membersihkan penyimpanan. Riwayat lama tidak dapat mengembalikan aset yang tidak pernah disimpan. Tanpa Worker, fallback memiliki jeda/deadline antar-fase; JavaScript sinkron tidak dapat dipreempt pada thread yang sama.

SBOM dan notice lisensi tetap disertakan. `npm audit` dan pemindaian pola rahasia adalah pemeriksaan pada saat audit, bukan jaminan bebas seluruh kerentanan. Tidak ada upgrade massal dependensi dalam perbaikan RC6 ini.
