import type { Root, RootContent } from 'hast';
import type { RenderedBody } from './contracts';

const boundaries = new Set([
  'blockquote', 'br', 'caption', 'dd', 'details', 'div', 'dl', 'dt', 'figcaption',
  'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'ol',
  'p', 'section', 'summary', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul',
]);

/** Count authored prose and structures on the sanitized HAST. Formula slots are still
 * atomic here. Conversation labels, page furniture and the KaTeX branches come later. */
export function addContentStats(root: Root, stats: RenderedBody['stats'], footnoteLabelId: string,
  labelBlocks?: ReadonlySet<string>): void {
  const prose: string[] = [];
  const words = /[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu;
  function endPhrase(): void {
    if (!prose.length) return;
    const text = prose.length === 1 ? prose[0]! : prose.join('');
    while (words.test(text)) stats.words++;
    prose.length = 0;
  }

  function visit(node: RootContent): void {
    if (node.type === 'text') { prose.push(node.value); return; }
    if (node.type !== 'element') return;
    const { tagName, properties } = node;
    if (labelBlocks?.has(String(properties.dataBlockId)) || properties.dataFootnoteRef !== undefined || properties.dataFootnoteBackref !== undefined ||
      (tagName === 'h2' && properties.id === footnoteLabelId)) return;
    const classes = properties.className;
    if (properties.dataSlot !== undefined) { endPhrase(); stats.math++; return; }
    if (tagName === 'img' || (tagName === 'span' && Array.isArray(classes) && classes.includes('pf-img-placeholder'))) { endPhrase(); stats.images++; return; }
    if (tagName === 'pre') {
      endPhrase();
      if (Array.isArray(classes) && classes.includes('pf-mermaid')) stats.mermaid++;
      else stats.code++;
      return;
    }
    if (tagName === 'code' || tagName === 'kbd' || tagName === 'samp') { endPhrase(); return; }
    if (tagName === 'table') stats.tables++;
    const boundary = boundaries.has(tagName);
    if (boundary) endPhrase();
    node.children.forEach(visit);
    if (boundary) endPhrase();
  }
  root.children.forEach(visit);
  endPhrase();
}
