// @vitest-environment jsdom
/**
 * Regression suite keutuhan paginasi (perintah lanjutan §5–6): paragraf hilang, halaman terduplikasi, tabel terpotong,
 * nomor halaman salah, heading berubah, urutan blok berubah, daftar isi salah, tautan internal rusak.
 * Setiap kasus harus terdeteksi dengan selisih yang menunjuk blok/halaman — bukan sekadar hitungan karakter.
 */
import { describe, expect, it } from 'vitest';
import { contentInventory, compareInventory, describeInventoryDiff, verifyPageStructure } from '../../../src/render/paginate';

const div = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d; };
const inv = (...h: string[]) => contentInventory(h.map(div));
const P1 = '<h2 data-block-id="h1">Bab Satu</h2><p data-block-id="p1">Paragraf pertama berisi angka 42.</p>';
const P2 = '<p data-block-id="p2">Paragraf kedua.</p><table data-block-id="t1"><thead><tr><th>Nama</th><th>Nilai</th></tr></thead><tbody><tr><td>A</td><td>1</td></tr><tr><td>B</td><td>2</td></tr><tr><td>C</td><td>3</td></tr></tbody></table>';
const P3 = '<h2 data-block-id="h2">Bab Dua</h2><p data-block-id="p3">Penutup.</p>';
const expected = inv(P1 + P2 + P3);

describe('regresi keutuhan paginasi', () => {
  it('paginasi sah (blok & tabel terbelah, header tabel berulang) lulus', () => {
    const pages = [
      P1 + '<p data-block-id="p2">Paragraf</p>',
      '<p data-block-id="p2" data-split-from="x">kedua.</p><table data-block-id="t1"><thead><tr><th>Nama</th><th>Nilai</th></tr></thead><tbody><tr><td>A</td><td>1</td></tr></tbody></table>',
      '<table data-block-id="t1" data-split-from="y"><thead data-pf-repeat><tr><th>Nama</th><th>Nilai</th></tr></thead><tbody><tr><td>B</td><td>2</td></tr><tr><td>C</td><td>3</td></tr></tbody></table>' + P3,
    ];
    expect(compareInventory(expected, inv(...pages))).toEqual([]);
  });
  it('paragraf hilang → blok spesifik dilaporkan hilang', () => {
    const d = compareInventory(expected, inv(P1, P2.replace('<p data-block-id="p2">Paragraf kedua.</p>', ''), P3));
    const b = d.find((x) => x.field === 'blockText' && x.blockId === 'p2');
    expect(b?.kind).toBe('missing');
    expect(d.some((x) => x.field === 'blockSeq')).toBe(true);
  });
  it('halaman terduplikasi (halaman 2 tercetak dua kali) → urutan blok "duplicated"', () => {
    const d = compareInventory(expected, inv(P1, P2, P2, P3));
    const seq = d.find((x) => x.field === 'blockSeq');
    expect(seq?.kind).toBe('duplicated');
    expect(d.find((x) => x.field === 'blockText' && x.blockId === 'p2')?.kind).toBe('duplicated');
    expect(describeInventoryDiff(seq!)).toMatch(/berulang/);
  });
  it('tabel terpotong (baris terakhir hilang di halaman lanjutan) → tableRows truncated', () => {
    const d = compareInventory(expected, inv(P1, P2.replace('<tr><td>C</td><td>3</td></tr>', ''), P3));
    expect(d.find((x) => x.field === 'tableRows')).toMatchObject({ blockId: 't1', expected: '4', actual: '3', kind: 'truncated' });
  });
  it('baris tabel berulang sebagai isi (bukan header berulang bertanda) → terdeteksi', () => {
    const d = compareInventory(expected, inv(P1, P2.replace('<tr><td>C</td><td>3</td></tr>', '<tr><td>C</td><td>3</td></tr><tr><td>C</td><td>3</td></tr>'), P3));
    expect(d.find((x) => x.field === 'tableRows')?.kind).toBe('added');
  });
  it('heading berubah teks atau level → headings', () => {
    expect(compareInventory(expected, inv(P1.replace('Bab Satu', 'Bab Satu!'), P2, P3)).some((x) => x.field === 'headings')).toBe(true);
    const lvl = compareInventory(expected, inv(P1.replace(/h2/g, 'h3'), P2, P3)).find((x) => x.field === 'headings');
    expect(lvl).toMatchObject({ expected: 'h2|Bab Satu', actual: 'h3|Bab Satu' });
  });
  it('blok bertukar urutan dengan teks total sama → terdeteksi (bukan hitungan karakter)', () => {
    const swapped = inv(P1, P3, P2);
    const d = compareInventory(expected, swapped);
    expect(swapped.text.length).toBe(expected.text.length);
    expect(d.find((x) => x.field === 'blockSeq')?.kind).toBe('reordered');
  });
  it('karakter bertukar di dalam blok dengan panjang sama → blockText changed', () => {
    const d = compareInventory(expected, inv(P1.replace('angka 42', 'angka 24'), P2, P3));
    expect(d.find((x) => x.field === 'blockText')).toMatchObject({ blockId: 'p1', kind: 'changed' });
    expect(d.some((x) => x.field === 'numbers')).toBe(true);
  });
});

describe('regresi struktur halaman (nomor halaman, daftar isi, tautan internal)', () => {
  const mk = (labels: string[], body: (i: number) => string) => {
    document.body.innerHTML = '';
    const pages = labels.map((l, i) => {
      const p = document.createElement('div'); p.className = 'pagedjs_page';
      p.style.setProperty('--pf-pnum', l ? JSON.stringify(l) : '""');
      p.innerHTML = `<div class="pagedjs_page_content">${body(i)}</div>`;
      document.body.appendChild(p); return p;
    });
    return pages;
  };
  const toc = '<nav class="pf-toc"><a href="#bab-1">Bab 1</a><span class="pf-toc-page" data-target="bab-1">2</span><a href="#bab-2">Bab 2</a><span class="pf-toc-page" data-target="bab-2">3</span></nav>';
  const body = (i: number) => i === 0 ? toc : i === 1 ? '<h2 id="bab-1">Bab 1</h2><p>Lihat <a href="#bab-2">Bab 2</a>.</p>' : '<h2 id="bab-2">Bab 2</h2>';
  it('struktur benar → tanpa selisih', () => {
    expect(verifyPageStructure(mk(['1', '2', '3'], body), ['1', '2', '3'])).toEqual([]);
  });
  it('nomor halaman salah pada hasil cetak → PAGE_NUMBER_MISMATCH di halaman tepat', () => {
    const d = verifyPageStructure(mk(['1', '3', '3'], body), ['1', '2', '3']);
    expect(d).toContainEqual(expect.objectContaining({ code: 'PAGE_NUMBER_MISMATCH', page: 2, expected: '2', actual: '3' }));
  });
  it('daftar isi menunjuk halaman salah → TOC_PAGE_MISMATCH', () => {
    const d = verifyPageStructure(mk(['1', '2', '3'], (i) => i === 0 ? toc.replace('data-target="bab-2">3', 'data-target="bab-2">4') : body(i)), ['1', '2', '3']);
    expect(d).toContainEqual(expect.objectContaining({ code: 'TOC_PAGE_MISMATCH', target: 'bab-2', expected: '3', actual: '4' }));
  });
  it('heading tujuan daftar isi hilang → TOC_TARGET_MISSING', () => {
    const d = verifyPageStructure(mk(['1', '2', '3'], (i) => i === 2 ? '<p>tanpa judul</p>' : body(i)), ['1', '2', '3']);
    expect(d.map((x) => x.code)).toContain('TOC_TARGET_MISSING');
    expect(d.map((x) => x.code)).toContain('INTERNAL_LINK_BROKEN');
  });
  it('sampul tanpa nomor: label kosong diharapkan', () => {
    expect(verifyPageStructure(mk(['', '1', '2'], body), ['', '1', '2']).filter((x) => x.code === 'PAGE_NUMBER_MISMATCH')).toEqual([]);
  });
});

describe('pemecahan baris kode untuk paginasi', () => {
  it('span.pf-line per baris, penyorot dipertahankan, teks identik tanpa pemisah baris', async () => {
    const { splitCodeLines } = await import('../../../src/render/paginate');
    const pre = document.createElement('pre');
    pre.innerHTML = '<code><span class="hljs-keyword">def</span> f():\n    <span class="hljs-string">"a\nb"</span>\n    return 1\n</code>';
    const before = pre.textContent!.replace(/\n/g, '');
    const n = splitCodeLines(document, pre);
    expect(n).toBe(4);
    expect(pre.querySelectorAll('.pf-line').length).toBe(4);
    expect(pre.querySelectorAll('.pf-line')[1]!.querySelector('.hljs-string')!.textContent).toBe('"a');
    expect(pre.querySelectorAll('.pf-line')[2]!.querySelector('.hljs-string')!.textContent).toBe('b"');
    expect(pre.textContent).toBe(before);
  });
});

describe('tanda hubung mesin paginasi (U+2011)', () => {
  it('di prosa dinormalisasi; di kode dihapus; tanda hubung sumber tetap dihitung', async () => {
    const { stripEngineHyphensInCode } = await import('../../../src/render/paginate');
    const e = inv('<p data-block-id="p">kodenomor</p>');
    expect(compareInventory(e, inv('<p data-block-id="p"><span class="pagedjs_hyphen">kode‑</span></p>', '<p data-block-id="p">nomor</p>'))).toEqual([]);
    // tanda hubung U+2011 yang bukan sisipan mesin tetap terdeteksi sebagai perubahan
    expect(compareInventory(e, inv('<p data-block-id="p">kode‑nomor</p>')).length).toBeGreaterThan(0);
    const d = div('<pre><code><span class="pf-line"><span class="pagedjs_hyphen">baris_kode‑</span></span></code></pre>');
    expect(stripEngineHyphensInCode(d)).toBe(1);
    expect(d.textContent).toBe('baris_kode');
  });
});

describe('baris tabel terbelah antarhalaman (WebKit)', () => {
  const T = (rows: string) => `<table data-block-id="t"><tbody>${rows}</tbody></table>`;
  it('fragmen satu baris di dua halaman dihitung satu baris; baris hilang tetap terdeteksi', () => {
    const e = inv(T('<tr data-pf-row="0"><td>A panjang</td></tr><tr data-pf-row="1"><td>B</td></tr>'));
    expect(compareInventory(e, inv(T('<tr data-pf-row="0"><td>A</td></tr>'), T('<tr data-pf-row="0"><td>panjang</td></tr><tr data-pf-row="1"><td>B</td></tr>')))).toEqual([]);
    expect(compareInventory(e, inv(T('<tr data-pf-row="0"><td>A panjang</td></tr>'))).find((x) => x.field === 'tableRows')?.kind).toBe('truncated');
  });
});
