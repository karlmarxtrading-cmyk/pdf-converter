// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { htmlToMarkdown } from '../../../src/core/clipboard';
import { parsePlainConversation, publicationFor, composeConversation } from '../../../src/core/conversation';
import { renderBody } from '../../../src/core/render';

const options = { template: 'BUS-01' as const, assets: [], allowExternalImages: false };
const markdown = [
  '# Energy', '', 'Middle $x$ text and `some code`.', '', '| Left | Right |', '|---|---|', '| Atom | Value |',
  '', '```', 'alpha beta', '```', '', '![ignored alt](missing.png)',
].join('\n');
const html = [
  '<h1>Energy</h1><p>Middle <span data-tex="x">x</span> text and <code>some code</code>.</p>',
  '<table><thead><tr><th>Left</th><th>Right</th></tr></thead><tbody><tr><td>Atom</td><td>Value</td></tr></tbody></table>',
  '<pre><code>alpha beta</code></pre><p><img src="missing.png" alt="ignored alt"></p>',
].join('');
const expected = { words: 8, tables: 1, code: 1, images: 1, math: 1, mermaid: 0 };

describe('semantic document statistics', () => {
  it.each(['Markdown','raw HTML','clipboard HTML'])('counts the same authored content in %s', async (format) => {
    let source = format === 'Markdown' ? markdown : html;
    if (format === 'clipboard HTML') {
      const converted = htmlToMarkdown(html);
      if (!converted.ok) throw Error(converted.message);
      source = converted.markdown;
    }
    const body = await renderBody(source, options);
    const dom = new DOMParser().parseFromString(body.html, 'text/html');
    expect(dom.querySelectorAll('table')).toHaveLength(1);
    expect(dom.querySelectorAll('td,th')).toHaveLength(4);
    expect(dom.querySelectorAll('.pf-math .katex-mathml')).toHaveLength(1);
    expect(dom.querySelectorAll('pre')).toHaveLength(1);
    expect(body.stats).toEqual(expected);
  });

  it('counts combined inline text once, break/cell boundaries separately and excludes markup and inactive content', async () => {
    const input = '<div title="metadata never included">re<em>visi</em> co<strong>öp</strong><br>again'
      + '<table><tr><td>ya</td><td>dua</td></tr></table><script>discard these tokens</script>'
      + '<kbd>Ctrl Space</kbd></div>';
    const rendered = await renderBody(input, options);
    expect(rendered.stats).toEqual({ words: 5, tables: 1, math: 0, images: 0, code: 0, mermaid: 0 });
  });

  it('reports Mermaid independently from ordinary code and footnote prose once without automatic numbering or labels', async () => {
    const input = 'Utama[^a].\n\n[^a]: Catatan asli.\n\n```mermaid\ngraph TD; A-->B\n```\n\n<pre>kode literal</pre>';
    const rendered = await renderBody(input, options);
    expect(rendered.stats).toEqual({ words: 3, tables: 0, math: 0, images: 0, code: 1, mermaid: 1 });
  });
});

it('omits composition labels only for their identified source revision', async () => {
  const conv = parsePlainConversation('User: Satu.\n\nAssistant: Dua tiga.', 'test').conversation;
  conv.outputMode = 'transcript';
  const built = composeConversation(conv, { lang: 'en' });
  conv.editable = true;
  conv.publication = publicationFor(conv, built);
  const first = await renderBody(built.markdown, { ...options, conversation: conv });
  expect(first.stats.words).toBe(3);
  const edited = await renderBody(built.markdown + '\n\nRevisi.', { ...options, conversation: conv });
  expect(edited.stats.words).toBe(6);
});
