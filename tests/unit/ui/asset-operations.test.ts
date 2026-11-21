import { describe,it,expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import * as assets from '../../../src/core/assets';
import * as projects from '../../../src/core/projects';
import * as limits from '../../../src/core/limits';
import type { Project } from '../../../src/core/contracts';

// Run the real UI handlers with controlled promise boundaries, without claiming a browser E2E.
const source=readFileSync(process.env.PF_UI_AUDIT_SOURCE ?? new URL('../../../src/ui/main.ts',import.meta.url),'utf8');
function handler(name:string,next:string,C:object,S:object,commit:(c:Partial<Project>)=>boolean){
 const fn=source.slice(source.indexOf(`async function ${name}(`),source.indexOf(`async function ${next}(`));
 const js=transformSync(`${fn}\nexport { ${name} };`,{loader:'ts',format:'cjs',target:'es2022'}).code;
 const module={exports:{} as Record<string,(...args:unknown[])=>Promise<void>>};
 new Function('module','exports','C','S','commit','notify','pick','goWorkspace','renderAssets',js)(module,module.exports,C,S,commit,()=>{},(id:string)=>id,()=>{},()=>{});
 return module.exports[name]!;
}
const png=(mark=0)=>{const b=new Uint8Array(33);b.set([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]);const v=new DataView(b.buffer);v.setUint32(16,4);v.setUint32(20,4);b[32]=mark;return b;};
const file=(name:string,bytes=png())=>({name,size:bytes.length,arrayBuffer:async()=>bytes.slice().buffer});
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return {resolve,promise};};
const core={...assets,...projects,...limits};
function state(p=projects.createProject()){const S={project:p,projectGeneration:0};return {S,commit:(c:Partial<Project>)=>{S.project=projects.commitRevision(S.project,c,'UI action');return true;}};}

describe('PF-AUD asynchronous asset UI',()=>{
 it('PF-AUD-A01 project switch while hashing cannot write old assets into the new project',async()=>{
  const {S,commit}=state();const hashing=deferred(),resume=deferred();
  class PausedStore extends assets.AssetStore {override async add(...args:Parameters<assets.AssetStore['add']>){const r=await super.add(...args);hashing.resolve();await resume.promise;return r;}}
  const add=handler('addAssetFiles','replaceAsset',{...core,AssetStore:PausedStore},S,commit);
  const pending=add([file('from-A.png')]);await hashing.promise;
  const b=projects.createProject({name:'B'});S.project=b;S.projectGeneration++;resume.resolve();await pending;
  expect(S.project).toBe(b);expect(S.project.assets).toEqual([]);
 });
 it('PF-AUD-A01 parallel uploads preserve both batches',async()=>{
  const {S,commit}=state();const hashing=deferred(),resume=deferred();
  class PausedStore extends assets.AssetStore {override async add(...args:Parameters<assets.AssetStore['add']>){const r=await super.add(...args);if(args[1]==='first.png'){hashing.resolve();await resume.promise;}return r;}}
  const add=handler('addAssetFiles','replaceAsset',{...core,AssetStore:PausedStore},S,commit);
  const first=add([file('first.png')]);await hashing.promise;await add([file('second.png',png(1))]);resume.resolve();await first;
  expect(S.project.assets.map(a=>a.path).sort()).toEqual(['first.png','second.png']);
 });
 it('PF-AUD-A02 replacing the second alias changes the selected path, not the first shared hash',async()=>{
  const r=await assets.createAssetRecord(png(),'first.png','upload');if(!r.ok)throw Error('fixture');
  const a=r.asset,b={...a,path:'second.png'};const {S,commit}=state(projects.commitRevision(projects.createProject(),{assets:[a,b]},'aliases'));
  const replace=handler('replaceAsset','importBundleFile',core,S,commit);
  // Follow the selector value wired by the actual row click handler in the audited source.
  const selected=source.includes('fi.dataset.replace = a.path') ? b.path : b.id;
  await replace(selected,file('replacement.png',png(2)));
  expect(S.project.assets.find(x=>x.path==='first.png')?.id).toBe(a.id);
  expect(S.project.assets.find(x=>x.path==='second.png')?.id).not.toBe(a.id);
 });
 it('PF-AUD-A01 reopening the same project invalidates an older pending upload',async()=>{
  const {S,commit}=state();const hashing=deferred(),resume=deferred();
  class PausedStore extends assets.AssetStore {override async add(...args:Parameters<assets.AssetStore['add']>){const r=await super.add(...args);hashing.resolve();await resume.promise;return r;}}
  const add=handler('addAssetFiles','replaceAsset',{...core,AssetStore:PausedStore},S,commit);
  const pending=add([file('old.png')]);await hashing.promise;S.project={...S.project,name:'reopened'};S.projectGeneration++;const reopened=S.project;resume.resolve();await pending;
  expect(S.project).toBe(reopened);expect(S.project.assets).toEqual([]);
 });
 it('PF-AUD-A01 competing replacements of the same filename do not silently overwrite a newer completion',async()=>{
  const {S,commit}=state();const hashing=deferred(),resume=deferred();let count=0;
  class PausedStore extends assets.AssetStore {override async add(...args:Parameters<assets.AssetStore['add']>){const r=await super.add(...args);if(++count===1){hashing.resolve();await resume.promise;}return r;}}
  const add=handler('addAssetFiles','replaceAsset',{...core,AssetStore:PausedStore},S,commit);
  const first=add([file('same.png',png(1))]);await hashing.promise;await add([file('same.png',png(2))]);const latest=S.project;resume.resolve();await first;
  expect(S.project).toBe(latest);
 });
});
