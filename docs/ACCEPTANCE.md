# Matriks penerimaan — PaperForma 3.0.0-rc.4

Semua 62 ID dari matriks asli dipertahankan. Definisi dan keputusan RC3 ada di `history/rc3/ACCEPTANCE.md`. Status di bawah hanya memakai bukti baru sesuai cakupannya; angka ini tidak dijumlahkan sebagai persentase kesiapan produksi. **LULUS DALAM CAKUPAN** berarti kriteria yang dapat diverifikasi melalui artefak/kode/HTTP telah dibuktikan, bukan bahwa semua browser/perangkat telah lulus.

Keputusan aktif: **produksi umum belum disetujui**; uji browser/PDF/hosting pemilik masih terbuka. Unit/jsdom tidak menggantikan layout browser. Rujukan: RELEASE_REPORT.md, TESTING.md, KNOWN_LIMITS.md serta evidence/audit-rc4.

| ID | Area | Status sekarang | Dasar / yang masih terbuka |
|---|---|---|---|
| ST-QA-01 | build | LULUS DALAM CAKUPAN | Instalasi, typecheck, lint, unit/Node, build produksi/QA; bukti final dan clean-room harus cocok. |
| ST-QA-02 | dependencies | LULUS DALAM CAKUPAN | Audit dependensi dan SBOM aktual; bukan jaminan seluruh dependensi bebas bug. |
| ST-QA-03 | network | SEBAGIAN | Inspeksi source/build dan tes terkait tersedia; alur browser kandidat belum dijalankan. |
| ST-QA-04 | product | SEBAGIAN | Inspeksi source/build dan tes terkait tersedia; alur browser kandidat belum dijalankan. |
| ST-QA-05 | source_integrity | SEBAGIAN | Regresi sumber/kode/PUA/angka/urutan lulus pada Node/jsdom; hasil browser/PDF belum diverifikasi. |
| ST-QA-06 | clipboard | SEBAGIAN | HTML literal/KaTeX dan transkripsi trig lulus; clipboard OS/penyedia nyata belum diuji. |
| ST-QA-07 | xss | SEBAGIAN | Sanitasi adversarial unit dan tinjau source; eksekusi browser belum diuji. |
| ST-QA-08 | svg_mermaid | SEBAGIAN | Sanitasi SVG/Mermaid ditinjau; kompleksitas seluruh diagram/filter belum dibuktikan. |
| ST-QA-09 | zip_security | SEBAGIAN | Batas ZIP/path/CRC/rasio/symlink lewat unit; impor browser belum dijalankan. |
| ST-QA-10 | zip_import | SEBAGIAN | Impor ZIP unit lulus; file picker browser baru belum diuji. |
| ST-QA-11 | image_budget | SEBAGIAN | Header, per-image, inline dan agregat piksel diuji; frame animasi/device memory belum. |
| ST-QA-12 | math_numbers | SEBAGIAN | 21 formula trig + Einstein serta kode/mata uang utuh; visual browser baru belum. |
| ST-QA-13 | tables | SEBAGIAN | Oracle tabel/urutan diperkuat; header kontras diperbaiki; paginasi nyata baru belum. |
| ST-QA-14 | navigation | SEBAGIAN | Fragmen malformed tidak crash pada unit; anotasi PDF baru belum diperiksa. |
| ST-QA-15 | templates | SEBAGIAN | Templat/cover unit lulus; visual seluruh kombinasi belum. |
| ST-QA-16 | html_export | SEBAGIAN | Ekspor HTML mandiri dengan font nyata lulus API; file:// visual baru belum. |
| ST-QA-17 | html_zip | SEBAGIAN | ZIP/publikasi unit; pembukaan browser baru belum. |
| ST-QA-18 | failure_integrity | SEBAGIAN | Abort/font/deadline/stale diuji dengan kondisi terkendali; alur browser baru belum. |
| ST-QA-19 | native_print | NOT_RUN / BLOCKED | Dialog cetak native tidak tersedia. |
| ST-QA-20 | local_pdf | N/A | Generator byte PDF langsung tidak ditawarkan; cetak memakai browser. |
| ST-QA-21 | portable_project | SEBAGIAN | .pfproj legacy dan round-trip diuji; browser import/reload baru belum. |
| ST-QA-22 | concurrency_storage | SEBAGIAN | Storage compare-and-swap/unit diuji; dua tab browser baru belum. |
| ST-QA-23 | storage_failure | SEBAGIAN | Kuota/blocked/unavailable dan source preservation unit; browser nyata baru belum. |
| ST-QA-24 | origin_migration | NOT_RUN / BLOCKED | Pindah origin melalui browser kandidat belum dijalankan. |
| ST-QA-25 | pagination_completeness | NOT_RUN / BLOCKED | Oracle paginasi diperketat; paginasi browser baru belum dijalankan. |
| ST-QA-26 | performance | SEBAGIAN | Mikrobenchmark Node saja; p95 snapshot gambar masih lebih tinggi pada sampel primer. |
| ST-QA-27 | accessibility | NOT_RUN / BLOCKED | Audit source/kontras terbatas; axe, pembaca layar dan zoom native kandidat belum dijalankan. |
| ST-QA-28 | real_mobile | NOT_RUN / BLOCKED | Perangkat fisik tidak tersedia. |
| ST-QA-29 | hosting | NOT_RUN / BLOCKED | URL Cloudflare pemilik belum diuji. |
| ST-QA-30 | release_zip | LULUS DALAM CAKUPAN | Checksum paket dan rekonstruksi clean-room; lihat AUDIT_ZIP.json. |
| ST-QA-31 | release_gate | LULUS DALAM CAKUPAN | Kontrol bersih dan 12 mutasi verifier; seluruh hasil sesuai harapan. |
| ST-QA-32 | pua_regression | SEBAGIAN | Konservasi PUA unit lulus; glyph yang sesuai tetap memerlukan font pengguna. |
| ST-QA-33 | conversation_detection | SEBAGIAN | Deteksi percakapan unit diperluas; alur browser baru belum. |
| ST-QA-34 | conversation_selection | SEBAGIAN | Komposisi dan pilihan pesan unit; UI browser baru belum. |
| ST-QA-35 | preflight_target | SEBAGIAN | Revisi/status preflight diperketat; uji DOM/unit, belum browser nyata. |
| ST-QA-36 | dirty_close | NOT_RUN / BLOCKED | Skenario beforeunload diperketat; belum dieksekusi di browser kandidat. |
| ST-QA-37 | static_boundary | LULUS DALAM CAKUPAN | Inspeksi source/build dan HTTP lokal; endpoint tidak ada menghasilkan 404. |
| ST-QA-38 | no_commercial_limits | SEBAGIAN | Inspeksi fitur statis; kapasitas 1.000 halaman RC4 belum diukur. |
| ST-QA-39 | static_build_graph | LULUS DALAM CAKUPAN | Build sumber statis tanpa backend/binding/kredensial. |
| ST-QA-40 | pages_artifact | LULUS DALAM CAKUPAN | Publish dist tanpa Functions/_worker.js dan dengan aset Worker browser. |
| ST-QA-41 | http_headers | SEBAGIAN | Header/MIME/cache HTTP lokal lulus; edge Cloudflare belum. |
| ST-QA-42 | canonical_metadata | LULUS DALAM CAKUPAN | Tidak ada domain canonical palsu; domain akhir belum ditetapkan. |
| ST-QA-43 | cache_update | SEBAGIAN | Cache HTML dan fallback ditinjau; update deployment lama→baru di hosting belum. |
| ST-QA-44 | font_fail_closed | SEBAGIAN | Font macet/gagal/batal unit; pembatalan jaringan browser baru belum. |
| ST-QA-45 | print_input_blockers | LULUS DALAM CAKUPAN | Input blocking menolak payload sebelum font; uji unit aktual. |
| ST-QA-46 | semantic_editing | SEBAGIAN | Kode/semantik literal dan diff besar diuji tanpa mengubah sumber. |
| ST-QA-47 | asset_cache | SEBAGIAN | Alias/cache/penggantian aset/riwayat unit dan handler DOM; browser baru belum. |
| ST-QA-48 | remote_assets | SEBAGIAN | Izin sumber eksternal ditinjau; redirect/CORS browser belum. |
| ST-QA-49 | admission_limits | SEBAGIAN | Byte/struktur/ZIP/proyek/inline pixel admission diuji; semua pola adversarial belum. |
| ST-QA-50 | local_workers | SEBAGIAN | Worker handler Node dan lifecycle/cleanup lulus; Worker browser baru belum. |
| ST-QA-51 | glyph_coverage | SEBAGIAN | 104 font lama didekode, cakupan diregenerasi, font plan brand/math diuji; glyph universal tidak didukung. |
| ST-QA-52 | privacy_canary | NOT_RUN / BLOCKED | Kanari jaringan membutuhkan browser baru. |
| ST-QA-53 | locale_theme_motion | SEBAGIAN | String ID/EN dan theme diperiksa; native motion/theme/browser baru belum. |
| ST-QA-54 | usability | NOT_RUN / BLOCKED | Belum ada peserta. |
| ST-QA-55 | ui_save_visibility | SEBAGIAN | Source/readiness/storage handler diperiksa; viewport browser baru belum. |
| ST-QA-56 | ui_revision_truth | SEBAGIAN | Status gagal mengalahkan stale processing pada DOM unit; browser baru belum. |
| ST-QA-57 | ui_single_job | SEBAGIAN | Dedupe/cancel lifecycle unit; UI browser baru belum. |
| ST-QA-58 | ui_export_dialog | SEBAGIAN | Timeout/abort/hasil terminal unit; dialog browser baru belum. |
| ST-QA-59 | ui_unsaved_form | SEBAGIAN | Source draf brand ditinjau; browser ganti bahasa/tema belum. |
| ST-QA-60 | ui_project_undo | SEBAGIAN | Undo/redo path/alias/commit ditolak diuji; browser baru belum. |
| ST-QA-61 | ui_open_paste | SEBAGIAN | Dispatcher format ditinjau/diuji; file picker sistem belum. |
| ST-QA-62 | ui_complete_lists | NOT_RUN / BLOCKED | Skenario jumlah revisi/sumber yang dipulihkan diperketat; belum dijalankan di browser. |
