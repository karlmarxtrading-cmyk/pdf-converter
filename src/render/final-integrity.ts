import { loadPrintProjection } from './print-projection';
import type { Snapshot, RenderedBody } from '../core/contracts';
import { checkedSourceReport, checkRenderIntegrity, integrityExpectation, type IntegrityExpectation, type IntegrityReport } from '../core/integrity';
import { compiledReference, formulaKey, formulaReferences, type FormulaReferences } from '../core/formula-integrity';
import { verifyFormulaRepresentations } from '../core/article-integrity';

/** Reuse a source projection only for the exact frozen inputs. A change to the
 * source or conversation invalidates the entry even for a caller reusing a body. */
const sourceModels = new WeakMap<RenderedBody, {source: string; conversationKey: string; model: IntegrityExpectation; modelKey:string; fallback?:true; checkedHtml?:string; report?:IntegrityReport}>();
/** A cancelled large export must release its source projection as soon as the
 * print job releases the DOM. A retry reconstructs it from the intact source. */
export function releaseSourceProjection(body: RenderedBody): void {
  sourceModels.delete(body);
}

export async function sourceCheck(snapshot: Snapshot, body: RenderedBody, largePrint?: {signal?:AbortSignal}) {
  const conversationKey = JSON.stringify(snapshot.conversation ?? null);
  let saved = sourceModels.get(body);
  if (!saved || saved.source !== snapshot.source || saved.conversationKey !== conversationKey) {
    let projection: {model:IntegrityExpectation; modelKey:string; fallback?:true};
    if (largePrint) projection = await loadPrintProjection(snapshot,largePrint.signal);
    else {
      const model=integrityExpectation(snapshot.source,{conversation:snapshot.conversation});
      projection={model,modelKey:JSON.stringify(model)};
    }
    saved = {source:snapshot.source, conversationKey, ...projection};
    sourceModels.set(body,saved);
  }
  const entry = saved;
  const expected = saved.model;
  let refs = formulaReferences(body);
  // Handles a restored/API-supplied RenderedBody with no live renderer object
  // identity. Derive reference bytes from locked KaTeX, never from input HTML.
  const missing = expected.blocks.flatMap(block => block.formulas ?? []).filter(f => !refs.has(formulaKey(f.tex,f.display)));
  if (missing.length) {
    refs = new Map(refs);
    const {renderTex} = await import('../core/tex-renderer');
    const slot = document.createElement('span');
    for (const f of missing) {
      const key = formulaKey(f.tex,f.display);
      if (refs.has(key)) continue;
      const compiled = renderTex(f.tex,f.display);
      slot.innerHTML = compiled.html;
      const ref = compiledReference(slot,f.tex,f.display,!compiled.ok);
      if (ref) refs.set(key,ref);
    }
  }
  return {
    expected, refs, fallback:saved.fallback, hasMath:expected.blocks.some(b => b.formulas?.length),
    check: (root: HTMLElement) => {
      if (entry.report && entry.checkedHtml === body.html) return structuredClone(entry.report);
      const report = checkedSourceReport(snapshot.source,body,conversationKey,entry.modelKey) ??
        checkRenderIntegrity(snapshot.source,root,{conversation:snapshot.conversation, expected, references:refs});
      if (report.ok) { entry.checkedHtml=body.html; entry.report=structuredClone(report); }
      return report;
    },
  };
}

export interface FinalArticleInput {
  articleInner: string;
  expected: IntegrityExpectation;
  refs: FormulaReferences;
}

/** Verify final parsed bytes against the source-checked body and the exact
 * markup produced by the trusted template, including navigation and labels.
 * Unknown extra nodes cannot exempt themselves with classes or attributes. */
export function finalArticleMatches(root: ParentNode, input: FinalArticleInput): boolean {
  const articles = root.querySelectorAll('main.pf-main > article#pf-content');
  if (articles.length !== 1) return false;
  const article = articles[0]!;
  const actual = article.innerHTML;
  if (actual !== input.articleInner) {
    // Normalize only HTML serialization (e.g. a literal generated ampersand or
    // void tags); parse in a detached article, never strip any text or elements.
    const reference = article.ownerDocument.createElement('article');
    reference.innerHTML = input.articleInner;
    if (actual !== reference.innerHTML) return false;
  }
  return !verifyFormulaRepresentations(article,input.expected.blocks,input.refs).length;
}
