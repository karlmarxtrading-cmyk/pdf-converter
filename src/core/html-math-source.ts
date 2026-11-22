/** Pure HAST math source recovery shared by clipboard and raw HTML rendering.
 * It reads only explicit TeX metadata; it never evaluates scripts or reconstructs missing equations.
 * Callers must exclude code ancestors and retain their normal sanitization and admission guards.
 */
import type { Element } from 'hast';
import { scanMath, type MathSpan } from './math';

const CODE_TAGS = new Set(['pre', 'code', 'kbd', 'samp']);
function cls(el: Element): string[] { const c: unknown = el.properties?.className; return Array.isArray(c) ? c.map(String) : typeof c === 'string' ? c.split(/\s+/) : []; }

const TEX_ANNOTATION_TYPES = new Set(['application/x-tex', 'application/x-latex', 'text/latex', 'text/x-tex', 'text/x-latex']);
const TEX_SOURCE_TAGS = new Set(['span', 'div', 'math', 'mjx-container', 'mjx-math', 'math-inline', 'math-display']);
const MATH_CLASSES = new Set(['katex', 'katex-display', 'math', 'math-inline', 'math-display', 'math-block', 'MathJax', 'MathJax_Display', 'MathJax_SVG', 'MathJax_CHTML']);

/** RC6-CLIP02: MathJax uses display="true"; editor exports may use a named data type. */
function isDisplayMath(el: Element): boolean {
  const p = el.properties;
  const display = (v: unknown) => v === true || /^(?:true|block|display|1)$/i.test(String(v ?? '').trim());
  return cls(el).some(c => ['katex-display', 'math-display', 'math-block', 'MathJax_Display'].includes(c)) ||
    el.tagName === 'math-display' || display(p.display) || display(p.dataDisplay) || display(p.dataDisplayMode) ||
    /^(?:block-math|math-block|display-math|math-display)$/i.test(String(p.dataType ?? ''));
}

/** Explicit source attributes are data, never code. Only known math-capable containers qualify. */
function sourceAttribute(el: Element): { tex: string; display?: boolean; span?: MathSpan } | null {
  if (!TEX_SOURCE_TAGS.has(el.tagName)) return null;
  const raw = [el.properties.dataLatex, el.properties.dataTex].find(v => typeof v === 'string' && v.trim());
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  const scan = scanMath(trimmed);
  const span = scan.spans.length === 1 ? scan.spans[0] : undefined;
  return span?.start === 0 && span.end === trimmed.length ? { tex: span.renderTex ?? span.tex, display: span.display, span } : { tex: raw };
}

function mathAnnotations(el: Element): Element[] {
  const found: Element[] = [];
  const walk = (n: Element) => {
    for (const c of n.children) {
      if (c.type === 'element') {
        if (CODE_TAGS.has(c.tagName)) continue;
        if (c.tagName === 'annotation' && TEX_ANNOTATION_TYPES.has(String(c.properties?.encoding ?? '').split(';')[0]!.trim().toLowerCase())) {
          found.push(c);
        } else walk(c);
      }
    }
  };
  walk(el);
  return found;
}

// A metadata-bearing leaf may carry one alternate visual label. Once the
// wrapper has siblings or semantic children, its metadata does not own them.
export function isMathPresentationBranch(el: Element): boolean {
  if (['math', 'svg', 'mjx-math', 'mjx-assistive-mml'].includes(el.tagName)) return true;
  if (el.tagName !== 'span' || !cls(el).some(c => c === 'katex-html' || c === 'katex-mathml')) return false;
  const presentation = (branch: Element): boolean => branch.children.every(child =>
    child.type !== 'element' || ['math','svg'].includes(child.tagName) ||
    (child.tagName === 'span' && !isHtmlMathContainer(child) && presentation(child)));
  return presentation(el);
}

function plainLabel(node: Element['children'][number]): string | undefined {
  if (node.type === 'text') return node.value;
  if (node.type !== 'element' || node.tagName !== 'span' || Object.keys(node.properties).length) return undefined;
  const labels = node.children.map(plainLabel);
  return labels.every(s => s !== undefined) ? labels.join('') : undefined;
}

export function hasSeparateMathContent(el: Element): boolean {
  const content = el.children.filter(c => c.type !== 'comment' && !(c.type === 'text' && !c.value.trim()));
  if (!content.length || content.every(c => c.type === 'element' && isMathPresentationBranch(c))) return false;
  if (content.length !== 1) {
    const labels = content.map(plainLabel);
    // Some editors wrap every token in its own inert span.
    return !labels.every(t => t !== undefined) || labels.join('').trim() !== sourceAttribute(el)?.tex.trim();
  }
  const child = content[0]!;
  const label = plainLabel(child);
  if (label === undefined) return true;
  // Readers may supply a single alternate label, such as x² for x^2. A
  // multi-word string can also contain independent prose. Keep it for review.
  const tex = sourceAttribute(el)?.tex;
  return /\s/u.test(label.trim()) && label.trim() !== tex?.trim();
}

/** On a mixed wrapper only an unadorned child with the exact source label
 * can be identified as the visual formula. Preserve siblings in position.
 * Without a unique match, keep all children and leave the metadata for review.
 * Called on ephemeral parsed trees; the original HTML is never written. */
export function recoverMixedMathChild(el: Element): void {
  if (!isHtmlMathContainer(el) || !hasSeparateMathContent(el) || hasHtmlMathAnnotation(el)) return;
  const attr = sourceAttribute(el);
  if (!attr) return;
  const labels = el.children.filter(c => plainLabel(c) === attr.tex);
  if (labels.length !== 1) return;
  const label = labels[0]!;
  const properties = { dataLatex: String(el.properties.dataLatex || el.properties.dataTex),
    dataDisplay: attr.display ?? isDisplayMath(el) };
  const branch: Element = {type: 'element', tagName: 'span', properties,
    children: label.type === 'element' ? label.children : [label], position: label.position};
  el.children[el.children.indexOf(label)] = branch;
}

/** A rejected source-bearing wrapper must not later be discarded as a source-free visual duplicate. */
export function hasHtmlMathAnnotation(el: Element): boolean { return mathAnnotations(el).length > 0; }

export function findHtmlMathAnnotation(el: Element): string | null {
  const annotations = mathAnnotations(el);
  // RC6-CLIP08: a broad "math" wrapper may contain prose and several independent equations.
  // Only an isolated equation may replace its enclosing element.
  if (annotations.length !== 1) return null;
  const annotation = annotations[0]!;
  // An annotation stores source code. Preserve its whitespace.
  const literal = (n: Element): string => n.children.map(child => child.type === 'text' ? child.value : child.type === 'element' ? literal(child) : '').join('');
  const tex = literal(annotation);
  const representationOnly = (n: Element, parent?: Element): boolean => {
    if (CODE_TAGS.has(n.tagName)) return false;
    if (n === annotation || isMathPresentationBranch(n)) return true;
    // Older producers omit the katex-html class on their hidden visual span.
    // Its label must agree with the annotation or be a single math symbol.
    if (parent && cls(parent).includes('katex') && n.tagName === 'span' && String(n.properties.ariaHidden) === 'true') {
      const labels = n.children.map(plainLabel);
      const value = labels.join('').replace(/\s+/gu, '');
      if (labels.every(label => label !== undefined) && (value === tex.replace(/\s+/gu, '') || /^\p{Sm}$/u.test(value))) return true;
    }
    return n.children.every(c => c.type === 'comment' || (c.type === 'text' ? !c.value.trim() : c.type === 'element' && representationOnly(c,n)));
  };
  return representationOnly(el) ? tex : null;
}


export interface HtmlMathSource {
  tex: string;
  display: boolean;
  origin: 'annotation' | 'source-attribute' | 'alttext';
  /** Original matched source when a data attribute itself carried copied math delimiters. */
  span?: MathSpan;
}

/** Supported containers only: arbitrary data attributes on links, code or scripts are not math. */
export function isHtmlMathContainer(el: Element): boolean {
  if (!TEX_SOURCE_TAGS.has(el.tagName)) return false;
  return cls(el).some(c => MATH_CLASSES.has(c)) ||
    ['math', 'mjx-container', 'math-inline', 'math-display'].includes(el.tagName) ||
    (TEX_SOURCE_TAGS.has(el.tagName) && [el.properties.dataLatex, el.properties.dataTex].some(v => typeof v === 'string' && !!v.trim()));
}

export function readHtmlMathSource(el: Element): HtmlMathSource | null {
  if (!isHtmlMathContainer(el)) return null;
  const display = isDisplayMath(el);
  const annotation = findHtmlMathAnnotation(el);
  if (annotation !== null) return { tex: annotation, display, origin: 'annotation' };
  if (hasHtmlMathAnnotation(el)) return null;
  const attr = sourceAttribute(el);
  if (attr && !hasSeparateMathContent(el)) return { tex: attr.tex, display: attr.display ?? display, origin: 'source-attribute', ...(attr.span ? { span: attr.span } : {}) };
  const alt = el.tagName === 'math' ? String(el.properties.alttext ?? '') : '';
  if (alt && /\\[A-Za-z]+|[\^_{}]/.test(alt)) return { tex: alt, display, origin: 'alttext' };
  return null;
}
