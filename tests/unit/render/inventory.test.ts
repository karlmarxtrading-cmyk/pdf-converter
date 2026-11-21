// @vitest-environment jsdom
// EN-006: inventaris isi pasca-paginasi. Pemecahan sah (di tengah kata, header tabel berulang, tautan terbelah) lulus;
// kehilangan, duplikasi, perubahan angka, gambar/rumus hilang gagal.
import { describe, expect, it } from 'vitest';
import { contentInventory, compareInventory } from '../../../src/render/paginate';

const el = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d; };
const SRC = '<p data-block-id="b1">Pemrosesan dokumen <a href="#x">tautan panjang</a> 12,5%.</p><table data-block-id="t1"><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr><tr><td>2</td></tr></tbody></table><span class="pf-math" data-tex="x^2"><span class="katex"><span class="katex-mathml">x2</span>x²</span></span><img src="data:image/png;base64,AAA">';
const inv = (...h: string[]) => contentInventory(h.map(el));

describe('inventaris isi paginasi', () => {
  const expected = inv(SRC);
  it('pemecahan di tengah kata, tautan terbelah, header berulang → sama', () => {
    const pages = [
      '<p data-block-id="b1">Pemro</p>',
      '<p data-block-id="b1">sesan dokumen <a href="#x">tautan</a></p>',
      '<p data-block-id="b1"><a href="#x">panjang</a> 12,5%.</p><table data-block-id="t1"><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>',
      '<table data-block-id="t1"><thead data-pf-repeat><tr><th>A</th></tr></thead><tbody><tr><td>2</td></tr></tbody></table><span class="pf-math" data-tex="x^2"><span class="katex"><span class="katex-mathml">x2</span>x²</span></span><img src="data:image/png;base64,AAA">',
    ];
    expect(compareInventory(expected, inv(...pages))).toEqual([]);
  });
  it('paragraf hilang → gagal', () => {
    const d = compareInventory(expected, inv(SRC.replace('Pemrosesan dokumen ', '')));
    expect(d.map((x) => x.field)).toContain('text');
  });
  it('angka berubah atau baris tabel terduplikasi → gagal', () => {
    expect(compareInventory(expected, inv(SRC.replace('12,5', '12,6'))).length).toBeGreaterThan(0);
    expect(compareInventory(expected, inv(SRC.replace('<tr><td>2</td></tr>', '<tr><td>2</td></tr><tr><td>2</td></tr>'))).length).toBeGreaterThan(0);
  });
  it('gambar atau rumus hilang → gagal', () => {
    expect(compareInventory(expected, inv(SRC.replace(/<img[^>]+>/, ''))).map((x) => x.field)).toContain('images');
    expect(compareInventory(expected, inv(SRC.replace('data-tex="x^2"', 'data-tex="x^3"'))).map((x) => x.field)).toContain('formulas');
  });
});
