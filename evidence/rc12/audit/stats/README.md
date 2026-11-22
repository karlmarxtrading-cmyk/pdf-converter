# F11-03 · Statistik isi dan revisi aktif

Pada RC11 tombol Terbitkan membuka ringkasan yang dapat tertinggal pada revisi sebelumnya. Dokumen yang memuat tabel HTML menghasilkan hitungan nol tabel. Dalam bukti Chromium sebelum perbaikan, sumber juga memuat judul sehingga hitungan kata yang benar adalah 4. Probe tabel tanpa judul mempunyai 3 kata prosa.

Kandidat menghitung struktur pada pohon dokumen yang sudah disanitasi, sebelum penyisipan cabang KaTeX. Definisi kata dan struktur ada di `docs/CORE_API.md`. Statistik di status editor dan ringkasan ekspor mengikuti snapshot siap pada revisi yang aktif. Saat suntingan sedang diproses, dialog menarik hitungan lama dan menonaktifkan ekspor.

Jalankan dari root source untuk mengulangi kasus regresi dan pengamatan UI pada distribusi produksi.

```bash
npx vitest run tests/unit/core/semantic-stats.test.ts tests/unit/engine/semantic-stats-worker.test.ts
node tests/e2e/semantic-stats.mjs dist stats-browser.json
```

Untuk kasus besar, buka `fixtures/rc9/single-paragraph-217850.md` pada editor, tunggu sampai status siap dan buka Terbitkan. Fixture publik tersebut memiliki enam kata pada judul/sel tabel pembuka dan 217.844 token berurutan dari `kata000001` sampai `kata217844`. Status dan ringkasan seharusnya menunjukkan 217.850 kata dan ringkasan seharusnya menunjukkan satu tabel. Log kandidat memuat hash input dan hasil pemeriksaan sumber setelah pemuatan.

Berkas dalam `baseline/` memuat pengamatan RC11. Berkas `browser.json`, `large-ui.json`, dan `vitest.log` di samping dokumen ini memuat hasil kandidat final.
