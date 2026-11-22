// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { zipSync, strToU8 } from 'fflate';
import { beforeAll, expect, it, vi } from 'vitest';

// Exercise production controls. The injected transient print preparation failure
// lets the same document be retried deterministically without simulating a PDF.
// Layout/WOFF2 decoding belongs to browser coverage. This harness has no font server.
vi.mock('../../../src/render/font-assets', () => ({
  browserFontSource: async () => { throw new Error('no font server in DOM harness'); },
}));
const printAttempt = vi.hoisted(() => vi.fn());
vi.mock('../../../src/render/index', async (original) => ({
  ...await original<typeof import('../../../src/render/index')>(),
  buildPrintPayload: printAttempt,
}));

const q = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const text = (value: string) => {
  const ed = q<HTMLTextAreaElement>('#editor');
  ed.value = value;
  ed.dispatchEvent(new Event('input', { bubbles: true }));
};
const upload = (bytes: Uint8Array, name: string) => {
  const input = q<HTMLInputElement>('#file-open');
  Object.defineProperty(input, 'files', { configurable: true, value: [{ name, size: bytes.length, arrayBuffer: async () => bytes.buffer }] });
  input.dispatchEvent(new Event('change', { bubbles: true }));
};
beforeAll(async () => {
  document.documentElement.innerHTML = new DOMParser().parseFromString(readFileSync('index.html', 'utf8'), 'text/html').documentElement.innerHTML;
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} });
  HTMLDialogElement.prototype.showModal = function() { this.open = true; };
  HTMLDialogElement.prototype.close = function(value = '') {
    this.returnValue = value; this.open = false; this.dispatchEvent(new Event('close'));
  };
  await import('../../../src/ui/main');
  await vi.waitFor(() => expect(q('#goal-grid [role=radio]')).toBeTruthy());
  q('[data-action=open-workspace]').click();
});

it('PF-RC7-U01 Cancel in the ZIP document picker commits neither assets nor a revision', async () => {
  text('# Active draft');
  const bytes = zipSync({
    'chapter.md': strToU8('# Alternate'),
    'diagram.svg': strToU8('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>'),
  });
  upload(bytes, 'material.zip');
  const dialog = q<HTMLDialogElement>('#dlg-confirm');
  await vi.waitFor(() => expect(dialog.open).toBe(true));
  dialog.close('cancel');
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(q('#asset-list').textContent).not.toContain('diagram.svg');
  expect(q<HTMLTextAreaElement>('#editor').value).toBe('# Active draft');
  q('#btn-undo').click();
  expect(q<HTMLTextAreaElement>('#editor').value).toBe('');
  // Keep-source is an explicit choice and must still import the image.
  text('# Active draft');
  upload(bytes, 'material.zip');
  await vi.waitFor(() => expect(dialog.open).toBe(true));
  q<HTMLSelectElement>('#zip-pick').value = '';
  dialog.close('ok');
  await vi.waitFor(() => expect(q('#asset-list').textContent).toContain('diagram.svg'));
  expect(q<HTMLTextAreaElement>('#editor').value).toBe('# Active draft');
});

it('PF-RC7-U02 a user can retry page preparation after a transient failure on the same revision', async () => {
  text('# Retry pages');
  const run = q<HTMLButtonElement>('[data-action=run-layout-check]');
  printAttempt.mockRejectedValue(new Error('temporary font read failure'));
  await vi.waitFor(() => expect(q('#outline').textContent).toContain('Retry pages'), { timeout: 6000 });
  run.click();
  await vi.waitFor(() => expect(q('#notices').textContent).toMatch(/Pemeriksaan halaman gagal|page check failed/i));
  expect(printAttempt).toHaveBeenCalledTimes(1);
  run.click();
  await vi.waitFor(() => expect(printAttempt).toHaveBeenCalledTimes(2));
});

it('PF-RC7-U03 opening a different project clears the previous document preview and outline immediately', async () => {
  text('# Private heading');
  await vi.waitFor(() => expect(q('#outline').textContent).toContain('Private heading'), { timeout: 6000 });
  expect(q<HTMLIFrameElement>('#live-frame').srcdoc).toContain('Private heading');
  q('[data-action=new]').click();
  const dialog = q<HTMLDialogElement>('#dlg-choice');
  await vi.waitFor(() => expect(dialog.open).toBe(true));
  dialog.close('discard');
  // The project switch has committed, but rendering the empty project has not started.
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(q<HTMLTextAreaElement>('#editor').value).toBe('');
  expect(q('#outline').textContent).not.toContain('Private heading');
  expect(q<HTMLIFrameElement>('#live-frame').srcdoc).not.toContain('Private heading');
  expect(q('#src-hash').textContent).toBe('');
});

it('PF-RC7-U04 background preview leaves the title being typed intact and both title controls show the committed value', async () => {
  text('# Background preview');
  const header = q<HTMLInputElement>('#doc-title');
  const settings = q<HTMLInputElement>('#s-title');
  header.focus();
  header.value = 'Working title';
  header.dispatchEvent(new Event('input', { bubbles: true }));
  await vi.waitFor(() => expect(q('#outline').textContent).toContain('Background preview'), { timeout: 6000 });
  expect(header.value).toBe('Working title');
  header.dispatchEvent(new Event('change', { bubbles: true }));
  expect(settings.value).toBe('Working title');
  settings.value = 'Final title';
  settings.dispatchEvent(new Event('change', { bubbles: true }));
  expect(header.value).toBe('Final title');
});

it('PF-RC7-U05 imports the formatted first heading as a plain title and respects an explicit title', async () => {
  q('[data-action=new]').click();
  const choice = q<HTMLDialogElement>('#dlg-choice');
  if (choice.open) choice.close('discard');
  await vi.waitFor(() => expect(q<HTMLTextAreaElement>('#editor').value).toBe(''));
  const md = '# **Kumpulan Rumus Trigonometri Lengkap**\n\nMateri asli.';
  upload(strToU8(md), 'trigonometri.md');
  await vi.waitFor(() => expect(q<HTMLTextAreaElement>('#editor').value).toBe(md));
  const title = q<HTMLInputElement>('#doc-title');
  expect(title.value).toBe('Kumpulan Rumus Trigonometri Lengkap');
  title.value = 'Manual **literal**';
  title.dispatchEvent(new Event('change', { bubbles: true }));
  upload(strToU8('# **New heading**'), 'next.md');
  const confirm = q<HTMLDialogElement>('#dlg-confirm');
  await vi.waitFor(() => expect(confirm.open).toBe(true));
  confirm.close('ok');
  await vi.waitFor(() => expect(q<HTMLTextAreaElement>('#editor').value).toBe('# **New heading**'));
  expect(title.value).toBe('Manual **literal**');
});
