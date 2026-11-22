// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import type {Snapshot} from '../../../src/core/contracts';
import {integrityExpectation} from '../../../src/core/integrity';
import {loadPrintProjection} from '../../../src/render/print-projection';
const snapshot={source:'# Contoh\n\nAksen é dan 🚲.\n\n| Indeks | Nilai |\n|---|---|\n| satu | dua |'} as Snapshot;
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
it('reconstructs the exact canonical worker projection and releases the worker',async()=>{
  const key=JSON.stringify(integrityExpectation(snapshot.source));
  const terminate=vi.fn();
  class Worker {
    onmessage?: (message:{data:unknown})=>void;
    terminate=terminate;
    constructor(){queueMicrotask(()=>this.onmessage?.({data:{type:'ready'}}));}
    postMessage(data:{type:string;source:string}){
      expect(data).toEqual({type:'print-projection',source:snapshot.source,conversation:undefined});
      queueMicrotask(()=>this.onmessage?.({data:{type:'print-projection-result',key}}));
    }
  }
  vi.stubGlobal('Worker',Worker);
  expect(await loadPrintProjection(snapshot)).toEqual({model:JSON.parse(key),modelKey:key});
  expect(terminate).toHaveBeenCalledOnce();
});
it('aborts an active projection immediately and releases the worker and deadline',async()=>{
  vi.useFakeTimers();
  const abort=new AbortController(),terminate=vi.fn();
  class Worker{
    onmessage?: (message:{data:unknown})=>void;
    terminate=terminate;
    constructor(){queueMicrotask(()=>this.onmessage?.({data:{type:'ready'}}));}
    postMessage(){abort.abort();}
  }
  vi.stubGlobal('Worker',Worker);
  await expect(loadPrintProjection(snapshot,abort.signal)).rejects.toMatchObject({name:'AbortError'});
  expect(terminate).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);
});
it('rejects an installed worker that stops processing after readiness',async()=>{
  vi.useFakeTimers();const terminate=vi.fn();
  class Worker{
    onmessage?: (message:{data:unknown})=>void;
    terminate=terminate;
    constructor(){queueMicrotask(()=>this.onmessage?.({data:{type:'ready'}}));}
    postMessage(){}
  }
  vi.stubGlobal('Worker',Worker);
  const failure=loadPrintProjection(snapshot).catch((e:Error)=>e);
  await vi.advanceTimersByTimeAsync(90_001);
  await expect(failure).resolves.toMatchObject({message:expect.stringContaining('90 detik')});
  expect(terminate).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);
});
it('keeps the exact source oracle when module workers are unavailable',async()=>{
  vi.stubGlobal('Worker',undefined);
  const model=integrityExpectation(snapshot.source),key=JSON.stringify(model);
  expect(await loadPrintProjection(snapshot)).toEqual({model,modelKey:key,fallback:true});
});
it('aborts during worker startup and discards a ready or result event after close',async()=>{
  vi.useFakeTimers();
  const abort=new AbortController(),terminate=vi.fn(),post=vi.fn();
  const instances: Worker[] = [];
  class Worker {
    onmessage: ((event:{data:unknown})=>void) | null=null;
    onerror: (()=>void) | null=null;
    onmessageerror: (()=>void) | null=null;
    terminate=terminate;
    postMessage=post;
    constructor(){instances.push(this); }
  }
  vi.stubGlobal('Worker',Worker);
  const pending=loadPrintProjection(snapshot,abort.signal);
  abort.abort();await expect(pending).rejects.toMatchObject({name:'AbortError'});
  const worker = instances[0];
  expect(worker).toMatchObject({onmessage:null,onerror:null,onmessageerror:null});
  worker?.onmessage?.({data:{type:'ready'}});
  worker?.onmessage?.({data:{type:'print-projection-result',key:'stale'}});
  expect(post).not.toHaveBeenCalled();expect(terminate).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);
});
