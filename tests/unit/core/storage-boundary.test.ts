import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { createProject, makeInputRecord, commitRevision, exportBundle, importBundle, migrateV1Draft, projectBytes, historySource } from '../../../src/core/projects';
import { createAssetRecord } from '../../../src/core/assets';
import { validateProject } from '../../../src/core/schema';
import { sha256Hex } from '../../../src/core/hash';
import { parsePlainConversation } from '../../../src/core/conversation';
import { fxBytes } from './fx';
import { IdbProjectStorage } from '../../../src/core/storage';

describe('F-01 runtime boundaries', () => {
  it('rejects malformed numeric settings even when manifest and settings copy are internally consistent', async () => {
    const active = createProject({ source: 'Original' });
    const files = unzipSync((await exportBundle(active)).bytes);
    const meta = JSON.parse(strFromU8(files['project.json']!));
    const manifest = JSON.parse(strFromU8(files['manifest.json']!));
    meta.settings.lineHeight = '1.5';
    files['project.json'] = strToU8(JSON.stringify(meta)); files['settings.json'] = strToU8(JSON.stringify(meta.settings));
    for (const f of manifest.files) { f.sha256 = await sha256Hex(files[f.path]!); f.bytes = files[f.path]!.length; }
    files['manifest.json'] = strToU8(JSON.stringify(manifest));
    expect(await importBundle(zipSync(files))).toMatchObject({ ok: false, code: 'BUNDLE_CORRUPT' });
    expect(active.settings.lineHeight).toBe(1.5); expect(active.source).toBe('Original');
  });
  it('checks nested reference bounds, uniqueness, settings and legacy imports', async () => {
    const i = await makeInputRecord('paste-plain', 'User: satu\nAssistant: dua');
    const conversation = parsePlainConversation(i.rawPlain,i.id).conversation;
    const p = { ...createProject(), inputs: [i], conversation };
    expect(() => validateProject(p)).not.toThrow();
    expect(() => validateProject({ ...p, inputs: [i,i] })).toThrow();
    expect(() => validateProject({ ...p, conversation: { ...conversation, selectedOrder: ['missing'] } })).toThrow();
    expect(() => validateProject({ ...p, settings: { ...p.settings, baseSizePt: Infinity } })).toThrow();
    expect(() => validateProject({ ...p, settings: { ...p.settings, brandKitId: 'missing' } })).toThrow();
    const m = conversation.messages[0]!;
    expect(() => validateProject({ ...p, conversation: { ...conversation, messages: [{ ...m, sourceRef: { ...m.sourceRef, end: 999 } }] } })).toThrow();
    await expect(migrateV1Draft({source:'Old', settings:{ lineHeight: '1.5' as never }})).rejects.toThrow();
  });
});
it('F-04 one MiB, 100 small edits, source provenance, conversation and logo round-trip losslessly', async () => {
  const raw = 'Q'.repeat(1024 * 1024);
  const input = await makeInputRecord('markdown-file', raw);
  const dialogue = await makeInputRecord('paste-html', 'User: A\nAssistant: B', {rawHtml:'<p>B</p>'});
  const image = await createAssetRecord(fxBytes('assets/chart.png'), 'images/chart.png', 'brand');
  if (!image.ok) throw Error(image.message);
  const p = createProject({ source: raw });
  let current = commitRevision(p, {
    inputs:[input,dialogue], conversation:parsePlainConversation(dialogue.rawPlain,dialogue.id).conversation,
    assets:[image.asset], brandKit:{ id:'brand-test', accent:'#123456', headingFont:'inter', name:'School', logoAssetId:image.asset.id, updatedAt:p.updatedAt }
  },'initial');
  for (let n = 1; n <= 100; n++) current = commitRevision(current,{source: raw + ' ' + n},'Edit ' + n);
  expect(current.history).toHaveLength(100);
  expect(historySource(current,current.revision-50)).toBe(raw + ' 50');
  expect(projectBytes(current)).toBeLessThan(5*1024*1024);
  const {bytes} = await exportBundle(current);
  const restored = await importBundle(bytes);
  expect(restored.ok && restored.project).toEqual(current);
  console.info('F-04', JSON.stringify({ edits:100, rawBytes:raw.length, historyCount:current.history.length, portableUnpacked:projectBytes(current), archiveBytes:bytes.length }));
}, 60000);
it('F-05 retries, concurrent branches and deletion use the actual loaded base', async () => {
  const name = 'pf-cas-' + Date.now(), a = new IdbProjectStorage(indexedDB,name), b = new IdbProjectStorage(indexedDB,name);
  const p = createProject({source:'initial'}); expect((await a.save(p)).status).toBe('saved');
  const left = (await a.load(p.projectId))!, right = (await b.load(p.projectId))!;
  const x = commitRevision(left,{source:'left'},'left');
  const y = commitRevision(commitRevision(right,{source:'right'},'right'),{source:'right-2'},'right-2');
  expect((await a.save(x)).status).toBe('saved');
  expect((await a.save(x)).status).toBe('saved');
  const conflict = await b.save(y); expect(conflict.status).toBe('conflict');
  expect((await b.load(conflict.recoveryId!))!.source).toBe('right-2');
  expect((await b.save(y)).recoveryId).toBe(conflict.recoveryId);
  expect((await b.load(p.projectId))!.source).toBe('left');
  await a.delete(p.projectId);
  expect((await b.save(y)).status).toBe('rejected-deleted');
  await a.close(); await b.close();
});

it('F-04 rejects a mutation atomically and migrates recoverable RC2 full-snapshot IndexedDB history', async () => {
  const p = createProject({ source:'Previous document' });
  expect(() => commitRevision(p,{source:'X'.repeat(5*1024*1024+1)},'Overflow')).toThrow();
  expect(p).toMatchObject({source:'Previous document',revision:0,history:[]});
  const name = 'pf-legacy-history-' + Date.now();
  const store = new IdbProjectStorage(indexedDB,name);
  expect(await store.available()).toBe(true);
  const old = createProject({source:'A'.repeat(1024*1024)});
  old.revision = 8;
  old.history = Array.from({length:8},(_,i) => ({ revision:i+1, at:old.updatedAt, label:'Legacy', source:old.source }));
  const db = await new Promise<IDBDatabase>((resolve,reject) => {
    const request = indexedDB.open(name); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve,reject) => {
    const tx = db.transaction('projects','readwrite'); tx.objectStore('projects').put(old);
    tx.oncomplete=()=>resolve(); tx.onerror=()=>reject(tx.error);
  });
  db.close();
  const recovered = await store.load(old.projectId); expect(recovered?.source).toBe(old.source);
  expect(recovered!.revision).toBe(9); expect((await store.save(recovered!)).status).toBe('saved');
  const restored = await importBundle((await exportBundle(recovered!)).bytes);
  expect(restored.ok && restored.project).toEqual(recovered);
  await store.close();
},60000);

it('F-04/OPS-02 fast admission and exact export agree at UTF-8, JSON escape and ZIP accounting boundaries', async () => {
  const { LIMITS, utf8Length, assertBudget, checkBudget } = await import('../../../src/core/limits');
  const now = '2026-11-20T00:00:00.000Z';
  const text = ('Catatan 🌏\\\n\u0000\u0001 "A"\r\té\n').repeat(800);
  for (const s of [text, text.repeat(9), 'Q'.repeat(131071)+'🌏', '\ud800a\udc00']) {
    expect(utf8Length(s)).toBe(new TextEncoder().encode(s).length);
  }
  const asset = await createAssetRecord(fxBytes('assets/chart.png'),'assets/chart.png','zip');
  if (!asset.ok) throw Error(asset.message);
  const p = createProject({source:text,now});
  const change = { source:text+'End', inputs:[await makeInputRecord('paste-html',text,{rawHtml:'<p>🌏</p>',now})],
    assets:[asset.asset,{...asset.asset,path:'images/same.png'}] };
  const expected = commitRevision(p,change,'Edit',now);
  const exact = projectBytes(expected), noHistory = projectBytes({...expected,history:[]});
  expect(commitRevision(p,change,'Edit',now,{...LIMITS,totalProjectBytes:exact})).toEqual(expected);
  expect(commitRevision(p,change,'Edit',now,{...LIMITS,totalProjectBytes:noHistory})).toEqual({...expected,history:[]});
  expect(()=>commitRevision(p,change,'Edit',now,{...LIMITS,totalProjectBytes:noHistory-1})).toThrow();
  const manifest = (await exportBundle(expected,now)).manifest;
  const unpacked = manifest.files.reduce((n,f)=>n+f.bytes,utf8Length(JSON.stringify(manifest,null,2)));
  const paths = [...manifest.files.map(f=>f.path),'manifest.json'];
  const zipBound = paths.reduce((n,path)=>n+76+2*utf8Length(path),unpacked+22);
  expect(commitRevision(p,change,'Edit',now,{...LIMITS,zipUnpackedBytes:unpacked,zipBytes:zipBound,zipEntries:paths.length})).toEqual(expected);
  expect(()=>commitRevision(p,change,'Edit',now,{...LIMITS,zipEntries:paths.length-1})).toThrow();
  expect(()=>assertBudget('markdown',NaN)).toThrow();
  expect(checkBudget('markdown',3)).toMatchObject({ok:true,actual:3,code:'OK',message:expect.any(String),messageEn:expect.any(String)});
  const cycle: Record<string,unknown> = {}; cycle.self=cycle;
  for (const invalid of [cycle, new Map(), NaN]) {
    expect(()=>commitRevision(p,{ settings:{...p.settings,extra:invalid} as typeof p.settings },'invalid',now)).toThrow();
  }
});
