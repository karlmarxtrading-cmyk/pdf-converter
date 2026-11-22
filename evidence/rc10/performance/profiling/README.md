# Profil waktu persiapan ekspor

Pilot memakai tiga masukan publik dari harness G09. Setiap pekerjaan membuat proyek, merender pratinjau, memeriksa model sumber, lalu membandingkan proyeksi keluaran dengan oracle. `before.json` merekam RC6 dan RC9. `restore.json` merekam percobaan pemulihan DOM. `after.json` merekam RC6 dan implementasi baru. `stages.json` dan `stages-after.json` berisi waktu metode DOM dengan instrumentasi diagnostik. Waktu metode bersarang dapat tumpang tindih.

| Biaya yang teramati | Perubahan implementasi |
| --- | --- |
| Pada putaran trigonometri kedua RC9, DOMParser menghabiskan 151 ms saat ekspor dan 133 ms saat menyiapkan cetak. | Komposisi mencatat perubahan lokal pada DOM, membalikkan perubahan, lalu mencocokkan serialisasi utuh dengan HTML sumber. Pekerjaan serentak mengambil kepemilikan terpisah. Dokumen besar dan pemulihan yang tidak identik menggunakan parse baru. |
| Persiapan artikel layar diulang antara pratinjau dan ekspor berprofil sama. | String hasil pratinjau menjadi masukan bagi komposisi ekspor jika HTML sumber dan pengaturan identik. Pemeriksaan sumber serta validasi akhir artikel, rumus, dan CSS tetap berjalan. Cache mengecualikan Mermaid dan percakapan. |
| Pada putaran kedua dokumen kecil RC9, penetapan innerHTML membutuhkan 13 ms dari 22 ms ekspor. | Parser HTML menerima penanda pada payload font yang identik dengan CSS yang diharapkan. Setelah elemen style ditemukan, seluruh CSS asli dipasang sebelum pemeriksaan jaringan dan kesetaraan byte. Penyimpangan struktur kembali memakai parse penuh. |
| Setiap render mengonfigurasi ulang kebijakan sanitasi yang sama. | Satu instans DOMPurify privat per jendela menyimpan konfigurasi tersebut. Seluruh masukan tetap melalui sanitasi, dan laporan elemen atau atribut terhapus disalin per panggilan. |

Pada putaran kedua tanpa instrumentasi, waktu ekspor trigonometri teramati 665 ms untuk RC9 dan 488 ms untuk implementasi baru. Persiapan cetak teramati 461 dan 364 ms. Dua putaran diagnostik mencakup variasi besar, termasuk persiapan cetak berinstrumentasi di atas satu detik. Keputusan G09 berasal dari 40 pasangan per kohort pada berkas resmi di direktori induk.

Untuk mereproduksi diagnostik, tempatkan hasil ekstraksi bersaudara dalam direktori bernama `rc6`, `rc9f`, dan `rc10` dengan dependensi lockfile tersedia. Salin skrip diagnostik ke `work10/perf/` di samping ketiga direktori dan buat tautan lokal `work10/perf/node_modules` ke dependensi RC10. Perintah `node work10/perf/pilot.mjs after rc10 2` merekam waktu aktual dan digest oracle. Ganti nama skrip menjadi `stage.mjs` untuk merekam biaya metode DOM. Untuk hasil RC9 gunakan argumen `before rc9f 2`.

Pilot tambahan menjalankan 20 pasangan bergantian pada dokumen kosong. Median refresh RC6 dan RC10 tercatat 8,79 dan 5,65 ms, dengan p95 sampel 11,50 dan 10,98 ms. Pilot Chromium membuka UI editor, menunggu pratinjau, mengunduh HTML, membuka paginasi, dan memeriksa ketiga proyeksi trigonometri pada RC6, RC9, serta build percobaan RC10. Keenam hasil memiliki digest oracle yang sama. Pada putaran kedua, HTML RC6/RC9/RC10 tercatat 182/201/150 ms. Identitas index, semua waktu dan hasil proyeksi tersedia dalam `browser-profile.json`. Pengukuran akhir memakai build rilis serta pasangan resmi tersendiri.

Penghitungan kuantil independen terhadap empat berkas mentah historis RC9 menemukan tepat lima kegagalan ambang yang disebutkan audit. `rc9-historical-recount.json` menyimpan hasil per metrik, identitas arsip, kecocokan oracle dan pemeriksaan urutan. RC9 tetap berstatus FAIL. Perhitungan yang sama tersedia untuk kandidat final melalui skrip `../recount.mjs`.

Pada pilot 20 pasangan dokumen kecil sesudah edit, p95 ekspor HTML RC6/RC10 tercatat 30,2/18,8 ms dan p95 persiapan cetak 7,4/4,7 ms. Semua digest oracle cocok. Berkas `small-edit-diagnostic.json` memuat setiap lengan, termasuk pemanasan. Pengujian ini terpisah dari dua kohort resmi.
