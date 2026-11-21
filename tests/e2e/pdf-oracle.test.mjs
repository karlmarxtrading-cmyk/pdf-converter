import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { normalizePdfText, orderedTextCheck, pdfFragments } from './pdf-oracle.mjs';

test('PF-R4-06 sign removal never passes as the same quantity', () => {
  assert.notEqual(normalizePdfText('profit -5%'), normalizePdfText('profit 5%'));
  assert.equal(orderedTextCheck(['profit -5%'], { layout: 'profit 5%' }).pass, false);
});
test('PF-R4-06 raw fallback cannot pass reversed blocks or reuse the same occurrence', () => {
  assert.equal(orderedTextCheck(['First', 'Second'], { layout: 'First only', raw: 'Second First' }).pass, false);
  assert.equal(orderedTextCheck(['Again', 'Again'], { layout: 'Again' }).pass, false);
  assert.equal(orderedTextCheck(['First', 'Second'], { layout: 'irrelevant', raw: 'First Second' }).pass, true);
});
test('PF-R4-06 unsupported glyph omission requires an explicit caller decision', () => {
  assert.equal(normalizePdfText('😀'), '😀');
  assert.equal(normalizePdfText('😀', true), '');
});
test('PF-R4-06 prosa and cells around math/images are included in the oracle', () => {
  const dom = new JSDOM('<div class="pagedjs_page"><div class="pagedjs_page_content"><p data-block-id="p">Before <span class="pf-math" data-tex="x">x</span> after -5%<img src="data:image/png;base64,AAA"> final.</p><table data-block-id="t"><caption>Important caption</caption><tr><td>Sin <span class="pf-math">sin x</span> remains</td><td>42</td></tr></table></div></div>');
  const previous = globalThis.document; globalThis.document = dom.window.document;
  try {
    const result = pdfFragments();
    assert.deepEqual(result[0].blocks.map(b => b.text), ['Before', 'after -5%', 'final.', 'Important caption']);
    assert.deepEqual(result[0].cells, ['Sin', 'remains', '42']);
    assert.equal(result[0].formulas, 2); assert.equal(result[0].images, 1);
    assert.equal(orderedTextCheck(result[0].blocks, { layout: 'Before x final.' }).pass, false);
  } finally { globalThis.document = previous; dom.window.close(); }
});
