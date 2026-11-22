# Pengujian melalui studio produksi

Berkas di direktori ini menjalankan studio dari hasil build produksi dengan server HTTP lokal proyek. Semua aksi editor menggunakan elemen UI yang dilihat pengguna. Profil browser uji hanya berisi proyek sintetis. Statistik operasi yang selesai berada di `results/`. Observasi terikat pada kandidat dicatat pula oleh gerbang rilis.

| Bukti | Apa yang diperiksa |
|---|---|
| `results/trigonometry-downloads.json` dan `results/oracle.json` | Impor naskah pengguna dan unduh dari keempat template. Hash unduhan dicocokkan dengan tanda terima studio. HTML aktual dibuka saat luring. Setiap pasangan visual KaTeX dan MathML dibandingkan seluruh pohonnya dengan HTML acuan pengguna, termasuk teks dan atribut. Audit independen membandingkan struktur artikel, CSS/font, mode, sumber dan urutan rumus. |
| `results/content-outputs.json` | HTML aktual untuk percakapan empat pesan, dua jenis penyimpanan gambar, serta satu diagram valid dan satu diagram yang gagal. Sumber Mermaid yang gagal harus terlihat. Impor berkas wrapper campuran juga memeriksa hash sumber mentah dan isi mandiri sesudah konversi. |
| `results/uat.json` | Tombol Ctrl+C pada dokumen HTML sintetis yang dirender dan Ctrl+V pada editor. Browser membentuk sendiri pasangan MIME HTML/plain. Nilai pada panel sumber dibandingkan langsung dengan data `paste` yang diterima editor. Pemeriksaan WCAG otomatis, fokus keyboard, area hidup dan reflow diuji dalam studio produksi. |
| `results/browser-storage.json` | Penyimpanan sebelum dan sesudah opt-in, dua tab menyunting proyek sama, salinan konflik, pembukaan kembali, cancel/hapus satu proyek sintetis, kuota yang sengaja dibatasi, serta unduh dan impor ulang cadangan .pfproj. |
| `results/playwright-firefox.json` dan `results/playwright-webkit.json` | Impor, ekspor BUS-01, pembacaan HTML luring, font, rumus dan paginasi pada dua mesin Linux. |
| `results/native-save.json` | Kemampuan lingkungan untuk uji simpan cetak native. Pemberitahuan browser, sebuah halaman pratinjau dan berkas hasil API cetak otomatis masing-masing belum membuktikan satu berkas disimpan melalui dialog sistem. |

## Cakupan browser dan sumber sampel

| Lingkungan atau sumber | Jalur dan batas |
|---|---|
| Chromium Linux headless | Impor berkas, salin/tempel keyboard, unduh HTML, pembukaan luring dan interaksi penyimpanan diuji pada build produksi. Data mentah mencatat versi, identitas build dan hasil aktual masing-masing. |
| Firefox desktop Linux, WebKit WPE Linux | Satu template BUS-01 dari naskah asli lewat unduhan dan paginasi. Cakupan ini tidak mencakup Safari pada Mac atau iOS. |
| Chrome/Edge Windows, browser Android, Safari macOS/iOS | Perangkat sasaran belum tersedia untuk verifikasi aktual. |
| Naskah trigonometri dan HTML BUS-01 pengguna | Sampel pengguna yang menjadi acuan. Identitas penyedia AI atau browser saat teks mula-mula disalin tidak diketahui. |
| HTML/teks bergaya keluaran AI dan percakapan berlabel | Korpus sintetis yang dibuat di sini beserta fixture historis. Tombol Ctrl+C dan Ctrl+V digunakan. Tidak ada pembuktian sesi ChatGPT, Claude, Gemini, Copilot, DeepSeek, Grok, Perplexity atau Qwen yang masuk ke akun. |
| Teknologi bantu | Audit axe, pemeriksaan pohon aksesibilitas browser, fokus dan reflow dengan lebar efektif setara pembesaran. Penerimaan suara pembaca layar dan pembesaran native pada perangkat pengguna tetap memerlukan pengujian langsung. |
| Desktop cetak | Lingkungan shell dan desktop terkelola memiliki jalur berbeda. Berkas hasil cetak otomatis dan hasil percobaan desktop dicatat terpisah. |

## Menjalankan kembali

Dari root proyek, jalankan `npm ci` lalu `npm run build`. Siapkan `evidence/rc8/browser/results` sebelum menjalankan skrip. Gunakan Python dengan lxml, Chromium yang dapat dipakai Puppeteer dan Playwright dengan biner browser yang sesuai. Instalasi Playwright bersifat dependensi alat QA. Aplikasi statis tetap memakai dependensi lokal pada lockfile. Contoh berikut memakai jalur relatif dari root.

```sh
mkdir -p evidence/rc8/browser/results
python evidence/rc8/browser/verify-trig.py
node evidence/rc8/browser/content-outputs.mjs
node evidence/rc8/browser/storage-operations.mjs
node evidence/rc8/browser/uat.mjs
node evidence/rc8/browser/cross-engine.mjs firefox
node evidence/rc8/browser/cross-engine.mjs webkit
node evidence/rc8/browser/native-probe.mjs
```

`PF_CHROME` memilih Chromium untuk pengujian otomatis. `PF_HEADED_CHROME` menunjuk browser desktop. `PLAYWRIGHT_BROWSERS_PATH` menentukan direktori biner Playwright, `PF_PLAYWRIGHT_MODULE` dapat menunjuk paket Playwright yang disediakan lingkungan, dan `PF_ENGINE_EXECUTABLE` memilih launcher masing-masing bila diperlukan. Mesin WPE pada Linux memerlukan pustaka sistem yang cocok. Untuk mengikat eksekusi ke kandidat dan memeriksa perubahan source atau output, jalankan perintah tersebut melalui `scripts/acceptance.mjs observe` sesuai panduan penerimaan rilis.
