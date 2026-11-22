import { expect, it } from 'vitest';
import { createAssetRecord } from '../../../src/core/assets';
import { createProject, commitRevision, exportBundle, importBundle, restoreRevisionChanges } from '../../../src/core/projects';
import { fxBytes } from './fx';

it('verifies portable content, preserves local assets and typography, resets sender permission including in historical revisions', async () => {
  const owner = createProject({ source: '![Chart](chart.png)' });
  const image = await createAssetRecord(fxBytes('assets/chart.png'), 'chart.png', 'upload');
  if (!image.ok) throw new Error(image.message);
  const original = commitRevision(owner, { assets: [image.asset], settings: {
    ...owner.settings, allowExternalImages: true, paper: 'A5',
  } }, 'allow-image');
  const edited = commitRevision(original, { source: '# Report\n\n' + original.source }, 'heading');
  const imported = await importBundle((await exportBundle(edited)).bytes);
  if (!imported.ok) throw new Error(imported.message);
  expect(edited.settings.allowExternalImages).toBe(true);
  expect(imported.project.settings).toEqual({ ...edited.settings, allowExternalImages: false });
  expect(imported.project.source).toBe(edited.source);
  expect(imported.project.assets[0]!.bytes).toEqual(image.asset.bytes);
  const restored = restoreRevisionChanges(imported.project, original.revision);
  expect(restored.changes.source).toBe(original.source);
  expect(restored.changes.settings?.allowExternalImages).toBe(false);
  const consentedHere = commitRevision(imported.project, { settings: {
    ...imported.project.settings, allowExternalImages: true,
  } }, 'recipient opted in');
  expect(restoreRevisionChanges(consentedHere, original.revision).changes.settings?.allowExternalImages).toBe(true);
});
