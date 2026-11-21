/**
 * MESIN-36 — pekerjaan analisis tanpa DOM. Dijalankan di Web Worker (engine.worker.ts) atau, bila Worker tidak
 * tersedia, di thread utama dengan jeda antar-fase (client.ts). Modul ini TIDAK boleh menyentuh `document`/`window`:
 * dibuktikan oleh tests/unit/engine/worker-handler.test.ts yang berjalan di lingkungan Node tanpa DOM.
 */
import { renderStage1, type CoreRenderOptions, type RenderStage1 } from '../core/render';
import { integrityFromParsed, integrityExpectation, type IntegrityExpectation } from '../core/integrity';
import { analyzeChars, type CharAnalysis } from '../core/chars';
import type { CoreIssue } from '../core/util';
import { assetPreflight, preflightImageSources } from '../core/preflight';
import { parseMarkdown } from '../core/markdown';
import type { AssetPreflight } from '../core/assets';
export type { CharAnalysis };
import type { AssetRecord } from '../core/contracts';

/** Aset tanpa byte: tahap 1 hanya butuh id/path/mime/dimensi (src diisi di thread utama). */
export type AssetMeta = Omit<AssetRecord, 'bytes'>;
export interface AnalyzeInput { source: string; options: Omit<CoreRenderOptions, 'assets'> & { assets: AssetMeta[] } }

export interface AnalyzeResult { stage1: RenderStage1; expected: IntegrityExpectation; assets: AssetPreflight; chars: CharAnalysis; issues: CoreIssue[]; timings: Record<string, number> }

export type Phase = 'chars' | 'render' | 'integrity-model' | 'references';
export const PHASES: Phase[] = ['chars', 'render', 'integrity-model', 'references'];

export interface PhaseHooks { onPhase?: (phase: Phase, index: number) => void | Promise<void>; checkpoint?: () => void | Promise<void> }

/** Jalankan seluruh fase analisis. `checkpoint` dipanggil di antara fase (pembatalan / jeda ke event loop). */
export async function analyze(input: AnalyzeInput, hooks: PhaseHooks = {}): Promise<AnalyzeResult> {
  const timings: Record<string, number> = {};
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  let t = now();
  await hooks.onPhase?.('chars', 0);
  const chars = analyzeChars(input.source);
  timings.chars = now() - t;
  await hooks.checkpoint?.();
  t = now();
  await hooks.onPhase?.('render', 1);
  const stage1 = await renderStage1(input.source, input.options as unknown as CoreRenderOptions);
  timings.render = now() - t;
  await hooks.checkpoint?.();
  t = now();
  await hooks.onPhase?.('integrity-model', 2);
  // A fresh, independently validated tree is the oracle. Do not reuse the renderer's
  // tree or retain it across jobs. Conversation projections keep their per-message paths.
  const { conversation, idPrefix, sourcePath } = input.options;
  const parsed = conversation ? undefined : parseMarkdown(input.source);
  const expected = parsed ? integrityFromParsed(parsed, idPrefix) : integrityExpectation(input.source, { conversation, idPrefix });
  timings.integrityModel = now() - t;
  await hooks.checkpoint?.();
  t = now();
  await hooks.onPhase?.('references', 3);
  const metadata = input.options.assets as AssetRecord[];
  const assets = parsed
    ? preflightImageSources([parsed], metadata, sourcePath)
    : assetPreflight({ source: input.source, sourcePath, assets: metadata, conversation });
  timings.references = now() - t;
  return { stage1, expected, assets, chars, issues: [], timings };
}
