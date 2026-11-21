// @vitest-environment jsdom
// Kontrak CoreApi diekspor persis dari src/core/index.ts
import { describe, expect, it } from 'vitest';
import core, { LIMITS, type CoreApi, SCHEMA_VERSION, createProject } from '../../../src/core/index';
import { fx } from './fx';

describe('CoreApi', () => {
  it('core default export memenuhi CoreApi dan bekerja ujung-ke-ujung (render → snapshot) [fx:01_dokumen_pendek.md]', async () => {
    const api: CoreApi = core;
    expect(api.LIMITS).toBe(LIMITS);
    expect(api.utf8Length('é🙂')).toBe(6);
    expect(await api.sha256Hex('')).toHaveLength(64);
    const s = api.defaultSettings('EDT-01'); expect(s.paper).toBe('A5'); expect(s.template).toBe('EDT-01');
    const p = createProject({ source: fx('01_dokumen_pendek.md'), template: 'EDT-01' });
    const snap = await api.makeSnapshot(p); expect(snap.templateId).toBe('EDT-01'); expect(SCHEMA_VERSION).toBe(2);
    const body = await api.renderBody(snap.source, { assets: [], allowExternalImages: false, template: 'EDT-01' });
    expect(body.html).toContain('SENTINEL_AKHIR_01'); expect(body.blocks.length).toBeGreaterThan(5);
    const hard = await api.renderBody('baris satu  \nbaris dua', { assets: [], allowExternalImages: false, template: 'EDT-01' });
    expect(hard.html).toContain('<br>');
  });
});
