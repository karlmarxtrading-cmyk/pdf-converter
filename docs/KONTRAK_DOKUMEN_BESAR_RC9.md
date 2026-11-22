> Arsip versi terdahulu. [Laporan aktif RC10](RELEASE_REPORT.md).

# Kontrak pengukuran RC9

Pada Chromium lokal Linux, jalur uji membuka berkas UTF-8 melalui editor produksi. Protokol baru membatasi startup 30 detik, tidak ada kemajuan pekerjaan selama 90 detik dan total persiapan iframe 900 detik untuk payload HTML minimal 1.000.000 unit UTF-16. Untuk payload yang lebih kecil berlaku 45 dan 180 detik. Ini batas penghentian operasional. Durasi bawah 900 detik saja tidak membuktikan integritas atau memberi jaminan pada perangkat lain. Alat pengamat mempunyai batas terpisah 960 detik.

Setiap bentuk yang diuji harus menghasilkan satu PDF aktual, verifikasi paginasi lulus, dan teks sumber cocok saat PDF dan HTML dibuka kembali. Semua hasil gagal, terhenti, atau berbeda disimpan dalam ledger. Pada BUS-01 dengan sedikitnya 6.000 anak artikel dan payload panjang, kelompok blok utuh memulai halaman baru, dengan batas kelompok diutamakan pada heading. Hal ini dapat menambah ruang kosong di akhir kelompok. Nomor halaman dan daftar isi dihitung untuk seluruh buku. HTML mandiri dan Markdown asli mempertahankan struktur input. Angka performa RC6 lama mempunyai kontrak tersendiri di tests/bench/performance-protocol.json.

Pada cetak buku BUS-01 dengan minimal 6.000 elemen langsung artikel dan payload setidaknya satu juta unit UTF-16, kutipan dengan jeda baris eksplisit dipertahankan utuh bila lebih pendek dari 85 persen ruang isi satu halaman. Pemilihan huruf besar/kecil pada heading tingkat empat mengikuti sumber. Batas dukungan diuji secara terpisah pada fase tata letak dan penulisan byte PDF.

Pembandingan hasil buku membedakan teks dalam elemen dari penanda daftar buatan browser. Penguji PDF membandingkan semua nomor urut yang berdiri sendiri, termasuk nomor tahun empat digit. Bullet yang berbentuk vektor pada PDF terpaginasi diperiksa pada area marker yang sebenarnya. Font cadangan dan objek Type 3 pada buku tercatat per artefak. Rujuk private-receipts dan LAPORAN_RC9.md untuk status penerimaan.
