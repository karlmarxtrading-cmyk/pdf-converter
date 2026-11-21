/**
 * PF-022 / UX-09 / A11-08 — UI Indonesia/Inggris. Bahasa UI terpisah dari bahasa ISI dokumen
 * (Settings.contentLang). Mengganti bahasa UI tidak pernah menyentuh sumber, pengaturan dokumen, atau output.
 */
export type UiLang = 'id' | 'en';

const D = {
  'app.title.landing': ['PaperForma — susun dokumen rapi dari materi Anda', 'PaperForma — turn your material into tidy documents'],
  'app.title.workspace': ['Studio — PaperForma', 'Studio — PaperForma'],
  'skip': ['Lewati ke konten utama', 'Skip to main content'],
  'nav.main': ['Navigasi utama', 'Main navigation'], 'nav.home': ['PaperForma — beranda', 'PaperForma — home'], 'nav.panels': ['Panel studio', 'Studio panels'],
  'nav.formats': ['Format', 'Formats'], 'nav.how': ['Cara kerja', 'How it works'], 'nav.privacy': ['Privasi', 'Privacy'],
  'nav.docs': ['Panduan', 'Guide'], 'nav.open': ['Buka studio', 'Open studio'],
  'theme.label': ['Tema aplikasi', 'App theme'], 'theme.system': ['Ikuti sistem', 'System'], 'theme.light': ['Terang', 'Light'], 'theme.dark': ['Gelap', 'Dark'],
  'lang.label': ['Bahasa antarmuka', 'Interface language'],
  'hero.title': ['Susun dokumen rapi dari materi Anda.', 'Turn your material into tidy documents.'],
  'hero.sub': ['Buka Markdown, teks, ZIP, atau proyek PaperForma. Atur tampilan, periksa halaman, lalu simpan HTML atau gunakan cetak browser untuk menyimpan PDF. Isi Anda tidak diringkas atau ditulis ulang.', 'Open Markdown, text, ZIP or a PaperForma project. Adjust the look, check the pages, then save HTML or use browser printing to save a PDF. Your text is never summarised or rewritten.'],
  'cta.paste': ['Tempel teks', 'Paste text'], 'cta.conv': ['Tempel percakapan', 'Paste a conversation'], 'cta.sample': ['Coba contoh', 'Try a sample'],
  'hero.noaccount': ['Tanpa akun dan tanpa biaya. Dokumen diproses di browser Anda; situs ini hanya mengirim berkas aplikasi.', 'No account and no charge. Documents are processed in your browser; this site only serves the application files.'],
  'proof.caption': ['Contoh di atas dirender langsung oleh mesin PaperForma di browser Anda — bukan gambar.', 'The sample above is rendered live by the PaperForma engine in your browser — not an image.'],
  'proof.frame': ['Contoh dokumen yang dirender', 'Rendered sample document'],
  'io.title': ['Masuk dan keluar', 'In and out'],
  'io.in.t': ['Yang dapat dibuka', 'What you can open'],
  'io.in.1': ['Markdown atau teks (.md, .markdown, .txt) — UTF-8', 'Markdown or text (.md, .markdown, .txt) — UTF-8'],
  'io.in.2': ['Teks atau HTML yang ditempel, termasuk percakapan AI', 'Pasted text or HTML, including AI conversations'],
  'io.in.3': ['ZIP berisi naskah Markdown dan gambarnya', 'ZIP containing Markdown and its images'],
  'io.in.4': ['Gambar PNG, JPEG, WebP, GIF, SVG', 'PNG, JPEG, WebP, GIF, SVG images'],
  'io.in.5': ['Proyek PaperForma (.pfproj), termasuk dari versi 2.0', 'PaperForma projects (.pfproj), including from version 2.0'],
  'io.out.t': ['Yang dapat dihasilkan', 'What you can produce'],
  'io.out.1': ['Cetak / Simpan PDF lewat dialog cetak browser', 'Print / Save PDF through the browser print dialog'],
  'io.out.2': ['Satu berkas HTML mandiri (tanpa skrip, bisa dibuka luring)', 'A single self-contained HTML file (no scripts, works offline)'],
  'io.out.3': ['ZIP HTML (index.html + aset + manifest SHA-256)', 'HTML ZIP (index.html + assets + SHA-256 manifest)'],
  'io.out.4': ['HTML publikasi untuk hosting Anda sendiri', 'Publication HTML for your own hosting'],
  'io.out.5': ['Paket proyek .pfproj yang dapat dibuka dan disunting lagi', 'A .pfproj project bundle you can reopen and edit'],
  'io.not': ['Belum didukung: impor PDF, DOCX, atau OCR gambar. PDF dibuat oleh dialog cetak browser Anda, bukan oleh situs ini.', 'Not supported yet: importing PDF, DOCX or image OCR. PDFs are produced by your browser print dialog, not by this site.'],
  'steps.title': ['Cara kerja', 'How it works'],
  'step1.t': ['Masukkan materi', 'Add material'], 'step1.d': ['Buka berkas atau tempel teks. Materi asli selalu disimpan di proyek dan dapat dilihat kembali.', 'Open a file or paste text. The original material is always kept in the project and can be viewed again.'],
  'step2.t': ['Pilih format', 'Choose a format'], 'step2.d': ['Modul belajar, laporan, esai panjang, atau transkrip percakapan. Gaya tidak mengubah isi; setiap perubahan dapat diurungkan.', 'Learning module, report, long essay or conversation transcript. Style never changes content; every change can be undone.'],
  'step3.t': ['Periksa dan ekspor', 'Check and export'], 'step3.d': ['Lihat temuan keutuhan isi, aset, dan halaman, lalu simpan HTML atau cetak ke PDF.', 'Review findings on content integrity, assets and pages, then save HTML or print to PDF.'],
  'formats.title': ['Empat templat', 'Four templates'],
  'formats.sub': ['Contoh dirender saat bagian ini terlihat. Semua templat tersedia tanpa batasan.', 'Samples render when this section is visible. All templates are available without restriction.'],
  'privacy.title': ['Apa yang terjadi pada dokumen Anda', 'What happens to your document'],
  'privacy.local.t': ['Diproses di browser', 'Processed in your browser'], 'privacy.local.d': ['Pratinjau, pemeriksaan, HTML, paket proyek dan persiapan cetak berjalan di perangkat Anda. Isi dokumen tidak dikirim ke server mana pun.', 'Preview, checks, HTML, project bundles and print preparation run on your device. Document content is not sent to any server.'],
  'privacy.net.t': ['Akses jaringan', 'Network access'], 'privacy.net.d': ['Situs memuat berkas aplikasinya sendiri. Gambar dari alamat https hanya dimuat bila Anda mengizinkannya; situs asal gambar dapat melihat alamat IP Anda.', 'The site loads its own application files. Images from https addresses load only if you allow it; the image host can see your IP address.'],
  'privacy.store.t': ['Penyimpanan', 'Storage'], 'privacy.store.d': ['Secara bawaan tidak ada yang disimpan. Simpan proyek di perangkat ini hanya jika Anda mengaktifkannya; unduh paket .pfproj sebagai cadangan; hapus kapan saja.', 'Nothing is stored by default. Projects are saved on this device only if you turn it on; download a .pfproj bundle as a backup; delete any time.'],
  'privacy.truth.t': ['Bukan pemeriksa fakta', 'Not a fact checker'], 'privacy.truth.d': ['Pemeriksaan keutuhan memastikan format tidak menghilangkan atau mengubah isi. Kebenaran isi tetap tanggung jawab penulis.', 'Integrity checks confirm formatting did not drop or alter content. The truth of the content remains the author\'s responsibility.'],
  'ws.docname': ['Nama dokumen', 'Document name'],
  'ws.open': ['Buka berkas', 'Open file'],
  'ws.menu': ['Lainnya', 'More'],
  'ws.menu.new': ['Proyek baru', 'New project'],
  'ws.menu.paste': ['Tempel teks…', 'Paste text…'],
  'ws.menu.conv': ['Tempel percakapan…', 'Paste conversation…'],
  'ws.menu.assets': ['Tambah gambar…', 'Add images…'],
  'ws.menu.raw': ['Lihat sumber mentah', 'View raw source'],
  'ws.menu.history': ['Riwayat revisi…', 'Revision history…'],
  'ws.menu.projects': ['Penyimpanan & proyek…', 'Storage & projects…'],
  'ws.menu.openbundle': ['Buka paket proyek…', 'Open project bundle…'],
  'ws.menu.savebundle': ['Simpan paket kerja (.pfproj)', 'Save work bundle (.pfproj)'],
  'ws.publish': ['Periksa dan ekspor', 'Check and export'], 'ws.publish.short': ['Ekspor', 'Export'],
  'ws.undo': ['Urungkan', 'Undo'], 'ws.redo': ['Ulangi', 'Redo'],
  'tab.source': ['Sumber', 'Source'], 'tab.outline': ['Struktur', 'Outline'], 'tab.assets': ['Aset', 'Assets'], 'tab.messages': ['Pesan', 'Messages'],
  'tab.preview': ['Pratinjau', 'Preview'], 'tab.doc': ['Dokumen', 'Document'], 'tab.pages': ['Halaman', 'Pages'],
  'tab.result': ['Format & periksa', 'Format & checks'], 'tab.checks': ['Pemeriksaan', 'Checks'],
  'preview.mode': ['Mode pratinjau', 'Preview mode'], 'frame.live': ['Pratinjau dokumen', 'Document preview'], 'frame.pages': ['Pratinjau halaman', 'Page preview'],
  'empty.title': ['Belum ada naskah', 'No document yet'], 'empty.desc': ['Buka berkas, tempel teks atau percakapan, atau coba contoh.', 'Open a file, paste text or a conversation, or try a sample.'],
  'open.formats': ['Didukung: .md, .markdown, .txt, .zip (naskah + gambar), .pfproj, PNG/JPEG/WebP/GIF/SVG. Seret berkas ke jendela ini juga bisa.', 'Supported: .md, .markdown, .txt, .zip (document + images), .pfproj, PNG/JPEG/WebP/GIF/SVG. You can also drop files on this window.'],
  'drop.hint': ['Lepaskan berkas untuk membuka', 'Drop files to open'],
  'pages.hint': ['Tampilan halaman dibuat dari revisi terbaru saat Anda memintanya. Pemeriksaan ini memuat font, gambar dan memaginasi seluruh dokumen.', 'The page view is built from the latest revision when you ask for it. This check loads fonts and images and paginates the whole document.'],
  'outline.empty': ['Belum ada judul. Judul Markdown (#, ##) akan muncul di sini.', 'No headings yet. Markdown headings (#, ##) appear here.'],
  'assets.hint': ['Gambar yang dirujuk naskah (PNG, JPG, WebP, GIF, SVG) atau ZIP berisi naskah dan gambarnya. Identitas gambar dihitung dari isinya.', 'Images referenced by the document (PNG, JPG, WebP, GIF, SVG) or a ZIP with document and images. Image identity is computed from its bytes.'],
  'assets.external': ['Izinkan memuat gambar eksternal (https) di pratinjau — situs tersebut dapat melihat alamat IP Anda. Cetak dan HTML luring tetap memerlukan salinan gambar.', 'Allow loading external (https) images in preview — those sites can see your IP address. Printing and offline HTML still need a copy of each image.'],
  'assets.empty': ['Belum ada aset.', 'No assets yet.'],
  'assets.remove': ['Hapus', 'Remove'], 'assets.replace': ['Ganti', 'Replace'],
  'goal.title': ['Format', 'Format'],
  'goal.apply.style': ['Terapkan gaya saja', 'Apply style only'],
  'goal.apply.full': ['Pakai rekomendasi format', 'Use format recommendation'],
  'goal.hint': ['“Terapkan gaya saja” mempertahankan kertas, margin, sampul, dan daftar isi yang Anda atur. “Pakai rekomendasi” menerapkan seluruh bawaan format.', '“Apply style only” keeps your paper, margins, cover and TOC. “Use recommendation” applies all format defaults.'],
  'set.details': ['Pengaturan lanjutan', 'Advanced settings'],
  'set.paper': ['Kertas', 'Paper'], 'set.orient': ['Orientasi', 'Orientation'], 'set.portrait': ['Tegak', 'Portrait'], 'set.landscape': ['Lanskap', 'Landscape'],
  'set.margins': ['Margin (mm)', 'Margins (mm)'], 'set.top': ['Atas', 'Top'], 'set.right': ['Kanan', 'Right'], 'set.bottom': ['Bawah', 'Bottom'], 'set.left': ['Kiri', 'Left'],
  'set.font': ['Huruf isi', 'Body font'], 'set.size': ['Ukuran (pt)', 'Size (pt)'], 'set.leading': ['Spasi baris', 'Line height'],
  'set.cover': ['Sampul', 'Cover page'], 'set.toc': ['Daftar isi', 'Table of contents'], 'set.tocdepth': ['Kedalaman daftar isi', 'TOC depth'],
  'set.chapter': ['Judul H1 mulai di halaman baru', 'Start each H1 on a new page'], 'set.pagenum': ['Nomor halaman', 'Page numbers'], 'set.pagestart': ['Nomor awal', 'Start number'],
  'set.header': ['Kepala halaman', 'Running header'], 'set.footer': ['Kaki halaman', 'Footer'], 'set.ink': ['Hemat tinta', 'Ink saver'],
  'set.contentlang': ['Bahasa isi dokumen', 'Document content language'], 'set.lang.und': ['Lainnya / campuran', 'Other / mixed'],
  'set.title': ['Judul', 'Title'], 'set.subtitle': ['Subjudul', 'Subtitle'], 'set.author': ['Penyusun', 'Author'], 'set.date': ['Tanggal (teks)', 'Date (text)'],
  'set.follow': ['Ikuti bawaan format', 'Follow format defaults'],
  'brand.title': ['Brand kit', 'Brand kit'], 'brand.name': ['Nama brand kit', 'Brand kit name'], 'brand.org': ['Nama lembaga', 'Organisation'], 'brand.accent': ['Warna aksen', 'Accent colour'],
  'brand.headfont': ['Huruf judul', 'Heading font'], 'brand.logo': ['Pilih logo…', 'Choose logo…'], 'brand.footer': ['Teks kaki', 'Footer text'], 'brand.save': ['Simpan brand kit', 'Save brand kit'], 'brand.none': ['Tanpa brand kit', 'No brand kit'], 'brand.delete': ['Hapus', 'Delete'],
  'brand.draft': ['Ada perubahan brand kit yang belum disimpan.', 'There are unsaved brand kit changes.'], 'brand.discard': ['Buang draf', 'Discard draft'],
  'store.title': ['Penyimpanan', 'Storage'], 'store.opt': ['Simpan proyek otomatis di perangkat ini (IndexedDB)', 'Save projects automatically on this device (IndexedDB)'], 'store.clear': ['Hapus semua data lokal', 'Delete all local data'],
  'store.status.desc': ['Status penyimpanan proyek. Tekan untuk membuka penyimpanan dan cadangan.', 'Project save status. Press to open storage and backups.'],
  'store.status.off': ['Belum disimpan', 'Not saved'], 'store.status.empty': ['Kosong', 'Empty'], 'store.status.bundle': ['Cadangan diminta', 'Backup requested'],
  'store.status.pending': ['Menyimpan…', 'Saving…'], 'store.status.saved': ['Tersimpan di perangkat', 'Saved on device'],
  'store.status.failed': ['Gagal disimpan', 'Save failed'], 'store.status.quota': ['Penyimpanan penuh', 'Storage full'], 'store.status.blocked': ['Penyimpanan diblokir', 'Storage blocked'], 'store.status.unavailable': ['Penyimpanan tidak tersedia', 'Storage unavailable'],
  'store.status.conflict': ['Konflik dua tab', 'Two-tab conflict'], 'store.status.deleted': ['Dihapus di tab lain', 'Deleted in another tab'],
  'checks.all': ['Semua', 'All'], 'checks.error': ['Perlu diperbaiki', 'Must fix'], 'checks.warning': ['Perlu diperiksa', 'Review'], 'checks.info': ['Info', 'Info'],
  'checks.filter': ['Saring temuan', 'Filter findings'], 'checks.category': ['Kategori', 'Category'], 'checks.search': ['Cari', 'Search'], 'checks.anycat': ['Semua kategori', 'All categories'],
  'checks.none': ['Tidak ada temuan pada pemeriksaan yang dijalankan.', 'No findings in the checks that were run.'],
  'checks.scope': ['Cakupan: keutuhan format, sintaks rumus, tabel, aset, struktur, keamanan, font; halaman setelah pemeriksaan halaman. Bukan pemeriksaan kebenaran fakta.', 'Scope: format integrity, formula syntax, tables, assets, structure, security, fonts; pages after the page check. Not a fact check.'],
  'checks.goto': ['Buka baris', 'Go to line'], 'checks.repair': ['Tinjau perbaikan…', 'Review fix…'], 'checks.layout': ['Periksa halaman (cetak)', 'Check pages (print)'],
  'checks.report': ['Unduh laporan lengkap (JSON)', 'Download full report (JSON)'],
  'checks.see': ['Lihat hasil pemeriksaan', 'View check results'],
  'pager.prev': ['‹ Sebelumnya', '‹ Previous'], 'pager.next': ['Berikutnya ›', 'Next ›'],
  'status.ready': ['Siap', 'Ready'], 'status.review': ['Perlu diperiksa', 'Needs review'], 'status.fix': ['Perlu diperbaiki', 'Needs fixing'], 'status.unchecked': ['Belum diperiksa', 'Not checked'], 'status.processing': ['Memproses…', 'Processing…'], 'status.failed': ['Gagal diproses', 'Processing failed'],
  'flow.label': ['Alur kerja', 'Workflow'], 'flow.input': ['Masukkan', 'Add text'], 'flow.check': ['Periksa', 'Check'], 'flow.style': ['Atur gaya', 'Style'], 'flow.preview': ['Pratinjau halaman', 'Page preview'], 'flow.save': ['Simpan HTML / Cetak PDF', 'Save HTML / Print PDF'],
  'flow.state.done': ['selesai', 'done'], 'flow.state.todo': ['belum', 'to do'], 'flow.state.attention': ['perlu perhatian', 'needs attention'],
  'target.html': ['HTML', 'HTML'], 'target.print': ['Cetak / PDF', 'Print / PDF'],
  'paste.title': ['Tempel teks', 'Paste text'], 'paste.conv.title': ['Tempel percakapan', 'Paste conversation'],
  'paste.hint': ['Tempel di sini (Ctrl/⌘+V). Teks biasa dan teks terformat diterima. Materi asli tetap disimpan; periksa hasil sebelum diterapkan.', 'Paste here (Ctrl/⌘+V). Plain and formatted text are accepted. The original material is kept; review the result before it is applied.'],
  'paste.mode': ['Cara memasukkan', 'How to add'], 'paste.insert': ['Sisipkan di posisi kursor', 'Insert at cursor'], 'paste.append': ['Tambahkan sebagai bagian baru', 'Append as new section'], 'paste.replace': ['Ganti seluruh sumber', 'Replace entire source'],
  'paste.replace.warn': ['Seluruh sumber saat ini akan diganti. Anda dapat mengurungkannya.', 'The entire current source will be replaced. You can undo this.'],
  'paste.rich': ['Clipboard berisi teks terformat. Pilih representasi yang dipakai:', 'The clipboard contains formatted text. Choose which representation to use:'],
  'paste.rich.stale': ['Teks sudah Anda edit setelah ditempel, jadi format asli tidak lagi sepadan dan tidak dipakai. Teks yang terlihat dipakai apa adanya.', 'You edited the text after pasting, so the original formatting no longer matches and is not used. The visible text is used as is.'],
  'paste.rich.md': ['Ubah format menjadi Markdown (tinjau perubahan)', 'Convert formatting to Markdown (review changes)'], 'paste.rich.plain': ['Pakai teks biasa apa adanya', 'Use plain text as is'],
  'paste.use': ['Gunakan', 'Use'], 'cancel': ['Batal', 'Cancel'], 'close': ['Tutup', 'Close'], 'apply': ['Terapkan', 'Apply'], 'confirm': ['Konfirmasi', 'Confirm'],
  'paste.size': ['Ukuran', 'Size'],
  'conv.summary': ['Ringkasan impor', 'Import summary'], 'conv.msgs': ['pesan dikenali', 'messages recognised'], 'conv.selected': ['dipilih', 'selected'],
  'conv.mode': ['Bentuk hasil', 'Output form'], 'conv.mode.answer': ['Satu jawaban', 'Single answer'], 'conv.mode.selected': ['Pesan terpilih', 'Selected messages'], 'conv.mode.transcript': ['Transkrip', 'Transcript'], 'conv.mode.curated': ['Dokumen terkurasi', 'Curated document'], 'conv.mode.appendix': ['Lampiran sumber', 'Source appendix'],
  'conv.role': ['Peran', 'Role'], 'conv.role.user': ['Pengguna', 'User'], 'conv.role.assistant': ['Asisten', 'Assistant'], 'conv.role.system': ['Sistem', 'System'], 'conv.role.other': ['Pembicara lain', 'Other speaker'], 'conv.role.unknown': ['Tidak diketahui', 'Unknown'],
  'conv.conf.low': ['perlu konfirmasi', 'needs confirmation'], 'conv.up': ['Naikkan', 'Move up'], 'conv.down': ['Turunkan', 'Move down'], 'conv.split': ['Pisah di sini', 'Split here'], 'conv.merge': ['Gabung dengan berikutnya', 'Merge with next'],
  'conv.showroles': ['Tampilkan label peran', 'Show role labels'], 'conv.build': ['Buat dokumen', 'Build document'], 'conv.dupe': ['Mirip pesan lain — keduanya dipertahankan', 'Similar to another message — both are kept'],
  'export.title': ['Periksa dan ekspor', 'Check and export'], 'export.snapshot': ['Revisi', 'Revision'], 'export.target': ['Hasil', 'Output'],
  'export.print': ['Cetak / Simpan PDF — lewat dialog cetak browser', 'Print / Save PDF — through the browser print dialog'],
  'export.html.standalone': ['Satu berkas HTML — mandiri, tanpa skrip, bisa dibuka luring', 'Single HTML file — self-contained, no scripts, works offline'],
  'export.html.zip': ['ZIP HTML — index.html + assets/ + manifest', 'HTML ZIP — index.html + assets/ + manifest'],
  'export.html.pub': ['HTML publikasi — responsif, untuk hosting Anda sendiri (tidak dipublikasikan otomatis)', 'Publication HTML — responsive, for your own hosting (not published automatically)'],
  'export.pub.online': ['Varian daring: izinkan gambar https eksternal (tidak tersedia luring)', 'Online variant: allow external https images (not available offline)'],
  'export.pub.enhance': ['Sertakan skrip kecil tombol salin kode (opsional; dokumen tetap lengkap tanpa skrip)', 'Include a small copy-code button script (optional; the document is complete without it)'],
  'print.help.t': ['Cara menyimpan PDF dari dialog cetak', 'How to save a PDF from the print dialog'],
  'print.help.1': ['Pada tujuan/printer, pilih “Simpan sebagai PDF” atau tujuan PDF yang tersedia di browser/OS Anda.', 'For destination/printer, choose “Save as PDF” or the PDF destination available in your browser/OS.'],
  'print.help.2': ['Gunakan ukuran kertas dan orientasi yang sama dengan pengaturan dokumen; skala 100% (Default).', 'Use the same paper size and orientation as the document settings; scale 100% (Default).'],
  'print.help.3': ['Matikan “Header and footers” browser bila templat sudah memiliki kepala/kaki halaman; aktifkan “Background graphics” bila tersedia.', 'Turn off the browser “Headers and footers” when the template has its own; enable “Background graphics” when available.'],
  'print.help.4': ['Aplikasi tidak dapat melihat apakah berkas PDF benar-benar disimpan. Periksa berkas Anda setelah dialog ditutup.', 'The app cannot see whether a PDF file was actually saved. Check your file after the dialog closes.'],
  'print.help.matrix': ['Periksa pratinjau halaman sebelum mencetak. Hasil PDF mengikuti mesin cetak dan pengaturan browser Anda. Untuk kandidat ini, pengujian visual browser dan dialog cetak masih perlu dijalankan; lihat docs/KNOWN_LIMITS.md.', 'Check the page preview before printing. The PDF follows your browser print engine and print settings. Browser visual checks and the native print dialog still require validation for this candidate; see docs/KNOWN_LIMITS.md.'],
  'export.go': ['Buat hasil', 'Create output'], 'export.go.print': ['Siapkan cetak', 'Prepare print'], 'export.cancel': ['Batalkan proses', 'Cancel process'], 'export.retry': ['Coba lagi', 'Retry'],
  'export.download': ['Unduh lagi', 'Download again'], 'export.open': ['Buka hasil', 'Open result'], 'export.savebundle': ['Simpan paket kerja', 'Save work bundle'],
  'export.blocked': ['Hasil final tidak dibuat karena ada masalah yang dapat menghilangkan atau mengubah isi. Perbaiki dahulu; sumber Anda tetap utuh.', 'The final output was not created because some problems could lose or change content. Fix them first; your source is intact.'],
  'export.confirm': ['Masalah berikut tetap ada di hasil. Hasil dibuat hanya bila Anda menyetujuinya:', 'The following problems remain in the output. It is created only if you accept them:'],
  'export.confirm.ack': ['Saya sudah meninjau masalah di atas dan tetap ingin membuat hasil ini.', 'I have reviewed the problems above and still want this output.'],
  'export.stale': ['Sumber berubah selama proses; hasil ini usang dan tidak dipakai.', 'The source changed during processing; this result is stale and was discarded.'],
  'export.done': ['Berkas siap diunduh', 'File ready to download'], 'export.failed': ['Gagal membuat hasil', 'Could not create the output'], 'export.cancelled': ['Proses dibatalkan. Sumber dan pengaturan tetap utuh.', 'Process cancelled. Source and settings are intact.'],
  'export.gotochecks': ['Buka pemeriksaan', 'Open checks'],
  'print.ready': ['Halaman siap dicetak', 'Pages ready to print'], 'print.open': ['Buka dialog cetak', 'Open print dialog'], 'print.again': ['Cetak lagi', 'Print again'],
  'print.requested': ['Dialog cetak diminta. Pilih tujuan PDF lalu simpan. Untuk membatalkan, gunakan tombol Batal pada dialog browser.', 'Print dialog requested. Choose a PDF destination and save. To cancel, use Cancel in the browser dialog.'],
  'print.returned': ['Dialog cetak sudah ditutup. Aplikasi tidak dapat mengetahui apakah PDF disimpan atau dibatalkan — periksa berkas Anda.', 'The print dialog has closed. The app cannot tell whether a PDF was saved or cancelled — check your file.'],
  'print.unknown': ['Penutupan dialog cetak tidak teramati di browser ini. Halaman cetak tetap disiapkan; Anda dapat mencetak lagi.', 'The print dialog closing was not observable in this browser. The print pages remain prepared; you can print again.'],
  'notice.dismiss': ['Tutup pemberitahuan', 'Dismiss notice'],
  'notices.region': ['Pemberitahuan', 'Notifications'],
  'raw.title': ['Sumber mentah', 'Raw source'], 'raw.hint': ['Ini adalah input asli yang Anda masukkan, ditampilkan sebagai teks. Normalisasi dan Urungkan tidak menimpanya.', 'This is the original input you provided, shown as text. Normalisation and Undo never overwrite it.'],
  'raw.download': ['Unduh sebagai teks', 'Download as text'],
  'projects.title': ['Penyimpanan & proyek', 'Storage & projects'], 'projects.list': ['Proyek di perangkat ini', 'Projects on this device'],
  'projects.empty': ['Belum ada proyek tersimpan di perangkat ini.', 'No projects saved on this device.'], 'projects.open': ['Buka', 'Open'], 'projects.delete': ['Hapus', 'Delete'],
  'projects.off': ['Penyimpanan otomatis tidak aktif. Aktifkan di atas, atau simpan paket kerja .pfproj sebagai cadangan. Paket .pfproj dapat dibuka tanpa penyimpanan.', 'Automatic saving is off. Turn it on above, or save a .pfproj work bundle as a backup. .pfproj bundles open without storage.'],
  'history.title': ['Riwayat revisi', 'Revision history'],
  'history.hint': ['Riwayat menyimpan hingga 100 revisi dan 6 MiB. Revisi lama dilepas bila batas tercapai; sumber aktif, input asli dan aset tidak terpengaruh. Pemulihan dibuat sebagai revisi baru dan dapat diurungkan.', 'History keeps up to 100 revisions and 6 MiB. Older revisions expire when the limit is reached; the active source, original inputs and assets are unaffected. A restore becomes a new revision and can be undone.'],
  'history.restore': ['Pulihkan revisi', 'Restore revision'], 'history.restore.text': ['Pulihkan teks revisi', 'Restore revision text'],
  'repair.title': ['Tinjau perubahan', 'Review changes'],
  'repair.before': ['Sebelum - teks lengkap', 'Before - complete text'],
  'repair.after': ['Sesudah - teks lengkap', 'After - complete text'],
  'repair.download': ['Unduh teks lengkap', 'Download complete text'],
  'repair.full': ['Materi panjang atau banyak berubah. Dua teks lengkap ditampilkan agar pemeriksaan tetap responsif; belum ada perubahan yang diterapkan. Anda dapat membaca, menyalin atau mengunduh setiap teks sebelum memilih Terapkan atau Batal.', 'The material is long or changes substantially. Both complete texts are shown to keep review responsive; no change has been applied. You can read, copy or download each text before choosing Apply or Cancel.'],
  'confirm.unsaved': ['Proyek sekarang memiliki perubahan yang belum disimpan.', 'The current project has unsaved changes.'],
  'choice.save': ['Simpan paket dulu', 'Save bundle first'], 'choice.discard': ['Lanjut tanpa menyimpan', 'Continue without saving'],
  'confirm.clear': ['Hapus semua proyek, brand kit, dan pengaturan yang tersimpan di perangkat ini? Berkas yang sudah Anda unduh tidak terpengaruh.', 'Delete all projects, brand kits and settings stored on this device? Files you already downloaded are not affected.'],
  'footer': ['PaperForma — studio dokumen statis. Isi Anda tetap milik Anda.', 'PaperForma — a static document studio. Your content stays yours.'],
  'footer.licenses': ['Lisensi pihak ketiga', 'Third-party licences'],
} as const;

export type Key = keyof typeof D;
let lang: UiLang = 'id';
const listeners = new Set<() => void>();

export function getLang(): UiLang { return lang; }
export function t(k: Key, vars?: Record<string, string | number>): string {
  const pair = D[k] as readonly [string, string] | undefined;
  let s = pair ? pair[lang === 'id' ? 0 : 1] : String(k);
  if (vars) for (const [n, v] of Object.entries(vars)) s = s.replaceAll(`{${n}}`, String(v));
  return s;
}
/** Pilih pesan bilingual dari core (message / messageEn). */
export function pick(id: string, en?: string): string { return lang === 'en' && en ? en : id; }

export function setLang(l: UiLang, persist = true): void {
  lang = l;
  document.documentElement.setAttribute('data-ui-lang', l);
  // Atribut lang dokumen APLIKASI mengikuti UI; iframe dokumen memakai Settings.contentLang.
  document.documentElement.lang = l;
  if (persist) { try { localStorage.setItem('pf.ui.lang', l); } catch { /* storage diblokir: preferensi tidak disimpan */ } }
  applyI18n(document);
  listeners.forEach((f) => f());
}
export function onLangChange(f: () => void): () => void { listeners.add(f); return () => listeners.delete(f); }

export function initLang(): UiLang {
  let stored: string | null = null;
  try { stored = localStorage.getItem('pf.ui.lang'); } catch { /* ignore */ }
  const nav = (navigator.language || 'id').toLowerCase();
  setLang(stored === 'en' || stored === 'id' ? stored : nav.startsWith('id') ? 'id' : nav.startsWith('en') ? 'en' : 'id', false);
  return lang;
}

/** data-i18n="key" → textContent; data-i18n-attr="aria-label:key;placeholder:key" → atribut. */
export function applyI18n(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n as Key); });
  root.querySelectorAll<HTMLElement>('[data-i18n-attr]').forEach((el) => {
    for (const part of (el.dataset.i18nAttr || '').split(';')) {
      const [a, k] = part.split(':'); if (a && k) el.setAttribute(a.trim(), t(k.trim() as Key));
    }
  });
}

export const DICT_KEYS = Object.keys(D) as Key[];
export function dictionaryComplete(): { missing: string[] } {
  const missing: string[] = [];
  for (const k of DICT_KEYS) { const p = D[k]; if (!p[0] || !p[1]) missing.push(k); }
  return { missing };
}
