# Editor, pemulihan, dan revisi RC7

Pengujian pembanding memakai salinan source RC6 yang diekstrak dari ZIP sumber. Berkas uji yang sama dijalankan terhadap kedua versi. Entry point UI, dokumen HTML aplikasi, model proyek dan konversi ZIP dijalankan di jsdom. Modal OS dan kegagalan persiapan cetak dipasok oleh harness agar kondisi saat batal dan ulang dapat direproduksi. Uji ini memeriksa logika antarmuka dan statusnya.

| Kasus | RC6 | RC7 |
| --- | --- | --- |
| PF-RC7-U01 · Batalkan dialog pemilihan naskah ZIP | Gambar di dalam ZIP tetap masuk ke proyek | Aset, sumber dan riwayat tetap sama. Menyetujui pilihan “pertahankan sumber” tetap mengimpor gambar. |
| PF-RC7-U02 · Ulangi pemeriksaan halaman pada revisi yang sama setelah persiapan gagal | Dua klik hanya menjalankan satu percobaan | Klik kedua menjalankan percobaan kedua. Peralihan tab dan klik yang bersamaan tetap berbagi pekerjaan yang berjalan. |
| PF-RC7-U03 · Pindah ke proyek baru selagi pratinjau berikutnya belum selesai | Daftar bagian dan bingkai masih berisi proyek lama | Daftar bagian, isi pratinjau dan hash lama dikosongkan pada saat pergantian proyek. |
| PF-RC7-U04 · Ketik judul saat editor sedang merender | Pengetikan yang belum dikonfirmasi tertimpa judul proyek lama | Ketikan tetap ada selama render. Setelah dikonfirmasi, kedua bidang judul menampilkan nilai baru. |
| PF-RC7-U05 · Judul otomatis dari heading tebal pada impor Markdown | Penanda empat bintang Markdown ikut tercetak dalam judul dokumen | Judul turunan memakai teks heading yang diparse. Sumber asli dan judul manual yang sengaja memuat bintang tetap utuh. |

Uji regresi yang sama memberi 5 kegagalan pada RC6 dan 5 kelulusan pada RC7. Suite terkait yang dijalankan bersama kasus baru memberi 38 kelulusan dari 8 berkas. Keluaran ringkas terlampir dalam log. Kelulusan uji penyimpanan meliputi kuota yang disimulasikan, konflik dua penulis pada basis tersimpan, proyek yang dihapus, penjaga navigasi, batas penyimpanan, arsip cadangan, serta undo/redo. Keadaan perangkat fisik pengguna belum diuji.

`dom-baseline.txt` mencatat kegagalan yang diharapkan pada RC6. `dom-candidate.txt` mencatat hasil RC7. Untuk menjalankan ulang lima uji khusus gunakan `npx vitest run tests/unit/ui/rc7-recovery.test.ts`.


## Uji browser pada build produksi

Pada Chromium Headless 153 dengan viewport 360 × 780 piksel, lebar konten panel sumber, format dan pratinjau masing-masing 360 piksel. Menempelkan teks sintetik melalui clipboard browser dan Ctrl+V mempertahankan teks secara utuh, termasuk `017`, formula dan baris akhir. Ctrl+Z dan Ctrl+Y mengembalikan keadaan sebelumnya. Tombol panah memindahkan fokus serta pilihan pada tab dan template. Hasil ini terbatas pada viewport yang diuji.

Dua tab browser membuka satu proyek IndexedDB yang sama. Setelah tab pertama menyimpan perubahan, penyimpanan dari tab kedua melaporkan konflik. Proyek utama dan salinan konflik berhasil dibuka kembali dengan isi persis masing-masing. Pada konteks browser terpisah, kuota origin yang disetel 3.072 byte menimbulkan status `quota` untuk sumber sintetis 10.019 byte. Berkas cadangan 9.827 byte yang diunduh setelah kegagalan berhasil dipulihkan melalui kontrol impor di konteks bersih. Berkas `synthetic-browser-backup.pfproj` berisi cadangan hasil percobaan tersebut.

Ulangi di root proyek dengan `PF_CHROME=/lokasi/chromium node evidence/rc7-ux/real-storage.mjs`. Hasil dan sidik jari build tersedia di `browser-storage.json`. Pada uji terpisah melalui Chrome terkelola, membuka Markdown trigonometri asli menampilkan judul **Kumpulan Rumus Trigonometri Lengkap**. Baris pertama pada editor tetap persis `# **Kumpulan Rumus Trigonometri Lengkap**`. Hak clipboard ini terbatas pada sesi browser pengujian dan teks sintetik.
