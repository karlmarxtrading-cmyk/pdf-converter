// @vitest-environment node
import { expect, it } from 'vitest';
import { analyze } from '../../../src/engine/analyze';

it('counts accepted raw structures before DOM finishing in the Worker pipeline', async () => {
  const source = '<table><tr><th>Name</th><th>Formula</th></tr><tr><td>Energy</td><td>'
    + '<span class="katex-display" data-tex="E=mc^2">E=mc^2</span></td></tr></table>';
  const r = await analyze({ source, options: { assets: [], template: 'BUS-01', allowExternalImages: false } });
  expect(r.stage1.slots).toHaveLength(1);
  expect(r.stage1.stats).toEqual({ words: 3, tables: 1, math: 1, images: 0, code: 0, mermaid: 0 });
});

it('counts Unicode word runs across a large document including the final paragraph', async () => {
  const paragraphs = Array(1000).fill('汉字 alpha café 23 😀').join('\n\n');
  const r = await analyze({ source: paragraphs + '\n\nPenutup.', options: { assets: [], template: 'BUS-01', allowExternalImages: false } });
  expect(r.stage1.stats.words).toBe(4001);
});
