// A11-06 / UX-05 — rasio kontras token UI aktual dibaca dari src/ui/styles.css (terang & gelap). Jenis: unit (perhitungan WCAG 2.x).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
const css = readFileSync(new URL('../../../src/ui/styles.css', import.meta.url), 'utf8');
function tokens(selector: string): Record<string, string> {
  const i = css.indexOf(selector + '{'); const body = css.slice(i + selector.length + 1, css.indexOf('}', i));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):(#[0-9a-fA-F]{3,6})/g)].map((m) => [m[1]!, m[2]!]));
}
const lum = (hex: string) => { const h = hex.length === 4 ? hex.slice(1).split('').map((c) => c + c).join('') : hex.slice(1); return [0, 2, 4].map((o) => parseInt(h.slice(o, o + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)).reduce((a, c, k) => a + c * [0.2126, 0.7152, 0.0722][k]!, 0); };
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };
const light = tokens(':root'); const dark = { ...light, ...tokens(':root[data-theme=dark]') };
const pairs: [string, string][] = [['ink', 'canvas'], ['ink', 'panel'], ['ink-2', 'panel'], ['ink-2', 'canvas'], ['ink-3', 'panel'], ['ink-3', 'panel-2'], ['blue', 'panel'], ['on-blue', 'blue'], ['blue-ink', 'blue-tint'], ['err', 'err-bg'], ['err', 'panel'], ['warn', 'warn-bg'], ['warn', 'panel'], ['ok', 'ok-bg'], ['ok', 'panel'], ['info', 'info-bg'], ['code-ink', 'code-bg'], ['ink', 'sel']];
describe('A11-06 kontras teks normal ≥ 4.5:1', () => {
  for (const [name, t] of [['light', light], ['dark', dark]] as const)
    for (const [f, b] of pairs) it(`${name}: --${f} pada --${b}`, () => { const r = ratio(t[f]!, t[b]!); expect(r, `${t[f]} on ${t[b]} = ${r.toFixed(2)}`).toBeGreaterThanOrEqual(4.5); });
});
