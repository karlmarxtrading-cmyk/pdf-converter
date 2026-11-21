// PF-023…028, UX-06 — registri templat dan perpindahan templat (unit)
import { describe, expect, it } from 'vitest';
import { applyTemplate, customizedKeys, getTemplate, listTemplates, resetGroup, templateDefaultSettings } from '../../../src/render/templates';
import { pageCss, runningContent, TEMPLATE_CSS } from '../../../src/render/css';

describe('templates', () => {
  it('memuat empat format rilis dengan token katalog', () => {
    expect(listTemplates().map((t) => t.id)).toEqual(['EDU-01', 'BUS-01', 'EDT-01', 'CON-01']);
    const e = getTemplate('EDU-01').tokens;
    expect([e.paper, e.margins, e.baseSizePt, e.lineHeight, e.accent, e.bodyFont, e.textWidthMm]).toEqual(['A4', { top: 20, right: 18, bottom: 20, left: 20 }, 11.5, 1.5, '#275E73', 'source-serif-4', 172]);
    const b = getTemplate('BUS-01').tokens; expect([b.baseSizePt, b.accent, b.bodyFont, b.textWidthMm]).toEqual([10.5, '#245B75', 'inter', 174]);
    const d = getTemplate('EDT-01').tokens; expect([d.paper, d.baseSizePt, d.lineHeight, d.accent, d.textWidthMm]).toEqual(['A5', 10.5, 1.6, '#6B4F3A', 116]);
    const c = getTemplate('CON-01').tokens; expect([c.speakerGutterMm, c.speakerGapMm, c.textWidthMm - 24 - 6, c.accent]).toEqual([24, 6, 144, '#526278']);
    for (const t of listTemplates()) expect(210 - t.tokens.margins.left - t.tokens.margins.right === t.tokens.textWidthMm || t.tokens.paper === 'A5').toBe(true);
    expect(148 - 16 - 16).toBe(getTemplate('EDT-01').tokens.textWidthMm);
  });
  it('struktur CSS berbeda, bukan hanya warna', () => {
    expect(TEMPLATE_CSS['EDU-01']).toMatch(/pf-callout/);
    expect(TEMPLATE_CSS['BUS-01']).toMatch(/pf-metrics/);
    expect(TEMPLATE_CSS['EDT-01']).toMatch(/text-indent/);
    expect(TEMPLATE_CSS['CON-01']).toMatch(/--pf-gutter: 24mm/);
  });
  it('UX-06: followTemplateDefaults=true menerapkan preset penuh', () => {
    const s = { ...templateDefaultSettings('BUS-01'), title: 'Judul', margins: { top: 30, right: 30, bottom: 30, left: 30 } };
    const r = applyTemplate(s, 'EDT-01');
    expect(r.settings.paper).toBe('A5'); expect(r.settings.margins).toEqual({ top: 18, right: 16, bottom: 18, left: 16 });
    expect(r.settings.cover).toBe(false); expect(r.settings.title).toBe('Judul'); expect(r.applied).toContain('margins');
  });
  it('UX-06: followTemplateDefaults=false tidak menimpa margin/sampul/TOC kustom', () => {
    const s = { ...templateDefaultSettings('BUS-01'), followTemplateDefaults: false, margins: { top: 30, right: 30, bottom: 30, left: 30 }, cover: true, toc: false };
    const r = applyTemplate(s, 'EDT-01');
    expect(r.settings.template).toBe('EDT-01');
    expect(r.settings.margins).toEqual({ top: 30, right: 30, bottom: 30, left: 30 });
    expect([r.settings.cover, r.settings.toc, r.settings.paper]).toEqual([true, false, 'A4']);
    expect(r.kept).toEqual(expect.arrayContaining(['margins', 'cover', 'paper']));
    expect(customizedKeys(r.settings)).toContain('margins');
    expect(resetGroup(r.settings, 'paper').margins).toEqual({ top: 18, right: 16, bottom: 18, left: 16 });
  });
  it('@page memakai mm, sampul tanpa kotak margin, nomor dari peta halaman', () => {
    const css = pageCss({ ...templateDefaultSettings('EDU-01'), orientation: 'landscape', title: 'T' }, undefined);
    expect(css).toMatch(/size:297mm 210mm;margin:20mm 18mm 20mm 20mm/);
    expect(css).toMatch(/@page pf-cover\{margin:0;/);
    expect(css).toMatch(/var\(--pf-pnum\)/);
    expect(runningContent('{title} — {chapter}', { title: 'A"b' })).toBe('"A\\"b" " — " string(pf-chapter)');
  });
});
