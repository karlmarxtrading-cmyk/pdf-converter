// @vitest-environment jsdom
// PF-R4-07: a default cover without visible metadata must not create a blank printed page.
import { describe, expect, it } from 'vitest';
import { composeDocument, prepareBody } from '../../../src/render/document';
import { realDoc } from './helpers';

describe('PF-R4-07 meaningful cover content', () => {
  it.each(['screen', 'print'] as const)('omits an empty default cover in %s without changing source or settings', async mode => {
    const doc = await realDoc('# Real source title\n\nBody text stays intact.', 'BUS-01', {
      cover: true, title: ' \t ', subtitle: '\n', author: ' ', dateText: '', toc: false,
    });
    const before = JSON.stringify(doc.snapshot);
    const prepared = await prepareBody(doc.snapshot, doc.body, { mode, renderMermaid: false, allowExternalImages: false });
    const result = await composeDocument(doc.snapshot, { mode, prepared, fontCss: '' });
    const output = new DOMParser().parseFromString(result.html, 'text/html');
    expect(output.querySelector('.pf-cover')).toBe(null);
    expect(output.querySelector('.pf-doc')?.textContent?.trim()).toBe('Real source title\nBody text stays intact.');
    expect(JSON.stringify(doc.snapshot)).toBe(before);
    expect(doc.snapshot.settings.cover).toBe(true);
  });

  it.each(['title', 'subtitle', 'author', 'dateText'] as const)('retains the explicitly populated %s cover', async field => {
    const doc = await realDoc('# Body title\n\nBody text.', 'BUS-01', {
      cover: true, title: '', subtitle: '', author: '', dateText: '', [field]: 'Explicit cover text',
    });
    const prepared = await prepareBody(doc.snapshot, doc.body, { mode: 'print', renderMermaid: false, allowExternalImages: false });
    const result = await composeDocument(doc.snapshot, { mode: 'print', prepared, fontCss: '' });
    const output = new DOMParser().parseFromString(result.html, 'text/html');
    expect(output.querySelector('.pf-cover')?.textContent).toContain('Explicit cover text');
    expect(output.querySelector('.pf-doc')?.textContent).toContain('Body text.');
  });
});
