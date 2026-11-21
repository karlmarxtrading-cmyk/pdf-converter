# Pemeriksaan visual PDF historis dari paket RC3

Tanggal pemeriksaan: 21 November 2026. **Semua PNG di direktori ini berasal dari PDF lama dalam ZIP pengguna. Tidak satu pun merupakan keluaran PDF kandidat RC4.** Source asli tidak diubah. Metadata, SHA-256, ukuran dan jumlah halaman kesebelas PDF paket dicatat pada `inventory.json`.

## Metode dan cakupan

Poppler `pdftoppm` merender 29 halaman pada 150 dpi. Halaman penuh dipakai untuk pembacaan detail; enam contact sheet diberi label arsip RC3 untuk pemeriksaan keseluruhan. Log perintah dan status render ada di `render-log.json`. Pypdf dan Poppler dipakai untuk pemeriksaan teks pendamping, bukan pengganti pembacaan gambar.

| PDF historis | Halaman fisik yang dirender | Cakupan visual |
|---|---|---|
| `pdf/einstein-A4.chrome.pdf` | 1–2, seluruh dokumen | Sampul, prosa, pecahan/akar, matriks, integral, rumus dalam tabel, mata uang dan kode |
| `pdf/einstein-A4.firefox.pdf` | 1–2, seluruh dokumen | Perbandingan visual mesin cetak historis Firefox |
| `pdf/small-mixed-A4.chrome.pdf` | 1–11, seluruh dokumen | Overview seluruh halaman; detail prosa, Unicode, rumus, gambar, tabel 12 kolom, tabel panjang, kode dan catatan kaki |
| `pdf/small-mixed-A4.firefox.pdf` | 1, 5, 6, 9, 10, 11 | Spot check Unicode, tabel, kode panjang dan akhir dokumen |
| `pdf/small-mixed-A5.chrome.pdf` | 7, 9, 10, 14, 21 | Rumus pada A5, tabel dibagi menurut kolom, pembungkusan kode, catatan kaki |
| `pdf-eval/small.B1-jspdf-html.pdf` | 3, 5, 9 | Eksperimen jsPDF, diperiksa terpisah dari jalur cetak utama |

## Temuan yang dapat dilihat

### 1. Sampul kosong pada PDF utama — PF-R4-07

Halaman fisik pertama PDF Einstein Chrome/Firefox dan mixed A4 berupa pita warna teal di atas bidang putih, tanpa judul atau teks. Ini bukan sekadar kegagalan ekstraksi: gambarnya juga menunjukkan cover tanpa isi.

Penyebab source dikonfirmasi: default `BUS-01` mempunyai `cover=true` dan `title=''`; `coverHtml` tetap membuat elemen sampul dan CSS memaksakan halaman tersendiri. Historical flattened HTML mempunyai `<p class="pf-cover-title" ...></p>` kosong. Reproduksi current candidate dengan metadata kosong juga membuat cover itu (`blank-cover-current-proof.json`), meskipun `<title>` dokumen memakai heading sumber.

Perbaikan yang disetujui integrator: sampul tidak dibuat apabila seluruh metadata yang benar-benar tampil kosong/whitespace dan tidak ada logo. Pengaturan `cover` dan isi sumber tidak diubah; cover yang berisi metadata tetap ada. Sebelum perbaikan dua tes gagal dan empat kontrol lulus; setelahnya seluruh enam tes lulus. PDF baru setelah perbaikan belum dapat dihasilkan di lingkungan ini.

### 2. Header kolom berulang terlalu pucat — PF-R4-08

Pada mixed A5 Chrome halaman fisik 10, bagian 2/2 tabel lebar, teks header `Kolom 1` berwarna putih pada latar abu-abu sangat muda. Kolom lainnya memakai putih di atas teal. Teks tidak hilang secara struktural, tetapi header kolom kunci hampir tidak terbaca.

Source mengonfirmasi penyebab: `.pf-doc th.pf-repeat-key` memberi latar tint dengan specificity lebih tinggi daripada latar template BUS, sementara `color:#fff` template tetap berlaku. Reproduksi DOM/CSS sebelum fix menyimpan putih `rgb(255,255,255)` dengan latar terang `rgb(241,244,248)` dalam palette unit yang eksplisit (`contrast-current-proof.txt`).

Perbaikan terbatas: tint kolom kunci berlaku untuk `td` saja, sehingga `th` mempertahankan pasangan foreground/background template. Satu regresi gagal sebelum perubahan; sesudahnya header berulang sama dengan header normal, sementara tint sel isi dan striping baris tetap sama. Ini bukti CSS/DOM, bukan screenshot browser kandidat.

### 3. Karakter PUA belum memiliki glyph yang setia

Pada mixed A4 halaman fisik 5, karakter Private Use terlihat sebagai tanda fallback/kotak, dengan bentuk berbeda antara Chrome dan Firefox. Latin beraksen, Yunani, Sirilik, simbol umum dan rumus yang diperiksa tetap terbaca. Tidak ada klaim bahwa glyph PUA tersebut sesuai maksud sumber, karena titik kode PUA memerlukan font yang mendefinisikannya.

`pdffonts` menemukan 3 entri Type 3 pada mixed A4 Chrome (termasuk emoji dan Inter-Regular sintetis) serta 2 entri emoji Type 3 pada Firefox. Einstein Chrome/Firefox tidak mempunyai entri Type 3. Ini selaras dengan keputusan memperketat gate font PDF: satu warning glyph tidak membuktikan bahwa seluruh fallback PDF benar. Data mentah ada pada `extraction-and-font-observations.json` dan berkas `*-fonts.txt`.

### 4. Rumus Einstein pada keluaran cetak utama tampak ter-render

Pada kedua PDF Einstein, pecahan faktor Lorentz, akar, kotak energi diam, matriks 2×2, integral, serta rumus dalam dua baris tabel tampil sebagai notasi matematika. Tidak terlihat LaTeX mentah di luar contoh kode yang memang harus literal. String mata uang `$5`/`$10`, `$HOME`, `$PATH` dan delimiter dalam kode tetap berupa teks.

Tidak tampak pemotongan rumus atau tumpang tindih pada halaman konten yang dibaca. Bukti ini hanya menunjukkan kemampuan jalur cetak lama untuk fixture tersebut. Ia tidak membuktikan bahwa jalur clipboard HTML pengguna, tabel gabungan, atau kandidat RC4 terbaru sudah lulus browser.

### 5. Tabel/kode utama terbaca pada sampel yang diperiksa

Tabel A4 yang panjang menampilkan header berulang dan nilai R001–R070; kode berlanjut antarahalaman dengan label `PYTHON · LANJUTAN`. Baris kode panjang membungkus ke baris tampilan berikutnya; pada A5 pembungkusan menjadi lebih sering. Pada halaman yang dibaca tidak terlihat teks terpotong di tepi kertas. Penutup dan catatan kaki masih terlihat. Pemeriksaan ini tidak menggantikan verifikasi semua karakter, struktur PDF bertag, pembaca layar, atau pengujian copy/paste kode.

Gambar bidang biru/cokelat yang terlihat kosong adalah gambar uji warna solid dalam fixture, bukan bukti bahwa gambar sumber hilang.

### 6. Eksperimen jsPDF berbeda dari PDF utama

Pada `small.B1-jspdf-html.pdf`, halaman yang diperiksa memperlihatkan garis, latar panel dan bidang gambar, tetapi prosa, rumus, tabel dan kode nyaris tidak terlihat. Poppler mengekstrak **0 karakter non-whitespace** dari seluruh PDF ini. Pypdf tetap mengembalikan 14.459 karakter non-whitespace dari objek teks, sehingga jumlah teks yang dibaca satu parser jelas tidak cukup sebagai bukti keluaran visual.

Ini artefak eksperimen `pdf-eval`, bukan PDF yang dibuat jalur utama Paged.js → cetak browser. Tidak tepat menggeneralisasi kegagalan eksperimen tersebut sebagai kondisi seluruh PDF aplikasi, ataupun memasukkannya sebagai bukti lulus rilis.

## Status akhir subpemeriksaan

- Pemeriksaan visual arsip: selesai pada cakupan halaman di atas.
- PF-R4-07/PF-R4-08: diperbaiki dan terverifikasi dengan unit/DOM; fresh browser/PDF masih NOT_RUN.
- Seluruh unit render setelah perubahan ini: **72/72 lulus**; typecheck global dan scoped lint lulus.
- Glyph PUA dan Type 3: batas font nyata tetap perlu dinyatakan; tidak ada dukungan universal yang dikarang.
- PDF kandidat RC4, dialog cetak native, browser/perangkat fisik dan Cloudflare pemilik: tidak disertifikasi oleh pemeriksaan ini.

## Gambar yang paling berguna untuk laporan integrator

- `einstein-all-contact.png`: semua halaman kedua PDF Einstein, jelas memperlihatkan cover kosong dan rumus yang ter-render.
- `mixed-A5-chrome-p10.png`: contoh header `Kolom 1` yang terlalu pucat; gunakan sebagai bukti sebelum perbaikan.
- `mixed-A4-firefox-p05.png`: glyph PUA fallback serta rumus yang terbaca.
- `prototype-jspdf-spot-contact.png`: kegagalan visual eksperimen; selalu beri label prototype.
- `mixed-A4-overview-1-contact.png` / `mixed-A4-overview-2-contact.png`: konteks pagination dokumen utama.
