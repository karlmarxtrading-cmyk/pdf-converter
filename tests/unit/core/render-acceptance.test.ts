// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import * as C from '../../../src/core/index';
import { docLabels } from '../../../src/render/labels';
import { exportHtml } from '../../../src/render/exports';
import { nodeFontSource } from '../render/helpers';
import { fxBytes } from './fx';

async function exportProject(p: C.Project) {
  const snapshot = await C.makeSnapshot(p);
  const body = await C.renderBody(snapshot.source, C.snapshotRenderOptions(snapshot));
  const output = await exportHtml({ snapshot, body, profile: 'standalone', fontSource: nodeFontSource, renderMermaid: false });
  const doc = new DOMParser().parseFromString(output.html!, 'text/html');
  return { snapshot, body, doc, output };
}

const formula = (tex: string, display = false) => `<math${display ? ' display="block"' : ''}><semantics><mi>x</mi><annotation encoding="application/x-tex">${tex}</annotation></semantics></math>`;

describe('RC3 import → model → output', () => {
  it('F-06 retains exact formulas in caption, colspan, rowspan and footer', async () => {
    const tex = ['a_{1}', '\\frac{1}{2}', 'x^{3}', 'z=4' + ' + 1'.repeat(60) + '\n\n +  2'];
    const html = `<table><caption>${formula(tex[0]!)}</caption><thead><tr><th colspan="2">${formula(tex[1]!, true)}</th></tr></thead><tbody><tr><td rowspan="2">${formula(tex[2]!)}</td><td>12</td></tr><tr><td>13</td></tr></tbody><tfoot><tr><td colspan="2">${formula(tex[3]!)}</td></tr></tfoot></table>`;
    const result = C.htmlToMarkdown(html);
    if (!result.ok) throw Error(result.message);
    const { body, doc } = await exportProject(C.createProject({ source: result.markdown }));
    expect(body.stats.math).toBe(4);
    expect(C.checkIntegrity(result.markdown, body).issues.filter(i => i.severity === 'error')).toEqual([]);
    expect([...doc.querySelectorAll('table .pf-math annotation')].map(n => n.textContent)).toEqual(tex);
    expect(doc.querySelector('th[colspan="2"] .pf-math-display .katex')).toBeTruthy();
    expect(doc.querySelector('td[rowspan="2"] .pf-math-inline')).toBeTruthy();
    expect(doc.querySelector('caption .katex')).toBeTruthy();
    expect(doc.querySelector('tfoot .katex')).toBeTruthy();
  });

  it('F-07 ZIP member path binds resolution/preflight/export to the selected markdown, also after restore', async () => {
    const text = '![one](images/log%C3%B3%20x.png)\n\n<img alt="two" src="images/log%C3%B3%20x.png?v=7#test">';
    const bytes = zipSync({ 'docs/chapter.md': strToU8(text), 'other/chapter.md': strToU8(text),
      'docs/images/logó x.png': fxBytes('assets/chart.png'), 'other/images/logó x.png': fxBytes('pengganti_B/chart.png') });
    const imports = await C.importZipIntoProject(C.createProject(), bytes);
    if (!imports.ok) throw Error(imports.message);
    expect(imports.needsSelection).toBe(true);
    const hashes = new Set<string>();
    for (const chosen of imports.markdown) {
      const p = C.commitRevision(imports.project, { source: chosen.text, sourcePath: chosen.path,
        inputs: [await C.makeInputRecord('zip', chosen.text, { name: chosen.path })] }, 'zip');
      const bundle = await C.exportBundle(p), restored = await C.importBundle(bundle.bytes);
      if (!restored.ok) throw Error(restored.message);
      const { snapshot, body, doc } = await exportProject(restored.project);
      const expected = snapshot.assets.find(a => a.path === chosen.path.replace('chapter.md', 'images/logó x.png'))!;
      expect(doc.querySelectorAll('img[data-asset-id]')).toHaveLength(2);
      for (const im of doc.querySelectorAll('img[data-asset-id]')) expect(im.getAttribute('src')).toBe(C.assetDataUrl(expected));
      expect(C.assetPreflight(snapshot)).toMatchObject({ complete: true, total: 2 });
      expect(body.issues.some(i => i.code === 'IMAGE_MISSING_ASSET')).toBe(false);
      expect(snapshot.source).toBe(text);
      hashes.add(snapshot.renderInputHash);
    }
    expect(hashes.size).toBe(2);
    expect(C.normalizeAssetPath('../other/a.png', 'docs/chapter.md')).toBe('other/a.png');
    for (const ref of ['../../bad.png', '%2e%2e/%2e%2e/bad.png', '//remote/image', 'nested%2f..%2fimage'])
      expect(C.normalizeAssetPath(ref, 'docs/chapter.md')).toBeNull();
  });

  it('F-08 rewrites explicit IDs, Unicode, duplicates and footnotes, while retaining link integrity', async () => {
    const source = '[custom](#A-1) · [last](#%C3%A9cole-2)\n\n<div id="A-1">target</div><div aria-labelledby="A-1">description</div>\n\n## École\n\n## École\n\nNote[^1].\n\n[^1]: Value.';
    const { body, doc, output } = await exportProject(C.createProject({ source }));
    for (const anchor of doc.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'))
      expect(doc.getElementById(decodeURIComponent(anchor.hash.slice(1)))).toBeTruthy();
    expect(doc.querySelector('[aria-labelledby="u-a-1"]')?.textContent).toBe('description');
    expect(doc.querySelector('[data-source-href="#A-1"]')?.getAttribute('href')).toBe('#u-a-1');
    expect(C.checkIntegrity(source, body).issues.filter(i => i.severity === 'error')).toEqual([]);
    expect(output.manifest.checks.find(c => c.name === 'internal-anchors')?.status).toBe('pass');
  });

  it('F-08 resolves a cross-message target and keeps identically named local headings scoped', async () => {
    const msg = ['## Intro\n\n[first](#intro) [to B](#elsewhere)', '## Intro\n\n[second](#intro)\n\n<div id="elsewhere">B</div>'];
    const p = C.createProject();
    const conv = C.parsePlainConversation('User:\n' + msg[0] + '\n\nAssistant:\n' + msg[1], 'in-1').conversation;
    p.conversation = { ...conv, messages: conv.messages.map(m => ({ ...m, selected: true })), outputMode: 'transcript', selectedOrder: conv.messages.map(m=>m.id) };
    const { doc } = await exportProject(p);
    const links = [...doc.querySelectorAll<HTMLAnchorElement>('.pf-msg a')];
    expect(links.map(a => a.hash)).toEqual(['#m1-h-intro', '#m2-u-elsewhere', '#m2-h-intro']);
    for (const a of links) expect(doc.getElementById(a.hash.slice(1))).toBeTruthy();
  });

  it.each(['en', 'id'])('F-09 output labels follow document language %s; preserve user text', async lang => {
    const p = C.createProject({ source: '# My heading\n\nOriginal -5.2 USD[^x].\n\n[^x]: Original note.' });
    p.settings.contentLang = lang;
    const { snapshot, body, doc } = await exportProject(p);
    expect(snapshot.source).toBe(p.source);
    expect(doc.documentElement.lang).toBe(lang);
    expect(doc.querySelector('#footnote-label')?.textContent).toBe(docLabels(lang).fn);
    expect(doc.querySelector('a[data-footnote-backref]')?.getAttribute('aria-label')).toBe(docLabels(lang).back('1'));
    expect(body.html).toContain('Original -5.2 USD');
  });
});
