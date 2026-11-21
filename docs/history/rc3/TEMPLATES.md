# Empat format rilis (G2)

Sumber kebenaran: `src/render/templates.ts` (versi templat dicatat di setiap snapshot dan manifest ekspor).
Pergantian format **tidak mengubah isi**. “Terapkan gaya saja” (`followTemplateDefaults=false`) mempertahankan kertas, margin,
sampul, daftar isi pengguna; “Pakai rekomendasi format” menerapkan seluruh bawaan.

| | EDU-01 Modul Belajar | BUS-01 Laporan Eksekutif | EDT-01 Esai dan Bab Panjang | CON-01 Transkrip Percakapan AI |
|---|---|---|---|---|
| Kertas bawaan | A4 tegak | A4 tegak | A5 tegak | A4 tegak |
| Margin (mm) | 20/18/20/20 | 18 | 18/16/18/16 | 18 |
| Huruf isi | Source Serif 4 11,5 pt / 1,5 | Inter 10,5 pt / 1,5 | Source Serif 4 10,5 pt / 1,6 | Inter 10,5 pt / 1,5 |
| Aksen | #275E73 | #245B75 | #6B4F3A | #526278 |
| Struktur khas | Kotak Konsep/Contoh/Latihan **hanya** dari penandaan pengguna (`> **Contoh 2.** …`) | Panel ringkasan dari bagian “Ringkasan” milik pengguna; kartu metrik hanya dari daftar data pengguna; tabel bukti selebar halaman | Pembuka bab, H1 di halaman baru, catatan akhir, running header bab | Kolom label pembicara 24 mm + 6 mm + isi; label selalu tertulis (tidak hanya warna); label lanjutan saat pesan terpotong halaman |
| Sampul / TOC bawaan | tidak / ya (H1–H2) | ya / ya | tidak / tidak | tidak / tidak |

Brand kit (nama lembaga, aksen, huruf judul, logo, teks kaki) diterapkan lewat variabel CSS yang sama pada keempat format.

Kemampuan yang tidak tersedia di rilis ini pada format mana pun: dua kolom, lanskap per bagian, catatan pinggir, catatan kaki
di dasar halaman (catatan dikumpulkan di akhir), PDF bertanda.
