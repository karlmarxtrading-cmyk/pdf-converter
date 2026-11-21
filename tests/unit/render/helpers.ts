/** Bahan uji unit render: snapshot & RenderedBody kecil buatan tangan (BUKAN keluaran core; untuk menguji lapisan render saja). */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { RenderedBody, Snapshot, TemplateId } from '../../../src/core/contracts';
import { RENDERER_VERSION } from '../../../src/core/contracts';
import { templateDefaultSettings, TEMPLATE_VERSION } from '../../../src/render/templates';
import type { FontSource } from '../../../src/render/fonts';

export const nodeFontSource: FontSource = async (spec) => {
  const dir = spec.pkg === 'katex' ? 'node_modules/katex/dist/fonts' : `node_modules/${spec.pkg}/files`;
  return new Uint8Array(await readFile(path.resolve(dir, spec.file)));
};

export function snap(template: TemplateId, over: Partial<Snapshot['settings']> = {}, rev = 1): Snapshot {
  const settings = templateDefaultSettings(template, { title: 'Dokumen Uji', author: 'Penulis Uji', ...over });
  return {
    projectId: 'p-test', revision: rev, createdAt: '2026-11-19T00:00:00Z', rawSourceHash: 'a'.repeat(64), contentSnapshotHash: 'b'.repeat(64),
    renderInputHash: `${rev}`.padStart(64, 'c'), templateId: template, templateVersion: TEMPLATE_VERSION, rendererVersion: RENDERER_VERSION,
    source: '# x', settings, assets: [],
  };
}

export function body(html: string, toc: RenderedBody['toc'] = []): RenderedBody {
  return { html, toc, footnotes: [], blocks: [], issues: [], stats: { words: 0, tables: 0, math: 0, images: 0, code: 0, mermaid: 0 }, scripts: ['Latn'], mermaidPending: false };
}

/** Snapshot + RenderedBody NYATA dari core (dipakai uji ekspor: validator akhir memeriksa integritas sumber → keluaran). */
export async function realDoc(md: string, template: TemplateId, over: Partial<Snapshot['settings']> = {}, rev = 1, assets: Snapshot['assets'] = []): Promise<{ snapshot: Snapshot; body: RenderedBody }> {
  const { createProject } = await import('../../../src/core/projects');
  const { makeSnapshot } = await import('../../../src/core/hash');
  const { renderBody, snapshotRenderOptions } = await import('../../../src/core/render');
  const p = createProject({ template, source: md, projectId: 'p-test' });
  p.settings = { ...templateDefaultSettings(template, { title: 'Dokumen Uji', author: 'Penulis Uji' }), ...over };
  p.revision = rev;
  p.assets = assets;
  const snapshot = await makeSnapshot(p);
  const body = await renderBody(snapshot.source, snapshotRenderOptions(snapshot));
  return { snapshot, body };
}
