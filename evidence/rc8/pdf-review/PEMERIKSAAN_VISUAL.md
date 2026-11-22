# Pemeriksaan visual PDF PaperForma RC8

Kandidat `0ecf3b0981925fd3c42fb49e1756b6ac99900ebfe330b94d7ded617194864064` menghasilkan build `bd329e6b849839b5fd4c5e6ba51e3ee55d98fa607261dee1fbfbad62dd770436`. Pada run `d58c2ce4-cce6-45dc-a95c-e615f8660e14`, pengujian mengimpor sumber lewat antarmuka dan menghasilkan PDF dengan mesin cetak Chromium 153.0.8010.0. Agen meraster ulang dua belas halaman fisik dari tujuh berkas aktual berikut dan memeriksa bagian yang tercantum. Bukti dialog cetak perangkat berada pada pemeriksaan operasional terpisah.

| Berkas | Halaman fisik | Hasil yang tampak pada PDF |
| --- | --- | --- |
| `trigonometry-BUS-01-A4-portrait.pdf` | 3 | Kolom “Fungsi” dan “Rumus” memiliki kepala berwarna. Pada baris sinus, teks “sisi depan” berada di atas garis pecahan dan “sisi miring” di bawahnya. |
| `trigonometry-EDU-01-A4-portrait.pdf` | 11 | Bentuk umum ada di dalam kotak. Di bawahnya, koefisien dan pecahan terpisah jelas. Dua kotak batas maksimum dan minimum memiliki jarak vertikal. |
| `trigonometry-EDT-01-A5-portrait.pdf` | 19 | Dua jumlah deret tersusun bertingkat. Batas sigma dan garis pecahan terlihat di masing-masing kotak. Kalimat sesudah kedua deret serta bagian identitas Euler terbaca. |
| `trigonometry-CON-01-Letter-landscape.pdf` | 7 | Halaman lanskap memisahkan bagian sudut tiga kali dan setengah sudut. Rumus dalam kotak dan label masing-masing memiliki ruang tersendiri. |
| `mixed-supported-BUS-01-A5-portrait.pdf` | 7 | Paragraf multibahasa memperlihatkan wajah, roket dan orang di depan komputer. Ketiganya berupa gambar garis monokrom. Teks “[U+E000]” dan “[U+F8FF]” cocok dengan teks pada fixture kontrol terpisah. |
| `mixed-supported-EDT-01-A5-portrait.pdf` | 10–12 | Halaman 10 berakhir dengan baris R070 dan garis bawah tabel. Halaman 11 memuat judul “Blok kode panjang”, label PYTHON, definisi fungsi, dan baris return yang menjorok. Di halaman 12 label PYTHON · LANJUTAN tercetak bersama baris 015. |
| `DIAGNOSTIC-mixed-original-EDT-01-A5-portrait.pdf` | 5, 10–12 | Pada halaman 5 wajah, roket dan orang di depan komputer tampak. Dua karakter privat pada fixture asli tampil sebagai kotak bersilang. Mesin ekstraksi membaca U+E000 sebagai NUL. Urutan akhir tabel, label awal dan label lanjutan pada halaman 10 hingga 12 juga muncul pada sumber asli. Aplikasi menolak ekspor ketat dari fixture ini. PDF diagnostik dibuat dari pratinjau dan disimpan di `evidence/rc8/pdf/diagnostics`. |

## Perbandingan otomatis

Keempat tata letak trigonometri rujukan menghasilkan 74 halaman. Seluruh raster halaman pada 86,4 DPI dan seluruh 924 area rumus pada 108 DPI cocok piksel demi piksel dengan PDF RC7 masing-masing. Lihat `reference-pages.json` untuk halaman penuh dan `../pdf/physical-verification.json` untuk setiap area rumus. Nilai ini mengukur reproduksi visual pada mesin dan resolusi tercatat. Pengamatan visual individual dibatasi pada halaman dalam tabel.

## SHA-256 berkas yang ditinjau

| Berkas | SHA-256 |
| --- | --- |
| `trigonometry-BUS-01-A4-portrait.pdf` | `f883e518c53fa4f21d999c420531458e181ff69f0bb8c41fdbfccf9c7c0b5ff6` |
| `trigonometry-EDU-01-A4-portrait.pdf` | `90933542830b1cddf52bcb0ce516326d2b0b30a7b80a81ee9d004307682b98e4` |
| `trigonometry-EDT-01-A5-portrait.pdf` | `8d6e5cb9c46b2d4281b47439d11e9c9fe5589aff21e91aeb77bb4e1cc5a0aba6` |
| `trigonometry-CON-01-Letter-landscape.pdf` | `448e7709cdb7eae8afcb7703049ed872185ae4e4a1fb5e2a14912f604f02a033` |
| `mixed-supported-BUS-01-A5-portrait.pdf` | `9486630e309200df1ceb0206c24fbe045f828783f116ef241ea3e3adc89fd3a6` |
| `mixed-supported-EDT-01-A5-portrait.pdf` | `efea30cef8f0b39b93e6b8dc77a7440d73d8158f7115496e803f1b74fea9d784` |
| `DIAGNOSTIC-mixed-original-EDT-01-A5-portrait.pdf` | `779e2f15b3a53e01d6311a69c9e86e8c5e4199921d2da4d9e1f13778708aaf5d` |
