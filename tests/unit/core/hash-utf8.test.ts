// @vitest-environment node
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../../../src/core/hash';

describe('SHA-256 revision metadata', () => {
  it('matches native SHA-256 for UTF-8 source and canonical metadata at both sides of the byte limit', async () => {
    const metadata = JSON.stringify({ title: 'Rumus π²', author: 'Ayu', nested: { value: 'a\\b\nc' } });
    const samples = [
      '', metadata, 'A'.repeat(55), 'B'.repeat(56), 'x'.repeat(2047), 'x'.repeat(2048), 'x'.repeat(2049),
      '𝔸'.repeat(512), '𝔸'.repeat(512) + 'π',
    ];
    for (const input of samples) {
      expect(await sha256Hex(input)).toBe(createHash('sha256').update(input, 'utf8').digest('hex'));
    }
  });
});
