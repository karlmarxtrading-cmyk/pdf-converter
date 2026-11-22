# Naskah dan HTML trigonometri acuan

Keempat template dibangun dari naskah pengguna yang sama. Salinan asli dan ekspor baru mempunyai lokasi serta peran berbeda agar perubahan CSS, matematika atau susunan dokumen dapat diperiksa kembali.

| Berkas | Yang dapat diperiksa | SHA-256 |
|---|---|---|
| [Naskah asli](../fixtures/rc6/user-trigonometry.md) | 15.280 byte sumber, termasuk TeX sebelum pemulihan | `1f4b9345ef5a092c40e66290821f110cee2656a093a889c0f51800bdd54bb16f` |
| [HTML BUS-01 milik pengguna](../examples/reference-rc6/RUMUS%20TRIGONOMETRI%201.html) | Struktur acuan, dua cabang KaTeX, aturan layout dan 10 font tersemat | `a82ecec4f37617d9730b1aeaf427c446c1e0f1acaa3ea9ffa37372f0126108ff` |
| [HTML EDU-01 dari RC6](../examples/RC6_TRIGONOMETRI_PENGGUNA.html) | Salinan utuh dengan 231 rumus dan 12 font. Pemeriksaan historis menemukan kekurangan aturan CSS layout KaTeX pada versi ini. | `328dbc489d9ba51b77f96d53b1d1c9ed54e53a1066e6b86f2839057b41a85ac1` |
| [HTML EDU-01 dari RC8](../examples/rc8/html/EDU-01.html) | Unduhan luring dengan 231 rumus, 12 font, CSS KaTeX lengkap, 77 heading, 5 tabel dan 22 tautan daftar isi | Lihat [hasil pemeriksaan byte](../evidence/rc8/browser/results/oracle.json) |

[Inventaris expected per rumus](../fixtures/rc6/user-trigonometry.expected.json) memuat TeX asli dan hasil pemulihan untuk pembandingan. [Verifikasi identitas bahan](../evidence/rc8/input/identity.json) mencatat ukuran dan SHA-256 ZIP RC6, ZIP RC7 serta ZIP audit yang dipakai. [Perintah implementasi asli](../evidence/rc8/input/PROMPT_ASTRA_PAPERFORMA_RC7_MENUJU_PRODUKSI_20261122.txt) dan daftar temuan audit disertakan bersama hasil.
