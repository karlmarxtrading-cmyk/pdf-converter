// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Boot the production UI entry against the production document. jsdom supplies the
// DOM; the suite deliberately makes no layout, native clipboard or print assertions.
const element = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
beforeAll(async () => {
  document.documentElement.innerHTML = readFileSync('index.html', 'utf8').replace(/^.*?<html[^>]*>|<\/html>\s*$/gs, '');
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} });
  const pasteDialog = element<HTMLDialogElement>('#dlg-paste');
  // jsdom does not supply native modal methods. Only the open/close event
  // boundary matters to the paste tests.
  pasteDialog.showModal = () => { pasteDialog.open = true; };
  pasteDialog.close = () => { pasteDialog.open = false; pasteDialog.dispatchEvent(new Event('close')); };
  await import('../../../src/ui/main');
  await vi.waitFor(() => expect(document.querySelector('#goal-grid [role=radio]')).toBeTruthy());
  element<HTMLButtonElement>('[data-action=open-workspace]').click();
});
afterAll(() => { vi.unstubAllGlobals(); });

describe('studio controls', () => {
  it('starts each new rich paste with the conversion option enabled, even after a previous clipboard became stale', () => {
    const open = element<HTMLButtonElement>('button[data-action=paste]');
    const dialog = element<HTMLDialogElement>('#dlg-paste');
    const area = element<HTMLTextAreaElement>('#paste-area');
    const rich = element<HTMLInputElement>('[name=paste-repr][value=markdown]');
    const plain = element<HTMLInputElement>('[name=paste-repr][value=plain]');
    const paste = () => {
      const event = new Event('paste', { bubbles: true });
      Object.defineProperty(event, 'clipboardData', { value: { getData: (kind: string) => kind === 'text/html' ? '<strong>teks</strong>' : 'teks' } });
      area.dispatchEvent(event);
      area.value = 'teks';
      area.dispatchEvent(new Event('input', { bubbles: true }));
    };
    open.click();
    paste();
    area.value += ' tambahan';
    area.dispatchEvent(new Event('input', { bubbles: true }));
    expect(rich.disabled).toBe(true);
    expect(plain.checked).toBe(true);
    dialog.close();
    open.click();
    paste();
    expect(rich.disabled).toBe(false);
    expect(rich.checked).toBe(true);
    expect(plain.checked).toBe(false);
    dialog.close();
  });

  it('moves and applies the selected template with arrow keys, retaining focus after redraw and wrapping both ends', () => {
    const group = element('#goal-grid');
    const choices = () => [...group.querySelectorAll<HTMLButtonElement>('[role=radio]')];
    const initial = choices().findIndex(radio => radio.getAttribute('aria-checked') === 'true');
    const move = (key: string, index: number) => {
      document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      const current = choices()[index]!;
      expect(document.activeElement === current).toBe(true);
      expect(current.getAttribute('aria-checked')).toBe('true');
      expect(current.tabIndex).toBe(0);
      expect(choices().filter(radio => radio.tabIndex === 0)).toHaveLength(1);
    };
    choices()[initial]!.focus();
    move('ArrowRight', (initial + 1) % choices().length);
    move('ArrowLeft', initial);
    for (let i = 1; i <= choices().length; i++) move('ArrowDown', (initial + i) % choices().length);
  });

  it('uses the displayed template when applying settings after undo', () => {
    const group = element('#goal-grid');
    const get = () => group.querySelector<HTMLButtonElement>('[aria-checked=true]')!.dataset.tpl;
    const original = get();
    group.querySelector<HTMLButtonElement>('[aria-checked=false]')!.click();
    expect(get()).not.toBe(original);
    element<HTMLButtonElement>('#btn-undo').click();
    expect(get()).toBe(original);
    element<HTMLButtonElement>('[data-action=apply-full]').click();
    expect(get()).toBe(original);
  });
});
