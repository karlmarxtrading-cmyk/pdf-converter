/** Expected representations are taken from the trusted KaTeX slot before document
 * composition. An input attribute can never install a reference. The key is the
 * independently parsed source TeX and display mode, not a rendered element's ID. */
export interface SourceFormula { tex: string; raw: string; display: boolean }
export type FormulaReference = { markup: string; fallback: boolean };
export type FormulaReferences = Map<string, FormulaReference>;
export const formulaKey = (tex: string, display: boolean): string => (display ? 'D' : 'I') + tex;
const referencesByBody = new WeakMap<object, FormulaReferences>();
const emptyReferences: FormulaReferences = new Map();

export function retainFormulaReferences(body: object, references: FormulaReferences): void {
  referencesByBody.set(body, references);
}

export function formulaReferences(body?: object): FormulaReferences {
  return body && referencesByBody.get(body) || emptyReferences;
}

/** Accept provenance from a compiler slot only if it contains both branches
 * and an exact TeX annotation, or the complete, visible fallback. */
export function compiledReference(el: Element, tex: string, display: boolean, fallback: boolean): FormulaReference | undefined {
  if (fallback) {
    const d = display ? '$$' : '$';
    const code = el.firstElementChild;
    if (el.childNodes.length !== 1 || !code?.matches('code.pf-math-src') || code.children.length || code.textContent !== d+tex+d) return;
  } else {
    const annotation = el.querySelector('.katex-mathml math semantics annotation[encoding="application/x-tex"]');
    const visual = el.querySelector('.katex-html[aria-hidden="true"]');
    if (!annotation || annotation.textContent !== tex || !visual?.firstElementChild) return;
  }
  return {markup:el.innerHTML, fallback};
}

/** A prepared display formula adds exactly one accessible scrolling wrapper.
 * The enclosed, serialized KaTeX subtree must match in its entirety, including
 * operators, invisible layout rules, MathML, annotation and SVG drawing data. */
export function formulaMatches(el: Element, expected: SourceFormula, refs: FormulaReferences): boolean {
  const {tex, raw, display} = expected;
  const ref = refs.get(formulaKey(tex, display));
  if (!ref || el.getAttribute('data-tex') !== tex || (el.getAttribute('data-source-tex') ?? tex) !== raw ||
      el.classList.contains('pf-math-display') !== display || el.classList.contains('pf-math-inline') === display ||
      el.classList.contains('pf-math-error') !== ref.fallback) return false;
  const box = el.firstElementChild;
  const root = display && el.childNodes.length === 1 && box?.classList.contains('pf-math-block') ? box : el;
  return root.innerHTML === ref.markup;
}
