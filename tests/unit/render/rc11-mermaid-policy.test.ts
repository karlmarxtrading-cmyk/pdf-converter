// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { checkedDiagram } from '../../../src/render/diagram-policy';

describe('resource policy for the SVG returned by the renderer', () => {
  const svg = (content: string) => '<svg xmlns="http://www.w3.org/2000/svg">' + content + '</svg>';
  const remote = 'https://paperforma-audit.invalid/sample.png';
  it('keeps local paint servers, Mermaid styles and label text', () => {
    const input = svg('<style>rect { fill: url(#paint) } .node { color: rgb(0, 0, 0) }</style><rect fill="url(#paint)"/><text>classroom</text>');
    expect(checkedDiagram(input, false, document).textContent).toContain('classroom');
  });
  it.each([false, true])('rejects external paints and styles with approved images=%s', online => {
    for (const mark of ['<style>@import "' + remote + '";</style>', '<rect fill="url(' + remote + ')"/>',
      '<rect style="background-image: image-set(&quot;' + remote + '&quot; 1x)"/>']) {
      expect(() => checkedDiagram(svg(mark), online, document)).toThrow();
    }
  });
  it('limits external href to a consented HTTPS image', () => {
    const image = svg('<image href="' + remote + '"/>');
    expect(() => checkedDiagram(image, false, document)).toThrow();
    expect(checkedDiagram(image, true, document).querySelector('image')!.getAttribute('href')).toBe(remote);
    expect(() => checkedDiagram(svg('<use href="' + remote + '"/>'), true, document)).toThrow();
  });
  it('accepts a local flowchart from the installed Mermaid package', async () => {
    const proto = window.SVGElement.prototype;
    const bbox = Object.getOwnPropertyDescriptor(proto, 'getBBox');
    const textLength = Object.getOwnPropertyDescriptor(proto, 'getComputedTextLength');
    Object.defineProperty(proto, 'getBBox', { configurable: true, value: () => ({ x: 0, y: 0, width: 80, height: 30 }) });
    Object.defineProperty(proto, 'getComputedTextLength', { configurable: true, value: () => 30 });
    try {
      const { default: mermaid } = await import('mermaid');
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: false, flowchart: { htmlLabels: false }, theme: 'neutral' });
      const { svg: rendered } = await mermaid.render('pfLocalDiagram', 'flowchart LR\nA[one] --> B[two]');
      const drawing = checkedDiagram(rendered, false, document);
      expect(drawing.textContent).toContain('one');
      expect(drawing.textContent).toContain('two');
    } finally {
      if (bbox) Object.defineProperty(proto, 'getBBox', bbox); else Reflect.deleteProperty(proto, 'getBBox');
      if (textLength) Object.defineProperty(proto, 'getComputedTextLength', textLength); else Reflect.deleteProperty(proto, 'getComputedTextLength');
    }
  }, 30_000);
});
