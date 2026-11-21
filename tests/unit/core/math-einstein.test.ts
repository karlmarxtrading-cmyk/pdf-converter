// @vitest-environment jsdom
/**
 * Regresi "rumus LaTeX tampil sebagai teks mentah" (dokumen Einstein, deployment performa-cwd.pages.dev).
 * Akar masalah: HTML clipboard (ChatGPT) yang memuat delimiter rumus sebagai teks literal diserialisasi ke Markdown
 * dengan escape (\( → \\(, \[ → \\\[, $ → \$) sehingga pemindai rumus tidak lagi mengenalinya; selain itu spasi sebelum
 * rumus KaTeX hilang, alttext MathML dibuang, dan skrip MathJax math/tex terhapus.
 * Setiap jalur masuk diuji sampai HTML yang dirender: rumus = TeX sumber (tanpa perubahan makna), teks prosa utuh,
 * mata uang dan kode tidak dianggap rumus.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderBody, htmlToMarkdown, parseClipboardConversation, checkRenderIntegrity, composeConversation } from '../../../src/core/index';

const FX = (f: string) => readFileSync(`fixtures/einstein/${f}`, 'utf8');
const MD = FX('einstein.md');
const nt = (t: string) => t.replace(/\s+/g, ' ').trim();
const EXPECTED = ['m', 'E_0', '\\boxed{E_0=mc^2}', 'v', '\\gamma=\\frac{1}{\\sqrt{1-\\frac{v^2}{c^2}}}', 'E=\\gamma mc^2', '\\Delta E = \\Delta m\\, c^2',
  "\\begin{pmatrix} ct' \\\\ x' \\end{pmatrix} = \\begin{pmatrix} \\gamma & -\\gamma\\beta \\\\ -\\gamma\\beta & \\gamma \\end{pmatrix} \\begin{pmatrix} ct \\\\ x \\end{pmatrix}",
  '\\tau = \\int_{t_1}^{t_2} \\sqrt{1-\\frac{v(t)^2}{c^2}}\\,dt', 'E_0=mc^2', 'p=\\gamma m v'].map(nt);
/** mode tiap rumus sesuai delimiter sumber: \[…\] / $$…$$ = display (blok tengah), \(…\) / $…$ = inline */
const DISPLAY = [false, false, true, false, true, false, true, true, false, false, false];
const PROSE = ['Relativitas khusus Einstein', 'Energi diam sebuah benda bermassa', 'faktor Lorentz didefinisikan sebagai', 'sehingga energi total menjadi',
  'Transformasi Lorentz dalam bentuk matriks', 'Waktu sebagai integral', 'Biaya cetak buku ini $5 untuk versi hitam-putih dan $10 untuk versi berwarna.', 'PENUTUP-EINSTEIN'];
const OPTS = { assets: [], allowExternalImages: false, template: 'BUS-01' } as never;

async function verify(markdown: string, label: string) {
  const r = await renderBody(markdown, OPTS);
  const doc = new DOMParser().parseFromString(`<body>${r.html}</body>`, 'text/html');
  const texs = [...doc.querySelectorAll('.pf-math[data-tex]')].map((e) => nt(e.getAttribute('data-tex')!));
  expect(texs, `${label}: TeX rumus`).toEqual(EXPECTED);
  expect(doc.querySelectorAll('.pf-math .katex').length, `${label}: semua rumus dirender KaTeX`).toBe(EXPECTED.length);
  expect(doc.querySelectorAll('.pf-math-error').length, label).toBe(0);
  const modes = [...doc.querySelectorAll('.pf-math[data-tex]')].map((e) => e.classList.contains('pf-math-display') && !!e.querySelector('.katex-display'));
  expect(modes, `${label}: mode display/inline`).toEqual(DISPLAY);
  expect(r.issues.filter((i) => i.scope === 'math').map((i) => i.code), label).toEqual([]);
  // teks yang terlihat (tanpa rumus & kode) tidak memuat delimiter/perintah TeX mentah
  const vis = doc.body.cloneNode(true) as HTMLElement;
  vis.querySelectorAll('.pf-math, pre, code').forEach((n) => n.remove());
  const text = vis.textContent ?? '';
  for (const raw of ['\\(', '\\)', '\\[', '\\]', '\\boxed', '\\frac', '\\gamma', '$$', '$E', '\\\\']) expect(text.includes(raw), `${label}: sisa mentah ${raw}`).toBe(false);
  for (const p of PROSE) expect(nt(doc.body.textContent ?? '').includes(p), `${label}: prosa "${p}"`).toBe(true);
  // kode tetap literal
  expect(doc.querySelector('pre')!.textContent).toContain('echo "\\(x\\) tetap teks, $HOME juga"');
  expect([...doc.querySelectorAll('p code')].map((c) => c.textContent)).toEqual(['$PATH', '\\[a\\]']);
  // pemeriksaan keutuhan mesin (sumber ↔ render)
  expect(checkRenderIntegrity(markdown, r).issues.filter((i) => i.severity === 'error'), label).toEqual([]);
  return r;
}

describe('mesin matematika — dokumen Einstein', () => {
  it('teks biasa/Markdown ChatGPT (\\(…\\), \\[…\\], $…$, $$…$$, matriks, integral, tabel, daftar)', async () => { await verify(MD, 'plain'); });

  it('HTML clipboard dengan delimiter literal → Markdown tanpa escape ganda, makna rumus sama', async () => {
    const c = htmlToMarkdown(FX('chatgpt-literal.html'));
    expect(c.ok).toBe(true); if (!c.ok) return;
    expect(c.markdown).toContain('\\[\\boxed{E_0=mc^2}\\]');
    expect(c.markdown).toContain('\\(E_0\\)');
    expect(c.markdown).not.toMatch(/\\\\\(|\\\\\[|\\\$E/);
    expect(c.markdown).toContain('\\$5'); // mata uang tetap teks (di-escape), bukan rumus
    await verify(c.markdown, 'html-literal');
  });

  it('HTML clipboard KaTeX (markup ChatGPT) → TeX dari anotasi, spasi di sekitar rumus utuh', async () => {
    const c = htmlToMarkdown(FX('chatgpt-katex.html'));
    expect(c.ok).toBe(true); if (!c.ok) return;
    expect(c.markdown).toContain('bermassa $m$ adalah $E_0$:');
    expect(c.changes.find((x) => x.kind === 'math-from-annotation')?.count).toBe(EXPECTED.length);
    await verify(c.markdown, 'html-katex');
  });

  it('impor percakapan ChatGPT (data-message-author-role) mempertahankan rumus', async () => {
    const parsed = parseClipboardConversation({ plain: '', html: FX('chatgpt-conversation.html') }, 'in-1');
    const a = parsed.conversation.messages.find((m) => m.role === 'assistant')!;
    expect(a).toBeTruthy();
    const conv = { ...parsed.conversation, outputMode: 'answer' as const, messages: parsed.conversation.messages.map((m) => ({ ...m, selected: m.role === 'assistant' })) };
    const md = composeConversation(conv as never).markdown;
    await verify(md, 'conversation');
  });

  it('MathML alttext dan MathJax v2 math/tex dipakai sebagai TeX; tanpa TeX → peringatan, teks tidak hilang', () => {
    const r = htmlToMarkdown('<p>a <math alttext="\\frac{a}{b}"><mfrac><mi>a</mi><mi>b</mi></mfrac></math> b <span class="MathJax">x2</span><script type="math/tex">x^2</script></p><p><script type="math/tex; mode=display">\\int_0^1 x\\,dx</script></p><p><math alttext="a over b"><mi>a</mi></math></p>');
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.markdown).toContain('a $\\frac{a}{b}$ b $x^2$');
    expect(r.markdown).toContain('$$\n\\int_0^1 x\\,dx\n$$');
    expect(r.markdown).not.toContain('x2'); // tampilan visual MathJax tidak diduplikasi
    expect(r.issues.map((i) => i.code)).toContain('CLIPBOARD_MATH_NO_TEX'); // alttext non-TeX → teks dipertahankan + peringatan
  });

  it('delimiter literal terbelah <br> (display multi-baris) dan di sel tabel tetap rumus', async () => {
    const r = htmlToMarkdown('<p>\\[<br>\\boxed{E_0=mc^2}<br>\\]</p><table><tr><th>A</th></tr><tr><td>\\(E_0\\) dan $5</td></tr></table>');
    expect(r.ok).toBe(true); if (!r.ok) return;
    const out = await renderBody(r.markdown, OPTS);
    expect([...out.html.matchAll(/data-tex="([^"]*)"/g)].map((m) => m[1]!.trim())).toEqual(['\\boxed{E_0=mc^2}', 'E_0']);
    expect(out.html).toContain('$5');
  });

  it('delimiter yang memang tidak membentuk rumus tidak dikarang menjadi rumus', async () => {
    const r = htmlToMarkdown('<p>Harga $5 dan diskon 10$ saja; simbol \\( tanpa penutup.</p>');
    expect(r.ok).toBe(true); if (!r.ok) return;
    const out = await renderBody(r.markdown, OPTS);
    expect(out.html).not.toContain('pf-math');
    expect(nt(new DOMParser().parseFromString(out.html, 'text/html').body.textContent ?? '')).toBe('Harga $5 dan diskon 10$ saja; simbol \\( tanpa penutup.');
  });
});

describe('perlindungan mata uang di pemindai rumus (berlaku untuk semua jalur)', () => {
  it.each([
    ['Harga $5 dan $10.', 0], ['Harga $5 dan diskon 10$ saja.', 0], ['Total $1.250 untuk 3 item$ ini.', 0],
    ['Nilai $2x + 3y$ benar.', 1], ['Hasil $3 \\times 4$ = 12.', 1], ['Rumus $5 \\text{ dan } 10$ di sini.', 1], ['Energi $E=mc^2$.', 1],
  ])('%s → %i rumus', async (src, n) => {
    const r = await renderBody(src, OPTS);
    expect((r.html.match(/class="pf-math /g) ?? []).length).toBe(n);
  });
});

describe('mode display untuk \\[…\\] dan $$…$$ satu baris', () => {
  it.each([
    ['\\[\\boxed{E_0=mc^2}\\]\n', 'div'], ['$$E=mc^2$$\n', 'div'], ['Energi diam adalah \\[E_0=mc^2\\] untuk benda diam.\n', 'span'], ['Inline \\(E_0\\) saja.\n', null],
  ])('%s', async (src, tag) => {
    const r = await renderBody(src, OPTS);
    const doc = new DOMParser().parseFromString(`<body>${r.html}</body>`, 'text/html');
    const m = doc.querySelector('.pf-math')!;
    if (tag) { expect(m.tagName.toLowerCase()).toBe(tag); expect(m.classList.contains('pf-math-display')).toBe(true); expect(m.querySelector('.katex-display')).toBeTruthy(); }
    else expect(m.classList.contains('pf-math-inline')).toBe(true);
    expect(checkRenderIntegrity(src, r).issues.filter((i) => i.severity === 'error')).toEqual([]);
    if (tag === 'span') expect(m.parentElement!.tagName).toBe('P');
  });
});
