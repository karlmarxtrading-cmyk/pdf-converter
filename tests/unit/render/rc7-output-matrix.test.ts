// @vitest-environment jsdom
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Paper, TemplateId } from '../../../src/core/contracts';
import { exportHtml } from '../../../src/render/exports';
import { buildPrintPayload } from '../../../src/render/print-payload';
import { nodeFontSource, realDoc } from './helpers';

const layouts: [TemplateId, Paper, 'portrait' | 'landscape', number, number][] = [
  ['BUS-01', 'A4', 'portrait', 210, 297], ['EDU-01', 'A5', 'portrait', 148, 210],
  ['EDT-01', 'Letter', 'landscape', 279.4, 215.9], ['CON-01', 'Legal', 'landscape', 355.6, 215.9],
];
const title = 'Kumpulan Rumus Trigonometri Lengkap';
const mixed = Array.from({length: 28}, (_, i) => [
  '## Bagian ' + (i + 1), 'Paragraf awal ' + i + ' dengan rumus $x^2+1$ dan [tautan](https://example.org).',
  '| A | B |\n|---|---|\n| ' + i + ' | 2 |', '    kode_' + i, 'Paragraf akhir ' + i + '.',
].join('\n\n')).join('\n\n');
const parse = (s: string) => new DOMParser().parseFromString(s, 'text/html');

describe('RC7 matrix of standalone bytes and print preparation from production APIs', () => {
  for (const [template, paper, orientation, w, h] of layouts) {
    it(template + ' preserves a small, original trigonometry and long synthetic mixed document', async () => {
      const input = await readFile('fixtures/rc6/user-trigonometry.md', 'utf8');
      const cases = [
        { name: 'small', source: '# Contoh\n\nIsi $a+b$.', formulas: 1, tables: 0 },
        { name: 'trig', source: input, formulas: 231, tables: 5 },
        { name: 'mixed', source: mixed, formulas: 28, tables: 28 },
      ];
      for (const item of cases) {
        const trig = item.name === 'trig';
        const doc = await realDoc(item.source, template, {
          title: trig ? title : 'Matriks RC7', author: '', cover: false, toc: template === 'BUS-01',
          tocDepth: 2, paper, orientation,
        }, 2);
        const result = await exportHtml({ ...doc, profile: 'standalone', fontSource: nodeFontSource, renderMermaid: false });
        expect(result.verdict.block).toEqual([]);
        const page = parse(result.html);
        expect(page.querySelectorAll('.pf-math .katex')).toHaveLength(item.formulas);
        expect(page.querySelectorAll('.pf-math math')).toHaveLength(item.formulas);
        expect(page.querySelectorAll('article table')).toHaveLength(item.tables);
        if (item.name === 'mixed') {
          expect(page.querySelectorAll('article pre')).toHaveLength(28);
          expect(page.body.textContent).toContain('Paragraf akhir 27.');
        }
        const payload = await buildPrintPayload(doc.snapshot, doc.body, { fontSource: nodeFontSource, renderMermaid: false });
        expect(payload.issues.filter(i => i.blocking || i.severity === 'error')).toEqual([]);
        expect(payload.page.widthMm).toBeCloseTo(w, 1);
        expect(payload.page.heightMm).toBeCloseTo(h, 1);
        expect(parse(payload.bodyInner).querySelectorAll('.pf-math math')).toHaveLength(item.formulas);
        expect(payload.fonts.map(f => f.sha256)).toEqual(result.manifest.fonts.map(f => f.sha256));
        const out = process.env.PF_RC7_EXAMPLES;
        if (out && trig && (template === 'BUS-01' || template === 'EDU-01')) {
          await mkdir(out, { recursive: true });
          await writeFile(join(out, template + '.html'), result.bytes);
          await writeFile(join(out, template + '.manifest.json'), JSON.stringify({
            method: 'Node/jsdom standalone export API (no browser UI or pagination)',
            manifest: result.manifest, settings: payload.settings, printPreparation: payload.page,
          }, null, 2) + '\n');
        }
      }
    }, 120000);
  }
});
