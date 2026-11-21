# PaperForma 2 — Core API (`src/core`)

Status: 3.0.0-rc.1 (statis). Pemilik: modul core. Konsumen: `src/render`, `src/ui`.

Tambahan 3.0: `verdictOf`/`classifyIssue` (`verdict.ts`), `ProjectUndo`/`changesFor` (`undo.ts`), `restoreRevisionChanges`/`historyEntryState` (riwayat dengan `stateJson`), `privateUseConservation` (oracle PUA), `chooseSentinels`/`restorePua(s, scan)` (sentinel per pemindaian), `IMAGE_BUDGET`, preflight target `'html' | 'print' | 'pdf'` + `identity`.
Impor: `import core, { … } from '../core'` (berkas `src/core/index.ts`). Objek default `core` mengimplementasikan
`CoreApi` dari `contracts.ts` persis; semua ekspor lain bersifat tambahan.

Konvensi:

- **Offset** sumber = indeks UTF-16 (sama dengan `textarea.selectionStart`, `String.slice`). **Ukuran anggaran** = byte UTF-8.
- **Issue** mengikuti `Issue` kontrak; core mengembalikan `CoreIssue` = `Issue` + `messageEn?` (Inggris) + `detail?` (data terstruktur
  pendek). `message` selalu Bahasa Indonesia. `id` berurutan per hasil (`issue-001`, `integrity-001`, …) — jangan dipakai sebagai kunci lintas render.
- Fungsi yang memerlukan DOM (dibutuhkan DOMPurify / DOMParser): `renderBody`, `checkIntegrity*`, `extractRenderedBlocks`, `sanitizeSvgBytes`
  (tanpa DOM: penolakan konservatif). Di browser otomatis; di vitest pakai `// @vitest-environment jsdom`. Fungsi lain murni dan berjalan di Node/browser.
- Core **tidak pernah** melakukan permintaan jaringan, mengeksekusi isi, atau mengubah `source`/input mentah.

## 1. CoreApi (kontrak)

| Anggota | Perilaku |
|---|---|
| `LIMITS` | Konfigurasi batas tunggal (lihat §2). Beku. |
| `utf8Length(s)` | Byte UTF-8 tanpa alokasi. |
| `sha256Hex(data)` | WebCrypto bila ada; fallback SHA-256 murni-JS (`sha256HexSync`) bila `crypto.subtle` tidak tersedia (konteks non-HTTPS). |
| `renderBody(source, opts)` | §4. |
| `assetDataUrl(asset)` | `data:` URL; cache dikunci `asset.id`+MIME **dan diverifikasi terhadap bytes** (objek sama atau sidik FNV atas seluruh bytes sama). Penggantian bytes tidak pernah mengembalikan isi lama (CODE-03/AST-02). SVG disanitasi dulu. LRU berbatas `DATA_URL_CACHE_MAX_CHARS` (64 Mi karakter). `clearDataUrlCache()` untuk proyek baru/hapus data, `evictAsset(id)` saat replace/delete (AssetStore sudah memanggilnya). |
| `makeSnapshot(project)` | §3. |
| `defaultSettings(template)` | Delegasi ke `templateDefaultSettings` di `src/render/templates.ts` (satu sumber kebenaran). |

## 2. InputBudget (PF-008, CODE-05/13, IMP-13/14, AST-07/08)

```ts
LIMITS = { markdownBytes: 5 MiB, pasteBytes: 5 MiB, pasteHtmlBytes: 5 MiB, assetBytes: 10 MiB, totalProjectBytes: 30 MiB,
  zipBytes: 30 MiB, zipEntries: 500, zipMaxDepth: 8, zipMaxRatio: 100, zipUnpackedBytes: 30 MiB,
  mathChars: 10000, maxNodes: 400000, maxTableCells: 50000, standaloneHtmlBytes: 25 MiB, pdfPayloadBytes: 45 MiB }
```
Angka = batas konfigurasi (nilai baseline `tE` dipertahankan), **bukan** kapasitas terukur.

- `checkBudget(kind, actual, limits?) → BudgetResult {ok, kind, limitKey, actual, limit, unit, code:'OK'|'BUDGET_EXCEEDED', message, messageEn}`.
  `kind ∈ markdown|paste|pasteHtml|asset|totalProject|zip|zipEntries|zipDepth|zipRatio|zipUnpacked|math|nodes|tableCells|standaloneHtml|pdfPayload`.
  Tepat di batas diterima; satu byte di atasnya ditolak. Pesan menyatakan input ditolak utuh dan dokumen aktif tidak berubah.
- `checkTextBudget('markdown'|'paste'|'pasteHtml', text)` — menghitung byte UTF-8 (bukan karakter).
- `readFileWithinBudget(file, 'markdown'|'asset'|'zip')` — memeriksa `file.size` **sebelum** `arrayBuffer()`; ukuran aktual diperiksa lagi.
- `assertBudget` / `BudgetError` untuk jalur yang lebih suka exception.
- `decodeUtf8Strict(bytes)` — `TextDecoder` fatal, BOM **dipertahankan** di teks (sumber mentah tidak diubah; IMP-01).
- UI: paste → `checkTextBudget('paste', plain)` dan `('pasteHtml', html)` sebelum apa pun; ekspor → `checkBudget('standaloneHtml'|'pdfPayload', bytes)`.

## 3. Hash, snapshot, revisi (PF-015, 03 §5, OPS-03, HTM-07)

`canonicalJson(v)`: kunci objek diurutkan (urutan unit UTF-16, `Array.prototype.sort`), properti `undefined` dihilangkan, tanpa spasi,
string via `JSON.stringify`, tanpa normalisasi Unicode, angka harus finite, `Uint8Array/Map/Set`/siklus ditolak.

| Hash | Definisi |
|---|---|
| `inputRawHash(plain, html?)` | tanpa html: `sha256(UTF-8 plain)`; dengan html: `sha256(canonical{html: sha256(html), plain: sha256(plain)})`. Disimpan di `InputRecord.rawSourceHash`. |
| `rawSourceHash` | tanpa input: `sha256(UTF-8 source)`; selain itu `sha256(canonical[{id, rawSourceHash}])` dengan hash **dihitung ulang** dari isi. |
| `contentSnapshotHash` | `sha256(canonical{source, conversation:{inputId, outputMode, selectedOrder, showRoles, editable?, curatedBlockIds?, publication?, messages[{id, role, speakerLabel, timestamp, markdown, selected}]}})`. |
| `renderInputHash` | `sha256(canonical{content: contentSnapshotHash, assets: [{path, mime, sha256(bytes aktual)}] terurut path, settings, brandKit, templateId, templateVersion, rendererVersion})`. |
| `outputHash` | dihitung lapisan ekspor (`sha256Hex(bytes)`). |

`makeSnapshot(project, {templateVersion?, rendererVersion?, now?})` → `Snapshot` beku dari **salinan dalam** (structuredClone);
`asset.id` di salinan diganti `sha256(bytes)` aktual. Default `templateVersion = TEMPLATE_VERSION` (render), `rendererVersion = RENDERER_VERSION`.

`RevisionGuard`: `begin(key?) → token {rev, key, signal}` membatalkan token sebelumnya (AbortSignal); `isCurrent(token)`;
`run(fn, key?) → {stale:false, value} | {stale:true}`; `invalidate()`. Pakai satu guard per jalur (preview, paginasi, ekspor): hasil `stale` **dibuang**, tidak dipublikasikan.

Offset: `utf16ToUtf8Offset`, `utf8ToUtf16Offset`, `utf16ToCodePointOffset`, `rangeToUtf8`. Melempar `RangeError` bila offset membelah pasangan surrogate / urutan UTF-8.

## 4. `renderBody(source, opts)` → `RenderedBody`

`opts: RenderOptions & CoreRenderOptions` — tambahan opsional: `inputId` (default `'source'` atau `conversation.inputId`), `lang: 'id'|'en'`
(label struktural: judul catatan kaki, label pembicara, placeholder; default `'id'`), `parts: {id, startLine, endLine}[]` (namespace heading dokumen gabungan, dari `mergeDocuments`), `appendixTitle`.

Panggil `snapshotRenderOptions(snapshot)` untuk memperoleh opsi dari revisi aktif. Bahasa label struktural mengikuti `settings.contentLang` (Inggris untuk `en` beserta variannya, Indonesia sebagai fallback). `sourcePath` menyimpan nama anggota ZIP Markdown pilihan dan ikut dihitung di `renderInputHash`. Semua referensi gambar relatif memakai direktori anggota tersebut. Referensi dengan awalan `/` mengacu ke akar arsip. Query dan fragmen lokal diabaikan saat pencocokan. Persen di-decode satu kali per segmen dan referensi yang keluar akar ditolak. Nama berkas yang memuat tanda pagar, persen, atau tanda tanya literal dapat dirujuk sebagai `%23`, `%25`, dan `%3F`.

Dalam HTML tabel hasil konversi clipboard, `<code data-pf-formula="inline">` atau mode `display` menyimpan sumber LaTeX sebagai teks. Renderer menerima dua mode tersebut pada elemen berisi teks dan tanpa atribut lain, lalu menggunakan renderer rumus yang sama dengan Markdown. Integritas membandingkan mode dan isi tepat pada sel, judul, atau footer asal.

Keluaran `html` = isi tersanitasi (tanpa `<html>/<head>`/CSS). Struktur yang dapat diandalkan lapisan render/UI:

| Unsur | Markup |
|---|---|
| Blok tingkat atas | atribut `data-block-id` (stabil: hash jenis+isi, sufiks `-2…` untuk duplikat; tidak bergantung posisi) dan `data-line` (baris 1-based). HTML mentah tingkat atas tidak diberi id. |
| Judul | `id = {idPrefix}{partId-}h-{slug}` unik (`-2`, `-3`); `toc[]` urut dokumen. Judul catatan kaki tidak masuk TOC. |
| Rumus | `<span class="pf-math pf-math-inline" data-tex>` / `<div class="pf-math pf-math-display" data-tex>` berisi KaTeX (`htmlAndMathml`, `trust:false`, `maxExpand:1000`). LaTeX mentah selalu di `data-tex` + anotasi MathML. Gagal → kelas `pf-math-error` berisi `<code class="pf-math-src">$…$</code>` (sumber terlihat) + issue `MATH_PARSE_ERROR`/`MATH_TOO_LONG` (baris). |
| Mata uang | `$` literal (`$100 dan $250`, `\$`) tidak pernah menjadi rumus (aturan baseline: pembuka tak diikuti spasi; penutup tak didahului spasi & tak diikuti angka). `$\frac…` tanpa penutup → teks + `MATH_SUSPECT_UNTERMINATED`. `\(..\)`, `\[..\]`, `$$..$$` didukung. |
| Kode | `<pre class="pf-code" data-lang><code class="hljs language-x">` (highlight.js, hanya bahasa eksplisit; tidak dijalankan). `textContent` kode = sumber persis (tab/spasi utuh). |
| Mermaid | `<pre class="pf-mermaid" data-src="…">sumber</pre>`; `mermaidPending=true`. Lapisan DOM merender & mengganti; sumber tetap fallback. |
| Tabel | Semua sel dirender. Baris pendek: sel tambahan `<td class="pf-cell-missing" data-missing>` + `TABLE_MISSING_CELLS`; baris panjang: sel `pf-cell-extra` (tidak dibuang) + `TABLE_EXTRA_CELLS`. `detail.repair='table-pad'` → `repairTable(source, line)`. Nilai sel = teks (nol di depan, koma desimal, minus utuh). |
| Catatan kaki | gfm: `sup>a[data-footnote-ref][data-fn-label]`, id `{p}fn-x` / `{p}fnref-x(-2)`; `section.footnotes` dengan `li[data-fn-def][data-block-id]` dan backref. `[^x]` tanpa definisi → teks + `FOOTNOTE_DANGLING` (`footnotes[]` entri `defined:false`). Definisi tak dirujuk → `FOOTNOTE_UNUSED` (tidak tampil). |
| Tautan | URL nonfragmen dipertahankan. Untuk fragmen, ID eksplisit atau slug judul (NFC, huruf kecil, tanda hubung, sufiks duplikat `-2` dst.) dipetakan ke ID keluaran dalam namespace pesan/bagian. Di luar namespace, target harus unik atau disebut dengan ID kanonik lengkap. `data-source-href` menyimpan referensi awal bila target berubah. Tujuan yang hilang atau ambigu memunculkan `FRAGMENT_TARGET_MISSING` di pemeriksaan. `http(s)` diberi `rel="noopener noreferrer"`. Skema selain http/https/mailto/tel/relatif/# → `href` dihapus, `data-blocked-href`, kelas `pf-link-blocked`, issue `SECURITY_UNSAFE_LINK`. |
| Gambar lokal | dicocokkan ke `opts.assets` lewat path ternormalisasi (decode persen, NFC, `./`, `..` dalam akar; spasi/Unicode). `<img src="data:…" data-asset-id data-src-path width height>`. |
| Gambar hilang | `<span class="pf-img-placeholder pf-img-missing" role="img" data-src-path>` + `IMAGE_MISSING_ASSET` (error, blocking). |
| Gambar eksternal | tanpa izin: `<span class="pf-img-placeholder pf-img-external" data-src>` (tidak ada `src` → tidak ada request; AST-04) + `IMAGE_EXTERNAL_BLOCKED`. Dengan `allowExternalImages` (https saja): `<img src referrerpolicy=no-referrer loading=lazy data-external>` + `PRIVACY_EXTERNAL_IMAGES`. Bila ada aset dengan `path === URL` (dari `embedRemoteCopy`) → salinan lokal dipakai. |
| Label UI | elemen `.pf-ui-label` adalah teks struktural (bukan isi sumber); pemeriksa integritas mengabaikannya. |
| Percakapan | pada API percakapan terstruktur lama, bila `opts.conversation` dan `outputMode !== 'answer'`: tiap pesan terpilih (urutan `selectedOrder`) → `<section class="pf-msg pf-role-{role}" data-role data-message-id id="{p}msg-n" aria-label>` berisi `<header class="pf-msg-label pf-ui-label"><span class="pf-msg-role">Pengguna</span> <span class="pf-msg-time">…</span></header>` (bila `showRoles` atau mode transcript) dan `<div class="pf-msg-body">`. Id di dalam pesan memakai prefix `{p}m{n}-`. `source-appendix`: naskah utama + `<section class="pf-appendix">` dengan `h2` + pesan. |

Sanitasi (HTM-05, SEC-01): HTML mentah pengguna melewati allow-list di tingkat hast — `script/style/iframe/object/embed/svg/math/form controls…`
dibuang beserta isi (`SECURITY_SCRIPT_REMOVED`/`SECURITY_ELEMENT_REMOVED`, dengan baris dan cuplikan), `form`/elemen tak dikenal dibuka
(`SECURITY_ELEMENT_UNWRAPPED`), `on*` (`SECURITY_EVENT_HANDLER`), `style` (`SECURITY_INLINE_STYLE`), `name` (`SECURITY_DOM_CLOBBERING`),
atribut lain (`SECURITY_ATTRIBUTE_REMOVED`); `id` pengguna diberi prefix `{p}u-`; atribut internal `data-*` pf dan kelas `pf-*`/`katex*` dari HTML mentah dibuang (tidak dapat dipalsukan). Lalu DOMPurify (allow-list ketat, `SANITIZE_DOM`) atas seluruh keluaran; penghapusan tambahan dilaporkan `SECURITY_SANITIZER_REMOVED`. KaTeX disisipkan setelah sanitasi ke slot bernonce acak.

Frontmatter YAML di awal naskah (`---`…`---`) tidak dirender; pasangan `kunci: nilai` dikembalikan di `rendered.frontmatter = {raw, startLine, endLine, data, valid}` (tambahan di luar kontrak); baris tak terbaca → `FRONTMATTER_INVALID`. Nilai `data-tex` dan `data-src` mermaid diset SETELAH DOMPurify (nilai bebas seperti `-->` tetap utuh).
`speakerDisplay(message, lang)` memberi label tertulis yang sama dengan yang dipakai renderBody/compose (mis. "Asisten (ChatGPT)"; label generik tidak diulang).

Issue lain: `INPUT_TOO_COMPLEX` (node mdast > `maxNodes`; tetap dirender, blocking), `OUTER_FENCE` (deteksi pembungkus, `detail.repair='unwrap-fence'`), `HEADING_LEVEL_SKIP`, `HEADING_EMPTY`, `HEADING_DUPLICATE`, `IMAGE_NO_ALT`, `CITATION_UNRESOLVED` (token sitasi AI tanpa URL; tidak ada tautan dikarang), `TABLE_TOO_LARGE`, `CONVERSATION_NOTHING_SELECTED`.

`blocks[]`: `{id, type, line, text, sourceRef:{inputId, start, end, unit:'utf16', messageId?}, messageId?}` untuk semua blok tingkat atas (termasuk definisi catatan kaki dan HTML mentah). Pada mode percakapan, `line` relatif terhadap pesan dan `sourceRef` dipetakan ke `rawPlain` (`messageStart = sourceRef.end − markdown.length`; perkiraan bila pesan digabung manual, flag `source-span-approximate`).
`stats`: words/tables/math/images/code/mermaid. `scripts`: `Latin, Greek, Cyrillic, Arabic, Hebrew, Han, Hiragana, Katakana, Hangul, Thai, Devanagari, Emoji` yang muncul (untuk resolver font).

## 5. Pemeriksa keutuhan berurutan (PF-016, CODE-04)

- `checkIntegrity(source, rendered|html|Element|Document, {idPrefix?})` / `checkRenderIntegrity(source, rendered, {idPrefix?, conversation?})` → `IntegrityReport {scope, ok, checkedBlocks, skippedBlocks, coverage, issues}`.
  Bisa diberi DOM hasil paginasi (selama `data-block-id` dipertahankan).
- Membandingkan **per blok, berurutan**: urutan blok (`INTEGRITY_BLOCK_ORDER`), blok hilang/asing, token berurutan termasuk tanda dan operator
  (`+ − - = % $ ^ _`, desimal `1,25` / `1.250.000`, minus) — `INTEGRITY_TOKEN_CHANGED`; matriks sel tabel sel-demi-sel (`INTEGRITY_TABLE_*`);
  sumber rumus (`INTEGRITY_MATH_CHANGED`); teks kode persis (`INTEGRITY_CODE_CHANGED`); tautan, gambar, rujukan & definisi catatan kaki; nomor awal daftar.
- `compareText(a, b)` / `compareTokens` / `orderedTokens` untuk pasangan bebas: `A + B = C`≠`A - B = C`, `-5`≠`5`, `A membayar B`≠`B membayar A`.
- `INTEGRITY_SCOPE` (id/en): **memeriksa keutuhan format, bukan kebenaran fakta/matematis.** HTML mentah dinilai oleh laporan sanitasi (dilewati, dicatat di `skippedBlocks`).

## 6. Pembungkus & perbaikan (IMP-02, SEM-05)

- `detectWrapper(source) → {kind:'none'} | {kind:'single'|'ambiguous', openLine, closeLine, info, fence, reason, reasonEn, innerClosesEarly}`. Mendukung fence luar 3/4/5 backtick dan `~~~`; `innerClosesEarly=true` bila fence dalam menutup pembungkus menurut CommonMark.
- `unwrapWrapper(source, det) → ReversibleEdit` — hanya dipanggil atas keputusan eksplisit. Hanya baris pembuka/penutup dihapus.
- `repairTable(source, line) → ReversibleEdit | null` — sel kosong ditambahkan; tidak ada yang dibuang/digeser.
- `ReversibleEdit {id, label, labelEn, before, after, diff (unified), apply(cur), undo(cur)}`; `apply/undo` menolak (`SOURCE_CHANGED`) bila sumber sudah berubah.

## 7. Clipboard HTML → Markdown (IMP-04, SEM-07, CODE-06)

`htmlToMarkdown(html, {plain?, limits?}) → {ok:true, markdown, changes[], issues[], stats} | {ok:false, code:'BUDGET_EXCEEDED', budget, message}`.
Ditolak utuh sebelum parsing bila > `pasteHtmlBytes`. KaTeX/MathML: LaTeX diambil dari `annotation[encoding=application/x-tex]` sekali
(tampilan visual + MathML tersembunyi tidak diduplikasi); MathML tanpa anotasi → teks + `CLIPBOARD_MATH_NO_TEX`. Tabel dengan rowspan/colspan → blok HTML tabel tersanitasi + `TABLE_MERGED_CELLS_HTML`. `script`, `on*`, `style`, tautan `javascript:` dibuang dan dilaporkan. Bila `plain` diberikan: token text/plain yang tidak ada di hasil → `CLIPBOARD_PLAIN_MISMATCH`.

## 8. Transaksi tempel (PF-009, UX-03, IMP-05)

`new PasteLedger(initialText?, limits?)`:
`pasteAtCursor({start,end}, {plain, html?})`, `appendAsMessage({plain, html?})`, `replaceAll(clip, {confirmed:true})` (tanpa konfirmasi → `CONFIRM_REQUIRED`),
`edit(start, end, inserted)`, `syncFromText(nextTextareaValue)` (diff awalan/akhiran → satu transaksi), `convertFragment(fragmentId)` (mengganti **hanya**
rentang fragmen; `FRAGMENT_STALE` bila fragmen sudah diedit), `undo()`, `redo()` (satu transaksi = satu unit). Properti: `text`, `fragments`
(`{id, start, end, status:'live'|'stale'|'removed', rawPlain, rawHtml, selectionStart, selectionEnd, mode, converted}`), `canUndo`, `canRedo`, `history()`.
Rentang di-rebase saat edit di luar fragmen; penyisipan tepat di akhir fragmen tidak mengubah fragmen. Semua operasi memeriksa anggaran.

## 9. Percakapan (PF-019/020, IMP-06…12)

- `parsePlainConversation(text, inputId)` / `parseClipboardConversation({plain, html?}, inputId)` → `{conversation, issues, suggestions}`.
  Label dikenal (ID/EN: User/Pengguna/Anda/You/Kamu/Saya… ; Assistant/Asisten/ChatGPT/Claude/Gemini/Copilot/AI… ; System/Sistem; bentuk `You said:`, `**User:**`, `User (10:42):`) hanya di luar fence/kutipan/tabel. `Message.markdown` = irisan persis `rawPlain` (baris kosong di tepi dipangkas), `sourceRef` = label s.d. akhir isi. Teks sebelum label pertama → pesan `unknown` (`unlabeled-prefix`); tanpa label → satu pesan `unknown` (`no-speaker-labels`, mode `answer`). Flag: `possible-ui-chrome` (tidak dihapus), `consecutive-same-role`, `empty`. `Nama:` tak dikenal → `suggestions` saja. Timestamp hanya bila tertulis literal di label; `provider` hanya dari label tertulis (`confidence:'low'`).
  Jalur HTML: elemen `data-message-author-role` → satu pesan per elemen (offset pada rawHtml; flag `offsets-in-raw-html`).
- `suggestDuplicates(messages)` → saran `exact-duplicate`/`revision-candidate` dengan perbedaan token; `action:'keep-both'`. Tidak menghapus apa pun.
- Edit (mengembalikan Conversation baru + `op` untuk log revisi): `setRole`, `setSelected`, `selectMessages(ids)`, `reorderSelected(order)`, `setOutputMode`, `splitMessage(id, offset)`, `mergeMessages(a, b)`.
- `composeConversation(conv, {mode?, mainSource?, lang?, showRoles?, curated?:[{messageId, blockIndex}], appendixTitle?}) → {markdown, provenance[], issues, mode}`.
  `provenance` menutup seluruh keluaran: `{kind:'message'|'block'|'label'|'separator'|'main'|'appendix-title', outStart, outEnd, startLine, endLine, messageId?, sourceRef?, footnoteRenames?}`. Label catatan kaki tiap pesan diberi namespace `m{n}-`. `verifyComposition(result, conv)` membuktikan tidak ada kalimat baru/isi hilang (IMP-10). `curatedBlocks(message)` memberikan ID stabil, blok dan rentang asal. Studio menyimpan urutan ID dalam `conversation.curatedBlockIds`. Blok terpilih yang kehilangan definisi tautan/catatan kaki atau merujuk pesan yang dinonaktifkan menghasilkan kegagalan sebelum perubahan dokumen.

Studio memakai `conversation.editable=true`. Isi yang ditampilkan, diperiksa dan diekspor berasal dari `project.source`. **Buat dokumen** menerapkan pilihan dan menulis Markdown serta `conversation.publication` dalam satu revisi. `publicationFor(conversation, result)` mengikat rentang UTF-16 ke SHA-256 komposisi dan ke materi impor. Peta ini dapat dibaca melalui **Lihat sumber asli → Susunan terakhir**. Setelah penyuntingan bebas, peta tetap menjelaskan komposisi asal. Penerbitan memakai Markdown hasil suntingan. Jika isi kembali sama dengan hash awal melalui undo, susunan pembicara dapat ditampilkan kembali. Transkrip dan lampiran selalu menyertakan pembicara. Mode pesan terpilih mengikuti kontrol label. Kurasi dan jawaban tunggal memakai isi tanpa label.
- `mergeDocuments([{id, markdown}]) → {markdown, parts, footnoteMap}`; teruskan `parts` ke `renderBody` agar id heading menjadi `{docId}-h-…` (IMP-12).
- `importSummary(conv)`.

## 10. Aset (PF-004, CODE-03, AST-01…04) & gambar eksternal (PF-014, CODE-09)

`sniffMime(bytes)` (magic bytes PNG/JPEG/GIF/WebP/SVG), `imageDimensions(bytes, mime)`, `normalizeAssetPath(p)`, `sanitizeSvgBytes(bytes)`,
`createAssetRecord(bytes, path, origin)`. `new AssetStore(initial?, limits?, otherProjectBytes?)`: `add` (ganti path sama → id baru + `evictAsset` lama),
`addMany` (transaksional), `remove`, `get`, `list`, `totalBytes`. `resolveAsset(assets, url)`.
`listExternalImages(source, assets)`; `embedRemoteCopy(store, url, bytes)` — UI mengambil bytes **setelah** persetujuan; core tidak fetch.
`assetPreflight(snapshot) → {complete, total, resolved, missing, external, unresolvedExternal, message}` — `complete` hanya bila semua gambar punya salinan lokal.

## 11. ZIP (PF-033, CODE-17, AST-05…08)

`importZip(bytes, {limits?, existingProjectBytes?}) → {ok:true, markdown[] (SEMUA, terurut path), assets[], unsupported[], rejected[], needsSelection, totalUnpacked, entries} | {ok:false, fatal:{path, code, message}}`.
Central directory diperiksa sebelum inflate: jumlah entri, ukuran per berkas, rasio > `zipMaxRatio`, total terekstrak, kedalaman, `..`, path absolut, backslash, duplikat kanonik (NFC, tanpa beda huruf besar), symlink, terenkripsi, ZIP64. Inflate streaming dengan batas keras; ukuran berbeda dari deklarasi → `ZIP_SIZE_MISMATCH`. `needsSelection=true` bila >1 naskah: UI wajib meminta pilihan dari **seluruh** daftar.
Stored dan deflate diverifikasi CRC32 sebelum dokumen atau aset dapat diterima. Ketidakcocokan menghasilkan ZIP_CRC_MISMATCH dan seluruh impor dibatalkan.

`importZipIntoProject(project, bytes)` — transaksional terhadap `totalProjectBytes`; gagal → proyek dikembalikan tanpa perubahan.

## 12. Proyek, paket, migrasi, penyimpanan, brand kit (PF-031/032, OPS-06/07/08, CODE-10)

- `createProject({name?, template?, source?})`, `makeInputRecord(kind, rawPlain, {rawHtml?, name?})`, `commitRevision(p, changes, label)` (maksimal 100 revisi dan 6 MiB riwayat), `historySource(p, revision)`, dan `projectBytes(p)`. Snapshot terbaru dan delta mundur menyimpan perubahan kecil. Versi lama dilepas mulai dari yang tertua jika backup akan melampaui batas.
- `exportBundle(project) → {bytes (.pfproj ZIP), manifest}`: `manifest.json` (format, schemaVersion, appVersion, files[{path, sha256, bytes}], hashes), `project.json`, `source.md`, `settings.json`, `brandkit.json`, `inputs/{id}.txt|.html`, `assets/{sha256}.{ext}`.
- Cadangan memeriksa ukuran ZIP dan total entri yang diekstrak, masing-masing maksimal 30 MiB. Total ini meliputi riwayat lengkap, metadata, manifest, sumber, input asli dan aset. Sumber aktif dibatasi 5 MiB. Teks berulang di jalur teks khusus paket proyek diperiksa dengan rasio maksimal 1100:1 dan batas byte absolut. Rasio ZIP dokumen biasa tetap 100:1. Ekspor memvalidasi cadangan dengan pembaca yang sama sebelum unduhan tersedia. Sebelum menerima perubahan, aplikasi menghitung biaya berkas portabel, salinan metadata dan aset, manifest, dan ruang untuk header ZIP. Jika isi wajib masih terlalu besar setelah pemadatan riwayat, transaksi ditolak dan proyek sebelumnya tetap dapat dibuka. Import, migrasi dan pemulihan IndexedDB memverifikasi struktur sebelum proyek diaktifkan.
- `importBundle(bytes)` — fungsi murni; memverifikasi semua hash, id aset = sha256 isi, `rawSourceHash`, `contentSnapshotHash`, anggaran, keamanan ZIP. Gagal → `{ok:false, code}` dan proyek aktif tidak tersentuh. Skema lebih baru → `BUNDLE_NEWER_SCHEMA`. Berkas JSON draf 1.0.0 → dimigrasi (lihat bawah).
- `migrateV1Draft(draft)` (bentuk `{source, title, settings{template:'academic'|'report'|'textbook'|'essay', paper, orientation, margin, marginMm, font:'serif'|'sans', baseSize, lineHeight, accent, cover, toc, tocDepth, pageNumbers, header, headerText, footerText, chapterBreak, headingNumbers, codeWrap, tableFont}, savedAt, assets[{path, bytes, mime}]}` dari IndexedDB `paperforma`/`drafts`/`current`) → `{project, changes[], original, warnings}`. Draf asli disimpan sebagai `InputRecord` kind `project`; `revertMigration(result)` mengembalikan asli. Pemetaan gaya: textbook→EDU-01, report→BUS-01, essay→EDT-01, academic→EDT-01 dengan kertas/margin lama. `readLegacyDraft()` membaca tanpa mengubah.
- Penyimpanan: antarmuka `ProjectStorage` (`IdbProjectStorage(factory?|null, name?)` — DB `paperforma2`, `null` = tidak tersedia; `MemoryProjectStorage` dengan `faults` untuk uji). `save → {status:'saved'|'conflict'|'failed'|'blocked'|'unavailable'|'quota-exceeded'|'rejected-deleted', recoveryId?}`. Transaksi compare-and-swap membandingkan token basis penulis dengan rekaman saat transaksi berjalan. Pengiriman identik bersifat idempoten. Bila tab lain telah menyimpan perubahan berbeda, status `conflict` memuat ID salinan pemulihan. Buka panel Proyek untuk meninjau kedua versi dan melanjutkan pada versi pilihan. `delete`/`deleteAll → {status:'deleted'|'not-found'|'blocked'|'failed'|'unavailable'}` — `blocked` **bukan** sukses. Tombstone mencegah autosave terlambat menghidupkan proyek terhapus.
- `AutosaveController(storage, delayMs, onStatus)`: `schedule(p)` → status `pending` (bukan `saved`) sampai hasil nyata; `flush()`, `cancel()`, `deleteProject(id)` (batalkan timer → hapus → status jujur).
- `validateBrandKit(partial, assets) → {ok, brandKit} | {ok:false, errors[{field, message, messageEn}]}`.

## 13. Preflight (04 §8)

`preflight(snapshot, rendered|null, {target:'html'|'pdf', integrity?, external?:{font?, layout?, pdf?}, renderedForHash?}) → {status:'ready'|'review'|'fix'|'unchecked', label{id,en}, categories[{category, status, checked, coverage{id,en}, issues, counts}], stale, target, assets}`.
Label: Siap / Perlu diperiksa / Perlu diperbaiki / Belum diperiksa. Error → Perlu diperbaiki; kategori wajib yang belum dijalankan (integrity tanpa laporan, font/layout/pdf tanpa hasil lapisan lain, atau hasil usang karena `renderedForHash ≠ snapshot.renderInputHash`) → Belum diperiksa; peringatan → Perlu diperiksa. Untuk `target:'pdf'`, gambar hilang/eksternal tanpa salinan → `PDF_ASSETS_INCOMPLETE` / `PDF_EXTERNAL_IMAGE_NOT_EMBEDDED` (error, blocking). Untuk `html`, kategori layout/pdf tidak diwajibkan.

## 14. Batas yang diketahui

- Pengujian core = unit (Node/jsdom). Belum ada verifikasi browser nyata/visual untuk keluaran core.
- `\(…\)` tidak didukung bila naskah memuat karakter PUA U+E001/U+E004 (`INPUT_PRIVATE_USE_CHARS`).
- Inline HTML yang dibuang (mis. `<script>` di tengah paragraf) juga memicu `INTEGRITY_TOKEN_CHANGED` pada blok itu — disengaja (isi tidak tampil).
- Offset pesan hasil `mergeMessages` bersifat perkiraan (flag `source-span-approximate`).
- Deteksi `ZIP64` → ditolak (tidak didukung).
