# Profil fase pratinjau trigonometri

Profil ini membandingkan fungsi RC6 dan RC7 terhadap 15.280 byte sumber asli, 231 rumus, 254 blok, dan 15.591 elemen HTML hasil render. Node 24.22.3 menjalankan jsdom dengan satu proses dan dua bundle sumber terpisah. Kedua revisi menerima input yang sama. Pengukuran ini melengkapi benchmark pratinjau penuh yang memiliki beberapa proses terisolasi.

Dua putaran pemanasan dikeluarkan. Urutan kedua versi bergantian pada setiap pasangan. Pengukur waktu memakai performance.now(). Untuk operasi di bawah 20 ms, setiap sampel merata-ratakan 12 pemanggilan pemeriksa sisa rumus atau dua pemanggilan ekstraktor blok, dengan 20 pasangan. Fase berat memakai enam pasangan. Garbage collection diminta sebelum pengukuran setiap lengan fase berat. Median dan p95 memakai nearest rank. Dengan enam pasangan, p95 sama dengan maksimum. Waktu browser, KaTeX CSS, unduhan dan dialog native berada di luar profil ini.

| Fase | Median RC6 (ms) | Median RC7 (ms) | Pasangan |
| --- | ---: | ---: | ---: |
| Pemeriksaan sisa rumus pada DOM yang sama | 1,53 | 0,82 | 20 |
| Ekstraksi blok pada DOM yang sama | 13,39 | 13,04 | 20 |
| Integritas dari byte HTML yang sama, termasuk parsing HTML | 241,38 | 250,21 | 6 |
| Sanitasi dan pengisian slot KaTeX dari stage yang sama | 241,88 | 236,08 | 6 |
| Persiapan dokumen layar dari HTML yang sama | 274,67 | 288,46 | 6 |

Tidak ada blok raw HTML maupun marker target/aset yang memicu pemeriksaan baru pada contoh ini. Fungsi prepareBody mempunyai implementasi yang sama di kedua versi. Variasi waktu pada fungsi itu terlihat pula pada p95. Pemeriksaan gaya dalam composeDocument menggunakan hasil cache setelah pemuatan pertama. Perbandingan median fase ini belum mengidentifikasi kenaikan yang konsisten sebesar 236 ms pada salah satu fungsi kandidat.

Untuk reproduksi, sediakan dua direktori saudara bernama rc6 dan rc7 dengan npm ci sesuai lockfile masing-masing. Buat direktori kerja ketiga di dalam induk yang sama. Salin jsdom-phase-probe.mjs ke direktori kerja itu, sediakan node_modules dari lockfile rilis, lalu jalankan node --expose-gc jsdom-phase-probe.mjs dari sana. Probe menulis dua bundle lokal sementara dan profile.json. Sampel asli ditemukan di jsdom-phase-profile.json.
