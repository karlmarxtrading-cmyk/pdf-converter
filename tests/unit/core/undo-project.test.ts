// UI-06 / EN-009: Undo/Redo dan pemulihan revisi mencakup seluruh proyek; retensi undo terbatas.
import { describe, expect, it } from 'vitest';
import { createProject, commitRevision, restoreRevisionChanges, historyEntryState } from '../../../src/core/projects';
import { ProjectUndo, changesFor, UNDO_LIMITS } from '../../../src/core/undo';
import { createAssetRecord } from '../../../src/core/assets';
import { templateDefaultSettings } from '../../../src/render/templates';

const png = () => { const b = new Uint8Array(33); b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]); const dv = new DataView(b.buffer); dv.setUint32(16, 4); dv.setUint32(20, 4); return b; };

describe('transaksi proyek: teks → margin → templat → brand → aset → Undo/Redo', () => {
  it('setiap langkah dapat diurungkan dan diulang dengan seluruh keadaannya', async () => {
    const u = new ProjectUndo(UNDO_LIMITS, (() => { let t = 0; return () => (t += 5000); })());
    let p = createProject({ template: 'EDU-01', source: 'awal' });
    const step = (changes: Parameters<typeof commitRevision>[1], label: string) => { u.record(p, label, label === 'edit' ? 'edit' : undefined); p = commitRevision(p, changes, label); };
    step({ source: 'awal + teks' }, 'edit');
    step({ settings: { ...p.settings, margins: { ...p.settings.margins, top: 33 } } }, 'margins');
    step({ settings: { ...templateDefaultSettings('BUS-01'), title: p.settings.title } }, 'template');
    step({ brandKit: { id: 'b1', name: 'Merek', accent: '#123456', headingFont: 'inter', updatedAt: '2026-11-20T00:00:00Z' } }, 'brand');
    const a = await createAssetRecord(png(), 'gambar.png', 'upload'); if (!a.ok) throw new Error('asset');
    step({ assets: [a.asset] }, 'asset');
    const snapshots: string[] = [];
    const sig = (x: typeof p) => JSON.stringify([x.source, x.settings.margins.top, x.settings.template, x.brandKit?.name ?? null, x.assets.length]);
    snapshots.push(sig(p));
    while (u.canUndo) { const e = u.undo(p)!; p = commitRevision(p, changesFor(e.state, p), 'undo'); snapshots.push(sig(p)); }
    // aset dipertahankan saat undo (tanpa rujukan) agar byte tidak hilang; keadaan lain kembali persis per langkah
    const top0 = templateDefaultSettings('EDU-01').margins.top, bus = templateDefaultSettings('BUS-01').margins.top;
    expect(snapshots.map((x) => JSON.parse(x))).toEqual([
      ['awal + teks', bus, 'BUS-01', 'Merek', 1],
      ['awal + teks', bus, 'BUS-01', 'Merek', 1],
      ['awal + teks', bus, 'BUS-01', null, 1],
      ['awal + teks', 33, 'EDU-01', null, 1],
      ['awal + teks', top0, 'EDU-01', null, 1],
      ['awal', top0, 'EDU-01', null, 1],
    ]);
    while (u.canRedo) { const e = u.redo(p)!; p = commitRevision(p, changesFor(e.state), 'redo'); }
    expect(sig(p)).toBe(snapshots[0]);
  });

  it('ketikan beruntun digabung; retensi dibatasi tanpa menyentuh sumber aktif', () => {
    let t = 0;
    const u = new ProjectUndo({ maxEntries: 5, maxSourceChars: 1e9, coalesceMs: 1000 }, () => (t += 10));
    let p = createProject({ source: '' });
    for (let i = 0; i < 50; i++) { u.record(p, 'edit', 'edit'); p = commitRevision(p, { source: p.source + 'x' }, 'edit'); }
    expect(u.size.past).toBe(1);
    for (let i = 0; i < 20; i++) { t += 5000; u.record(p, 'paste'); p = commitRevision(p, { source: p.source + 'y' }, 'paste'); }
    expect(u.size.past).toBe(5);
    expect(u.size.dropped).toBeGreaterThan(0);
    expect(p.source.length).toBe(70);
  });
});

describe('pemulihan revisi mencakup pengaturan, templat, brand dan aset', () => {
  it('restoreRevisionChanges memulihkan keadaan non-teks; aset hilang dilaporkan', async () => {
    let p = createProject({ template: 'EDU-01', source: 'v1' });
    const a = await createAssetRecord(png(), 'g.png', 'upload'); if (!a.ok) throw new Error('asset');
    p = commitRevision(p, { assets: [a.asset], settings: { ...p.settings, paper: 'A5' } }, 'r1');
    const r1 = p.revision;
    p = commitRevision(p, { source: 'v2', settings: { ...templateDefaultSettings('BUS-01') }, assets: [] }, 'r2');
    expect(historyEntryState(p, r1).state?.settings.paper).toBe('A5');
    const back = restoreRevisionChanges(p, r1);
    expect(back.scope).toBe('full');
    expect(back.changes.source).toBe('v1');
    expect(back.changes.settings?.paper).toBe('A5');
    expect(back.missingAssetIds).toEqual([a.asset.id]);
  });
  it('revisi RC3 tanpa keadaan dipulihkan sebagai teks saja dan diberi label', () => {
    let p = createProject({ source: 'lama' });
    p = commitRevision(p, { source: 'baru' }, 'x');
    p = { ...p, history: p.history.map((h) => { const { stateJson: _s, ...rest } = h; void _s; return rest; }) };
    const back = restoreRevisionChanges(p, p.history[0]!.revision);
    expect(back.scope).toBe('text-only');
  });
});
