/**
 * Shell aplikasi: router, skip-link, menu, tab, notifikasi global, dialog.
 * UX-02/A11-03 (skip-link tanpa ubah rute), UX-04/A11-05 (notifikasi di luar panel), UX-01/A11-01 (menu sumber),
 * A11-02 (keyboard: panah/Home/End pada tab & menu, Escape menutup).
 */
import { t, pick } from './i18n';

export const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document): T => {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`UI element missing: ${sel}`);
  return el;
};
export const $$ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document): T[] => [...root.querySelectorAll<T>(sel)];

/* ---------------- live regions ---------------- */
export function announce(msg: string, assertive = false): void {
  const el = $(assertive ? '#alert' : '#live');
  el.textContent = '';
  // jeda kecil agar pembaca layar membaca ulang teks yang sama
  setTimeout(() => { el.textContent = msg; }, 30);
}

/* ---------------- notifications (UX-04) ---------------- */
export type NoticeKind = 'info' | 'success' | 'warning' | 'error';
export interface NoticeAction { label: string; run: () => void }
let noticeSeq = 0;
/** Pesan tetap terlihat di panel mana pun. Error tidak hilang otomatis; info/sukses hilang setelah 8 s. */
export function notify(kind: NoticeKind, message: string, actions: NoticeAction[] = [], opts: { sticky?: boolean } = {}): () => void {
  const host = $('#notices');
  const el = document.createElement('div');
  el.className = 'notice'; el.dataset.kind = kind; el.id = `notice-${++noticeSeq}`;
  const body = document.createElement('div'); body.className = 'notice-body';
  const kindLabel = document.createElement('span'); kindLabel.className = 'notice-kind';
  kindLabel.textContent = kind === 'error' ? '⚠ ' + (pick('Gagal:', 'Error:')) : kind === 'warning' ? '⚠ ' + pick('Perhatian:', 'Warning:') : kind === 'success' ? '✓' : 'ℹ';
  const text = document.createElement('span'); text.textContent = message;
  body.append(kindLabel, text);
  if (actions.length) {
    const acts = document.createElement('div'); acts.className = 'notice-actions';
    for (const a of actions) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn-secondary btn-sm'; b.textContent = a.label;
      b.addEventListener('click', () => { a.run(); close(); });
      acts.append(b);
    }
    body.append(acts);
  }
  const x = document.createElement('button'); x.type = 'button'; x.className = 'icon-btn'; x.textContent = '×';
  x.setAttribute('aria-label', t('notice.dismiss'));
  x.addEventListener('click', () => close());
  el.append(body, x);
  host.append(el);
  while (host.children.length > 4) host.firstElementChild?.remove();
  announce(message, kind === 'error');
  let timer = 0;
  if (!opts.sticky && kind !== 'error' && !actions.length) timer = window.setTimeout(() => close(), 8000);
  function close(): void { clearTimeout(timer); el.remove(); }
  return close;
}

/* ---------------- router ---------------- */
export type View = 'landing' | 'workspace';
let currentView: View = 'landing';
export function currentRoute(): View { return currentView; }
/** Hanya hash yang diawali "#/workspace" berarti ruang kerja; anchor biasa tidak dianggap rute (UX-02). */
export function routeFromHash(h: string): View | null {
  if (h.startsWith('#/workspace')) return 'workspace';
  if (h === '' || h === '#' || h === '#/') return 'landing';
  return null; // anchor dalam halaman — bukan navigasi rute
}
export function showView(v: View, focus = true): void {
  currentView = v;
  $('#view-landing').hidden = v !== 'landing';
  $('#view-workspace').hidden = v !== 'workspace';
  updateTitle();
  if (focus) (v === 'workspace' ? $('#doc-title') : $('#hero-title')).focus?.({ preventScroll: v === 'landing' });
}
/** Judul halaman mengikuti view dan bahasa UI (UI-05). */
export function updateTitle(): void { document.title = t(currentView === 'workspace' ? 'app.title.workspace' : 'app.title.landing'); }
export function go(v: View): void {
  const target = v === 'workspace' ? '#/workspace' : '#/';
  if (location.hash !== target) history.pushState(null, '', target);
  showView(v);
}
export function initRouter(onEnterWorkspace: () => void): void {
  const apply = () => { const r = routeFromHash(location.hash); if (r) { showView(r, false); if (r === 'workspace') onEnterWorkspace(); } };
  window.addEventListener('popstate', apply);
  window.addEventListener('hashchange', apply);
  apply();
}
/** Skip-link: fokuskan <main> view aktif tanpa mengubah hash/rute. */
export function skipToMain(): void {
  const main = currentView === 'workspace' ? $('#main-ws') : $('#main-landing');
  main.focus();
}

/* ---------------- tabs (roving tabindex) ---------------- */
export function initTabs(list: HTMLElement, onChange?: (tabId: string) => void): (id: string) => void {
  const tabs = $$<HTMLButtonElement>('[role=tab]', list);
  const select = (id: string, focus = false) => {
    for (const tb of tabs) {
      const on = tb.id === id;
      tb.setAttribute('aria-selected', String(on)); tb.tabIndex = on ? 0 : -1;
      const panel = document.getElementById(tb.getAttribute('aria-controls') || '');
      if (panel) panel.hidden = !on;
      if (on && focus) tb.focus();
    }
    onChange?.(id);
  };
  list.addEventListener('click', (e) => { const tb = (e.target as HTMLElement).closest<HTMLButtonElement>('[role=tab]'); if (tb) select(tb.id); });
  list.addEventListener('keydown', (e) => {
    const i = tabs.findIndex((x) => x === document.activeElement); if (i < 0) return;
    let n = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') n = 0; else if (e.key === 'End') n = tabs.length - 1;
    if (n >= 0) { e.preventDefault(); select(tabs[n]!.id, true); }
  });
  return (id) => select(id);
}

/* ---------------- menu button ---------------- */
export function initMenu(btn: HTMLButtonElement, menu: HTMLElement): { close: () => void } {
  const items = () => $$<HTMLElement>('[role=menuitem], select', menu).filter((x) => x.getClientRects().length && !x.matches(':disabled'));
  const open = () => { menu.hidden = false; btn.setAttribute('aria-expanded', 'true'); items()[0]?.focus(); };
  const close = (refocus = true) => { if (menu.hidden) return; menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); if (refocus) btn.focus(); };
  btn.addEventListener('click', () => (menu.hidden ? open() : close()));
  btn.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown') { e.preventDefault(); open(); } });
  menu.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    // Keep the native key bindings in the language and theme selects.
    if ((e.target as HTMLElement).tagName === 'SELECT') return;
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    let next: number;
    switch (e.key) {
      case 'ArrowDown': next = (i + 1) % list.length; break;
      case 'ArrowUp': next = (i - 1 + list.length) % list.length; break;
      case 'Home': next = 0; break;
      case 'End': next = list.length - 1; break;
      default: return;
    }
    e.preventDefault(); list[next]?.focus();
  });
  menu.addEventListener('focusout', (e) => {
    if (e.relatedTarget instanceof Node && !menu.contains(e.relatedTarget)) close(false);
  });
  menu.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('[role=menuitem]')) close();
  });
  document.addEventListener('pointerdown', (e) => { if (!menu.hidden && !menu.contains(e.target as Node) && e.target !== btn && !btn.contains(e.target as Node)) close(false); });
  return { close: () => close(false) };
}

/* ---------------- dialogs: return focus to the trigger (A11-03) ---------------- */
export function openDialog(dlg: HTMLDialogElement, returnTo?: HTMLElement | null): Promise<string> {
  const opener = returnTo ?? (document.activeElement as HTMLElement | null);
  return new Promise((resolve) => {
    const onClose = () => {
      dlg.removeEventListener('close', onClose);
      // kembalikan fokus ke pemicu bila masih ada di DOM dan terlihat; jika tidak, ke main aktif
      if (opener && opener.isConnected && opener.offsetParent !== null) opener.focus();
      else {
        const menuTrigger = opener?.closest('[role=menu]')?.getAttribute('aria-labelledby');
        const visibleTrigger = menuTrigger && document.getElementById(menuTrigger);
        if (visibleTrigger && visibleTrigger.getClientRects().length) visibleTrigger.focus();
        else skipToMain();
      }
      resolve(dlg.returnValue || 'cancel');
    };
    dlg.addEventListener('close', onClose);
    dlg.returnValue = '';
    dlg.showModal();
  });
}

/** Dialog pilihan dengan beberapa tombol berlabel; mengembalikan nilai tombol yang dipilih atau 'cancel'. */
export async function choiceDialog(message: string, choices: { value: string; label: string; primary?: boolean }[]): Promise<string> {
  const dlg = $<HTMLDialogElement>('#dlg-choice');
  $('#dlg-choice-msg').textContent = message;
  const host = $('#dlg-choice-actions'); host.replaceChildren();
  for (const c of choices) {
    const b = document.createElement('button'); b.type = 'submit'; b.value = c.value; b.textContent = c.label;
    b.className = c.primary ? 'btn btn-primary' : c.value === 'cancel' ? 'btn btn-quiet' : 'btn btn-secondary';
    host.append(b);
  }
  return openDialog(dlg);
}

export async function confirmDialog(message: string, extra?: HTMLElement): Promise<boolean> {
  const dlg = $<HTMLDialogElement>('#dlg-confirm');
  $('#dlg-confirm-msg').textContent = message;
  const host = $('#dlg-confirm-extra'); host.replaceChildren(); if (extra) host.append(extra);
  return (await openDialog(dlg)) === 'ok';
}

/* ---------------- downloads ---------------- */
export function downloadBytes(bytes: Uint8Array | Blob, name: string, mime: string): string {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.rel = 'noopener';
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return url;
}

export function safeFileName(title: string, ext: string): string {
  const base = title.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 _.-]+/g, ' ').trim().replace(/\s+/g, '-').replace(/-{2,}/g, '-').slice(0, 80);
  return `${base || 'dokumen'}.${ext}`;
}

export function fmtBytes(n: number): string { return n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KiB` : `${(n / 1048576).toFixed(2)} MiB`; }

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string | boolean | undefined> = {}, ...kids: (Node | string | null | undefined)[]): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'text') n.textContent = String(v); else if (v === true) n.setAttribute(k, ''); else n.setAttribute(k, v);
  }
  for (const k of kids) if (k != null) n.append(k);
  return n;
}
