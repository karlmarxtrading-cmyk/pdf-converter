/// <reference lib="webworker" />
/** Worker modul MESIN-36: parsing, normalisasi, render tahap 1, model integritas, analisis karakter. */
import { createHandler } from './handler';
import { ENGINE_PROTOCOL, type EngineRequest } from './protocol';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const handle = createHandler((r) => scope.postMessage(r));
scope.onmessage = (ev: MessageEvent<EngineRequest>) => { void handle(ev.data); };
scope.postMessage({ type: 'ready', protocol: ENGINE_PROTOCOL });
