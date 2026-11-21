// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { commitRevision, createProject, exportBundle, importBundle, importZipIntoProject } from '../../../src/core/projects';
import { readCentralDirectory } from '../../../src/core/zip';
import { LIMITS } from '../../../src/core/limits';
import { htmlToMarkdown } from '../../../src/core/clipboard';
import { renderBody } from '../../../src/core/render';
import { checkRenderIntegrity } from '../../../src/core/integrity';

describe('CR-01 portable archive budgets', () => {
  it('restores 135,011 bytes of repetitive exercise text, including a legacy high compression ratio', async () => {
    const source = '# Catatan\n\n' + 'Contoh kalimat pendek untuk buku latihan matematika.\n\n'.repeat(2500);
    const project = createProject({ source, name: 'Repetitive but valid text' });
    const { bytes } = await exportBundle(project);
    const cd = readCentralDirectory(bytes);
    if (!cd.ok) throw Error(cd.code);
    const entry = cd.entries.find(x => x.name === 'project.json')!;
    expect(strToU8(source).length).toBe(135011);
    expect(entry.uncompressedSize / entry.compressedSize).toBeGreaterThan(100);
    const recovered = await importBundle(bytes);
    expect(recovered.ok && recovered.project).toEqual(project);
  });

  it('restores 90 full revisions with project metadata larger than 5 MiB', async () => {
    const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let seed = 123456789;
    let source = '# Riwayat revisi\n\n';
    for (let i = 0; i < 60000; i++) {
      if (i % 100 === 99) source += '\n';
      else { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; source += alphabet[(seed >>> 0) % alphabet.length]; }
    }
    let project = createProject({ source, name: 'Normal size document with revisions' });
    // Exercise the full-snapshot legacy representation directly. Current edits are stored as deltas.
    for (let i = 0; i < 90; i++) {
      const text = source + '\nRevisi ' + i;
      project = { ...project, source: text, revision: i + 1, history: [...project.history, { revision: i+1, at: project.updatedAt, label: 'Edit ' + i, source: text }] };
    }
    const { bytes } = await exportBundle(project);
    const cd = readCentralDirectory(bytes);
    if (!cd.ok) throw Error(cd.code);
    expect(strToU8(project.source).length).toBe(60028);
    const size = cd.entries.find(x => x.name === 'project.json')!.uncompressedSize;
    expect(size).toBeGreaterThan(5 * 1024 * 1024);
    const restored = await importBundle(bytes);
    expect(restored.ok && restored.project).toEqual(project);
  });

  it('rejects export and restore consistently at the unpacked limit and preserves the original', async () => {
    const project = commitRevision(createProject({ source: 'notes' }), { source: 'abc'.repeat(1000) }, 'update');
    const budget = { ...LIMITS, zipUnpackedBytes: 4000 };
    const exported = await exportBundle(project);
    await expect(exportBundle(project, project.updatedAt, budget)).rejects.toThrow();
    const result = await importBundle(exported.bytes, budget);
    expect(result).toMatchObject({ ok: false, code: 'BUDGET_EXCEEDED' });
    expect(project.history).toHaveLength(1);
  });

  it('preserves a UTF-8 BOM when restoring source.md', async () => {
    const project = createProject({ source: '\uFEFF# Angka\n1.000' });
    const { bytes } = await exportBundle(project);
    expect(await importBundle(bytes)).toMatchObject({ ok: true, project: { source: project.source } });
  });
});

describe('CR-03 CRC32 before commit', () => {
  for (const level of [0, 6] as const) {
    it('rejects a damaged checksum for a price in a ' + (level ? 'deflate' : 'stored') + ' entry', async () => {
      const archive = (price: number) => zipSync({ 'a.md': strToU8('# A'), 'total.md': strToU8('Harga ' + price + ' rupiah.') }, { level });
      const previous = readCentralDirectory(archive(1000));
      if (!previous.ok) throw Error(previous.code);
      const bytes = archive(9000);
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const start = view.getUint32(bytes.byteLength - 6, true);
      const second = start + 46 + view.getUint16(start + 28, true);
      const oldChecksum = previous.entries[1]!.crc32;
      const local = view.getUint32(second + 42, true);
      view.setUint32(local + 14, oldChecksum, true);
      view.setUint32(second + 16, oldChecksum, true);
      const active = createProject({ source: 'Draft' });
      const read = await importZipIntoProject(active, bytes);
      expect(read.ok).toBe(false);
      if (!read.ok) {
        expect(read.messageEn).toMatch(/checksum/i);
        expect(read.project).toBe(active);
      }
    });
  }
});

it('CR-02 verifies caption, footer totals, cells and spans in a raw HTML table', async () => {
  const source = '<table><caption>Stock</caption><thead><tr><th colspan="2">Items</th></tr></thead><tbody><tr><td>A</td><td>B</td></tr></tbody><tfoot><tr><th>Total</th><td>47</td></tr></tfoot></table>';
  const rendered = await renderBody(source, { assets: [], allowExternalImages: false, template: 'EDU-01' });
  expect(checkRenderIntegrity(source, rendered)).toMatchObject({ ok: true, coverage: { tables: 1, cells: 5 } });
  for (const edited of [
    rendered.html.replace(/<tfoot>[\s\S]*?<\/tfoot>/, ''), rendered.html.replace('47', '49'),
    rendered.html.replace('<caption>Stock</caption>', ''), rendered.html.replace('colspan="2"', 'colspan="1"')
  ]) {
    expect(checkRenderIntegrity(source, edited)).toMatchObject({ ok: false, issues: [expect.objectContaining({ code: 'INTEGRITY_RAW_TABLE_CHANGED' })] });
  }
});

it('CR-02 HTML clipboard import preserves caption, footer and links for a table without merged cells', async () => {
  const input = '<table><caption>Totals</caption><tbody><tr><td><a href="/report">Report</a></td></tr></tbody><tfoot><tr><td>70195</td></tr></tfoot></table>';
  const clipped = htmlToMarkdown(input);
  if (!clipped.ok) throw Error(clipped.message);
  const { html } = await renderBody(clipped.markdown, { assets: [], allowExternalImages: false, template: 'BUS-01' });
  const table = new DOMParser().parseFromString(html, 'text/html').querySelector('table')!;
  expect(table.caption?.textContent).toBe('Totals');
  expect(table.tFoot?.textContent).toBe('70195');
  expect(table.querySelector('a')?.getAttribute('href')).toBe('/report');
  expect(checkRenderIntegrity(clipped.markdown, html).ok).toBe(true);
});
