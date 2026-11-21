import { expect, it } from 'vitest';
import { AutosaveController, MemoryProjectStorage } from '../../../src/core/storage';
import { createProject, commitRevision } from '../../../src/core/projects';

it('preserves a pending revision when deleting a project is blocked', async () => {
  const store = new MemoryProjectStorage();
  const autosave = new AutosaveController(store);
  const p = createProject({ source: 'Draft' });
  await store.save(p);
  const changed = commitRevision(p, { source: 'Draft with new changes' }, 'edit');
  autosave.schedule(changed);
  store.faults.blockDelete = true;
  expect((await autosave.deleteProject(p.projectId)).status).toBe('blocked');
  expect((await store.load(p.projectId))?.source).toBe(changed.source);
  expect(autosave.status).toBe('saved');
});

it('revokes the active save receipt only after deletion completes', async () => {
  const store = new MemoryProjectStorage();
  const autosave = new AutosaveController(store);
  const p = createProject({ source: 'Open draft' });
  autosave.schedule(p);
  await autosave.flush();
  expect(autosave.status).toBe('saved');
  expect((await autosave.deleteProject(p.projectId)).status).toBe('deleted');
  expect(autosave.status).toBe('rejected-deleted');
  expect(await store.load(p.projectId)).toBeNull();

  const newer = commitRevision(p, { source: 'Still here' }, 'edit');
  autosave.schedule(newer);
  await autosave.flush();
  expect(await store.load(p.projectId)).toBeNull();
  expect(newer.source).toBe('Still here');
});
