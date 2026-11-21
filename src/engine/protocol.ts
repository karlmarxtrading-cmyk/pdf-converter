/** Protokol pesan MESIN-36 antara thread utama dan Worker analisis. */
import type { AnalyzeInput, AnalyzeResult, Phase } from './analyze';

export const ENGINE_PROTOCOL = 1;

/** Utama → Worker */
export type EngineRequest =
  | { type: 'job'; protocol: number; jobId: number; docVersion: string; kind: 'analyze'; input: AnalyzeInput }
  | { type: 'cancel'; jobId: number };

/** Worker → utama */
export type EngineResponse =
  | { type: 'ready'; protocol: number }
  | { type: 'progress'; jobId: number; docVersion: string; phase: Phase; done: number; total: number }
  | { type: 'result'; jobId: number; docVersion: string; result: AnalyzeResult; ms: number }
  | { type: 'cancelled'; jobId: number }
  | { type: 'error'; jobId: number; docVersion: string; code: string; message: string };
