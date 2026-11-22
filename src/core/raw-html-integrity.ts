/** RC7-I01. Compare safe, self-contained raw HTML in reading order. Source
 * projection uses the parsed input; output projection reads the sanitized DOM.
 * Neither reads the concatenated visual + accessibility text of a formula. */
import type { Element as HElement, Root as HRoot, RootContent } from 'hast';
import { parseHtmlWithinBudget } from './html';
import { recoverHtmlLiteralMath } from './html-math';
import { readHtmlMathSource, recoverMixedMathChild } from './html-math-source';
import { DROP_WITH_CONTENT } from './sanitize';
import { imageRefKey, orderedTokens } from './util';

const boundaries = new Set(['a','blockquote','br','caption','code','col','colgroup','dd','details','div','dl','dt','figcaption','figure',
  'h1','h2','h3','h4','h5','h6','header','hr','kbd','li','ol','p','pre','samp','section','summary',
  'sub','sup','table','tbody','td','tfoot','th','thead','tr','ul']);
const literalTags = new Set(['pre','code','kbd','samp']);

export interface RawHtmlProjection {
  signature: string;
  counts: { tokens: number; math: number; links: number; images: number; code: number; tables: number; cells: number };
}

class Signature {
  private events: (string | null)[][] = [];
  private buffer = '';
  private headerIds = new Map<string, number>();
  private headerRefs: (string | null)[][] = [];
  text(value: string) { this.buffer += value; }
  flush(exact: boolean) {
    const value = exact ? this.buffer : this.buffer.replace(/\s+/g, ' ').trim();
    if (value) this.events.push(['text', value]);
    this.buffer = '';
  }
  event(exact: boolean, ...fields: (string | null)[]) {
    this.flush(exact);
    if (fields[0] === 'start' && (fields[1] === 'th' || fields[1] === 'td') && fields.length > 5) {
      const id = fields[5];
      if (id && fields[1] === 'th') this.headerIds.set(id, this.events.length);
      fields[5] = id ? 'declared' : null;
      if (fields[6]) this.headerRefs.push(fields);
    }
    this.events.push(fields);
  }
  counts(): RawHtmlProjection['counts'] {
    const counts = { tokens: 0, math: 0, links: 0, images: 0, code: 0, tables: 0, cells: 0 };
    for (const [kind, value] of this.events) {
      if (kind === 'text' && value) counts.tokens += orderedTokens(value).length;
      if (kind === 'math') counts.math++;
      if (kind === 'image') counts.images++;
      if (kind !== 'start') continue;
      if (value === 'a') counts.links++;
      if (value === 'code' || value === 'pre') counts.code++;
      if (value === 'table') counts.tables++;
      if (value === 'th' || value === 'td') counts.cells++;
    }
    return counts;
  }
  result() {
    this.flush(false);
    // IDs are namespaced on render. Compare which header cell each reference
    // resolves to, so renaming IDs consistently is allowed but moving one is not.
    for (const row of this.headerRefs) {
      row[6] = row[6]!.trim().split(/\s+/).map(id => this.headerIds.get(id) ?? 'unresolved:' + id).join(' ');
    }
    this.headerRefs = [];
    return this.events.length ? JSON.stringify(this.events) : undefined;
  }
}

function attributes(tag: string, get: (name: string) => string | null): (string | null)[] {
  if (tag === 'col' || tag === 'colgroup') return [get('span')];
  if (tag === 'a') return [get('href'), get('title')];
  if (tag === 'th' || tag === 'td') {
    const props = [get('colspan'), get('rowspan'), get('scope')];
    const id = get('id'), headers = get('headers');
    if (id || headers) props.push(id, headers);
    return props;
  }
  if (tag === 'li') return [get('value'), get('type')];
  if (tag === 'ul') return [get('type')];
  if (tag === 'ol') return [get('type'), get('start'), get('reversed') === null ? null : 'reversed'];
  return [];
}

export function sourceRawHtmlSignature(html: string): RawHtmlProjection | undefined {
  const parsed = parseHtmlWithinBudget(html, undefined, true);
  if (!parsed.ok || !parsed.closed) return undefined;
  const sig = new Signature();
  const synthetic = new WeakMap<RootContent, (string | null)[]>();
  const visitChildren = (parent: HRoot | HElement, literal: boolean) => {
    if (!literal && parent.type !== 'root') {
      recoverHtmlLiteralMath(parent, span => {
        const token = { type: 'text' as const, value: '' };
        synthetic.set(token, ['math', span.display ? 'display' : 'inline', span.renderTex ?? span.tex, span.tex]);
        return token;
      }, node => !!readHtmlMathSource(node));
    }
    for (const child of parent.children) visit(child, literal);
  };
  const visit = (node: RootContent, literal: boolean) => {
    const token = synthetic.get(node);
    if (token) { sig.event(literal, ...token); return; }
    if (node.type === 'text') { sig.text(node.value); return; }
    if (node.type !== 'element') return;
    const tag = node.tagName;
    if (!literal) {
      const math = readHtmlMathSource(node);
      if (math) { sig.event(false, 'math', math.display ? 'display' : 'inline', math.tex, math.span?.tex ?? math.tex); return; }
      recoverMixedMathChild(node);
    }
    // Serialized clipboard tables can include explicit formula markers inside otherwise literal code.
    const mode = node.properties.dataPfFormula;
    if (tag === 'code' && (mode === 'display' || mode === 'inline') && Object.keys(node.properties).length === 1 &&
        node.children.every(c => c.type === 'text')) {
      const tex = node.children.map(c => c.value).join('');
      sig.event(literal, 'math', mode, tex, tex); return;
    }
    if (DROP_WITH_CONTENT.has(tag) || tag === 'input') return;
    const get = (name: string) => {
      const prop = node.properties[({ colspan: 'colSpan', rowspan: 'rowSpan' } as Record<string,string>)[name] ?? name];
      return prop == null ? null : Array.isArray(prop) ? prop.join(' ') : String(prop);
    };
    if (tag === 'img') { sig.event(literal, 'image', imageRefKey(get('src') ?? ''), get('alt') ?? '', get('title')); return; }
    if (boundaries.has(tag)) sig.event(literal, 'start', tag, ...attributes(tag, get));
    const exact = literal || literalTags.has(tag);
    visitChildren(node, exact);
    if (boundaries.has(tag)) sig.event(exact, 'end', tag);
  };
  visitChildren(parsed.tree, false);
  const signature = sig.result();
  return signature ? {signature, counts: sig.counts()} : undefined;
}

export function renderedRawHtmlSignature(el: Element): string | undefined {
  const sig = new Signature();
  const visit = (n: Node, literal: boolean) => {
    if (n.nodeType === 3) { sig.text(n.nodeValue ?? ''); return; }
    if (n.nodeType !== 1) return;
    const e = n as Element, tag = e.localName;
    const get = (key: string) => e.getAttribute(key);
    if (e.classList.contains('pf-math') && e.hasAttribute('data-tex')) {
      sig.event(literal, 'math', e.classList.contains('pf-math-display') ? 'display' : 'inline', get('data-tex'), get('data-source-tex') ?? get('data-tex'));
      return;
    }
    if (tag === 'img' || e.classList.contains('pf-img-placeholder')) {
      const src = get('data-src-path') ?? get('data-src') ?? get('data-blocked-src') ?? imageRefKey(get('src') ?? '');
      sig.event(literal, 'image', src, get('alt') ?? get('data-alt') ?? '', get('title'));
      return;
    }
    const attr = (key: string) => key === 'href' ? get('data-source-href') ?? get('href') ?? get('data-blocked-href') : get(key);
    if (boundaries.has(tag)) sig.event(literal, 'start', tag, ...attributes(tag, attr));
    const exact = literal || literalTags.has(tag);
    for (const child of e.childNodes) visit(child, exact);
    if (boundaries.has(tag)) sig.event(exact, 'end', tag);
  };
  if (el.getAttribute('data-pf-raw-html') === 'group') {
    for (const child of el.childNodes) visit(child, false);
  } else visit(el, false);
  return sig.result();
}
