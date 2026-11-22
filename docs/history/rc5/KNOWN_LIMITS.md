# Cakupan dukungan RC5

Status browser, hasil PDF baru dan deployment kandidat tercatat di [laporan rilis](RELEASE_REPORT.md).

## Batas format dan isi

- Impor: Markdown/teks UTF-8, HTML clipboard, percakapan teks/HTML, ZIP naskah+gambar, `.pfproj`, PNG/JPEG/WebP/GIF/SVG. Impor PDF, DOCX/ODT/RTF dan OCR belum didukung. “Membaca setiap tulisan” tidak berarti membaca seluruh format berkas atau seluruh bahasa tanpa batas.
- Rumus menggunakan KaTeX dengan trust dimatikan dan batas ekspansi/ukuran. Delimiter `\(…\)`, `\[…\]`, `$…$`, `$$…$$` dikenali sesuai konteks; kode dan mata uang dilindungi. Perintah LaTeX di luar dukungan KaTeX tetap dilaporkan sebagai error dan sumber ditampilkan. HTML matematika tanpa sumber TeX tidak selalu dapat dipulihkan menjadi formula yang sama.
- Canvas, widget interaktif, animasi/diagram yang tidak ikut sebagai gambar/SVG/teks dalam clipboard tidak dapat direkonstruksi dari labelnya. “Drag point P” dan “Beri masukan” dipertahankan bila ada di sumber; aplikasi tidak mengarang lingkaran satuan/grafik yang hilang.
- Pemeriksaan integritas menjaga format, urutan, angka, tautan dan sumber formula. Ia tidak memeriksa kebenaran isi matematika, fakta, atau ejaan naskah pengguna.
- Font bawaan mencakup Latin/Indonesia, Latin Extended, Vietnam, Yunani, Sirilik dan simbol KaTeX. Arab/RTL, CJK, Thai, Devanagari, emoji berwarna dan Private Use belum memiliki cakupan font lengkap; temuan font tetap ditampilkan. Jangan menjanjikan PDF universal atau menghapus peringatan glyph demi status hijau.

## PDF, layout dan performa

- Aplikasi menyiapkan HTML berhalaman dan membuka dialog cetak browser. Aplikasi tidak menerima byte PDF final dan tidak tahu apakah pengguna benar-benar menyimpan. Tidak ada dukungan tersertifikasi PDF/A, PDF/UA, CMYK atau tagging aksesibel lengkap.
- Paginasi Paged.js membutuhkan DOM dan tetap berjalan pada thread utama. Dokumen besar masih dapat tersendat. Web Worker digunakan untuk analisis, bukan memindahkan seluruh pekerjaan layout ke thread lain.
- Pengukuran RC4 terdahulu adalah mikrobenchmark Node berpasangan, bukan Core Web Vitals, browser/perangkat fisik, atau waktu PDF menyeluruh. Median yang membaik tidak membuktikan semua tail latency membaik; seluruh sampel dan p95 disertakan.
- Batas masukan (5 MiB teks, batas ZIP/aset/proyek, 256 kedalaman struktur) adalah batas admission, bukan kapasitas yang dijamin pada setiap perangkat. Input berlebih ditolak utuh.
- Gambar: 16.384 px/sisi, 40 MP/gambar, 200 MP agregat; header diperiksa sebelum dekode. Jalur inline dan proyek sekarang menerapkan admission. Jumlah frame animasi GIF/WebP, kompleksitas semua SVG/Mermaid dan konsumsi memori decoder lengkap belum dibuktikan. Data header valid tidak berarti semua byte gambar valid.
- Jika isi halaman berubah atau terpotong, cetak harus diblokir. Oracle terbaru lebih ketat terhadap kode/tanda minus/prosa sekeliling rumus; beberapa fixture PDF lama yang sebelumnya diloloskan bisa gagal ketika diperiksa ulang dengan aturan baru. Itu alasan memperbaiki hasil, bukan melemahkan pemeriksa.
- Oracle raw-table belum mencakup seluruh mutasi alt/title gambar. Pada kasus audit tidak ditemukan renderer menghilangkan alt/title, tetapi cakupan oracle tidak boleh disebut sempurna.

## Data, riwayat dan keamanan

- IndexedDB terikat origin. Pindah domain memerlukan ekspor/impor `.pfproj`. Simpan cadangan sebelum rollback atau membersihkan data browser.
- Riwayat sesi/persisten dibatasi untuk memori dan ukuran paket. Riwayat lama yang tidak menyimpan byte/nama gambar tidak dapat mengembalikan data yang tidak pernah disimpan. Metadata rusak dipulihkan sebagai teks bila memungkinkan, dengan penjelasan.
- Tanpa browser Worker, fallback memiliki jeda antar fase dan deadline di batas fase. JavaScript sinkron yang sedang berjalan tidak dapat dipreempt oleh timeout pada thread yang sama.
- `npm audit` dan pemindaian pola rahasia adalah pemeriksaan pada saat audit, bukan jaminan bebas seluruh kerentanan. Paket lama/deprecated tetap tercatat; tidak dilakukan upgrade massal tanpa verifikasi.
- Dependensi Mermaid/elkjs memiliki notice lisensi yang harus ikut didistribusikan. Lihat `release/SBOM.json` dan `release/THIRD_PARTY_NOTICES.md`.
