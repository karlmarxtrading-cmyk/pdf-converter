/// <reference lib="webworker" />
/** Worker modul MESIN-36: parsing, normalisasi, render tahap 1, model integritas, analisis karakter. */
import { integrityExpectation } from '../core/integrity';
import { BudgetError } from '../core/limits';
import type { ProjectionRequest, ProjectionResponse } from '../render/print-projection';
import { createHandler } from './handler';
import { ENGINE_PROTOCOL, type EngineRequest } from './protocol';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const handle = createHandler((r) => scope.postMessage(r));
scope.onmessage = (ev: MessageEvent<EngineRequest | ProjectionRequest>) => {
  const request=ev.data;
  if(request.type!=='print-projection'){void handle(request);return;}
  try {
    const expected=integrityExpectation(request.source,{conversation:request.conversation});
    scope.postMessage({type:'print-projection-result',key:JSON.stringify(expected)} satisfies ProjectionResponse);
  } catch(error) {
    scope.postMessage({type:'print-projection-error',message:error instanceof Error?error.message:String(error),
      ...(error instanceof BudgetError?{budget:error.result}:{})} satisfies ProjectionResponse);
  }
};
scope.postMessage({ type: 'ready', protocol: ENGINE_PROTOCOL });
