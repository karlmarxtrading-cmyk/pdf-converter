> Arsip versi terdahulu. [Laporan aktif RC10](RELEASE_REPORT.md).

# Matriks kompatibilitas PaperForma RC8

Korpus menguji struktur masukan. Bentuk yang sama dapat disalin dari ChatGPT, Claude, Gemini, Copilot, DeepSeek, Grok, Perplexity, Qwen atau penyedia lain. Identitas penyedia tetap mengikuti asal sampel. Naskah trigonometri yang diberikan pengguna dan pasangan MIME sintetis yang disalin melalui browser dicatat terpisah.

| Masukan / jalur | Perilaku yang diuji | Bukti |
|---|---|---|
| Teks, Markdown, percakapan | Hierarki, kutipan, daftar, spasi kode, atribusi pesan, angka dan simbol; adanya label peran mengikuti isi asli | [Kasus per format dan batas](../evidence/rc8/wrappers/COMPATIBILITAS.md) |
| HTML dari clipboard | Pembungkus formula dengan prosa mandiri, tabel, kolom/baris gabungan, isi kosong, tautan; MIME HTML/plain di Chromium Linux | [Sampel dan hasil](../evidence/rc8/wrappers/) |
| Membuka .html / .htm | Dokumen UTF-8 termasuk BOM dan CRLF. Pengguna dapat membatalkan, menerapkan, melihat sumber asli, menyimpan .pfproj dan mengunduh HTML | [Unduhan editor dan pemeriksaan luring](../evidence/rc8/operations/rich-import.json) |
| Matematika | TeX mentah dan kanonik, urutan, inline/display, MathML, tampilan, CSS dan font. Kasus lengkap, ambigu dan fallback dibedakan | [Integritas](../evidence/rc8/integrity/) |
| Tabel, kode, gambar, SVG dan Mermaid | Tabel gabungan/sel kosong; baris kode/indentasi; decode gambar lokal; SVG dengan referensi internal; diagram valid dan teks sumber pada diagram gagal | [Format](../evidence/rc8/wrappers/COMPATIBILITAS.md) · [Contoh](../examples/rc8/) |
| Cetak BUS/EDU/EDT/CON | Pengaturan kertas dan orientasi, pemenggalan dan label kode, glif yang didukung, penolakan karakter privat yang tidak dipetakan | [Pemeriksaan PDF](../evidence/rc8/pdf/) |
| Browser, penyimpanan, aksesibilitas | Hasil ujung ke ujung mencatat OS, engine aktual, sumber clipboard, metode otomasi, dan perangkat yang belum diuji | [Penerimaan browser](../evidence/rc8/browser/) |
| Kapasitas dan performa | Konfigurasi, sampel, kegagalan serta batas yang benar-benar diukur | [Data performa](../evidence/rc8/performance/) |

Pada pratinjau panjang berisi 118 bagian, klik dan Enter memfokuskan heading terakhir. Seleksi mouse menyalin penanda bagian secara persis dengan optimasi tampilan hidup maupun mati. Semua 1.888 sel tetap dapat diperiksa dalam DOM. Pencarian native pada perangkat sasaran belum dijalankan. [Bukti navigasi pada build produksi](../evidence/rc8/operations/preview-navigation.json).

Makro LaTeX arbitrer, pemulihan persamaan dari gambar tanpa TeX, OCR dan impor berkas PDF/DOCX berada di luar fitur yang diterapkan. Angka cakupan mengacu pada fixture dan browser yang tercatat. [Keputusan rilis](RELEASE_REPORT.md).
