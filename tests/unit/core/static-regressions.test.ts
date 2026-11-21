// @vitest-environment jsdom
// Regresi audit statis 2026-11-20: EN-003 (Private Use), EN-011 (percakapan HTML), EN-012 (issue input diblokir).
// Setiap kasus di sini GAGAL pada RC3 (lihat bukti/engines-pua-probe.json dan engines-conversation-probe.json)
// dan harus lulus setelah perbaikan.
import { describe, expect, it } from 'vitest';
import { renderBody } from '../../../src/core/render';
import { checkRenderIntegrity, privateUseConservation } from '../../../src/core/integrity';
import { scanMath, restorePua } from '../../../src/core/math';
import { parseClipboardConversation } from '../../../src/core/conversation';
import { createProject } from '../../../src/core/projects';
import { makeSnapshot, snapshotRenderOptions } from '../../../src/core/index';
import { dom } from './fx';

const P1 = '', P4 = '';
const LIT = `A${P1}B${P4}C`;
const R = (src: string) => renderBody(src, { assets: [], allowExternalImages: false, template: 'EDU-01' });

describe('EN-003 karakter Private Use literal dipertahankan', () => {
  it('scanMath tidak memakai karakter yang ada di sumber sebagai sentinel', () => {
    const scan = scanMath(`${LIT} dan $5 serta $10`);
    expect(scan.sentinels).not.toBeNull();
    expect([scan.sentinels!.dollar, scan.sentinels!.fill]).not.toContain(P1);
    expect([scan.sentinels!.dollar, scan.sentinels!.fill]).not.toContain(P4);
    // pemulihan tanpa konteks tidak mengubah apa pun
    expect(restorePua(LIT)).toBe(LIT);
    expect(restorePua(LIT, scan)).toBe(LIT);
  });

  const cases: [string, string, (b: HTMLElement) => string][] = [
    ['paragraf', LIT, (b) => b.querySelector('p')!.textContent!],
    ['heading', `# ${LIT}`, (b) => b.querySelector('h1')!.textContent!],
    ['kode fence', '```text\n' + LIT + '\n```', (b) => b.querySelector('pre code')!.textContent!],
    ['kode inline', 'x `' + LIT + '` y', (b) => b.querySelector('code')!.textContent!],
    ['tabel', `| a | b |\n|---|---|\n| ${LIT} | $5 |`, (b) => b.querySelectorAll('td')[0]!.textContent!],
    ['atribut alt/judul tautan', `[t](https://ex.com/${LIT} "${LIT}")`, (b) => b.querySelector('a')!.getAttribute('title')!],
    ['rumus', `$x${P1}y$`, (b) => b.querySelector('.pf-math')!.getAttribute('data-tex')!],
  ];
  for (const [name, src, pick] of cases) {
    it(`${name}: karakter sumber tetap sama dan integrity lulus`, async () => {
      const r = await R(src);
      const got = pick(dom(r.html));
      if (name === 'rumus') expect(got).toBe(`x${P1}y`);
      else expect(got).toContain(LIT);
      expect(got).not.toContain('$B');
      const integ = checkRenderIntegrity(src, r);
      expect(integ.issues.filter((i) => i.severity === 'error')).toEqual([]);
      expect(integ.ok).toBe(true);
    });
  }

  it('mata uang dan pembatas \\( \\) \\[ \\] tetap benar bersama PUA, astral dan CRLF', async () => {
    const src = `Harga $5 dan $10.${LIT}\r\nRumus \\(a+b\\) dan 😀 𝒳\r\n\r\n\\[x^2\\]\r\n`;
    const r = await R(src);
    const b = dom(r.html);
    expect(b.textContent).toContain('Harga $5 dan $10.' + LIT);
    expect(b.textContent).toContain('😀 𝒳');
    const tex = [...b.querySelectorAll('.pf-math')].map((e) => e.getAttribute('data-tex'));
    expect(tex).toEqual(['a+b', 'x^2']);
    expect(checkRenderIntegrity(src, r).ok).toBe(true);
  });

  it('integrity gagal bila satu literal PUA diubah/dihapus pada keluaran', async () => {
    const src = `Paragraf ${LIT}.`;
    const r = await R(src);
    const corrupted = r.html.replace(P1, '$');
    const bad = checkRenderIntegrity(src, { ...r, html: corrupted });
    expect(bad.ok).toBe(false);
    expect(bad.issues.map((i) => i.code)).toContain('INTEGRITY_PRIVATE_USE_CHANGED');
    const removed = checkRenderIntegrity(src, { ...r, html: r.html.replace(P4, '') });
    expect(removed.ok).toBe(false);
  });

  it('oracle independen menghitung dari sumber mentah, bukan dari parser', () => {
    expect(privateUseConservation([LIT], `<p>${LIT}</p>`).ok).toBe(true);
    expect(privateUseConservation([LIT], `<p>A$BC</p>`).ok).toBe(false);
    expect(privateUseConservation([`x <!-- ${P1} -->`], `<p>x</p>`).ok).toBe(true);
  });

  it('roundtrip snapshot mempertahankan PUA di sumber', async () => {
    const p = createProject({ source: `# ${LIT}\n\n${LIT}` });
    const snap = await makeSnapshot(p);
    expect(snap.source).toBe(p.source);
    const r = await renderBody(snap.source, snapshotRenderOptions(snap));
    expect(dom(r.html).textContent).toContain(LIT);
  });
});

describe('EN-011 percakapan HTML clipboard', () => {
  it('penyebutan literal nama atribut di paragraf/kode tidak menghasilkan 0 pesan', () => {
    const plain = 'Penjelasan atribut data-message-author-role pada HTML.\n\nKalimat kedua.';
    for (const html of [
      '<p>Penjelasan atribut data-message-author-role pada HTML.</p><p>Kalimat kedua.</p>',
      '<pre><code>&lt;div data-message-author-role="user"&gt;</code></pre><p>Kalimat kedua.</p>',
      '<!-- data-message-author-role --><p>Kalimat kedua.</p>',
    ]) {
      const r = parseClipboardConversation({ plain, html }, 'in1');
      expect(r.usedHtml).toBe(false);
      expect(r.conversation.messages.length).toBeGreaterThan(0);
      expect(r.conversation.messages.map((m) => m.markdown).join('\n')).toContain('Kalimat kedua.');
    }
  });

  it('struktur ChatGPT asli tetap dikenali per peran', () => {
    const html = '<div data-message-author-role="user"><p>Halo?</p></div><div data-message-author-role="assistant"><p>Jawaban $5.</p></div>';
    const r = parseClipboardConversation({ plain: 'Halo?\nJawaban $5.', html }, 'in1');
    expect(r.usedHtml).toBe(true);
    expect(r.conversation.messages.map((m) => [m.role, m.markdown])).toEqual([['user', 'Halo?'], ['assistant', 'Jawaban \\$5.']]); // remark-stringify meng-escape $ agar tetap literal
  });

  it('teks pembuka/penutup di luar wrapper dipertahankan sebagai pesan unknown dengan issue', () => {
    const html = '<p>Pembuka.</p><div data-message-author-role="user"><p>Tanya</p></div><p>Penutup.</p>';
    const r = parseClipboardConversation({ plain: 'Pembuka.\nTanya\nPenutup.', html }, 'in1');
    const md = r.conversation.messages.map((m) => m.markdown);
    expect(md).toEqual(['Pembuka.', 'Tanya', 'Penutup.']);
    expect(r.conversation.messages[0]!.role).toBe('unknown');
    expect(r.conversation.messages[0]!.flags).toContain('outside-wrapper');
    expect(r.issues.filter((i) => i.code === 'CONVERSATION_OUTSIDE_WRAPPER')).toHaveLength(2);
  });

  it('input nonkosong yang tidak dapat dikenali memberi issue blocking, bukan sukses kosong', () => {
    const r = parseClipboardConversation({ plain: '   ', html: '<p>data-message-author-role</p>' }, 'in1');
    if (!r.conversation.messages.length) expect(r.issues.some((i) => i.blocking)).toBe(true);
  });
});

describe('QA-02 anggaran piksel/dekode dari header sebelum dekode', async () => {
  const { createAssetRecord, AssetStore, IMAGE_BUDGET } = await import('../../../src/core/assets');
  const png = (w: number, h: number) => {
    const b = new Uint8Array(33);
    b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    const dv = new DataView(b.buffer); dv.setUint32(16, w); dv.setUint32(20, h); b[24] = 8; b[25] = 6;
    return b;
  };
  it('header PNG 24 byte yang mengklaim 100000×100000 ditolak', async () => {
    const r = await createAssetRecord(png(100000, 100000), 'besar.png', 'upload');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('IMAGE_PIXELS_EXCEEDED');
  });
  it('tepat di bawah batas diterima, di atas batas ditolak', async () => {
    expect((await createAssetRecord(png(6000, 6000), 'a.png', 'upload')).ok).toBe(true);
    expect((await createAssetRecord(png(7000, 7000), 'b.png', 'upload')).ok).toBe(false);
    expect((await createAssetRecord(png(IMAGE_BUDGET.maxDimension + 1, 10), 'c.png', 'upload')).ok).toBe(false);
  });
  it('JPEG rusak tanpa marker SOF ditolak sebagai dimensi tak terbaca', async () => {
    const r = await createAssetRecord(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xd9, 0, 0, 0, 0]), 'rusak.jpg', 'upload');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('IMAGE_DIMENSIONS_UNREADABLE');
  });
  it('SVG dengan width/height ekstrem ditolak; viewBox besar tanpa ukuran tetap diterima', async () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    expect((await createAssetRecord(enc('<svg xmlns="http://www.w3.org/2000/svg" width="1000000" height="10"></svg>'), 'x.svg', 'upload')).ok).toBe(false);
    expect((await createAssetRecord(enc('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100000 100000"><rect width="10" height="10"/></svg>'), 'y.svg', 'upload')).ok).toBe(true);
  });
  it('total piksel proyek dibatasi; proyek semula tetap utuh', async () => {
    const store = new AssetStore();
    for (let i = 0; i < 5; i++) expect((await store.add(png(6000, 6000), `p${i}.png`, 'upload')).ok).toBe(true);
    const before = store.list().length;
    const r = await store.add(png(6000, 6000), 'p6.png', 'upload');
    expect(r.ok).toBe(false);
    expect(store.list().length).toBe(before);
  });
});

describe('gambar data: inline (regresi lintas-browser)', () => {
  it('rujukan data: lolos pemeriksaan keutuhan tanpa menduplikasi base64', async () => {
    const { renderBody, checkRenderIntegrity } = await import('../../../src/core/index');
    // A real 1×1 PNG: the previous repeated-base64 fixture had no valid raster header.
    const payload = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=';
    const url = 'data:image/png;base64,' + payload;
    const src = `Teks ![grafik](${url} "Judul") akhir.\n`;
    const r = await renderBody(src, { assets: [], allowExternalImages: false, template: 'BUS-01' });
    const rep = checkRenderIntegrity(src, r);
    expect(rep.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(r.issues.some((i) => i.blocking)).toBe(false);
    expect(r.html.split(payload).length - 1).toBe(1); // hanya di src
  });
});
