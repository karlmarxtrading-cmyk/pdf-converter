# Performa RC7

Perbandingan terukur, status per metrik, median dan p95 terdapat dalam [hasil performa RC7](../evidence/rc7-perf/HASIL_PERFORMA.md). [Ketentuan pengukuran](../evidence/rc7-perf/PERFORMANCE_BUDGET.md) menjelaskan kondisi cache, baseline, urutan run dan jumlah pasangan. Sampel mentah disertakan dalam folder yang sama.

Pengukuran Chromium menjalankan editor produksi hingga konten dan font siap. Pada uji waktu ekspor, durasi berakhir saat byte siap diunduh. Pengujian unduhan berkas sesungguhnya memiliki bukti tersendiri. Node/jsdom mengukur bagian pemrosesan yang berbeda. Lihat metode untuk membandingkan angka dari jalur yang sama.

Aktivitas GC, pemanasan, versi browser, beban mesin dan sedikitnya pasangan pada dokumen berat memengaruhi sebaran. Pada lima sampel, p95 empiris adalah pengamatan terbesar. Hasil ini berlaku untuk data dan perangkat uji yang tercatat.
