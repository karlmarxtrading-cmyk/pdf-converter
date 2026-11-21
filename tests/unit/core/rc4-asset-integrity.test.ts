import { describe, it, expect } from 'vitest';
import { zipSync } from 'fflate';
import { createAssetRecord, IMAGE_BUDGET } from '../../../src/core/assets';
import { createProject, commitRevision, restoreRevisionChanges, exportBundle, importBundle } from '../../../src/core/projects';
import { changesFor, undoFieldsOf, ProjectUndo } from '../../../src/core/undo';
import { validateProject } from '../../../src/core/schema';
import { importZip } from '../../../src/core/zip';
import { MemoryProjectStorage } from '../../../src/core/storage';

// Header-level admission fixtures: these tests do not claim to decode the image.
const png = (w = 4, h = 4, variant = 0) => { const b = new Uint8Array(33); b.set([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]); const v = new DataView(b.buffer); v.setUint32(16,w); v.setUint32(20,h); b[32]=variant; return b; };
const image = async (path: string, w = 4, h = 4, variant = 0) => { const r = await createAssetRecord(png(w,h,variant),path,'upload'); if (!r.ok) throw Error(r.code); return r.asset; };

describe('PF-AUD-2026 asset recovery and resource admission', () => {
  it('PF-AUD-A03 undo replacement restores the original bytes at the same path without duplicate paths', async () => {
    const old = await image('logo.png',4,4,1), next = await image('logo.png',4,4,2);
    const before = commitRevision(createProject({ source: '![logo](logo.png)' }),{ assets:[old] },'add');
    const current = commitRevision(before,{ assets:[next] },'replace');
    const restored = commitRevision(current, changesFor(undoFieldsOf(before), current), 'undo');
    expect(restored.assets.map(a => a.path)).toEqual(['logo.png']);
    expect(restored.assets[0]?.id).toBe(old.id);
  });
  it('PF-AUD-A04 persistent history restores distinct filename aliases with identical image bytes', async () => {
    const a = await image('first.png'), b = { ...a, path:'second.png' };
    let p = commitRevision(createProject({ source:'![1](first.png) ![2](second.png)' }),{ assets:[a,b] },'aliases');
    const r = p.revision;
    p = commitRevision(p,{ source:'changed' },'edit');
    const back = restoreRevisionChanges(p,r);
    const restored = commitRevision(p,back.changes,'restore');
    expect(restored.assets.map(a => a.path)).toEqual(['first.png','second.png']);
    expect(restored.source).toBe('![1](first.png) ![2](second.png)');
  });
  it('PF-AUD-A04 legacy history with hash-only aliases must not introduce duplicate paths', async () => {
    const a = await image('first.png'), b = { ...a,path:'second.png' };
    let p = commitRevision(createProject(),{ assets:[a,b] },'aliases');
    p = { ...p,history:p.history.map(h=>({ ...h,stateJson:JSON.stringify({ name:p.name,settings:p.settings,assetIds:[a.id,b.id] }) })) };
    const back = restoreRevisionChanges(p,p.revision);
    expect(()=>commitRevision(p,back.changes,'restore')).not.toThrow();
    expect(back.changes.assets?.map(a=>a.path)).toEqual(['first.png','second.png']);
  });
  it('PF-AUD-A05 total image pixels are enforced at the project boundary', async () => {
    const a = await image('1.png',6000,6000);
    const assets = Array.from({length:6},(_,i)=>({ ...a,path:`${i}.png` }));
    expect(assets.reduce((n,a)=>n+a.width!*a.height!,0)).toBeGreaterThan(IMAGE_BUDGET.maxTotalPixels);
    expect(()=>validateProject({ ...createProject(),assets })).toThrow();
    expect(()=>commitRevision(createProject(),{ assets },'large batch')).toThrow();
  });
  it('PF-AUD-A05 ordinary ZIP rejects a cumulative pixel overload before returning accepted assets', async () => {
    const bytes = png(6000,6000), files:Record<string,Uint8Array> = { 'source.md':new TextEncoder().encode('images') };
    for(let i=0;i<6;i++) files[`${i}.png`]=bytes;
    const r = await importZip(zipSync(files,{ level:0 }));
    expect(r.ok).toBe(false);
  });
  it('PF-AUD-A05 the storage boundary also rejects cumulative pixel overload', async () => {
    const a = await image('1.png',6000,6000);
    const p = { ...createProject(),assets:Array.from({length:6},(_,i)=>({ ...a,path:`${i}.png` })) };
    const store = new MemoryProjectStorage();
    expect((await store.save(p)).status).toBe('failed');
    expect(await store.load(p.projectId)).toBeNull();
  });
  it('PF-AUD-A06 malformed history state safely degrades to text-only recovery', () => {
    const p = commitRevision(createProject({source:'intact'}),{},'snapshot');
    for(const bad of [null,[],{assetIds:4},{assetIds:['bad']}, {assetIds:[],settings:5},'x']) {
      const corrupt = { ...p,history:p.history.map(h=>({ ...h,stateJson:JSON.stringify(bad) })) };
      expect(()=>restoreRevisionChanges(corrupt,p.revision)).not.toThrow();
      expect(restoreRevisionChanges(corrupt,p.revision).scope).toBe('text-only');
    }
  });
  it('PF-AUD-A04 portable round-trip keeps asset aliases and full history restores validly', async () => {
    const a = await image('one.png'), b={ ...a,path:'two.png' };
    let p = commitRevision(createProject(),{ assets:[a,b],source:'original' },'aliases'); const rev=p.revision;
    p=commitRevision(p,{ source:'latest' },'edit');
    const out=await exportBundle(p), r=await importBundle(out.bytes); expect(r.ok).toBe(true); if(!r.ok)return;
    expect(()=>commitRevision(r.project,restoreRevisionChanges(r.project,rev).changes,'restore')).not.toThrow();
  });
  it('PF-AUD-A03 undo can be committed conditionally without consuming the entry on admission failure', () => {
    const u = new ProjectUndo(); const before=createProject({source:'before'}); const p=commitRevision(before,{source:'after'},'edit');
    u.record(before,'edit');
    const e=u.peekUndo(); expect(e?.state.source).toBe('before');
    // UI uses peek -> validate/commit -> move; rejection leaves both stacks unchanged.
    expect(()=>commitRevision(p,{ ...changesFor(e!.state,p),settings:{...p.settings,title:'x'.repeat(201)} },'undo')).toThrow();
    expect(u.size).toEqual({past:1,future:0,dropped:0});
  });
});
