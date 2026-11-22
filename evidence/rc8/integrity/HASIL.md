# A02 dan A03 — keutuhan rumus dan artikel

Pada RC7, 19 dari 28 tes penerimaan gagal. Sembilan kontrol lulus. Sebagai contoh, menghapus semua anak elemen rumus sambil mempertahankan atribut TeX masih menghasilkan HTML yang dapat diunduh dan dokumen yang dapat dikirim ke paginasi. Menyisipkan satu paragraf tanpa ID di ujung artikel juga lolos pada empat jalur tersebut. Hasil RC7 berasal dari eksekusi suite yang sama terhadap salinan kode dan dependensi RC7.

Pada kandidat RC8, model sumber menyimpan urutan rumus di setiap blok, TeX kanonik, TeX asal dan mode. Kompiler menghasilkan referensi tampilan untuk setiap pasangan TeX dan mode. Pemeriksa mencocokkan seluruh subpohon KaTeX, termasuk cabang visual, struktur MathML dan anotasi. Fallback harus mempertahankan TeX beserta pembatas lengkap. Pada paginasi, kedua cabang dibandingkan lagi antara isi awal dan halaman dengan pengecualian khusus untuk salinan kepala tabel dan atribut internal Paged.js.

Pemeriksa menelusuri teks di luar blok, memeriksa ID asing, duplikat dan bersarang, serta memeriksa urutan dan isi blok. Label yang diturunkan dari pesan dan catatan kaki diperiksa dalam konteks pemiliknya. Markup artikel akhir diperiksa dengan markup tubuh yang sudah melalui pemeriksaan dan tambahan template yang dibuat aplikasi. Kode pengguna yang meniru atribut dekorasi tetap diperiksa.

Tiga mutasi tambahan memakai ID sumber yang memang ada untuk menyamarkan paragraf baru. Pemeriksa menolak paragraf dengan ID milik definisi tautan, catatan kaki yang tidak dirujuk atau garis pemisah. Catatan kaki yang tidak dirujuk tetap dipertahankan dalam sumber.

Tes mutasi menggunakan angka, operator dan teks pengganti literal. Perubahan pada digit, tanda minus, sel, tautan, spasi kode, mode dan urutan diperiksa satu per satu. Dua kerusakan diperiksa pada jalur HTML mandiri, ZIP, publikasi dan persiapan cetak. Pemeriksaan terpisah menghapus CSS matematika, mengubah byte font tersemat, mengosongkan rumus dan menyisipkan elemen baru setelah komposisi. Hasil rinci ada di `acceptance.json`, `final-bytes.json`, `rc7-control.json` dan `rc7-baseline.log`.

Tes API dan DOM ini tidak menyimpan PDF melalui dialog native. Bukti pemeriksaan PDF dan perangkat ada pada kelompok pengujian masing-masing. Pembandingan dengan keluaran KaTeX terpasang menguji kelangsungan representasi sepanjang jalur aplikasi. Pemeriksaan ini tidak membuktikan kebenaran matematika dari teks yang ditulis pengguna.

Untuk menjalankan ulang dari root paket:

```bash
PF_INTEGRITY_EVIDENCE=evidence/rc8/integrity/acceptance.json \
PF_INTEGRITY_FINAL_BYTES=evidence/rc8/integrity/final-bytes.json \
node node_modules/vitest/vitest.mjs run \
  tests/unit/render/rc8-source-integrity.test.ts \
  tests/unit/render/rc8-final-bytes.test.ts
```
