// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { createAssetRecord, sanitizeSvgBytes, assetDataUrl } from '../../../src/core/assets';
const input = new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">
  <defs><linearGradient id="light"><stop offset="1" stop-color="red"/></linearGradient></defs>
  <rect width="32" height="32" fill="url(#light)" stroke="url(https://example.invalid/palette.svg#ink)"/>
</svg>`);
it('embeds the safe local gradient and keeps an inspectable copy of the original SVG', async () => {
  const safe = sanitizeSvgBytes(input);
  expect(safe.ok).toBe(true);
  const markup = new TextDecoder().decode(safe.bytes);
  expect(markup).toContain('url(#light)');
  expect(markup).not.toContain('example.invalid');
  expect(safe.removed).toContain('stroke');
  const entry = await createAssetRecord(input, 'palette.svg', 'upload');
  if (!entry.ok) throw Error(entry.message);
  expect(entry.asset.bytes).toEqual(input);
  expect(atob(assetDataUrl(entry.asset).split(',')[1]!)).not.toContain('example.invalid');
});
