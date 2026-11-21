// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { detectCompat } from '../../../src/ui/compat';
describe('deteksi kompatibilitas browser', () => {
  it('melaporkan setiap kemampuan dengan penjelasan dua bahasa dan dampaknya', () => {
    const items = detectCompat();
    expect(items.map((i) => i.key)).toEqual(['indexeddb', 'worker', 'subtle', 'dialog', 'print-css']);
    for (const i of items) { expect(i.id.length).toBeGreaterThan(30); expect(i.en.length).toBeGreaterThan(30); }
  });
});
