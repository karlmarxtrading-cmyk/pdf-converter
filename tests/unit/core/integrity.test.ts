// @vitest-environment jsdom
// Pemeriksa keutuhan berurutan — PF-016, CODE-04, SEM-01/02/04, IMP-10
import { describe, expect, it } from 'vitest';
import pairs from '../../../fixtures/ordered-token-pairs.json';
import { renderBody } from '../../../src/core/render';
import { checkIntegrity, compareText, INTEGRITY_SCOPE } from '../../../src/core/integrity';
import { fx } from './fx';

const R = (s: string) => renderBody(s, { assets: [], allowExternalImages: false, template: 'EDU-01' });

describe('CODE-04 token berurutan', () => {
  it('CODE-04 distinguishes reordered operands, repeated tokens and reversed roles (authored regression pairs)', () => {
    for (const [original, changed] of pairs) {
      expect(original!.split(' ').sort()).toEqual(changed!.split(' ').sort());
      expect(compareText(original!, changed!).equal).toBe(false);
    }
    for (const [a, b] of [['x^2', 'x^3'], ['x_1', 'x^1'], ['1,25', '1.25'], ['12%', '12'], ['$100', '100'], ['+5', '−5'], ['-5', '−5'], ['a ≤ b', 'a < b']]) expect(compareText(a!, b!).equal).toBe(false);
    expect(compareText('A  +\nB', 'A + B').equal).toBe(true); // whitespace bukan perubahan isi
  });
  it('SEM-01 IMP-10 fixture pasangan pembanding: render utuh lolos; mutasi tanda/urutan/minus terdeteksi per blok [fx:16_urutan_dan_operator.md]', async () => {
    const src = fx('16_urutan_dan_operator.md');
    const r = await R(src);
    const ok = checkIntegrity(src, r);
    expect(ok.ok).toBe(true); expect(ok.issues).toEqual([]); expect(ok.scope).toBe(INTEGRITY_SCOPE);
    expect(ok.coverage.blocks).toBeGreaterThan(3);
    const mut = [
      r.html.replace('PAIR_A: A + B', 'PAIR_A: A - B'),
      r.html.replace('PAIR_E: Hasil -5', 'PAIR_E: Hasil 5'),
      r.html.replace('PAIR_C: A membayar B', 'PAIR_C: B membayar A'),
    ];
    for (const h of mut) {
      const rep = checkIntegrity(src, h);
      expect(rep.ok).toBe(false);
      expect(rep.issues[0]!.code).toBe('INTEGRITY_TOKEN_CHANGED');
      expect(rep.issues[0]!.line).toBeGreaterThan(1);
    }
  });
  it('urutan blok, blok hilang, kode, rumus, sel tabel, tautan, aset, catatan kaki — semua terdeteksi [fx:01_dokumen_pendek.md] [fx:02_rumus_dan_mata_uang.md] [fx:10_catatan_kaki_dan_sitasi.md]', async () => {
    const src = fx('01_dokumen_pendek.md') + '\n```js\nlet a = 1;\n```\n\n' + fx('02_rumus_dan_mata_uang.md') + '\n' + fx('10_catatan_kaki_dan_sitasi.md') + '\n![g](https://example.invalid/g.png)\n';
    const r = await R(src);
    expect(checkIntegrity(src, r).ok).toBe(true);
    const doc = new DOMParser().parseFromString(`<body>${r.html}</body>`, 'text/html');
    const body = doc.body;
    const mutate = (f: (b: HTMLElement) => void) => { const c = body.cloneNode(true) as HTMLElement; f(c); return checkIntegrity(src, c); };
    const has = (rep: ReturnType<typeof checkIntegrity>, code: string) => rep.issues.some((i) => i.code === code);
    expect(has(mutate((b) => { const ps = b.querySelectorAll(':scope > [data-block-id]'); b.insertBefore(ps[3]!, ps[1]!); }), 'INTEGRITY_BLOCK_ORDER')).toBe(true);
    expect(has(mutate((b) => { b.querySelector('table')!.remove(); }), 'INTEGRITY_BLOCK_MISSING')).toBe(true);
    expect(has(mutate((b) => { const c = b.querySelector('pre.pf-code code')!; c.textContent = 'let a = 1; '; }), 'INTEGRITY_CODE_CHANGED')).toBe(true);
    expect(has(mutate((b) => { b.querySelector('.pf-math')!.setAttribute('data-tex', 'a-b=c'); }), 'INTEGRITY_MATH_CHANGED')).toBe(true);
    expect(has(mutate((b) => { b.querySelector('.pf-math-display')!.setAttribute('data-tex', '\\frac{b}{2a}'); }), 'INTEGRITY_MATH_CHANGED')).toBe(true);
    const cell = mutate((b) => { b.querySelectorAll('tbody td')[1]!.textContent = '42'; });
    expect(cell.issues.find((i) => i.code === 'INTEGRITY_TABLE_CELL')!.message).toContain('"24" → "42"');
    expect(has(mutate((b) => { b.querySelector('a[rel]')!.setAttribute('href', 'https://example.invalid/riset?bagian=2'); }), 'INTEGRITY_LINK_CHANGED')).toBe(true);
    expect(has(mutate((b) => { b.querySelector('.pf-img-external')!.setAttribute('data-src', 'https://example.invalid/lain.png'); }), 'INTEGRITY_ASSET_CHANGED')).toBe(true);
    expect(has(mutate((b) => { b.querySelector('li[data-fn-def]')!.remove(); }), 'INTEGRITY_FOOTNOTE_MISSING')).toBe(true);
    expect(has(mutate((b) => { b.querySelector('a[data-footnote-ref]')!.parentElement!.remove(); }), 'INTEGRITY_FOOTNOTE_REF')).toBe(true);
  });
  it('SEM-04 SEM-06 matriks sel tabel sel-demi-sel; 60 baris & tabel lebar lolos [fx:03_tabel_60_baris.md] [fx:04_tabel_lebar.md]', async () => {
    for (const f of ['03_tabel_60_baris.md', '04_tabel_lebar.md']) {
      const src = fx(f); const r = await R(src);
      const rep = checkIntegrity(src, r);
      expect(rep.ok).toBe(true); expect(rep.coverage.cells).toBeGreaterThanOrEqual(f.startsWith('03') ? 183 : 84);
      const bad = checkIntegrity(src, r.html.replace('00123 / -5,25%', '123 / -5,25%').replace('ROW_007', 'ROW_070'));
      expect(bad.issues.some((i) => i.code === 'INTEGRITY_TABLE_CELL')).toBe(true);
    }
  });
  it('SEM-02 sel/kode/rumus panjang & tabel malformed tidak menimbulkan positif palsu [fx:14_blok_panjang.md]', async () => {
    const src = fx('14_blok_panjang.md') + '\n| A | B |\n|---|---|\n| 1 |\n| 2 | 3 | 4 |\n';
    expect(checkIntegrity(src, await R(src)).ok).toBe(true);
  });
});
