// Proyek, paket .pfproj, migrasi v1→v2, penyimpanan, brand kit — PF-031/032, OPS-06/07/08, CODE-10, UX-10
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { unzipSync, zipSync } from 'fflate';
import { createProject, commitRevision, exportBundle, importBundle, migrateV1Draft, revertMigration, validateBrandKit, makeInputRecord, HISTORY_MAX, type LegacyDraftV1 } from '../../../src/core/projects';
import { MemoryProjectStorage, IdbProjectStorage, AutosaveController, readLegacyDraft } from '../../../src/core/storage';
import { createAssetRecord } from '../../../src/core/assets';
import { makeSnapshot } from '../../../src/core/hash';
import { parsePlainConversation } from '../../../src/core/conversation';
import { fx, fxBytes } from './fx';

async function sample() {
  let p = createProject({ name: 'Uji', template: 'BUS-01', source: fx('11_aset_lokal_dan_hilang.md') });
  const a = await createAssetRecord(fxBytes('assets/chart.png'), 'assets/chart.png', 'upload'); if (!a.ok) throw new Error();
  const inp = await makeInputRecord('paste-html', 'User: hai\nAssistant: halo', { rawHtml: '<p>User: hai</p>' });
  const conv = parsePlainConversation(inp.rawPlain, inp.id).conversation;
  const kit = validateBrandKit({ name: 'Brand', accent: '#1F4E79', headingFont: 'inter', logoAssetId: a.asset.id }, [a.asset]); if (!kit.ok) throw new Error();
  p = commitRevision(p, { assets: [a.asset], inputs: [inp], conversation: conv, brandKit: kit.brandKit }, 'isi');
  return p;
}

describe('Paket proyek', () => {
  it('OPS-07 ekspor → impor .pfproj utuh: sumber, input mentah, aset, setting, brand kit, hash identik [fx:11_aset_lokal_dan_hilang.md] [fx:assets/chart.png]', async () => {
    const p = await sample();
    const { bytes, manifest } = await exportBundle(p);
    expect(Object.keys(unzipSync(bytes))).toEqual(expect.arrayContaining(['manifest.json', 'project.json', 'source.md', 'settings.json', 'brandkit.json', `assets/${p.assets[0]!.id}.png`, `inputs/${p.inputs[0]!.id}.txt`, `inputs/${p.inputs[0]!.id}.html`]));
    const r = await importBundle(bytes);
    if (!r.ok) throw new Error(r.message);
    expect(r.project.source).toBe(p.source); expect(r.project.inputs).toEqual(p.inputs);
    expect(Buffer.from(r.project.assets[0]!.bytes).equals(Buffer.from(p.assets[0]!.bytes))).toBe(true);
    expect(r.project.settings).toEqual(p.settings); expect(r.project.brandKit).toEqual(p.brandKit); expect(r.project.conversation).toEqual(p.conversation);
    const [s1, s2] = [await makeSnapshot(p), await makeSnapshot(r.project)];
    expect(s2.renderInputHash).toBe(s1.renderInputHash); expect(manifest.hashes.rawSourceHash).toBe(s1.rawSourceHash);
  });
  it('OPS-08 paket rusak/diubah/tanpa manifest/skema lebih baru ditolak tanpa mengganti proyek aktif', async () => {
    const p = await sample();
    const active = JSON.stringify(p);
    const { bytes } = await exportBundle(p);
    const files = unzipSync(bytes);
    const tamper = (f: (x: Record<string, Uint8Array>) => void) => { const c = { ...files }; f(c); return zipSync(c); };
    const cases: [Uint8Array, string][] = [
      [tamper((c) => { const k = Object.keys(c).find((x) => x.startsWith('assets/'))!; const b = c[k]!.slice(); b[200] ^= 0xff; c[k] = b; }), 'BUNDLE_HASH_MISMATCH'],
      [tamper((c) => { c['source.md'] = new TextEncoder().encode('diubah'); }), 'BUNDLE_HASH_MISMATCH'],
      [tamper((c) => { delete c['manifest.json']; }), 'BUNDLE_NO_MANIFEST'],
      [tamper((c) => { const m = JSON.parse(new TextDecoder().decode(c['manifest.json'])); m.schemaVersion = 99; c['manifest.json'] = new TextEncoder().encode(JSON.stringify(m)); }), 'BUNDLE_NEWER_SCHEMA'],
      [tamper((c) => { const k = Object.keys(c).find((x) => x.startsWith('inputs/') && x.endsWith('.txt'))!; delete c[k]; }), 'BUNDLE_MISSING_FILE'],
      [bytes.slice(0, bytes.length - 30), 'BUNDLE_NOT_ZIP'],
      [tamper((c) => { c['../evil.md'] = new Uint8Array([1]); }), 'BUNDLE_UNSAFE'],
    ];
    for (const [b, code] of cases) { const r = await importBundle(b); expect(r.ok).toBe(false); if (!r.ok) expect(r.code).toBe(code); }
    expect(JSON.stringify(p)).toBe(active);
  });
  it('OPS-08 migrasi draf 1.0.0 → v2 eksplisit & dapat dibatalkan; draf asli disimpan [fx:01_dokumen_pendek.md] [fx:assets/chart.png]', async () => {
    const draft: LegacyDraftV1 = {
      source: fx('01_dokumen_pendek.md'), title: 'Draf Lama', savedAt: '2026-10-01T00:00:00Z',
      settings: { template: 'report', paper: 'Letter', orientation: 'portrait', margin: 'normal', marginMm: { top: 22, right: 20, bottom: 24, left: 20 }, font: 'sans', baseSize: 10.5, lineHeight: 1.5, accent: '#0f6466', cover: true, toc: true, tocDepth: 2, pageNumbers: true, header: 'title', headerText: 'Kepala', footerText: 'Kaki', chapterBreak: false, headingNumbers: false, codeWrap: true, tableFont: 'normal' },
      assets: [{ path: 'assets/chart.png', bytes: Array.from(fxBytes('assets/chart.png')), mime: 'image/png' }],
    };
    const orig = JSON.stringify(draft);
    const m = await migrateV1Draft(draft);
    expect(m.project.schemaVersion).toBe(2); expect(m.project.settings.template).toBe('BUS-01'); expect(m.project.settings.paper).toBe('Letter');
    expect(m.project.settings.bodyFont).toBe('inter'); expect(m.project.settings.header).toBe('Kepala'); expect(m.project.settings.tocDepth).toBe(2);
    expect(m.project.source).toBe(draft.source); expect(m.project.assets[0]!.mime).toBe('image/png');
    expect(m.changes.map((c) => c.field)).toEqual(expect.arrayContaining(['settings.template', 'settings.font', 'settings.accent']));
    const legacy = m.project.inputs.find((i) => i.kind === 'project')!;
    expect(JSON.parse(legacy.rawPlain).settings).toEqual(draft.settings);
    expect(JSON.stringify(revertMigration(m))).toBe(orig);
    // impor berkas JSON draf lama lewat importBundle → migrasi dilaporkan
    const r = await importBundle(new TextEncoder().encode(JSON.stringify({ ...draft, assets: [] })));
    expect(r.ok && r.migrated !== undefined).toBe(true);
  });
  it('UX-10 riwayat revisi terbatas & berurutan; proyek lama tidak dimutasi', () => {
    let p = createProject({ source: '0' });
    const first = p;
    for (let i = 1; i <= HISTORY_MAX + 5; i++) p = commitRevision(p, { source: String(i) }, `r${i}`);
    expect(p.revision).toBe(HISTORY_MAX + 5); expect(p.history.length).toBe(HISTORY_MAX);
    expect(p.history.at(-1)).toMatchObject({ revision: HISTORY_MAX + 5, source: String(HISTORY_MAX + 5) });
    expect(first.revision).toBe(0); expect(first.history).toEqual([]);
  });
  it('PF-032 brand kit divalidasi; logo harus aset proyek', () => {
    expect(validateBrandKit({ name: '', accent: 'red', headingFont: 'comic' as never }).ok).toBe(false);
    const r = validateBrandKit({ name: 'X', accent: '#ABCDEF', headingFont: 'source-serif-4', logoAssetId: 'tidak-ada' });
    expect(r.ok).toBe(false); if (!r.ok) expect(r.errors.map((e) => e.field)).toEqual(['logoAssetId']);
    const ok = validateBrandKit({ name: 'X', accent: '#ABCDEF', headingFont: 'source-serif-4' });
    expect(ok.ok && ok.brandKit.accent).toBe('#abcdef');
  });
});

describe('Penyimpanan', () => {
  it('OPS-06 status simpan jujur: pending ≠ saved; quota/unavailable/failed dilaporkan apa adanya (memori)', async () => {
    const st = new MemoryProjectStorage();
    const seen: string[] = [];
    const auto = new AutosaveController(st, 5, (s) => seen.push(s));
    const p = createProject({ source: 'a' });
    auto.schedule(p); expect(auto.status).toBe('pending');
    const r = await auto.flush(); expect(r!.status).toBe('saved'); expect(auto.status).toBe('saved');
    st.faults.quota = true; auto.schedule(commitRevision(p, { source: 'b' }, 'b')); expect((await auto.flush())!.status).toBe('quota-exceeded'); expect(auto.status).toBe('quota-exceeded');
    st.faults = { unavailable: true }; auto.schedule(p); expect((await auto.flush())!.status).toBe('unavailable');
    st.faults = { failSave: true }; auto.schedule(p); expect((await auto.flush())!.status).toBe('failed');
    st.faults = {};
    expect((await st.load(p.projectId))!.source).toBe('a');
    expect(seen).toEqual(['pending', 'saved', 'pending', 'quota-exceeded', 'pending', 'unavailable', 'pending', 'failed']);
    // revisi lama tidak menimpa revisi baru
    const p2 = commitRevision(p, { source: 'baru' }, 'x');
    await st.save(p2); await st.save(p);
    expect((await st.load(p.projectId))!.source).toBe('baru');
  });
  it('CODE-10 hapus: blocked/failed BUKAN sukses; autosave terlambat tidak menghidupkan proyek terhapus', async () => {
    const st = new MemoryProjectStorage();
    const p = createProject({ source: 'rahasia' });
    await st.save(p);
    st.faults.blockDelete = true;
    expect((await st.delete(p.projectId)).status).toBe('blocked');
    expect(await st.load(p.projectId)).not.toBeNull();
    st.faults = { failDelete: true }; expect((await st.deleteAll()).status).toBe('failed');
    st.faults = {};
    const auto = new AutosaveController(st, 1000);
    auto.schedule(p);
    expect((await auto.deleteProject(p.projectId)).status).toBe('deleted');
    await new Promise((r) => setTimeout(r, 20));
    expect(await st.load(p.projectId)).toBeNull();
    expect((await st.save(p)).status).toBe('rejected-deleted');
    auto.schedule(p); expect(auto.status).toBe('rejected-deleted');
    // simpan yang sedang berjalan saat dihapus
    const st2 = new MemoryProjectStorage(); st2.faults.saveDelayMs = 30;
    const a2 = new AutosaveController(st2, 0); const q = createProject({ source: 'x' });
    a2.schedule(q); const inflight = a2.flush();
    const del = await a2.deleteProject(q.projectId); await inflight;
    expect(del.status === 'deleted' || del.status === 'not-found').toBe(true);
    expect(await st2.load(q.projectId)).toBeNull();
  });
  it('OPS-06 OPS-07 IndexedDB (fake-indexeddb): simpan/muat/daftar, tombstone, deleteAll blocked oleh koneksi lain dilaporkan jujur', async () => {
    const factory = new IDBFactory();
    const st = new IdbProjectStorage(factory, 'pf-test');
    expect(await st.available()).toBe(true);
    const p = await sample();
    expect((await st.save(p)).status).toBe('saved');
    const back = await st.load(p.projectId);
    expect(back!.source).toBe(p.source); expect(Buffer.from(back!.assets[0]!.bytes).equals(Buffer.from(p.assets[0]!.bytes))).toBe(true);
    expect((await st.list()).map((x) => x.projectId)).toEqual([p.projectId]);
    expect((await st.delete(p.projectId)).status).toBe('deleted');
    expect((await st.save(p)).status).toBe('rejected-deleted');
    expect(await st.load(p.projectId)).toBeNull();
    // koneksi lain yang tidak menutup diri → deleteDatabase blocked
    const other = await new Promise<IDBDatabase>((res) => { const r = factory.open('pf-test'); r.onsuccess = () => res(r.result); });
    other.onversionchange = null;
    const d = await st.deleteAll();
    expect(d.status).toBe('blocked');
    other.close();
    const d2 = await new IdbProjectStorage(factory, 'pf-test').deleteAll();
    expect(d2.status).toBe('deleted');
    const none = new IdbProjectStorage(null);
    expect(await none.available()).toBe(false); expect((await none.save(p)).status).toBe('unavailable'); expect((await none.deleteAll()).status).toBe('unavailable');
  });
  it('OPS-08 draf baseline 1.0.0 dibaca dari IndexedDB lama tanpa diubah', async () => {
    const factory = new IDBFactory();
    await new Promise<void>((res) => { const r = factory.open('paperforma', 1); r.onupgradeneeded = () => r.result.createObjectStore('drafts'); r.onsuccess = () => { const tx = r.result.transaction('drafts', 'readwrite'); tx.objectStore('drafts').put({ source: '# lama', title: 'L', settings: { template: 'essay' }, assets: [] }, 'current'); tx.oncomplete = () => { r.result.close(); res(); }; }; });
    const d = await readLegacyDraft(factory);
    expect(d).toMatchObject({ source: '# lama' });
    const m = await migrateV1Draft(d as LegacyDraftV1);
    expect(m.project.settings.template).toBe('EDT-01');
    expect(await readLegacyDraft(new IDBFactory())).toBeNull();
  });
});
