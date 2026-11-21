# Migrasi dari 2.0.0-rc.3 ke 3.0.0 (statis)

## Data pengguna

- **Proyek IndexedDB** (`paperforma2`) dipakai apa adanya: skema proyek tidak berubah (field riwayat baru `stateJson`
  opsional). Proyek RC3 terbuka langsung bila origin sama.
- **Paket `.pfproj` RC3** dapat dibuka lewat *Buka berkas* (diuji: `tests/unit/core/rc3-compat.test.ts`,
  fixture `fixtures/rc3-project.pfproj` dibuat dengan source RC3 asli).
- **Riwayat RC3** hanya menyimpan teks per revisi. Pemulihan revisi lama diberi label “Pulihkan teks revisi”.
  Revisi baru (3.0) menyimpan pengaturan, templat, brand kit, percakapan dan daftar aset.
- **Draf PaperForma 1.0** (`paperforma/drafts`) tetap ditawarkan untuk dibuka sebagai proyek baru; asli tidak diubah.
- **Akun/kuota/PDF server RC3**: tidak ada data pengguna yang perlu dimigrasi di sisi klien. Data backend RC3 (D1/R2/DO)
  berada di luar repository ini dan tidak dipakai lagi.

## Berpindah origin (staging → domain final, atau perangkat baru)

1. Di origin lama: buka proyek → Lainnya → **Simpan paket kerja (.pfproj)**.
2. Di origin baru: **Buka berkas** → pilih `.pfproj`.
3. Aktifkan penyimpanan otomatis di origin baru bila diinginkan.

## Perubahan perilaku yang terlihat

- Ekspor tidak lagi dapat “dilanjutkan dengan label belum lengkap”: masalah penghalang memblokir hasil final; masalah
  non-penghalang memerlukan persetujuan atas daftar spesifik.
- Karakter Private Use (U+E000–U+F8FF) kini dipertahankan; sebelumnya U+E001/U+E004 dapat berubah menjadi `$`/hilang.
- Tempel HTML yang hanya *menyebut* `data-message-author-role` kini diproses sebagai teks biasa (sebelumnya nol pesan).
