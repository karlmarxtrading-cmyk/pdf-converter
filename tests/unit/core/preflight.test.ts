// @vitest-environment jsdom
// Preflight 04 §8 & resolusi gambar eksternal — PF-014, CODE-09
import { describe, expect, it } from 'vitest';
import { preflight, assetPreflight, listExternalImages } from '../../../src/core/preflight';
import { renderBody } from '../../../src/core/render';
import { checkIntegrity } from '../../../src/core/integrity';
import { makeSnapshot } from '../../../src/core/hash';
import { createProject } from '../../../src/core/projects';
import { AssetStore, embedRemoteCopy } from '../../../src/core/assets';
import { fx, fxBytes, dom } from './fx';

describe('Preflight', () => {
  it('CODE-09 PF-014 gambar eksternal & hilang: tidak pernah "lengkap" untuk PDF; salinan disematkan → lengkap [fx:11_aset_lokal_dan_hilang.md] [fx:assets/chart.png]', async () => {
    const p = createProject({ source: fx('11_aset_lokal_dan_hilang.md') });
    const store = new AssetStore();
    await store.add(fxBytes('assets/chart.png'), 'assets/chart.png', 'upload');
    p.assets = store.list();
    let snap = await makeSnapshot(p);
    expect(listExternalImages(p.source).map((e) => e.url)).toEqual(['https://example.invalid/remote.png']);
    let ap = assetPreflight(snap);
    expect(ap.complete).toBe(false); expect(ap.missing.map((m) => m.path)).toEqual(['assets/tidak-ada.png']); expect(ap.unresolvedExternal.length).toBe(1);
    let body = await renderBody(snap.source, { assets: snap.assets, allowExternalImages: true, template: snap.templateId });
    let pf = preflight(snap, body, { target: 'pdf' });
    expect(pf.status).toBe('fix');
    expect(pf.categories.find((c) => c.category === 'asset')!.issues.map((i) => i.code)).toEqual(expect.arrayContaining(['IMAGE_MISSING_ASSET', 'PDF_EXTERNAL_IMAGE_NOT_EMBEDDED']));
    // pengguna mengunggah aset hilang & UI mengambil salinan eksternal (setelah izin) → core menyematkan
    const remoteBytes = fxBytes('pengganti_A/chart.png');
    await store.add(fxBytes('pengganti_B/chart.png'), 'assets/tidak-ada.png', 'upload');
    const e = await embedRemoteCopy(store, 'https://example.invalid/remote.png', remoteBytes); expect(e.ok).toBe(true);
    p.assets = store.list(); snap = await makeSnapshot(p);
    ap = assetPreflight(snap); expect(ap.complete).toBe(true); expect(ap.total).toBe(3);
    body = await renderBody(snap.source, { assets: snap.assets, allowExternalImages: false, template: snap.templateId });
    expect(dom(body.html).querySelectorAll('img').length).toBe(3);
    expect(body.html).not.toMatch(/\ssrc="https:/);
    const integ = checkIntegrity(snap.source, body);
    pf = preflight(snap, body, { target: 'pdf', integrity: integ, renderedForHash: snap.renderInputHash });
    expect(pf.categories.find((c) => c.category === 'asset')!.status).not.toBe('fix');
    expect(pf.status).toBe('unchecked'); // layout/pdf/font belum dijalankan lapisan lain
    expect(pf.label).toEqual({ id: 'Belum diperiksa', en: 'Not checked' });
    const done = preflight(snap, body, { target: 'pdf', integrity: integ, renderedForHash: snap.renderInputHash, external: { font: [], layout: [], pdf: [] } });
    // semua aset lokal, tanpa peringatan, semua kategori diperiksa → Siap
    expect(done.status).toBe('ready'); expect(done.categories.every((c) => c.checked)).toBe(true);
  });
  it('empat status: Siap / Perlu diperiksa / Perlu diperbaiki / Belum diperiksa; hasil usang → Belum diperiksa [fx:01_dokumen_pendek.md] [fx:13_heading_dan_tautan.md]', async () => {
    const p = createProject({ source: fx('01_dokumen_pendek.md') });
    const snap = await makeSnapshot(p);
    const body = await renderBody(snap.source, { assets: [], allowExternalImages: false, template: snap.templateId });
    const integ = checkIntegrity(snap.source, body);
    const html = preflight(snap, body, { target: 'html', integrity: integ, renderedForHash: snap.renderInputHash, external: { font: [] } });
    expect(html.status).toBe('ready'); expect(html.label.id).toBe('Siap');
    expect(html.categories.every((c) => c.checked)).toBe(true);
    expect(preflight(snap, body, { target: 'html', renderedForHash: snap.renderInputHash, external: { font: [] } }).status).toBe('unchecked');
    const stale = preflight(snap, body, { target: 'html', integrity: integ, renderedForHash: 'lama', external: { font: [] } });
    expect(stale.stale).toBe(true); expect(stale.status).toBe('unchecked');
    expect(preflight(snap, null).status).toBe('unchecked');
    const p2 = createProject({ source: fx('13_heading_dan_tautan.md') });
    const s2 = await makeSnapshot(p2);
    const b2 = await renderBody(s2.source, { assets: [], allowExternalImages: false, template: s2.templateId });
    const r2 = preflight(s2, b2, { target: 'html', integrity: checkIntegrity(s2.source, b2), external: { font: [] } });
    expect(r2.status).toBe('review'); expect(r2.label.id).toBe('Perlu diperiksa');
    expect(r2.categories.find((c) => c.category === 'structure')!.coverage.id).toMatch(/Judul/);
    expect(r2.categories.find((c) => c.category === 'integrity')!.coverage.id).toMatch(/bukan kebenaran fakta/);
  });
});
