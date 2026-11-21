// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';

it('protects a settings-only draft and a deleted open draft at the real UI entry points', async () => {
  const html = readFileSync('index.html', 'utf8');
  document.documentElement.innerHTML = new DOMParser().parseFromString(html, 'text/html').documentElement.innerHTML;
  // jsdom has no system dialog or browser focus navigation.
  HTMLDialogElement.prototype.showModal = function() { this.open = true; };
  HTMLDialogElement.prototype.close = function(value = '') {
    this.returnValue = value; this.open = false; this.dispatchEvent(new Event('close'));
  };
  await import('../../../src/ui/main');
  const q = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
  const leaveIsGuarded = () => !window.dispatchEvent(new Event('beforeunload', { cancelable: true }));
  const title = q<HTMLInputElement>('#doc-title');
  title.value = 'Workshop';
  title.dispatchEvent(new Event('change', { bubbles: true }));
  expect(leaveIsGuarded()).toBe(true);
  expect(q('#save-status').dataset.state).toBe('off');

  const local = q<HTMLInputElement>('#opt-localsave');
  local.checked = true;
  local.dispatchEvent(new Event('change', { bubbles: true }));
  await vi.waitFor(() => expect(q('#save-status').dataset.state).toBe('saved'), { timeout: 10000 });
  expect(leaveIsGuarded()).toBe(false);

  q('#save-status').click();
  await vi.waitFor(() => expect(q<HTMLDialogElement>('#dlg-projects').open).toBe(true));
  q('#proj-list .btn-danger').click();
  await vi.waitFor(() => expect(q<HTMLDialogElement>('#dlg-confirm').open).toBe(true));
  q<HTMLDialogElement>('#dlg-confirm').close('ok');
  await vi.waitFor(() => expect(q('#save-status').dataset.state).toBe('deleted'));
  expect(leaveIsGuarded()).toBe(true);
  expect(title.value).toBe('Workshop');
});
