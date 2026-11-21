# Protokol payload

Ukur ukuran gzip level 9 dan byte mentah dari HTML awal, JavaScript entri, CSS dan seluruh preload yang dinyatakan pada index.html produksi. Ukur juga aset worker terpisah. Target sebelum perubahan: kurangi lebih dari 40 KiB gzip dari daftar startup tersebut dengan tetap memuat KaTeX setempat saat ada formula. Jumlah ini tidak mengukur request dinamis, browser cache, font pratinjau, waktu siap pakai, atau total transfer sesungguhnya. Korpus rumus, contoh beranda, Worker dan fallback perlu tetap merender sumber yang sama.
