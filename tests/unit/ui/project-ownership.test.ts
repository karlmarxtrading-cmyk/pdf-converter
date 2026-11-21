import { describe, it, expect } from 'vitest';
import { createProject, commitRevision } from '../../../src/core/projects';
import { MemoryProjectStorage, AutosaveController } from '../../../src/core/storage';
import { ExportGuard, StaleExportError } from '../../../src/render/exports';

describe('project identity across asynchronous operations', () => {
  it('UI-01 rejects an old completion and a late attempt to start even when a project is reopened', () => {
    const guard = new ExportGuard();
    const a = { projectId: 'first', revision: 18, renderInputHash: 'same-content' };
    const b = { projectId: 'second', revision: 0, renderInputHash: 'same-content' };
    const old = guard.begin(a, 'html');
    guard.activate(b.projectId);
    const current = guard.begin(b, 'html');
    expect(old.signal.aborted).toBe(true);
    expect(() => guard.begin(a)).toThrow(StaleExportError);
    expect(() => guard.deliver(old, 'A')).toThrow(StaleExportError);
    expect(guard.deliver(current, 'B')).toBe('B');
    guard.activate(a.projectId);
    expect(() => guard.deliver(old, 'old A')).toThrow(StaleExportError);
  });
  it('UI-02 drains a pending save for A and does not report its success against B', async () => {
    const storage = new MemoryProjectStorage();
    const a = createProject({ name: 'A', source: 'A' });
    const b = createProject({ name: 'B', source: 'B' });
    let finish!: () => void;
    let started!: () => void;
    const savingFirst = new Promise<void>(resolve => { started = resolve; });
    const wait = new Promise<void>(resolve => { finish = resolve; });
    const save = storage.save.bind(storage);
    storage.save = async project => {
      if (project.projectId === a.projectId) { started(); await wait; }
      return save(project);
    };
    const auto = new AutosaveController(storage, 60_000);
    auto.schedule(a);
    auto.schedule(b);
    await savingFirst;
    expect(auto.status).toBe('pending');
    finish();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(auto.status).toBe('pending'); expect(await storage.load(b.projectId)).toBeNull();
    await auto.flush();
    expect(auto.status).toBe('saved');
    expect((await storage.load(a.projectId))?.source).toBe('A');
    expect((await storage.load(b.projectId))?.source).toBe('B');
  });
  it('UI-02 if storage already has a newer revision, never label the old one saved', async () => {
    const st = new MemoryProjectStorage();
    const a = createProject({ source: 'A' });
    const newer = commitRevision(a, { source: 'A new' }, 'edit');
    await st.save(newer);
    const auto = new AutosaveController(st);
    auto.schedule(a); await auto.flush();
    expect(auto.status).toBe('conflict');
    expect((await st.load(auto.last!.recoveryId!))?.source).toBe(a.source);
    expect((await st.load(a.projectId))?.source).toBe('A new');
  });
});
