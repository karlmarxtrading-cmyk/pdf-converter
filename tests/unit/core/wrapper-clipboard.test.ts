// Pembungkus (IMP-02) & clipboard HTML → Markdown (IMP-04, SEM-07, CODE-06, IMP-14)
import { describe, expect, it } from 'vitest';
import { detectWrapper, unwrapWrapper } from '../../../src/core/wrapper';
import { htmlToMarkdown } from '../../../src/core/clipboard';
import { LIMITS } from '../../../src/core/limits';
import { fx, fxJson } from './fx';
import { parseMarkdown } from '../../../src/core/markdown';

describe('IMP-02 pembungkus', () => {
  it('IMP-02 fence luar ````markdown dengan fence kode dalam: terdeteksi, dilepas hanya eksplisit, isi utuh, undo memulihkan [fx:05_wrapper_dan_kode.md]', () => {
    const src = fx('05_wrapper_dan_kode.md');
    const d = detectWrapper(src);
    expect(d).toMatchObject({ kind: 'single', openLine: 1, closeLine: 10, info: 'markdown', fence: '````', innerClosesEarly: false });
    const e = unwrapWrapper(src, d)!;
    const a = e.apply(src); if (!a.ok) throw new Error();
    expect(a.text).toBe(src.split('\n').slice(1, 9).join('\n') + '\n');
    expect(a.text).toContain('```python\nfor x in [1, 2, 3]:\n    print("Assistant: ini teks kode", x)\n```');
    expect(a.text).toContain('SENTINEL_SETELAH_KODE');
    expect(e.diff).toContain('-````markdown');
    const u = e.undo(a.text); expect(u.ok && u.text).toBe(src);
  });
  it('IMP-02 varian 3/5 backtick dan tilde; fence dalam yang menutup lebih awal ditandai; teks di luar → ambiguous', () => {
    const inner = '# Judul\n\n```js\nx\n```\n';
    expect(detectWrapper('```markdown\n' + inner + '```\n')).toMatchObject({ kind: 'single', innerClosesEarly: true });
    expect(detectWrapper('`````md\n' + '````\nkode\n````\n' + inner + '`````\n')).toMatchObject({ kind: 'single', fence: '`````', innerClosesEarly: false });
    const t = '~~~markdown\n' + inner + '~~~\n';
    const dt = detectWrapper(t); expect(dt).toMatchObject({ kind: 'single', fence: '~~~' });
    const ut = unwrapWrapper(t, dt)!.apply(t); expect(ut.ok && ut.text).toBe(inner);
    expect(detectWrapper('Pengantar.\n\n```markdown\n' + inner + '```\nPenutup\n').kind).toBe('ambiguous');
    expect(detectWrapper('```\nhanya teks biasa\n```\n').kind).toBe('ambiguous');
    expect(detectWrapper('```python\nx\n```\n').kind).toBe('none');
    expect(detectWrapper('# Biasa\n').kind).toBe('none');
    const crlf = '```markdown\r\n# A\r\n```\r\n';
    const uc = unwrapWrapper(crlf, detectWrapper(crlf))!.apply(crlf); expect(uc.ok && uc.text).toBe('# A\r\n');
  });
});

describe('Clipboard HTML → Markdown', () => {
  it('IMP-04 SEM-07 fixture 08: LaTeX diambil sekali dari anotasi (tidak duplikat), tabel rowspan dipertahankan sebagai HTML + issue, sentinel utuh [fx:08_clipboard_rich_math_tabel.json]', () => {
    const f = fxJson<{ text_plain: string; text_html: string }>('08_clipboard_rich_math_tabel.json');
    const r = htmlToMarkdown(f.text_html, { plain: f.text_plain });
    if (!r.ok) throw new Error();
    expect(r.markdown).toContain('# Ringkasan');
    expect(r.markdown.match(/x=-5/g)!.length).toBe(1);
    expect(r.markdown).not.toContain('x = -5');
    expect(r.markdown).toContain('$x=-5$');
    expect(r.markdown).toMatch(/<table>[\s\S]*rowspan="2"[\s\S]*00123[\s\S]*<\/table>/);
    expect(r.markdown).toContain('SENTINEL_AKHIR_RICH');
    expect(r.issues.map((i) => i.code)).toContain('TABLE_MERGED_CELLS_HTML');
    expect(r.changes.map((c) => c.kind)).toEqual(expect.arrayContaining(['math-from-annotation', 'merged-table-as-html']));
    expect(r.stats.mergedTables).toBe(1); expect(r.stats.math).toBe(1);
  });
  it('IMP-04 heading, daftar bertingkat, tebal/miring, tautan, kode, tabel → GFM; script/handler tidak ikut dan dilaporkan', () => {
    const html = '<h1>Judul</h1><h2>Sub</h2><ul><li>Satu<ul><li>Satu-a</li></ul></li><li>Dua</li></ul><ol start="3"><li>tiga</li></ol><p><strong>tebal</strong> <em>miring</em> <a href="https://example.invalid/a?b=1&c=2">tautan</a> <a href="javascript:alert(1)">jahat</a></p><pre><code class="language-py">def f():\n\treturn 1</code></pre><table><tr><th>A</th><th>B</th></tr><tr><td>00123</td><td>-5,5%</td></tr></table><script>alert(1)</script><img src="x.png" onerror="alert(1)" alt="gbr"><p onclick="x()" style="color:red">p</p>';
    const r = htmlToMarkdown(html);
    if (!r.ok) throw new Error();
    const md = r.markdown;
    expect(md).toContain('# Judul'); expect(md).toContain('## Sub');
    expect(md).toMatch(/- Satu\n\s+- Satu-a/); expect(md).toContain('3. tiga');
    expect(md).toContain('**tebal**'); expect(md).toContain('*miring*');
    // URL tetap sama setelah Markdown di-parse ulang (escape Markdown boleh, isi tujuan tidak berubah)
    const urls: string[] = [];
    const walk = (n: { type: string; url?: string; children?: unknown[] }) => { if (n.type === 'link') urls.push(n.url!); for (const c of (n.children ?? []) as typeof n[]) walk(c); };
    walk(parseMarkdown(md).tree as never);
    expect(urls).toEqual(['https://example.invalid/a?b=1&c=2']);
    expect(md).toContain('```py\ndef f():\n\treturn 1\n```');
    expect(md).toMatch(/\| A +\| B +\|/); expect(md).toContain('00123'); expect(md).toContain('-5,5%');
    expect(md).not.toMatch(/script|alert|onerror|onclick|javascript/);
    expect(md).toContain('jahat');
    expect(r.issues.map((i) => i.code)).toEqual(expect.arrayContaining(['SECURITY_ELEMENT_REMOVED', 'SECURITY_EVENT_HANDLER', 'SECURITY_UNSAFE_LINK']));
  });
  it('IMP-14 CODE-06 markup melebihi batas byte ditolak UTUH sebelum konversi (tanpa slice), walau teks kecil', () => {
    const lim = { ...LIMITS, pasteHtmlBytes: 1000 };
    const html = `<div class="${'x'.repeat(2000)}">kecil</div>`;
    const r = htmlToMarkdown(html, { limits: lim });
    expect(r.ok).toBe(false);
    if (r.ok || r.code !== 'BUDGET_EXCEEDED') throw Error('Expected a budget rejection');
    expect(r.budget.actual).toBe(new TextEncoder().encode(html).length);
    expect(r.message).toMatch(/ditolak utuh/);
    const exact = '<p>' + 'é'.repeat((1000 - 7) / 2 | 0) + '</p>';
    expect(htmlToMarkdown(exact, { limits: lim }).ok).toBe(new TextEncoder().encode(exact).length <= 1000);
  });
  it('MathML tanpa anotasi ditandai; KaTeX display menghasilkan $$', () => {
    const r = htmlToMarkdown('<p>a</p><math><mi>y</mi></math><span class="katex-display"><span class="katex"><span class="katex-mathml"><math><semantics><mrow/><annotation encoding="application/x-tex">\\int_0^1 x</annotation></semantics></math></span><span aria-hidden="true">∫</span></span></span>');
    if (!r.ok) throw new Error();
    expect(r.markdown).toContain('$$\n\\int_0^1 x\n$$'); expect(r.markdown).not.toContain('∫');
    expect(r.issues.map((i) => i.code)).toContain('CLIPBOARD_MATH_NO_TEX');
  });
});
