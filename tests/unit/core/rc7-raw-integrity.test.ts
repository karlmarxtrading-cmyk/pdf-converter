// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderBody } from '../../../src/core/render';
import { checkRenderIntegrity } from '../../../src/core/integrity';

const opts = { assets: [], template: 'BUS-01' as const, allowExternalImages: false };
const src = String.raw`Awal.

<div><p>Alpha + 2.</p><p>Berikut \(x+y\)</p><figure><img src="/g.png" alt="Kurva" title="Gambar"><figcaption>Diagram</figcaption></figure><a href="/refs" title="Buku">Rujukan</a><table><tr><td>5</td></tr><tr><td>7</td></tr></table><pre>  $x$</pre></div>

Akhir.`;
const bodyOf = (s: string) => new DOMParser().parseFromString(s, 'text/html').body;

describe('RC7-I01 ordered safe raw HTML (synthetic)', () => {
  it('includes raw HTML between Markdown neighbours, detecting annotated mutations against the original input', async () => {
    const good = bodyOf((await renderBody(src, opts)).html);
    const report = checkRenderIntegrity(src, good);
    expect(report.issues).toEqual([]); expect(report.checkedBlocks).toBe(3);
    expect(report.coverage).toMatchObject({tables:1, cells:2, links:1, images:1, math:1, code:1});
    expect(good.querySelectorAll('.katex')).toHaveLength(1);
    const mutations: Record<string, (body: HTMLElement) => void> = {
      operator: b => { b.querySelector('div p')!.textContent = 'Alpha - 2.'; },
      formula: b => { b.querySelector('.pf-math')!.remove(); },
      sourceTex: b => { b.querySelector('.pf-math')!.setAttribute('data-source-tex', 'y-x'); },
      paragraph: b => { b.querySelector('div p')!.remove(); },
      order: b => { b.querySelector('div')!.prepend(b.querySelector('figure')!); },
      blockOrder: b => { b.append(b.querySelector('div')!); },
      row: b => { b.querySelector('tr')!.remove(); },
      link: b => { b.querySelector('a')!.setAttribute('href', '/other'); },
      asset: b => { b.querySelector('.pf-img-placeholder')!.remove(); },
      alt: b => { b.querySelector('.pf-img-placeholder')!.setAttribute('data-alt', 'Salah'); },
      title: b => { b.querySelector('.pf-img-placeholder')!.removeAttribute('title'); },
      caption: b => { b.querySelector('figcaption')!.replaceWith('Diagram'); },
      indentation: b => { b.querySelector('pre')!.textContent = ' $x$'; },
    };
    for (const [name, apply] of Object.entries(mutations)) {
      const b = good.cloneNode(true) as HTMLElement;
      apply(b);
      expect(checkRenderIntegrity(src, b).issues.some(i => i.blocking), name).toBe(true);
    }
  });
  it('handles multiple top-level elements, unwrapped containers, code and sanitization', async () => {
    const s = String.raw`<article><p>Un &amp; deux.</p><p><code>\(x\)</code></p><script>hidden</script></article><figure><figcaption>Trois</figcaption></figure>`;
    const b = bodyOf((await renderBody(s, opts)).html);
    expect(b.querySelector('script')).toBeNull();
    expect(b.querySelector('code')?.textContent).toBe(String.raw`\(x\)`);
    expect(checkRenderIntegrity(s, b)).toMatchObject({ok:true, checkedBlocks:1, skippedBlocks:[]});
    b.querySelector('p')!.remove();
    expect(checkRenderIntegrity(s, b).ok).toBe(false);
  });
  it('reports open HTML boundaries without changing the Markdown nested between them', async () => {
    const s = '<section>\n\nA *separate* paragraph.\n\n</section>';
    const b = bodyOf((await renderBody(s, opts)).html);
    expect(b.querySelector('section > p em')?.textContent).toBe('separate');
    const report = checkRenderIntegrity(s, b);
    expect(report.ok).toBe(true); expect(report.skippedBlocks.length).toBeGreaterThan(0);
    expect(report.issues.some(i => i.code === 'INTEGRITY_RAW_HTML_PARTIAL')).toBe(true);
  });
  it('verifies the actual fragment even when provenance is unchanged and another valid target exists', async () => {
    const s = '<section><h2 id="target">One</h2><h2 id="other">Two</h2><a href="#target">Go</a></section>';
    const b = bodyOf((await renderBody(s, opts)).html);
    expect(checkRenderIntegrity(s, b).ok).toBe(true);
    expect(b.querySelector('a')!.getAttribute('data-source-href')).toBe('#target');
    const changed = b.cloneNode(true) as HTMLElement;
    changed.querySelector('a')!.setAttribute('href', '#' + changed.querySelectorAll('h2')[1]!.id);
    expect(checkRenderIntegrity(s, changed).issues.map(i => i.code)).toContain('INTEGRITY_REFERENCE_TARGET_CHANGED');
    b.querySelector('h2')!.removeAttribute('id');
    expect(checkRenderIntegrity(s, b).ok).toBe(false);
  });
  it('detects missing embedded bytes and missing visible placeholder text even with an intact source path', async () => {
    const s = '<figure><img src="a.png" alt="Courbe"></figure>';
    const assets = [{id:'sample', path:'a.png', mime:'image/png', bytes:new Uint8Array([1]), origin:'upload' as const}];
    const b = bodyOf((await renderBody(s, {...opts, assets})).html);
    expect(checkRenderIntegrity(s,b).ok).toBe(true);
    b.querySelector('img')!.removeAttribute('src');
    expect(checkRenderIntegrity(s,b).ok).toBe(false);
    const missing = bodyOf((await renderBody(s,opts)).html);
    missing.querySelector('.pf-ui-label')!.remove();
    expect(checkRenderIntegrity(s,missing).ok).toBe(false);
  });
  it.each([
    '![deskripsi](a.png "judul") dan [label](/z "link")',
    '<table><tr><td><img src="a.png" alt="deskripsi" title="judul"><a href="/z" title="link">label</a></td></tr></table>',
    '<figure><img src="a.png" alt="deskripsi" title="judul"><a href="/z" title="link">label</a></figure>',
  ])('checks image description and titles on each supported path', async s => {
    const b = bodyOf((await renderBody(s, opts)).html);
    expect(checkRenderIntegrity(s, b).ok).toBe(true);
    expect(b.querySelector('[role="img"]')?.getAttribute('title')).toBe('judul');
    const wrong = b.cloneNode(true) as HTMLElement;
    wrong.querySelector('a')!.setAttribute('title', 'other');
    expect(checkRenderIntegrity(s, wrong).ok).toBe(false);
    b.querySelector('[role="img"]')!.setAttribute('data-alt', 'other');
    expect(checkRenderIntegrity(s, b).ok).toBe(false);
  });
});
