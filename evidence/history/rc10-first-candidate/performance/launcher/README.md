# Pencatatan proses kandidat pertama

Driver resmi menulis hasil independen tiap kohort dalam JSON mentah. Penghitung ulang menghitung isi setiap sampel dan seluruh ambang secara terpisah.

Pembungkus shell diagnostik mencetak waktu dengan substitusi perintah sebelum membaca kode keluar child. Angka exit di log peluncur itu berasal dari perintah waktu dan tidak dapat dipakai untuk menyatakan bahwa driver sukses. Nilai childExitCode untuk kandidat ini diberi null. Status harness, per-arm error, status oracle, hash runtime, dan rasio tetap berasal dari berkas mentah asli. Kandidat berikutnya menggunakan observasi proses langsung dengan spawnSync dan menyimpan kode keluar driver beserta digest berkas.
