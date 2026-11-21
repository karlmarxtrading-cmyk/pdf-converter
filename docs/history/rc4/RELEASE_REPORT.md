# Keputusan rilis — PaperForma 3.0.0-rc.4

**Kandidat hasil audit siap dimasukkan ke repository dan diuji di staging. Produksi umum belum disetujui.** Sumber/build/ekspor API telah diperbaiki dan diverifikasi; browser hidup, PDF baru, perangkat sasaran dan deployment pemilik tetap terbuka.

- Input: `PAPERFORMA_STATIC_3.0.0-rc.3_MATH_FIX.zip`; SHA-256 `0fa8d22b396789b9396c8a9124aba95cdd9ac5f8717367cc1552d149dc39abaf`; 520 file, 518 checksum isi cocok.
- Kandidat: `680c8b5c6cb1ca3948e19c17857682ab6711d3a2fb70430565692f8a0feadd79`.
- Dist: `03e0a565c52b2a514eb01e878e7f0ca3c31a1a7cc04b9a4a8c90dc53d2390a1d`.
- Node v24.22.3; npm 11.19.1; engines npm >=11.6.0 <12.

| Gate | Hasil aktual baru | Bukti |
|---|---|---|
| Baseline asli | 255/255 unit; dist RC3 281/281 identik | baseline-unit-recheck.log; baseline-dist-rebuild.json |
| Typecheck/lint | PASS | final/typecheck.log; final/lint.log |
| Unit/integrasi | 332/332 Vitest, 41 berkas | final/tests.log |
| Oracle/gate/server Node | 8/8 | final/tests.log |
| Ekspor trig font nyata | 2 jalur ×21 formula; PASS | trigonometry-export-final.log; examples/ |
| Build produksi + QA | PASS; source tidak berubah saat build | final/build-*.log; build manifests |
| Gate mutasi | 13/13 sesuai harapan, termasuk 12 kerusakan ditolak | release-gate.json |
| HTTP lokal | 285/285; 280 berkas SHA-256 cocok | http-verification.json |
| Clean-room | npm ci/typecheck/lint/test/build; 281/281 dist identik | cleanroom/result.json |
| Dependensi | 0 advisory pada pemeriksaan saat audit | npm-audit-current.json; cleanroom/npm-ci.log |
| Pola rahasia source/build | PASS dalam cakupan scanner | secret-scan.json |
| E2E browser kandidat | BLOCKED_BY_ENVIRONMENT; exit 1 sebelum skenario | final/browser-status.json; browser-attempt.log |
| PDF baru/native print | NOT_RUN | KNOWN_LIMITS.md |
| Cloudflare pemilik | NOT_RUN | DEPLOY_CLOUDFLARE.md |

Berkas bukti relatif terhadap `evidence/audit-rc4/` kecuali disebut lain. Bukti source sebelum perbaikan, intermediate dan RC3 historis diberi label terpisah. Langkah clean-room menggunakan arsip kandidat sumber+dist sebelum dokumentasi/bukti final dimasukkan. Paket akhir wajib mempunyai candidateSha256 dan seluruh dist yang sama dengan hasil clean-room; pemeriksaan ekstraksi/checksum paket ada di AUDIT_ZIP.json. Tidak ada hash ZIP yang menyertakan hash dirinya sendiri.

## Keterbatasan pengujian baru

Chromium terminal gagal pada socket/process singleton dengan `Operation not permitted` dan ptrace tidak diizinkan. Browser terpisah juga tidak menjangkau server lokal. Tidak ada pengubahan kebijakan keamanan. Tidak satu pun hasil browser/PDF historis RC3 disebut sebagai kelulusan RC4.

Skrip E2E diperketat pada font/isi/script ekspor, semua revisi riwayat, fokus dialog dan cleanup IndexedDB. Perubahan itu lulus sintaks/lint; keberhasilan eksekusinya tetap belum dibuktikan di browser. Deteksi browser hilang/hasil error kini tidak menghasilkan status lulus.

Seluruh 62 ID penerimaan tetap ada di ACCEPTANCE.md. Status parsial/NOT_RUN dinyatakan, bukan disamarkan dengan persentase. Rilis umum memerlukan: E2E/PDF pada browser yang tersedia, verifikasi clipboard asli, pengujian perangkat sasaran, lalu verify:http dan verify:deployment di URL preview pemilik. Tidak perlu menulis ulang aplikasi untuk melakukan langkah tersebut.
