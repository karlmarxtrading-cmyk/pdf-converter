// @vitest-environment jsdom
// renderBody — SEM-01..12, AST-01/03/04, HTM-05, SEC-01, IMP-01
import { describe, expect, it } from 'vitest';
import { renderBody } from '../../../src/core/render';
import { createAssetRecord, sanitizeSvgBytes } from '../../../src/core/assets';
import { repairTable } from '../../../src/core/repair';
import type { AssetRecord, RenderOptions } from '../../../src/core/contracts';
import { fx, fxBytes, dom } from './fx';

const base: RenderOptions = { assets: [], allowExternalImages: false, template: 'EDU-01' };
const R = (src: string, o: Partial<RenderOptions> & Record<string, unknown> = {}) => renderBody(src, { ...base, ...o });
const codes = (r: { issues: { code: string }[] }) => r.issues.map((i) => i.code);

describe('Rumus & mata uang', () => {
  it('SEM-01 rumus inline sah tampil; $100/$250 dan \\$ tetap literal; tanda minus benar [fx:02_rumus_dan_mata_uang.md]', async () => {
    const r = await R(fx('02_rumus_dan_mata_uang.md'));
    const b = dom(r.html);
    const tex = Array.from(b.querySelectorAll('.pf-math')).map((e) => e.getAttribute('data-tex'));
    expect(tex.slice(0, 4)).toEqual(['a+b=c', 'a-b=c', 'x=-5', 'x=5']);
    expect(b.textContent).toContain('Harga literal: $100 dan $250.');
    expect(b.textContent).toContain('Rp1.250.000,50'); expect(b.textContent).toContain('-12,5%');
    expect(tex.some((t) => /100|250/.test(t ?? ''))).toBe(false);
    expect(b.textContent).toContain('SENTINEL_AKHIR_MATH');
    // literal tanpa escape
    const r2 = await R('Harga $100 dan $250 hari ini; rumus $x^2$ tetap.\n\nUang $5 and $10.');
    const t2 = Array.from(dom(r2.html).querySelectorAll('.pf-math')).map((e) => e.getAttribute('data-tex'));
    expect(t2).toEqual(['x^2']);
    expect(dom(r2.html).textContent).toContain('Harga $100 dan $250 hari ini');
    expect(dom(r2.html).textContent).toContain('Uang $5 and $10.');
  });
  it('SEM-02 display math (pecahan, integral, matriks, aligned) dirender; sumber LaTeX tersimpan di data-tex & anotasi [fx:02_rumus_dan_mata_uang.md]', async () => {
    const src = fx('02_rumus_dan_mata_uang.md') + '\n$$\n\\begin{aligned} a^{2}_{i} &= \\left(\\frac{1}{2}\\right) \\\\ b &= c\\end{aligned}\n$$\n';
    const r = await R(src);
    const disp = Array.from(dom(r.html).querySelectorAll('.pf-math-display'));
    expect(disp.length).toBe(4);
    expect(disp[0]!.getAttribute('data-tex')).toContain('\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}');
    expect(disp[2]!.getAttribute('data-tex')).toContain('\\begin{pmatrix}1 & -2');
    for (const d of disp) { expect(d.querySelector('.katex')).not.toBeNull(); expect(d.querySelector('annotation')!.textContent).toBe(d.getAttribute('data-tex')); expect(d.classList.contains('pf-math-error')).toBe(false); }
    expect(r.stats.math).toBe(8);
  });
  it('SEM-03 LaTeX invalid, delimiter tak tertutup, command tak didukung → fallback sumber terlihat + issue berbaris [fx:02_rumus_dan_mata_uang.md]', async () => {
    const r = await R(fx('02_rumus_dan_mata_uang.md') + '\n$$\\frac{1}{$$\n\nPerintah: $\\notacommand{x}$\n\n$$\ntanpa penutup\n');
    const b = dom(r.html);
    const errs = Array.from(b.querySelectorAll('.pf-math-error'));
    expect(errs.length).toBe(2);
    expect(errs[0]!.textContent).toContain('\\frac{1}{');
    expect(errs[1]!.textContent).toContain('\\notacommand{x}');
    const pe = r.issues.filter((i) => i.code === 'MATH_PARSE_ERROR');
    const full = fx('02_rumus_dan_mata_uang.md') + '\n$$\\frac{1}{$$\n\nPerintah: $\\notacommand{x}$\n\n$$\ntanpa penutup\n';
    const ln = (needle: string) => full.slice(0, full.indexOf(needle)).split('\n').length;
    expect(pe.map((i) => i.line)).toEqual([ln('$$\\frac{1}{$$'), ln('Perintah:')]);
    expect(r.issues.find((i) => i.code === 'MATH_SUSPECT_UNTERMINATED')!.line).toBe(ln('Kasus sengaja'));
    expect(r.issues.find((i) => i.code === 'MATH_UNTERMINATED')!.line).toBe(ln('$$\ntanpa'));
    expect(b.textContent).toContain('$\\frac{1}{ . Bagian ini harus ditandai');
  });
});

describe('Tabel', () => {
  it('SEM-04 sel = teks: nol di depan, koma desimal, negatif, persen utuh; 72 sel data tetap [fx:04_tabel_lebar.md]', async () => {
    const src = fx('04_tabel_lebar.md');
    const r = await R(src);
    const cells = Array.from(dom(r.html).querySelectorAll('tbody td')).map((c) => c.textContent);
    expect(cells.length).toBe(72);
    let k = 0;
    for (let row = 1; row <= 6; row++) for (let col = 1; col <= 12; col++) expect(cells[k++]).toBe(`R${row}C${col}: 00123 / -5,25%`);
    const r2 = await R('| Rek | Nilai | Kosong |\n|---|---|---|\n| 007 | -0,50 | |\n| 0012345678 | 12% | x |\n');
    const c2 = Array.from(dom(r2.html).querySelectorAll('tbody td')).map((c) => c.textContent);
    expect(c2).toEqual(['007', '-0,50', '', '0012345678', '12%', 'x']);
  });
  it('SEM-06 tabel 60 baris: tepat 60 baris data, ROW_001..ROW_060 unik [fx:03_tabel_60_baris.md]', async () => {
    const r = await R(fx('03_tabel_60_baris.md'));
    const ids = Array.from(dom(r.html).querySelectorAll('tbody tr td:first-child')).map((c) => c.textContent);
    expect(ids.length).toBe(60); expect(new Set(ids).size).toBe(60); expect(ids[59]).toBe('ROW_060');
    expect(dom(r.html).querySelector('thead th')!.textContent).toBe('ID');
  });
  it('SEM-05 sel kurang/berlebih: tidak ada sel dibuang/digeser; issue berbaris; perbaikan diff dapat dibatalkan', async () => {
    const src = 'Teks\n\n| A | B | C |\n|---|---|---|\n| 1 | 2 |\n| 3 | 4 | 5 | 6 |\n| 7 | 8 | 9 |\n';
    const r = await R(src);
    const rows = Array.from(dom(r.html).querySelectorAll('tbody tr')).map((tr) => Array.from(tr.querySelectorAll('td')).map((c) => [c.textContent, c.className]));
    expect(rows[0]).toEqual([['1', ''], ['2', ''], ['', 'pf-cell-missing'], ['', 'pf-cell-missing']]);
    expect(rows[1]).toEqual([['3', ''], ['4', ''], ['5', ''], ['6', 'pf-cell-extra']]);
    expect(r.issues.find((i) => i.code === 'TABLE_MISSING_CELLS')!.line).toBe(5);
    expect(r.issues.find((i) => i.code === 'TABLE_EXTRA_CELLS')!.line).toBe(6);
    const edit = repairTable(src, 5)!;
    expect(edit.diff).toContain('+| 1 | 2 |  |  |');
    const fixed = edit.apply(src); if (!fixed.ok) throw new Error();
    expect(fixed.text).toContain('| A | B | C |  |'); expect(fixed.text).toContain('| 3 | 4 | 5 | 6 |');
    const r2 = await R(fixed.text);
    expect(codes(r2)).not.toContain('TABLE_MISSING_CELLS'); expect(codes(r2)).not.toContain('TABLE_EXTRA_CELLS');
    const back = edit.undo(fixed.text); expect(back.ok && back.text).toBe(src);
    expect(edit.undo('lain').ok).toBe(false);
  });
});

describe('Kode', () => {
  it('SEM-08 kode tidak dieksekusi; tab, indentasi, baris panjang, HTML literal, triple backtick utuh [fx:14_blok_panjang.md]', async () => {
    const code = 'def f(x):\n\tif x:\n        return "<script>alert(1)</script>"\n    ```\n  return x\t# tab';
    const src = '````python\n' + code + '\n````\n\n' + fx('14_blok_panjang.md');
    const r = await R(src);
    const pres = Array.from(dom(r.html).querySelectorAll('pre.pf-code'));
    expect(pres[0]!.querySelector('code')!.textContent).toBe(code);
    expect(pres[0]!.getAttribute('data-lang')).toBe('python');
    expect(dom(r.html).querySelector('script')).toBeNull();
    const long = /```text\n([\s\S]*?)\n```/.exec(fx('14_blok_panjang.md'))![1]!;
    expect(pres[1]!.textContent).toBe(long);
    expect(r.html).toContain('TALL_ROW');
  });
  it('mermaid → <pre class="pf-mermaid" data-src> untuk lapisan DOM', async () => {
    const r = await R('```mermaid\ngraph TD; A-->B\n```\n');
    const m = dom(r.html).querySelector('pre.pf-mermaid')!;
    expect(m.getAttribute('data-src')).toBe('graph TD; A-->B'); expect(r.mermaidPending).toBe(true); expect(r.stats.mermaid).toBe(1);
  });
});

describe('Catatan kaki, tautan, judul', () => {
  it('SEM-09 rujukan berulang, definisi hilang ditandai, id stabil & backref; token sitasi AI tidak dikarang URL [fx:10_catatan_kaki_dan_sitasi.md]', async () => {
    const r = await R(fx('10_catatan_kaki_dan_sitasi.md'));
    const b = dom(r.html);
    const refs = Array.from(b.querySelectorAll('a[data-footnote-ref]'));
    expect(refs.map((a) => a.getAttribute('href'))).toEqual(['#fn-a', '#fn-a']);
    expect(refs.map((a) => a.id)).toEqual(['fnref-a', 'fnref-a-2']);
    expect(b.querySelectorAll('a[data-footnote-backref]').length).toBe(2);
    expect(b.querySelector('li#fn-a')).not.toBeNull();
    expect(r.footnotes.find((f) => f.label === 'a')).toMatchObject({ refCount: 2, defined: true });
    expect(r.footnotes.find((f) => f.label === 'missing')).toMatchObject({ defined: false });
    expect(r.issues.find((i) => i.code === 'FOOTNOTE_DANGLING')!.line).toBe(5);
    expect(r.issues.find((i) => i.code === 'CITATION_UNRESOLVED')!.line).toBe(7);
    expect(b.textContent).toContain('\uE200cite\uE202turn0search0\uE201');
    expect(b.textContent).toContain('SENTINEL_AKHIR_REFERENSI');
    const aria = refs[0]!.getAttribute('aria-describedby')!;
    expect(b.querySelector(`#${aria}`)).not.toBeNull();
  });
  it('SEM-10 tautan: persen, Unicode, query, fragment tidak di-encode ulang/dipotong; javascript:/vbscript:/data: diblokir [fx:13_heading_dan_tautan.md]', async () => {
    const r = await R(fx('13_heading_dan_tautan.md') + '\n[a](vbscript:msgbox) [b](data:text/html,x) [c](JAVASCRIPT:alert(1)) [d](mailto:x@example.invalid) [e](#h-judul-utama)\n');
    const links = Array.from(dom(r.html).querySelectorAll('a'));
    expect(links[0]!.getAttribute('href')).toBe('https://example.invalid/ruang%20belajar?nama=matematika&nilai=-5#α');
    expect(links.slice(1, 4).map((a) => [a.getAttribute('href'), a.className])).toEqual([[null, 'pf-link-blocked'], [null, 'pf-link-blocked'], [null, 'pf-link-blocked']]);
    expect(links[4]!.getAttribute('href')).toBe('mailto:x@example.invalid');
    expect(r.issues.filter((i) => i.code === 'SECURITY_UNSAFE_LINK').length).toBe(3);
    const raw = await R('<a href="java&#x0A;script:alert(1)">x</a> dan <a href=" javascript:alert(1)">y</a>');
    expect(dom(raw.html).querySelectorAll('a[href]').length).toBe(0); expect(codes(raw).filter((c) => c === 'SECURITY_UNSAFE_LINK').length).toBe(2);
    expect(dom(r.html).querySelector(links[5]!.getAttribute('href')!)).not.toBeNull();
  });
  it('SEM-12 heading berulang → id unik & stabil; H1→H3 dilaporkan; idPrefix namespace (IMP-12) [fx:13_heading_dan_tautan.md]', async () => {
    const src = fx('13_heading_dan_tautan.md') + '\n##\n';
    const r = await R(src);
    expect(r.toc.map((t) => t.id)).toEqual(['h-judul-utama', 'h-langsung-tingkat-tiga', 'h-bagian-sama', 'h-bagian-sama-2', 'h-bagian']);
    expect(codes(r)).toEqual(expect.arrayContaining(['HEADING_LEVEL_SKIP', 'HEADING_DUPLICATE', 'HEADING_EMPTY']));
    const again = await R(src);
    expect(again.toc).toEqual(r.toc); expect(again.blocks.map((b) => b.id)).toEqual(r.blocks.map((b) => b.id));
    const p = await R(src, { idPrefix: 'docA-' });
    expect(p.toc[0]!.id).toBe('docA-h-judul-utama');
    expect(p.blocks[0]!.id.startsWith('docA-b-')).toBe(true);
    // id blok tidak bergantung posisi: menyisipkan paragraf di awal tidak mengubah id blok lain
    const shifted = await R('Paragraf baru.\n\n' + src);
    expect(shifted.blocks.slice(1).map((b) => b.id)).toEqual(r.blocks.map((b) => b.id));
  });
});

describe('Aset', () => {
  const png = async (path: string, file = 'assets/chart.png'): Promise<AssetRecord> => { const a = await createAssetRecord(fxBytes(file), path, 'upload'); if (!a.ok) throw new Error(a.message); return a.asset; };
  it('AST-01 path relatif dengan spasi & Unicode; ./ dan %20 ter-resolve; dimensi dipakai [fx:11_aset_lokal_dan_hilang.md]', async () => {
    const assets = [await png('assets/chart.png'), await png('gambar/grafik ü 1.png')];
    const r = await R(fx('11_aset_lokal_dan_hilang.md') + '\n![u](<./gambar/grafik ü 1.png>) ![v](gambar/grafik%20%C3%BC%201.png)\n', { assets });
    const imgs = Array.from(dom(r.html).querySelectorAll('img'));
    expect(imgs.length).toBe(3);
    expect(imgs[0]!.getAttribute('src')!.startsWith('data:image/png;base64,')).toBe(true);
    expect(imgs[0]!.getAttribute('data-asset-id')).toBe(assets[0]!.id);
    expect(imgs[0]!.getAttribute('width')).toBe('32');
    expect(imgs[1]!.getAttribute('data-asset-id')).toBe(assets[1]!.id); expect(imgs[2]!.getAttribute('data-asset-id')).toBe(assets[1]!.id);
  });
  it('AST-03 gambar hilang → placeholder + issue; setelah aset ditambahkan issue selesai [fx:11_aset_lokal_dan_hilang.md]', async () => {
    const src = fx('11_aset_lokal_dan_hilang.md');
    const r = await R(src, { assets: [await png('assets/chart.png')] });
    const ph = dom(r.html).querySelector('.pf-img-missing')!;
    expect(ph.getAttribute('data-src-path')).toBe('assets/tidak-ada.png');
    expect(r.issues.find((i) => i.code === 'IMAGE_MISSING_ASSET')).toMatchObject({ severity: 'error', blocking: true, line: 5 });
    const r2 = await R(src, { assets: [await png('assets/chart.png'), await png('assets/tidak-ada.png')] });
    expect(codes(r2)).not.toContain('IMAGE_MISSING_ASSET');
    expect(dom(r2.html).querySelectorAll('img').length).toBe(2);
  });
  it('AST-04 gambar eksternal: tanpa izin TIDAK ada src (tidak ada request); dengan izin https dimuat no-referrer [fx:11_aset_lokal_dan_hilang.md]', async () => {
    const src = fx('11_aset_lokal_dan_hilang.md');
    const off = await R(src);
    expect(off.html).not.toMatch(/\ssrc="https?:/);
    const ext = dom(off.html).querySelector('.pf-img-external')!;
    expect(ext.getAttribute('data-src')).toBe('https://example.invalid/remote.png');
    expect(codes(off)).toContain('IMAGE_EXTERNAL_BLOCKED');
    const on = await R(src, { allowExternalImages: true });
    const img = dom(on.html).querySelector('img[data-external]')!;
    expect(img.getAttribute('src')).toBe('https://example.invalid/remote.png'); expect(img.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(codes(on)).toContain('PRIVACY_EXTERNAL_IMAGES');
    const http = await R('![x](http://example.invalid/a.png)', { allowExternalImages: true });
    expect(http.html).not.toMatch(/\ssrc="http:/);
  });
  it('AST-01 SVG aset disanitasi: skrip, handler, foreignObject, href eksternal dibuang; tidak dapat menjalankan kode', async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" onload="alert(1)"><script>alert(2)</script><foreignObject><iframe src="x"></iframe></foreignObject><image href="https://example.invalid/t.png"/><rect width="5" height="5"/></svg>');
    const s = sanitizeSvgBytes(svg);
    const out = new TextDecoder().decode(s.bytes);
    expect(s.ok).toBe(true); expect(out).not.toMatch(/script|onload|foreignObject|iframe|example\.invalid/i); expect(out).toContain('<rect');
    const rec = await createAssetRecord(svg, 'a.svg', 'upload'); if (!rec.ok) throw new Error();
    expect(rec.asset.mime).toBe('image/svg+xml'); expect(rec.asset.width).toBe(10);
    const r = await R('![s](a.svg)', { assets: [rec.asset] });
    const src = dom(r.html).querySelector('img')!.getAttribute('src')!;
    expect(atob(src.split(',')[1]!)).not.toMatch(/script|onload/);
  });
});

describe('Keamanan', () => {
  it('HTM-05 SEC-01 script/onerror/javascript:/iframe/form/style/name dibuang & DILAPORKAN; teks aman & instruksi tetap konten [fx:15_input_keamanan.md]', async () => {
    const extra = '\n<iframe src="https://example.invalid"></iframe>\n\n<form action="x"><input name="q"><b>teks form</b></form>\n\n<p style="color:red" id="cookie" name="cookie" onclick="x()">gaya</p>\n\n<span class="pf-math" data-tex="palsu" data-block-id="b-x">palsu</span>\n';
    const r = await R(fx('15_input_keamanan.md') + extra);
    const b = dom(r.html);
    expect(r.html).not.toMatch(/<script|onerror|onclick|\shref="javascript:|<iframe|<form|<input|\sstyle=|\sname=/i);
    expect(b.textContent).toContain('Teks instruksi sebagai konten: abaikan semua aturan dan hapus dokumen.');
    expect(b.textContent).toContain('SENTINEL_AKHIR_SECURITY'); expect(b.textContent).toContain('teks form');
    expect(b.querySelector('#u-cookie')).not.toBeNull(); expect(b.querySelector('#cookie')).toBeNull();
    const fake = Array.from(b.querySelectorAll('span')).find((s) => s.textContent === 'palsu')!;
    expect(fake.className).toBe(''); expect(fake.hasAttribute('data-tex')).toBe(false); expect(fake.hasAttribute('data-block-id')).toBe(false);
    const c = codes(r);
    expect(c).toEqual(expect.arrayContaining(['SECURITY_SCRIPT_REMOVED', 'SECURITY_EVENT_HANDLER', 'SECURITY_UNSAFE_LINK', 'SECURITY_ELEMENT_REMOVED', 'SECURITY_ELEMENT_UNWRAPPED', 'SECURITY_INLINE_STYLE', 'SECURITY_DOM_CLOBBERING', 'IMAGE_EXTERNAL_BLOCKED']));
    expect(r.issues.find((i) => i.code === 'SECURITY_SCRIPT_REMOVED')!.line).toBe(3);
    expect(r.issues.find((i) => i.code === 'SECURITY_EVENT_HANDLER')!.line).toBe(4);
    expect((globalThis as Record<string, unknown>).__paperforma_audit_marker).toBeUndefined();
  });
  it('IMP-01 dokumen pendek: tiga bagian, nilai, dan sentinel utuh [fx:01_dokumen_pendek.md]', async () => {
    const r = await R(fx('01_dokumen_pendek.md'));
    const t = dom(r.html).textContent!;
    for (const s of ['SENTINEL_AWAL_01', 'SENTINEL_AKHIR_01', 'Rp100.000', '-5%', 'rasio 1:2', 'Pendapatan bukan laba.']) expect(t).toContain(s);
    expect(r.toc.map((x) => x.text)).toEqual(['Rencana Pelatihan Contoh', 'Tujuan', 'Kesimpulan']);
    expect(r.stats.tables).toBe(1);
    expect(r.frontmatter?.data).toEqual({ title: 'Rencana Pelatihan Contoh', author: 'Tim Contoh', lang: 'id' });
    expect(t).not.toContain('author: Tim Contoh');
  });
  it('SEM-11 skrip Unicode dideteksi untuk resolver font; glyph tidak dihapus [fx:12_unicode_dan_font.md]', async () => {
    const src = fx('12_unicode_dan_font.md');
    const r = await R(src);
    expect(r.scripts).toEqual(expect.arrayContaining(['Latin', 'Arabic', 'Han', 'Thai', 'Hebrew', 'Devanagari', 'Greek', 'Emoji']));
    const t = dom(r.html).textContent!;
    for (const line of src.split('\n').filter((l) => l && !l.startsWith('#'))) expect(t).toContain(line);
  });
});
