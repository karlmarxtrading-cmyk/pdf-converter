// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderBody } from '../../../src/core/render';
import { checkRenderIntegrity } from '../../../src/core/integrity';
import { purifyToBody } from '../../../src/core/sanitize';

const options = { template: 'BUS-01' as const, assets: [], allowExternalImages: false };

describe('empty document preparation', () => {
  it('returns independent inert DOM and removal reports after an editor reset', () => {
    const initial = purifyToBody('');
    const originalReport = structuredClone(initial.report);
    initial.body.setAttribute('title', 'Changed in previous output');
    initial.body.append('Earlier revision');
    initial.report.removed.push({ kind: 'element', name: 'test' });
    const reset = purifyToBody('');
    expect(reset.body).not.toBe(initial.body);
    expect(reset.body.ownerDocument).not.toBe(initial.body.ownerDocument);
    expect(reset.body.innerHTML).toBe('');
    expect(reset.body.getAttribute('title')).toBeNull();
    expect(reset.report).toEqual(originalReport);
    expect(reset.body.ownerDocument.defaultView).toBeNull();
    expect(purifyToBody('<p>Revision B</p>').body.textContent).toBe('Revision B');
  });

  it('preserves metadata, whitespace and source integrity around empty block sequences', async () => {
    const empty = await renderBody('', options);
    expect(empty.html).toBe('');
    expect(empty.stats.words).toBe(0);
    for (const source of [' \n\n', '---\ntitle: Metadata only\n---\n']) {
      const rendered = await renderBody(source, options);
      expect(rendered.html).toBe('');
      expect(checkRenderIntegrity(source, rendered).ok).toBe(true);
      if (source.startsWith('---')) expect(rendered.frontmatter).toBeDefined();
    }
    const citedMetadata = await renderBody('---\ntitle: Rekap citeturn0search1\n---\n', options);
    expect(citedMetadata.issues.some(issue => issue.code === 'CITATION_UNRESOLVED')).toBe(true);
    const content = await renderBody('Original content.', options);
    expect(checkRenderIntegrity('Original content.', content).ok).toBe(true);
    expect(checkRenderIntegrity('Original content.', empty).ok).toBe(false);
    expect(checkRenderIntegrity('', content).ok).toBe(false);
    expect(checkRenderIntegrity('', 'Extra text outside a block.').ok).toBe(false);
    expect(checkRenderIntegrity('$x+1$', empty).ok).toBe(false);
  });
});
