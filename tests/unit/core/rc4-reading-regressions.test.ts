// @vitest-environment jsdom
/** RC4 independent audit: correct TeX, code and URL semantics through every supported text input. */
import { describe, it, expect } from 'vitest';
import { htmlToMarkdown } from '../../../src/core/clipboard';
import { renderBody } from '../../../src/core/render';
import { assetPreflight } from '../../../src/core/preflight';
import { checkRenderIntegrity } from '../../../src/core/integrity';
import { parseMarkdown } from '../../../src/core/markdown';
import { scanMath } from '../../../src/core/math';
import { LIMITS, checkTreeBudget, BudgetError } from '../../../src/core/limits';
import { parseClipboardConversation } from '../../../src/core/conversation';
const opts = { assets: [], allowExternalImages: false, template: 'BUS-01' as const };
const doc = (html: string) => new DOMParser().parseFromString(html, 'text/html');
const tex = (html: string) => [...doc(html).querySelectorAll('.pf-math')].map(e => e.getAttribute('data-tex'));
async function fromHtml(html: string) { const r = htmlToMarkdown(html); if (!r.ok) throw new Error(r.code); return { converted: r, rendered: await renderBody(r.markdown, opts) }; }

describe('RC4-CORE reading regression audit', () => {
  it('control: literal trigonometry in a simple table renders once', async () => {
    const { rendered: r } = await fromHtml(String.raw`<table><tr><th>Fungsi</th><th>Rumus</th></tr><tr><td>Sinus</td><td>\(\sin\theta=\frac{\text{sisi depan}}{\text{sisi miring}}\)</td></tr></table>`);
    expect(tex(r.html)).toEqual([String.raw`\sin\theta=\frac{\text{sisi depan}}{\text{sisi miring}}`]);
  });
  it('RC4-M01: literal TeX in a caption / merged HTML table renders', async () => {
    const { converted: c, rendered: r } = await fromHtml(String.raw`<table><caption>Identitas \(x^2+y^2=1\)</caption><tr><td colspan="2">\(\sin^2\theta+\cos^2\theta=1\)</td></tr></table>`);
    expect(tex(r.html)).toEqual([String.raw`x^2+y^2=1`, String.raw`\sin^2\theta+\cos^2\theta=1`]);
    expect(checkRenderIntegrity(c.markdown,r).ok).toBe(true);
  });
  it('RC4-M02: literal TeX spanning harmless inline formatting is recognized', async () => {
    const { rendered: r } = await fromHtml(String.raw`<p>Rumus \(<strong>x</strong>^2+<em>y</em>^2=1\) lengkap.</p>`);
    expect(tex(r.html)).toEqual(['x^2+y^2=1']);
  });
  it('RC4-M03: math inside link label retains formula and URL', async () => {
    const { rendered: r } = await fromHtml(String.raw`<p><a href="https://example.com/">\(E=mc^2\)</a></p>`);
    expect(tex(r.html)).toEqual(['E=mc^2']);
    expect(doc(r.html).querySelector('a')?.getAttribute('href')).toBe('https://example.com/');
  });
  it.each([String.raw`| Mode | Rumus |
|---|---|
| Display | \[x^2+y^2=1\] |`, String.raw`**\[x^2+y^2=1\]**`])('RC4-M04: display mode reaches nested phrasing: %s', async source => {
    const r = await renderBody(source,opts);
    expect(doc(r.html).querySelectorAll('.katex-display').length).toBe(1);
    expect(checkRenderIntegrity(source,r).ok).toBe(true);
  });
  it.each([String.raw`print("$5", "\(x\)", "\[y\]", "$z$")`, String.raw`print("\(x\)", "\[y\]")`])('RC4-M05: indented code remains exact: %s', async body => {
    const source = '    '+body;
    const r = await renderBody(source,opts);
    expect(doc(r.html).querySelector('code')?.textContent).toBe(body);
    expect(tex(r.html)).toEqual([]);
    expect(parseMarkdown(source).tree.children[0]).toMatchObject({ type: 'code', value: body });
    expect(checkRenderIntegrity(source,r).ok).toBe(true);
  });
  it.each([String.raw`print("$5", "\(x\)", "\[y\]", "$z$")`, String.raw`print("\(x\)", "\[y\]")`])('RC4-M06: raw HTML code remains exact: %s', async body => {
    const r = await renderBody('<pre><code>'+body+'</code></pre>',opts);
    expect(doc(r.html).querySelector('code')?.textContent).toBe(body);
    expect(tex(r.html)).toEqual([]);
  });
  it('RC4-M07: display matrices may close after an even backslash run', () => {
    const source = String.raw`$$\begin{matrix}a&b\\\end{matrix}$$`;
    expect(scanMath(source).spans[0]?.tex).toBe(String.raw`\begin{matrix}a&b\\\end{matrix}`);
  });
  it('RC4-M08: image references containing literal dollars stay resolvable', () => {
    const r=assetPreflight({ source:'![price](price$1.png)', assets:[{ id:'a', path:'price$1.png',mime:'image/png',bytes:new Uint8Array([1]),origin:'upload' }], });
    expect(r.complete).toBe(true);
    expect(r.resolved).toEqual(['price$1.png']);
  });
  it('RC4-M08: rendered image lookup also restores a literal dollar before resolution', async () => {
    const source = '![price](price$1.png)';
    const assets = [{ id: 'a', path: 'price$1.png', mime: 'image/png', bytes: new Uint8Array([1]), origin: 'upload' as const }];
    const r = await renderBody(source, { ...opts, assets });
    expect(doc(r.html).querySelector('img')?.getAttribute('data-src-path')).toBe('price$1.png');
    expect(r.issues.some(i=>i.code==='IMAGE_MISSING_ASSET')).toBe(false);
    expect(checkRenderIntegrity(source,r).ok).toBe(true);
  });
  it('RC4-M09: HTML table preserves an absolute-value formula and multiline matrix', async () => {
    const { converted: c, rendered: r } = await fromHtml(String.raw`<table><tr><th>Mode</th><th>Rumus</th></tr><tr><td>Norma</td><td>\(\left|x\right|\)</td></tr><tr><td>Matriks</td><td>\[<br>\begin{pmatrix}a&amp;b\\c&amp;d\end{pmatrix}<br>\]</td></tr></table>`);
    expect(tex(r.html).map(t=>t!.trim())).toEqual([String.raw`\left|x\right|`,String.raw`\begin{pmatrix}a&b\\c&d\end{pmatrix}`]);
    expect(checkRenderIntegrity(c.markdown,r).ok).toBe(true);
  });
  it('RC4-M10: code, escaped delimiters and unsafe markup remain data in clipboard', async () => {
    const { rendered: r }=await fromHtml(String.raw`<p>Contoh <code>\(x\)</code> dan \\(literal\\).</p><pre><code>\[y\]</code></pre><script>window.__bad=1</script><p>\(x&lt;y\)</p>`);
    expect([...doc(r.html).querySelectorAll('code')].map(e=>e.textContent)).toEqual([String.raw`\(x\)`,String.raw`\[y\]`]);
    expect(tex(r.html)).toEqual(['x<y']);
    expect(doc(r.html).querySelectorAll('script').length).toBe(0);
    expect(doc(r.html).body.textContent).toContain(String.raw`\\(literal\\)`);
  });
  it.each(['kbd','samp'])('RC4-M10: %s remains literal code with its surrounding spaces', async tag => {
    const { rendered:r }=await fromHtml(`prefix <${tag}>\\(x\\)</${tag}> suffix`);
    expect(tex(r.html)).toEqual([]);
    expect(doc(r.html).querySelector('code')?.textContent).toBe(String.raw`\(x\)`);
    expect(doc(r.html).body.textContent).toBe(String.raw`prefix \(x\) suffix`);
  });
  it('RC4-I01: raw table integrity detects changed image / link references even when text stays equal', async () => {
    const source = '<table><caption>Table</caption><tr><td><a href="https://example.com/a">Report</a></td><td><img src="a.png" alt="Chart"></td></tr></table>';
    const assets = [{ id: 'a', path: 'a.png', mime: 'image/png', bytes: new Uint8Array([1]), origin: 'upload' as const }];
    const r = await renderBody(source, { ...opts, assets });
    expect(checkRenderIntegrity(source,r).ok).toBe(true);
    expect(checkRenderIntegrity(source,r.html.replace('https://example.com/a','https://example.com/b')).ok).toBe(false);
    expect(checkRenderIntegrity(source,r.html.replace('data-src-path="a.png"','data-src-path="b.png"')).ok).toBe(false);
    expect(checkRenderIntegrity(source,r.html.replace(/<img\b[^>]*>/,'')).ok).toBe(false);
  });
  it('RC4-R01: deeply nested HTML is rejected whole with an explicit depth budget', () => {
    const source = '<div>'.repeat(1800)+'PRESERVE-ME'+'</div>'.repeat(1800);
    const result=htmlToMarkdown(source);
    expect(result.ok).toBe(false);
    if(result.ok)throw new Error('Expected whole-input rejection');
    expect(result.budget).toMatchObject({kind:'nesting',limit:256,code:'BUDGET_EXCEEDED'});
    expect(source).toContain('PRESERVE-ME');
    expect(result.message).toContain('ditolak utuh');
  });
  it('RC4-R01: depth boundary is inclusive and ordinary nesting still works', () => {
    const tree=(depth:number):unknown=>depth?{children:[tree(depth-1)]}:{type:'text',value:'x'};
    expect(checkTreeBudget(tree(256))).toBe(null);
    expect(checkTreeBudget(tree(257))).toMatchObject({kind:'nesting',actual:257});
    expect(htmlToMarkdown('<div>'.repeat(64)+'safe'+'</div>'.repeat(64))).toMatchObject({ok:true,markdown:'safe\n'});
    expect(htmlToMarkdown('<p>A</p><p>B</p>',{limits:{...LIMITS,maxNodes:3}})).toMatchObject({ok:false,budget:{kind:'nodes'}});
  });
  it('RC4-R01: raw HTML render and conversation import share the structural guard', async () => {
    const source='<div>'.repeat(1800)+'<div data-message-author-role="assistant">KEEP</div>'+'</div>'.repeat(1800);
    await expect(renderBody(source,opts)).rejects.toBeInstanceOf(BudgetError);
    const result=parseClipboardConversation({html:source,plain:'KEEP'},'clip');
    expect(result.issues.some(i=>i.code==='BUDGET_EXCEEDED'&&i.blocking)).toBe(true);
    expect(result.conversation.messages[0]?.markdown).toBe('KEEP');
  });
});
