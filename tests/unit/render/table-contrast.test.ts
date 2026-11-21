// @vitest-environment jsdom
// PF-R4-08: repeated key headers retain the template's readable foreground/background pair.
import { expect, it } from 'vitest';
import { BASE_CSS, templateCss } from '../../../src/render/css';

it('PF-R4-08 keeps repeated BUS headers readable while preserving body-key and row striping', () => {
  // Isolate the real table color rules; jsdom does not parse every Paged.js/print CSS feature.
  const rules = [
    ...(BASE_CSS.match(/[^{}]*pf-repeat-key[^{}]*\{[^{}]*\}/g) ?? []),
    ...(templateCss('BUS-01').match(/[^{}]*(?:\bth|nth-child\(even\) td)\s*\{[^{}]*\}/g) ?? []),
  ].join('\n').replaceAll('var(--pf-tint, rgba(0,0,0,.035))', '#f1f4f8')
    .replaceAll('var(--pf-tint)', '#f1f4f8').replaceAll('var(--pf-accent)', '#245b75');
  const style = document.createElement('style'); style.textContent = rules;
  const host = document.createElement('article'); host.className = 'pf-doc pf-t-BUS-01';
  host.innerHTML = '<table><thead><tr><th id="normal">Other column</th><th id="repeat" class="pf-repeat-key" data-pf-repeat="1">Key column</th></tr></thead><tbody><tr><td id="key" class="pf-repeat-key">1</td></tr><tr><td id="stripe">2</td></tr></tbody></table>';
  document.head.append(style); document.body.append(host);
  try {
    const colors = (id: string) => getComputedStyle(host.querySelector(`#${id}`)!);
    expect(colors('normal').color).toBe('rgb(255, 255, 255)');
    expect(colors('normal').backgroundColor).toBe('rgb(36, 91, 117)');
    expect(colors('repeat').color).toBe(colors('normal').color);
    expect(colors('repeat').backgroundColor).toBe(colors('normal').backgroundColor);
    expect(colors('key').backgroundColor).toBe('rgb(241, 244, 248)');
    expect(colors('stripe').backgroundColor).toBe('rgb(241, 244, 248)');
    expect(host.querySelector('#repeat')?.textContent).toBe('Key column');
  } finally { style.remove(); host.remove(); }
});
