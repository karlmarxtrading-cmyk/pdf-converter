// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { serializeForFonts, textForFonts } from '../../../src/render/fonts';

it('preserves math fallback, labels and combining text when projecting the serialized DOM only once', () => {
  const root = document.createElement('div');
  root.innerHTML = '<p>Jose\u0301</p><span class="katex"><span class="katex-mathml">Hidden</span><span class="cjk_fallback">字</span></span><img alt="ār" title="Œ"><span data-lang="α" aria-label="ع"></span>';
  const original = root.innerHTML;
  const projection = serializeForFonts(root);
  expect(projection.html).toBe(original);
  expect(projection.fontText).toBe(textForFonts(original));
  expect(projection.fontText).toContain('字');
  expect(projection.fontText).not.toContain('Hidden');
  for (const symbol of ['ā','Œ','α','ع','\u0301']) expect(projection.fontText).toContain(symbol);
});
