# Peninjauan akhir seluruh sumber tes core dan skenario E2E

Tanggal: 21 November 2026. Reviewer: `rc3_math_core`.

## Cakupan dan metode

Seluruh 1.170 baris original `tests/e2e/scenarios.mjs` (81.909 byte) dibaca, termasuk helper unduhan/pembersihan storage dan seluruh E01–E33. Seluruh 13 berkas unit core yang belum memiliki catatan pembacaan manual juga dibaca lengkap: budget-hash, conversation, curation-publication, index, integrity, math-einstein, portable-regressions, preflight, rc3-compat, render-acceptance, render, static-regressions, wrapper-clipboard.

Daftar hash original, byte, baris, hash kandidat, dan metode ada di `manual-test-review.json`. Menjalankan tes sebelumnya tidak dipakai sebagai pengganti pembacaan sumber. Langkah ini tidak mengulang unit suite atau mencoba menjalankan browser. Original tetap tidak berubah.

## Temuan pada harness original dan koreksi yang diizinkan integrator

Ini kelemahan assertion/isolasi pengujian, **bukan penemuan baru cacat runtime aplikasi**. Integrator secara eksplisit mengizinkan koreksi terbatas setelah pipeline aplikasi selesai.

| Lokasi original | Kelemahan | Assertion/perilaku kandidat |
|---|---|---|
| `scenarios.mjs:65–69`, helper wipeStorage | onerror dan onblocked deleteDatabase dianggap selesai, sehingga reset gagal tidak tercatat | Hanya onsuccess menyelesaikan reset; onerror/onblocked menolak dengan alasan. Halaman helper ditutup melalui finally. |
| `scenarios.mjs:528–543`, E14 | Dismiss pada beforeunload dapat meninggalkan halaman asal dan koneksi DB terbuka ketika reset berikutnya berjalan | Setelah assertion beforeunload, halaman asal ditutup eksplisit bila masih terbuka. Ini cleanup sesudah observasi, tidak mengganti perilaku yang diuji. |
| `scenarios.mjs:195–243`, E05 | Font, script, dan heading hanya dicatat; assertion utama memeriksa overflow dan jaringan. Dokumen kosong/font gagal dapat lolos pemeriksaan ini | Pub-online dan pub-enhance dipastikan false. Tunggu document.fonts.ready; wajib ada font loaded, tidak ada font error, script=0, heading dan isi nonkosong. Normalisasi whitespace isi #pf-content harus sama dengan pratinjau. Berlaku untuk standalone 320/390/768/1440 dan kedua ZIP pada 390 px; assertion overflow/jaringan lama tetap. |
| `scenarios.mjs:488–502`, E13 | Tidak membuktikan lebih dari 20 revisi tersimpan atau semua baris terjangkau; pemulihan menjadi string kosong juga diterima | Jumlah history meningkat tepat 26, total >20. Seluruh ID revisi yang dijelajah harus unik dan jumlahnya sama dengan history. Loop memiliki batas berdasarkan jumlah history. Sumber yang dipulihkan harus tepat sama dengan lines.join('\\n'). |
| `scenarios.mjs:614–620`, E17 | Fokus setelah Escape hanya dicatat | `focusBack === 'publish'` wajib. E27 sebelumnya juga mempunyai assertion fokus terpisah; kelemahan E17 bukan bukti kegagalan aksesibilitas aplikasi. |
| `scenarios.mjs:868–912`, E27 | Nama zoom200 dapat disalahartikan sebagai native browser zoom | Judul, key viewportEquivalent200, method, dan nativeZoomTested:false menjelaskan viewport/deviceScaleFactor emulation; kriteria overflow dan visibilitas lama tetap. |

Persistent history saat ini tidak melakukan coalescing ketikan; yang coalesce adalah undo. Karena itu E13 di atas merupakan celah assertion terhadap kemungkinan truncation/pemulihan kosong, bukan klaim reproduksi coalescing history pada aplikasi.

## Pengamatan lain yang tetap membatasi cakupan bukti

- E07 menguji lifecycle cetak headless, bukan dialog cetak native; return note original sudah menjelaskan batas itu.
- E18 menguji kanari di URL, domain eksternal, dan konsol. Ia tidak memeriksa semua isi body POST ke origin yang sama. Penilaian privasi perlu digabungkan dengan source review dan pemeriksaan jaringan lain, bukan digeneralisasi dari satu kanari.
- E22 membatasi jumlah analisis maksimum dan mengukur waktu; ia bukan pengukuran Core Web Vitals populasi atau jaminan perangkat pengguna. Jumlah nol tidak ditolak secara tersendiri, meskipun waitReady mensyaratkan revisi aktif sudah selesai.
- E23 boleh berakhir tanpa hasil ekspor jika gate memblokir. Dalam keadaan itu keamanan keluaran ekspor tidak dibuktikan oleh skenario ini; bukti preview dan pemblokiran harus dibedakan dari inspeksi berkas ekspor.
- E26 timerLatencyMs mengukur delay timer dalam halaman, bukan pengukuran end-to-end keyboard fisik. Ia membandingkan satu percobaan Worker/fallback pada perangkat pengujian, bukan distribusi performa pengguna.
- Core test suite mempunyai oracle hasil yang konkret untuk TeX, display mode, kode literal, urutan token, karakter, struktur tabel, referensi, archive CRC, hash, sumber asli, dan provenance. Banyak cabang adalah unit/integrasi jsdom; komentar seperti lintas-browser atau tidak dieksekusi tidak mengubahnya menjadi bukti browser nyata.
- Original static-regressions.test.ts memakai fake PNG untuk memeriksa base64 tidak diduplikasi. Fixture kandidat sudah diperbaiki menjadi PNG 1×1 pada patch admission gambar, dengan assertion integritas dan ketunggalan payload tetap dipertahankan.
- Kasus original static-regressions.test.ts:120–123 memakai assertion kondisional jika tidak ada messages. Itu tidak cukup untuk membuktikan seluruh kemungkinan hasil parser nonkosong valid; tes hasil spesifik lain dan regresi baru harus dibaca bersama.

Tidak ada temuan runtime tambahan yang direproduksi dari pembacaan 13 berkas tes ini. Tidak ada expected value yang dilonggarkan, tes dinonaktifkan, maupun batas performa dinaikkan.

## Verifikasi perubahan harness

`node --check tests/e2e/scenarios.mjs`: PASS (`scenarios-node-check.txt`).

`npm run lint`: PASS (`scenarios-lint.txt`).

Hanya `candidate/tests/e2e/scenarios.mjs` berubah pada tahap ini. Tidak ada perubahan runtime, stylesheet, fixture, atau unit test tambahan pada tahap pembekuan terakhir ini. Browser baru tetap **NOT_RUN**. Lulus sintaks/lint tidak membuktikan assertion baru telah dieksekusi di browser; laporan rilis harus mempertahankan perbedaan tersebut.
