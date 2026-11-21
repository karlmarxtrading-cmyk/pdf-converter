// @vitest-environment jsdom
// PF-024…030, HTM-01/02/04/07, OPS-03 — pembangun dokumen & ekspor HTML (unit, jsdom; body buatan tangan, bukan core)
import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { exportHtml, ExportGuard, StaleExportError } from '../../../src/render/exports';
import { prepareBody } from '../../../src/render/document';
import { sha256Hex } from '../../../src/render/util';
import { body, nodeFontSource, realDoc, snap } from './helpers';

const _HTML = `<h1 id="bab-1">Bab Satu</h1><p>Teks <strong>tebal</strong> dan <em>miring</em> −5% Rp100.000<sup><a href="#fn-1" id="fnref-1" data-footnote-ref>1</a></sup></p>
<h2 id="tujuan">Tujuan</h2><table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>ROW_001</td><td>-1</td></tr></tbody></table>
<pre><code class="language-python">print("User: bukan pesan")</code></pre><p><img src="https://contoh.invalid/x.png" alt="grafik"></p>
<pre class="pf-mermaid" data-src="graph TD; A--&gt;B">graph TD; A--&gt;B</pre>
<section class="footnotes"><ol><li id="fn-1"><p>Catatan. <a href="#fnref-1" data-footnote-backref>↩</a></p></li></ol></section>`;
const _TOC = [{ id: 'bab-1', level: 1, text: 'Bab Satu' }, { id: 'tujuan', level: 2, text: 'Tujuan' }];

const MD = `# Bab Satu

Teks **tebal** dan *miring* −5% Rp100.000[^1]

## Tujuan

| A | B |
|---|---|
| ROW_001 | -1 |

\`\`\`python
print("User: bukan pesan")
\`\`\`

![grafik](https://contoh.invalid/x.png)

\`\`\`mermaid
graph TD; A-->B
\`\`\`

[^1]: Catatan.
`;

describe('ekspor HTML', () => {
  it('HTM-01 standalone: satu berkas, tanpa skrip, CSP tanpa jaringan, font tersemat, anchor beres', async () => {
    const d = await realDoc(MD, 'EDU-01');
    const r = await exportHtml({ ...d, profile: 'standalone', fontSource: nodeFontSource, renderMermaid: false });
    expect(r.html).not.toMatch(/<script/i);
    const standaloneDoc = new DOMParser().parseFromString(r.html, 'text/html');
    const fonts = standaloneDoc.querySelector('meta[name="paperforma-font-notices"]')?.getAttribute('content');
    expect(fonts).toContain('Copyright 2016 The Inter Project Authors');
    expect(fonts).toContain('SIL OPEN FONT LICENSE Version 1.1');
    expect(fonts).toContain('with Reserved Font Name KaTeX_Main');
    expect(standaloneDoc.body.textContent).not.toContain('OPEN FONT LICENSE');
    expect(r.html).toMatch(/default-src 'none'/);
    expect(r.html).toMatch(/<html lang="id">/);
    expect(r.html).toMatch(/src:url\(data:font\/woff2/);
    expect(r.html).not.toMatch(/\ssrc="https:\/\/contoh\.invalid/);
    expect(r.issues.map((i) => i.code)).toEqual(expect.arrayContaining(['MERMAID_NOT_RENDERED']));
    const c = Object.fromEntries(r.manifest.checks.map((x) => [x.name, x.status]));
    expect(c).toMatchObject({ 'no-scripts': 'pass', 'no-network-resources': 'pass', 'internal-anchors': 'pass', 'fonts-embedded': 'pass', integrity: 'pass' });
    expect(r.manifest.outputHash).toBe(await sha256Hex(r.bytes));
    expect(r.manifest.snapshot.revision).toBe(1);
    expect(r.html).toMatch(/role="region" tabindex="0" aria-label="Tabel 1/);
    expect(r.html).toMatch(/<nav class="pf-toc/);
    expect(standaloneDoc.body.textContent).toContain('print("User: bukan pesan")');
    expect(standaloneDoc.body.textContent).toContain('Rp100.000');
  });
  it('HTM-02 zip: index + assets relatif + manifest SHA-256 per berkas', async () => {
    const { createAssetRecord } = await import('../../../src/core/assets');
    const pngBytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (ch) => ch.charCodeAt(0));
    const asset = await createAssetRecord(pngBytes, 'titik.png', 'upload');
    if (!asset.ok) throw new Error('asset');
    const d = await realDoc('# A\n\n![titik](titik.png)\n\n## B\n', 'BUS-01', {}, 1, [asset.asset]);
    const r = await exportHtml({ ...d, profile: 'zip', fontSource: nodeFontSource, renderMermaid: false });
    const files = unzipSync(r.bytes);
    const man = JSON.parse(strFromU8(files['manifest.json']!));
    expect(Object.keys(files)).toEqual(expect.arrayContaining(['index.html', 'assets/document.css', 'assets/fonts.css', 'licenses/FONT_NOTICES.txt', 'manifest.json']));
    expect(man.files.map((item: { path: string }) => item.path)).toContain('licenses/FONT_NOTICES.txt');
    expect(strFromU8(files['licenses/FONT_NOTICES.txt']!)).toContain('SIL OPEN FONT LICENSE Version 1.1');
    for (const f of man.files) expect(await sha256Hex(files[f.path]!)).toBe(f.sha256);
    const idx = strFromU8(files['index.html']!);
    expect(idx).toMatch(/src="assets\/img\/[0-9a-f]{32}\.png"/);
    expect(idx).not.toMatch(/<script/);
    expect(strFromU8(files['assets/fonts.css']!)).toMatch(/url\(fonts\/inter-latin-400-normal\.woff2\)/);
    expect(r.manifest.checks.find((c) => c.name === 'relative-files')?.status).toBe('pass');
    expect(r.status).toBe('pass');
  });
  it('publikasi online + skrip peningkatan diberi label', async () => {
    const d = await realDoc('# X\n\n![a](https://contoh.invalid/a.png)\n\n```\nx\n```\n', 'EDT-01', { subtitle: 'Sub', allowExternalImages: true });
    const r = await exportHtml({ ...d, profile: 'publication', variant: 'online', enhancements: true, fontSource: nodeFontSource, renderMermaid: false });
    expect(r.manifest).toMatchObject({ kind: 'html-publication', variant: 'online', scripts: 'enhancement', network: 'external-images' });
    expect(r.html).toMatch(/og:title/); expect(r.html).toMatch(/name="description" content="Sub"/);
    expect(r.html).toMatch(/https:\/\/contoh\.invalid\/a\.png/);
    expect(r.html).toMatch(/<script src="assets\/enhance\.js" defer data-pf-enhancement/);
  });
  it('HTM-07/OPS-03: ekspor revisi lama tidak pernah dikirim sebagai terbaru', async () => {
    const g = new ExportGuard();
    const old = await realDoc('v1', 'EDU-01', {}, 1);
    const p = exportHtml({ ...old, profile: 'standalone', guard: g, fontSource: nodeFontSource, renderMermaid: false });
    g.observe({ ...old.snapshot, revision: 2, renderInputHash: 'x'.repeat(64) }); // pengguna mengetik saat ekspor berjalan
    await expect(p).rejects.toBeInstanceOf(StaleExportError);
    const v2 = await realDoc('v2', 'EDU-01', { title: 'Baru' }, 2);
    g.observe(v2.snapshot);
    const ok = await exportHtml({ ...v2, profile: 'standalone', guard: g, fontSource: nodeFontSource, renderMermaid: false });
    expect(ok.manifest.snapshot.revision).toBe(2); expect(ok.html).toMatch(/<title>Baru<\/title>/);
    g.observe(old.snapshot); // revisi lebih tua tidak menjadi terbaru
    expect(g.latestRevision).toBe(2);
  });
});

describe('transformasi templat (teks tidak berubah)', () => {
  const text = (h: string) => { const d = document.createElement('div'); d.innerHTML = h; d.querySelectorAll('[data-pf-generated]').forEach((n) => n.remove()); return d.textContent!.replace(/\s+/g, ' ').trim(); };
  it('EDU-01 callout hanya dari blockquote berlabel', async () => {
    const h = '<blockquote><p><strong>Contoh 2.</strong> Hitung.</p></blockquote><blockquote><p>Kutipan biasa yang menyebut contoh.</p></blockquote><h3 id="l">Latihan 1</h3>';
    const p = await prepareBody(snap('EDU-01'), body(h), { mode: 'print', renderMermaid: false, allowExternalImages: false });
    expect(p.html).toMatch(/class="pf-callout pf-callout-example"/);
    expect((p.html.match(/pf-callout /g) ?? []).length).toBe(1);
    expect(p.html).toMatch(/pf-label-heading pf-kind-exercise/);
    expect(text(p.html)).toBe(text(h));
  });
  it('BUS-01 panel ringkasan di tempat + kartu metrik dari daftar bertanda', async () => {
    const h = '<h1 id="j">Laporan</h1><h2 id="r">Ringkasan Eksekutif</h2><p>Metrik utama</p><ul><li><strong>12%</strong> pertumbuhan</li><li><strong>-3</strong> keluhan</li></ul><h2 id="t">Temuan</h2><ul><li><strong>A</strong> b</li><li><strong>C</strong> d</li></ul>';
    const p = await prepareBody(snap('BUS-01'), body(h), { mode: 'print', renderMermaid: false, allowExternalImages: false });
    expect(p.html).toMatch(/<section class="pf-summary" aria-labelledby="r"><h2 id="r">/);
    expect((p.html.match(/pf-metrics/g) ?? []).length).toBe(1);
    expect(p.html.indexOf('Temuan')).toBeGreaterThan(p.html.indexOf('</section>'));
    expect(text(p.html)).toBe(text(h));
  });
  it('CON-01 label pembicara selalu tertulis; tanggal tidak dikarang; kode lebar ditandai', async () => {
    const s = snap('CON-01');
    s.conversation = { inputId: 'i', outputMode: 'transcript', selectedOrder: [], showRoles: true, unresolved: [], messages: [
      { id: 'm1', role: 'user', roleConfidence: 'confirmed', markdown: '', selected: true, sourceRef: { inputId: 'i', start: 0, end: 1, unit: 'utf16' }, flags: [] },
      { id: 'm2', role: 'assistant', roleConfidence: 'low', markdown: '', selected: true, sourceRef: { inputId: 'i', start: 1, end: 2, unit: 'utf16' }, flags: [] },
    ] };
    const h = `<section class="pf-msg" data-role="user" data-message-id="m1"><p>Halo</p></section><section class="pf-msg" data-role="assistant" data-message-id="m2"><pre><code>${'x'.repeat(90)}</code></pre></section>`;
    const p = await prepareBody(s, body(h), { mode: 'print', renderMermaid: false, allowExternalImages: false });
    expect(p.html).toMatch(/<header class="pf-msg-speaker" data-pf-generated="">Pengguna<\/header>/);
    expect(p.html).toMatch(/Asisten<span class="pf-msg-meta">peran belum dikonfirmasi<\/span>/);
    expect(p.html).toMatch(/data-speaker="Asisten"/);
    expect(p.html).toMatch(/<pre class="pf-wide" data-speaker-note="Asisten · kode lebar">/);
    expect(p.html).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    const en = await prepareBody({ ...s, settings: { ...s.settings, contentLang: 'en' } }, body(h), { mode: 'print', renderMermaid: false, allowExternalImages: false });
    expect(en.html).toMatch(/>User<\/header>/);
  });
});

describe('F-01 export acceptance', () => {
  it('retains ordinary reader hyperlinks and literal HTML examples without treating them as fetched resources', async () => {
    const d = await realDoc('[Paper](https://example.org/paper)\n\n```\nhref="https://example.org/font"\n```\n', 'EDU-01');
    const r = await exportHtml({...d,profile:'standalone',fontSource:nodeFontSource,renderMermaid:false});
    expect(r.manifest.checks.find(x => x.name === 'no-network-resources')?.status).toBe('pass');
    expect(r.html).toContain('href="https://example.org/paper"');
  });
  it.each(['standalone','publication','zip'] as const)('rejects invalid settings before delivering %s bytes', async profile => {
    const invalid = snap('EDU-01'); invalid.settings.lineHeight = '1.5' as never;
    await expect(exportHtml({snapshot:invalid,body:body('<p>Good content</p>'),profile,fontSource:nodeFontSource,renderMermaid:false})).rejects.toThrow('settings.typography');
  });
  it('rejects an undeclared relative stylesheet in an offline export', async () => {
    // Body buatan tangan berisi <link> tak terdeklarasi: validator akhir menolak (no-network-resources + integritas).
    await expect(exportHtml({snapshot:snap('EDU-01'),body:body('<p>Document</p><link rel="stylesheet" href="missing.css">'),profile:'standalone',fontSource:nodeFontSource,renderMermaid:false})).rejects.toThrow(/no-network-resources/);
  });
});
