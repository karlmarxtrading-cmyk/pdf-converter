// PF-029, SEM-11, CODE-07/08 — resolver font (unit)
import { describe, expect, it } from 'vitest';
import { fontFaceCss, fontManifest, loadFonts, planFonts } from '../../../src/render/fonts';
import { templateDefaultSettings } from '../../../src/render/templates';
import { nodeFontSource } from './helpers';

const set = (t: 'EDU-01' | 'BUS-01' | 'EDT-01' | 'CON-01') => ({ ...templateDefaultSettings(t), title: 'Uji' });

describe('font resolver', () => {
  it('hanya subset latin untuk teks Indonesia biasa', () => {
    const p = planFonts({ html: '<p>Pendapatan bukan laba: Rp100.000; −5%</p>', settings: set('BUS-01'), mode: 'print' });
    expect(new Set(p.faces.map((f) => f.subset))).toEqual(new Set(['latin']));
    expect(p.faces.every((f) => f.license === 'OFL-1.1')).toBe(true);
    expect(p.missing).toEqual([]);
    expect(p.faces.some((f) => f.family === 'JetBrains Mono')).toBe(false);
  });
  it('menambah latin-ext, mono, italic dan KaTeX hanya bila dipakai', () => {
    const p = planFonts({ html: '<p><em>Đặng</em> ő</p><pre><code>x</code></pre><span class="katex"><span class="mathnormal">x</span><span class="mathbb">R</span></span>', settings: set('EDU-01'), mode: 'print' });
    const files = p.faces.map((f) => f.file);
    expect(files).toContain('source-serif-4-latin-ext-400-normal.woff2');
    expect(files).toContain('source-serif-4-latin-400-italic.woff2');
    expect(files).toContain('jetbrains-mono-latin-400-normal.woff2');
    expect(files).toEqual(expect.arrayContaining(['KaTeX_Main-Regular.woff2', 'KaTeX_Math-Italic.woff2', 'KaTeX_AMS-Regular.woff2']));
    expect(files).not.toContain('KaTeX_Fraktur-Regular.woff2');
  });
  it('SEM-11: Arab/CJK/emoji → issue font eksplisit, bukan glyph hilang diam-diam', () => {
    const p = planFonts({ html: '<p>Arab: العربية — CJK: 中文 — Emoji: 🙂 — Yunani α — ≤ ∞</p>', settings: set('EDU-01'), mode: 'print' });
    expect(p.missing.map((m) => m.script).sort()).toEqual(['Arabic', 'CJK', 'Emoji']);
    expect(p.issues[0]).toMatchObject({ code: 'FONT_GLYPH_NOT_BUNDLED', scope: 'font', severity: 'warning' });
    expect(p.faces.map((f) => f.file)).toContain('KaTeX_Main-Regular.woff2'); // ≤ ∞ via cadangan simbol KaTeX
  });
  it('memuat bytes nyata, membuat @font-face data: dan manifest dengan sha256', async () => {
    const p = planFonts({ html: '<h2>Judul</h2><p>teks <strong>tebal</strong></p>', settings: set('CON-01'), mode: 'print' });
    const { fonts, issues } = await loadFonts(p, nodeFontSource);
    expect(issues).toEqual([]);
    const css = fontFaceCss(fonts, 'data');
    expect(css).toMatch(/src:url\(data:font\/woff2;base64,d09GMg/);
    expect(css).toMatch(/unicode-range:U\+0000-00FF/);
    const m = fontManifest(fonts);
    expect(m[0]).toMatchObject({ family: 'Inter', license: 'OFL-1.1', subset: 'latin' });
    expect(m.every((e) => e.sha256.length === 64 && e.bytes > 1000)).toBe(true);
  });
  it('font gagal dimuat → issue penghalang', async () => {
    const p = planFonts({ html: '<p>a</p>', settings: set('BUS-01'), mode: 'print' });
    const r = await loadFonts(p, async () => new Uint8Array([1, 2, 3]));
    expect(r.issues[0]).toMatchObject({ code: 'FONT_LOAD_FAILED', blocking: true });
  });
});
