import {describe,it,expect,vi} from 'vitest';
import { makeSnapshot, computeRenderInputHash, computeContentSnapshotHash } from '../../../src/core/hash';
import { createProject } from '../../../src/core/projects';
import { createAssetRecord } from '../../../src/core/assets';
const png=()=>{const b=new Uint8Array(117);b.set([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]);const v=new DataView(b.buffer);v.setUint32(16,4);v.setUint32(20,4);return b;};
describe('PF-AUD-P01 immutable snapshot efficiency',()=>{
 it('hashes frozen image bytes once per asset rather than twice in one snapshot',async()=>{
  const r=await createAssetRecord(png(),'image.png','upload');if(!r.ok)throw Error('fixture');
  const p={...createProject({source:'hello'}),assets:[r.asset]};
  const original=crypto.subtle.digest.bind(crypto.subtle);let calls=0;
  const spy=vi.spyOn(crypto.subtle,'digest').mockImplementation((algorithm,data)=>{if(ArrayBuffer.isView(data)&&data.byteLength===117)calls++;return original(algorithm,data);});
  try{await makeSnapshot(p);expect(calls).toBe(1);}finally{spy.mockRestore();}
 });
 it('retains byte and setting immutability during asynchronous snapshot construction',async()=>{
  const r=await createAssetRecord(png(),'image.png','upload');if(!r.ok)throw Error('fixture');
  const p={...createProject({source:'before'}),assets:[r.asset]};
  const saved=p.assets[0]!.bytes.slice();const pending=makeSnapshot(p,{now:()=> '2026-11-21T00:00:00.000Z'});
  p.assets[0]!.bytes[100]=99;p.settings.title='mutated';p.source='after';
  const snap=await pending;expect(snap.assets[0]!.bytes).toEqual(saved);expect(snap.settings.title).toBe('');expect(snap.source).toBe('before');
  const expected=await computeRenderInputHash({ contentSnapshotHash:await computeContentSnapshotHash('before'),assets:snap.assets,settings:snap.settings,templateId:snap.templateId,templateVersion:snap.templateVersion,rendererVersion:snap.rendererVersion });
  expect(snap.renderInputHash).toBe(expected);expect(snap.assets[0]!.bytes).not.toBe(p.assets[0]!.bytes);
 });
});
