// @vitest-environment jsdom
// ST-QA-21: paket .pfproj yang dibuat kode RC3 (fixtures/rc3-project.pfproj, dibuat dari source RC3 asli)
// dapat dibuka versi statis; riwayat RC3 (tanpa keadaan) dipulihkan sebagai teks saja dan diberi label.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { importBundle, exportBundle, restoreRevisionChanges, commitRevision } from '../../../src/core/projects';
import { renderBody, snapshotRenderOptions } from '../../../src/core/render';
import { makeSnapshot } from '../../../src/core/hash';

describe('kompatibilitas proyek RC3', () => {
  it('impor, render, ekspor ulang, impor lagi', async () => {
    const bytes = new Uint8Array(readFileSync('fixtures/rc3-project.pfproj'));
    const r = await importBundle(bytes);
    if (!r.ok) throw new Error(r.message);
    expect(r.project.source).toContain('Revisi kedua.');
    expect(r.project.settings.paper).toBe('A5');
    expect(r.project.assets).toHaveLength(1);
    const body = await renderBody(r.project.source, snapshotRenderOptions(await makeSnapshot(r.project)));
    expect(body.html).toContain('data:image/png');
    const old = r.project.history[0]!;
    expect(old.stateJson).toBeUndefined();
    expect(restoreRevisionChanges(r.project, old.revision).scope).toBe('text-only');
    const next = commitRevision(r.project, { source: r.project.source + 'x' }, 'edit');
    const again = await importBundle((await exportBundle(next)).bytes);
    if (!again.ok) throw new Error(again.message);
    expect(again.project.history.at(-1)!.stateJson).toBeTruthy();
    expect(restoreRevisionChanges(again.project, again.project.revision).scope).toBe('full');
  });
  it('paket rusak ditolak tanpa menyentuh apa pun', async () => {
    const bytes = new Uint8Array(readFileSync('fixtures/rc3-project.pfproj'));
    const bad = bytes.slice(); bad[bad.length - 30] ^= 0xff; bad[60] ^= 0xff;
    const r = await importBundle(bad);
    expect(r.ok).toBe(false);
  });
});
