import type { Snapshot } from '../core/contracts';
import { BudgetError, type BudgetResult } from '../core/limits';
import { integrityExpectation, integrityFromParsed, type IntegrityExpectation } from '../core/integrity';
import { parseMarkdown } from '../core/markdown';

export interface ProjectionRequest { type: 'print-projection'; source: string; conversation?: Snapshot['conversation'] }
export type ProjectionResponse =
  | { type:'print-projection-result'; key:string }
  | { type:'print-projection-error'; message:string; budget?:BudgetResult };

type Projection = {model: IntegrityExpectation; modelKey:string; fallback?:true};

/** Preserve the independent source check in environments where module workers
 * cannot start. Parsing a single Markdown syntax tree is indivisible; the
 * fallback checks cancellation and its deadline between completed stages. */
async function localProjection(snapshot: Snapshot, signal?: AbortSignal): Promise<Projection> {
  const started=performance.now();
  const next=async()=>{
    await new Promise<void>(resolve=>setTimeout(resolve,0));
    signal?.throwIfAborted();
    if(performance.now()-started>90_000)throw new Error('Pemeriksaan sumber lokal melewati batas 90 detik.');
  };
  await next();
  let model: IntegrityExpectation;
  if(snapshot.conversation)model=integrityExpectation(snapshot.source,{conversation:snapshot.conversation});
  else {
    const parsed=parseMarkdown(snapshot.source);
    await next();
    model=integrityFromParsed(parsed);
  }
  await next();
  const modelKey=JSON.stringify(model);
  await next();
  return {model,modelKey,fallback:true};
}

/** A dedicated instance of the same bundled analysis worker. No Node or DOM
 * service is required. Transfer its canonical JSON once; it is both the
 * comparison key and a lossless representation of the independent block model. */
export async function loadPrintProjection(snapshot: Snapshot, signal?: AbortSignal): Promise<Projection> {
  if(typeof Worker!=='function')return localProjection(snapshot,signal);
  signal?.throwIfAborted();
  let worker:Worker;
  try { worker=new Worker(new URL('../engine/engine.worker.ts',import.meta.url),{type:'module',name:'paperforma-print-projection'}); }
  catch { return localProjection(snapshot,signal); }
  let started=false;
  let abort: (()=>void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const modelKey=await new Promise<string>((resolve,reject)=>{
      abort=()=>reject(signal?.reason ?? new DOMException('Dibatalkan','AbortError'));
      signal?.addEventListener('abort',abort,{once:true});
      if(signal?.aborted){abort();return;}
      timer=setTimeout(()=>reject(new Error('Worker pemeriksaan sumber cetak belum siap dalam 30 detik.')),30_000);
      worker.onerror=()=>reject(new Error('Worker pemeriksaan sumber cetak gagal dimuat atau berhenti.'));
      worker.onmessageerror=()=>reject(new Error('Hasil pemeriksaan sumber cetak tidak dapat dibaca.'));
      worker.onmessage=(message: MessageEvent<ProjectionResponse | {type:'ready'}>)=>{
        const reply=message.data;
        if(reply.type==='ready'&&!started){
          started=true;clearTimeout(timer);
          timer=setTimeout(()=>reject(new Error('Pemeriksaan sumber cetak tidak selesai dalam 90 detik.')),90_000);
          try { worker.postMessage({type:'print-projection',source:snapshot.source,conversation:snapshot.conversation} satisfies ProjectionRequest); }
          catch(error){reject(error);}
        }else if(started&&reply.type==='print-projection-result')resolve(reply.key);
        else if(started&&reply.type==='print-projection-error')reject(reply.budget ? new BudgetError(reply.budget) : new Error(reply.message));
      };
    });
    signal?.throwIfAborted();
    return {modelKey,model:JSON.parse(modelKey) as IntegrityExpectation};
  } catch(error) {
    if(started || signal?.aborted)throw error;
  } finally {
    clearTimeout(timer);if(abort)signal?.removeEventListener('abort',abort);
    worker.onmessage=null;worker.onerror=null;worker.onmessageerror=null;worker.terminate();
  }
  return localProjection(snapshot,signal);
}
