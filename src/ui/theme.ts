/** PF-022 / UX-09 / A11-06 — tema aplikasi System/Light/Dark. Tidak memengaruhi tema dokumen keluaran. */
export type ThemePref = 'system' | 'light' | 'dark';
let pref: ThemePref = 'system';
const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;

function resolved(): 'light' | 'dark' { return pref === 'system' ? (mq?.matches ? 'dark' : 'light') : pref; }
function apply(): void {
  const r = resolved();
  document.documentElement.dataset.theme = r;
  document.documentElement.dataset.themePref = pref;
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', r);
}
export function getTheme(): ThemePref { return pref; }
export function setTheme(p: ThemePref, persist = true): void {
  pref = p; apply();
  if (persist) { try { localStorage.setItem('pf.ui.theme', p); } catch { /* preferensi tidak disimpan */ } }
}
export function initTheme(): ThemePref {
  let s: string | null = null;
  try { s = localStorage.getItem('pf.ui.theme'); } catch { /* ignore */ }
  pref = s === 'light' || s === 'dark' ? s : 'system';
  apply();
  mq?.addEventListener('change', () => { if (pref === 'system') apply(); });
  return pref;
}
