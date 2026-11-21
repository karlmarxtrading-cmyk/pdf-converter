// @vitest-environment jsdom
// Regresi audit statis: QA-01 (validator akhir ekspor), EN-012 (issue input penghalang pada jalur cetak).
// Kasus QA-01 mereproduksi bukti/qa-html-font-failure-probe.json: RC3 menyerahkan HTML 41.303 byte dengan
// lima issue FONT_LOAD_FAILED yang memblokir. Target: tidak ada byte final, issue sampai ke pemanggil.
import { describe, expect, it } from 'vitest';
import { exportHtml, ExportBlockedError, REQUIRED_CHECKS } from '../../../src/render/exports';
import { buildPrintPayload, PrintBlockedError } from '../../../src/render/print-payload';
import type { FontSource } from '../../../src/render/fonts';
import { nodeFontSource, realDoc } from './helpers';

const failingFonts: FontSource = async () => { throw new Error('404 font'); };
const timeoutFonts: FontSource = () => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5));
const corruptFonts: FontSource = async () => new Uint8Array([1, 2, 3, 4]);

describe('QA-01 validator akhir ekspor HTML', () => {
  for (const profile of ['standalone', 'zip', 'publication'] as const) {
    for (const [name, src] of [['gagal', failingFonts], ['timeout', timeoutFonts]] as const) {
      it(`${profile}: font ${name} → ExportBlockedError tanpa byte final, issue FONT_LOAD_FAILED diteruskan`, async () => {
        const d = await realDoc('# Judul\n\nIsi $5 dan **tebal**.\n', 'EDU-01');
        let caught: unknown;
        let delivered: unknown;
        try { delivered = await exportHtml({ ...d, profile, fontSource: src, renderMermaid: false }); } catch (e) { caught = e; }
        expect(delivered).toBeUndefined();
        expect(caught).toBeInstanceOf(ExportBlockedError);
        const err = caught as ExportBlockedError;
        expect(err.issues.some((i) => i.code === 'FONT_LOAD_FAILED' && i.blocking)).toBe(true);
        expect(err.failedChecks.map((c) => c.name)).toEqual(expect.arrayContaining([profile === 'standalone' ? 'fonts-embedded' : 'fonts-packaged']));
        expect(err.verdict.status).toBe('blocked');
      });
    }
  }

  it('font rusak (byte bukan woff2) tidak menghasilkan sukses palsu', async () => {
    const d = await realDoc('# Judul\n\nIsi.\n', 'EDU-01');
    const r = await exportHtml({ ...d, profile: 'standalone', fontSource: corruptFonts, renderMermaid: false }).then((x) => ({ ok: x }), (e) => ({ err: e }));
    // Pemuat font memvalidasi tanda tangan WOFF2; bila lolos, pemeriksaan wajib tetap harus lulus seluruhnya.
    if ('ok' in r) expect(r.ok.manifest.checks.filter((c) => REQUIRED_CHECKS.standalone.includes(c.name)).every((c) => c.status === 'pass')).toBe(true);
    else expect(r.err).toBeInstanceOf(ExportBlockedError);
  });

  it('font tersedia: ketiga profil lulus semua pemeriksaan wajib dan menyerahkan byte', async () => {
    const d = await realDoc('# Judul\n\nIsi $5 dan $x^2$.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n', 'BUS-01');
    for (const profile of ['standalone', 'zip', 'publication'] as const) {
      const r = await exportHtml({ ...d, profile, fontSource: nodeFontSource, renderMermaid: false });
      expect(r.bytes.length).toBeGreaterThan(1000);
      const req = REQUIRED_CHECKS[profile];
      for (const name of req) expect(r.manifest.checks.find((c) => c.name === name)?.status, `${profile}:${name}`).toBe('pass');
      expect(r.status).toBe('pass');
    }
  });

  it('batas ukuran HTML mandiri terlampaui → diblokir tanpa memotong isi', async () => {
    const d = await realDoc('# Judul\n\n' + 'Kalimat panjang. '.repeat(50), 'EDU-01');
    const err = await exportHtml({ ...d, profile: 'standalone', fontSource: nodeFontSource, renderMermaid: false, limits: { standaloneHtmlBytes: 1000 } }).catch((e) => e);
    expect(err).toBeInstanceOf(ExportBlockedError);
    expect((err as ExportBlockedError).issues.map((i) => i.code)).toContain('STANDALONE_TOO_LARGE');
    expect((err as ExportBlockedError).failedChecks.map((c) => c.name)).toContain('size-budget');
  });

  it('tautan internal rusak → status confirm (keputusan eksplisit), bukan sukses diam-diam', async () => {
    const d = await realDoc('# Judul\n\nLihat [bagian](#tidak-ada).\n', 'EDU-01');
    const r = await exportHtml({ ...d, profile: 'standalone', fontSource: nodeFontSource, renderMermaid: false }).catch((e) => e);
    if (r instanceof ExportBlockedError) throw new Error('tautan rusak tidak boleh memblokir: ' + r.message);
    expect(r.status).toBe('confirm');
  });
});

describe('EN-012 issue input penghalang pada jalur cetak', () => {
  it('body sintetis dengan INPUT_TOO_COMPLEX ditolak sebelum font dimuat', async () => {
    const d = await realDoc('# x\n', 'EDU-01');
    let fontCalls = 0;
    const counting: FontSource = async (spec) => { fontCalls++; return nodeFontSource(spec); };
    const body = { ...d.body, issues: [...d.body.issues, { id: 'x', code: 'INPUT_TOO_COMPLEX', severity: 'error' as const, scope: 'input' as const, blocking: true, message: 'terlalu kompleks' }] };
    const err = await buildPrintPayload(d.snapshot, body, { fontSource: counting, renderMermaid: false }).catch((e) => e);
    expect(err).toBeInstanceOf(PrintBlockedError);
    expect((err as PrintBlockedError).issues.map((i) => i.code)).toContain('INPUT_TOO_COMPLEX');
    expect(fontCalls).toBe(0);
  });

  it('issue input nonblocking tetap ada di payload (tidak dibuang)', async () => {
    const d = await realDoc('```\n# x\n```\n', 'EDU-01');
    const body = { ...d.body, issues: [...d.body.issues, { id: 'w', code: 'OUTER_FENCE', severity: 'warning' as const, scope: 'input' as const, message: 'pembungkus' }] };
    const p = await buildPrintPayload(d.snapshot, body, { fontSource: nodeFontSource, renderMermaid: false });
    expect(p.issues.map((i) => i.code)).toContain('OUTER_FENCE');
  });
});
