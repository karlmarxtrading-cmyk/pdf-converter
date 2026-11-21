# Privasi

- **Tidak ada server aplikasi.** Situs hanya mengirim berkas statis. Pratinjau, pemeriksaan, ekspor HTML/ZIP, paket
  `.pfproj` dan persiapan cetak berjalan di browser. Isi dokumen, clipboard dan berkas tidak dikirim ke mana pun.
- **Tidak ada akun, telemetry, analytics, cookie pelacak.** CSP `connect-src 'self'` mencegah skrip aplikasi mengirim data
  ke origin lain.
- **Gambar https eksternal** hanya dimuat di pratinjau bila Anda mengaktifkan opsinya; situs pemilik gambar dapat melihat
  alamat IP Anda. Ekspor luring dan cetak memerlukan salinan lokal yang Anda unggah.
- **Penyimpanan perangkat** (IndexedDB) mati secara bawaan. Bila diaktifkan, proyek, riwayat revisi, input asli dan aset
  disimpan di browser ini saja; hapus kapan saja lewat “Hapus semua data lokal”. Preferensi bahasa/tema disimpan di
  `localStorage`.
- **Cetak / Simpan PDF** memakai dialog cetak browser/OS. Berkas PDF dibuat dan disimpan oleh browser/OS Anda; aplikasi
  tidak melihat byte PDF.
- Hosting (Cloudflare Pages) dapat mencatat log akses HTTP standar (alamat IP, URL berkas statis, user agent) sesuai
  kebijakan penyedia. URL tidak memuat isi dokumen.

Skenario kanari E18 dirancang untuk memeriksa kebocoran teks dokumen ke URL permintaan, origin lain, atau konsol. Hasil RC5 tersedia dalam ringkasan browser di `evidence/rc5/browser/`.
