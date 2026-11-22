/** Check the clipboard's annotated TeX and rich cells before accepting the Markdown
 * serialization. The input tree contains the metadata read from the original HTML,
 * before conversion to mdast. Never infer reference equations from a rendered glyph. */
import type { Element, Root, RootContent } from 'hast';
import { unified } from 'unified';
import rehypeRaw from 'rehype-raw';
import { toHast, type Handler } from 'mdast-util-to-hast';
import { readHtmlMathSource } from './html-math-source';
import { parseMarkdown } from './markdown';
import { restorerFor } from './math';

const normalize = unified().use(rehypeRaw).freeze();
type Mode = 'display' | 'inline';
type Equation = [Mode, string];
interface Boundary { left?: string; right?: string }
type Part = string | Equation | ['break'] | ['table'];
interface Inventory { equations: Equation[]; boundaries: Boundary[]; tables: unknown[][]; mathLines: Part[][] }
const edge = (text: string, end: boolean) => (end ? text.slice(-1) : text.slice(0,1)).replace(/\s/u,' ');
const blocks = new Set(['address','article','aside','blockquote','caption','dd','div','dl','dt','figcaption',
  'figure','footer','h1','h2','h3','h4','h5','h6','header','li','main','ol','p','pre','section','table','td','th','ul']);
const tokens = (value: unknown): string => (Array.isArray(value) ? value.join(' ') : String(value ?? '')).trim().replace(/\s+/gu,' ');
function appendText(parts: Part[], text: string) {
  if (!text) return;
  const last = parts.length - 1;
  if (typeof parts[last] === 'string') parts[last] += text;
  else parts.push(text);
}

/** In HTML normal flow, an ASCII whitespace run collapses; whitespace at a hard
 * line edge is not painted. Preserve every hard break, non-breaking space,
 * punctuation mark and the full text between breaks and inline equations. */
function visibleParts(parts: Part[]): Part[] {
  return parts.flatMap((part,i): Part[] => {
    if (typeof part !== 'string') return [part];
    let text = part.replace(/[ \t\n\r\f]+/g,' ');
    if (i === 0 || parts[i-1]?.[0] === 'break') text = text.replace(/^ /,'');
    if (i === parts.length-1 || parts[i+1]?.[0] === 'break') text = text.replace(/ $/,'');
    return text ? [text] : [];
  });
}

export function clipboardMathInventory(tree: Root, originals?: WeakMap<Element,Element>, restore = (s: string) => s): Inventory {
  const equations: Equation[] = [], boundaries: Boundary[] = [], tables: unknown[][] = [], mathLines: Part[][] = [];
  const distinctBodies = new WeakSet<Element>();
  let flow: Part[] = [], hasInlineOrBreak = false;
  const flush = () => {
    if (hasInlineOrBreak) mathLines.push(visibleParts(flow));
    flow = []; hasInlineOrBreak = false;
  };
  const visit = (node: RootContent, siblings: RootContent[], i: number, table?: unknown[], cell?: Part[]): void => {
    if (node.type === 'text') {
      const value = restore(node.value);
      appendText(flow,value);
      if (cell) appendText(cell,value);
      return;
    }
    if (node.type !== 'element') return;
    const el = originals?.get(node) ?? node;
    const annotation = originals && el.properties.dataPfMath === undefined ? readHtmlMathSource(el) : null;
    const mode = annotation ? (annotation.display ? 'display' : 'inline') : el.properties.dataPfMath ?? (el.tagName === 'code' && el.properties.dataPfFormula);
    if (mode === 'inline' || mode === 'display') {
      const tex = annotation?.tex ?? String(el.properties.dataTex ?? el.children.map(c => c.type === 'text' ? c.value : '').join(''));
      const eq: Equation = [mode,tex];
      equations.push(eq); flow.push(eq);
      if (mode === 'inline') hasInlineOrBreak = true;
      const previous = siblings[i-1], next = siblings[i+1];
      const sensitiveInline = mode === 'inline' && /^\s|\s$|[`$]/u.test(tex);
      boundaries.push({
        left: sensitiveInline && previous?.type === 'text' ? edge(restore(previous.value),true) : undefined,
        right: sensitiveInline && next?.type === 'text' ? edge(restore(next.value),false) : undefined,
      });
      cell?.push(eq);
      return;
    }
    const tag = el.tagName;
    if (tag === 'br') {
      flow.push(['break']); cell?.push(['break']); hasInlineOrBreak = true; return;
    }
    if (blocks.has(tag)) flush();
    if (tag === 'table') {
      cell?.push(['table']); cell = undefined; table = []; tables.push(table);
      const bodies = el.children.filter((n): n is Element => n.type === 'element' && n.tagName === 'tbody');
      if (bodies.length > 1) for (const body of bodies) distinctBodies.add(body);
    }
    const group = tag === 'colgroup' || tag === 'tfoot' || distinctBodies.has(el);
    if (group || tag === 'col') table?.push([tag, el.properties.span ?? 1]);
    if (tag === 'tr') table?.push('row');
    const isCell = tag === 'td' || tag === 'th' || tag === 'caption';
    if (isCell) cell = [];
    el.children.forEach((child, index) => visit(child,el.children,index,table,cell));
    if (isCell) {
      const p = el.properties;
      table?.push([tag, p.colSpan ?? 1, p.rowSpan ?? 1, p.scope ?? '', tokens(p.headers), p.id ?? '', p.abbr ?? '', visibleParts(cell!)]);
    }
    if (group) table?.push(['end',tag]);
    if (blocks.has(tag)) flush();
  };
  tree.children.forEach((node,i)=>visit(node,tree.children,i));
  flush();
  return {equations,boundaries,tables,mathLines};
}

export function clipboardMathMatches(expected: Inventory, markdown: string): boolean {
  const parsed = parseMarkdown(markdown);
  const formula: Handler = (_state, node) => ({
    type: 'element', tagName: 'code', properties: {dataPfFormula: node.type === 'math' || node.data?.pfDisplay ? 'display' : 'inline'},
    children: [{type:'text', value:node.value}],
  });
  const tree = toHast(parsed.tree,{allowDangerousHtml:true,handlers:{math:formula,inlineMath:formula}});
  const actual = clipboardMathInventory(normalize.runSync(tree as Root) as Root, undefined, restorerFor(parsed.scan));
  if (JSON.stringify(expected.equations) !== JSON.stringify(actual.equations) ||
      JSON.stringify(expected.tables) !== JSON.stringify(actual.tables) ||
      JSON.stringify(expected.mathLines) !== JSON.stringify(actual.mathLines)) return false;
  return expected.boundaries.every((wanted,i) => {
    const found = actual.boundaries[i]!;
    return (wanted.left === undefined || wanted.left === found.left) &&
      (wanted.right === undefined || wanted.right === found.right);
  });
}
