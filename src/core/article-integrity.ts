import type { Conversation } from './contracts';
import { docLabels } from '../render/labels';
import { speakerDisplay } from './render';
import { formulaMatches, type FormulaReferences } from './formula-integrity';
import type { BlockModel } from './markdown';
import { mkIssue, type CoreIssue } from './util';

const issue = (code: string, id: string, en: string, blockId?: string) =>
  mkIssue(code, 'error', 'integrity', {id, en}, {blocking:true, ...(blockId ? {blockId} : {})});

/** Source blocks may sit inside a split raw-HTML wrapper or a conversation.
 * Descend through containers. Never discard their text by class or by a
 * user-supplied data-pf-generated attribute. Only exact generated labels
 * whose owner exists in the source are eligible for an exemption. */
export function articleCoverage(root: Element, blocks: BlockModel[], conversation?: Conversation): CoreIssue[] {
  if (!root.hasChildNodes()) return [];
  const sourceIds = new Map(blocks.map(b => [b.id,b]));
  const referencedNotes = new Set(blocks.flatMap(b => b.fnRefs.map(label => label.toLowerCase())));
  const found = new Set<string>();
  for (const el of root.querySelectorAll('[data-block-id]')) {
    const id = el.getAttribute('data-block-id')!;
    const model = sourceIds.get(id);
    // A source identifier is not a permit to publish arbitrary content.
    // Definitions are non-emitting, and a horizontal rule has no prose.
    const unexpected = !model || model.kind === 'definition' ||
      (model.kind === 'html' && !model.rawHtml && !model.rawTableHtml) ||
      (model.kind === 'footnoteDefinition' && !referencedNotes.has((model.fnLabel ?? '').toLowerCase())) ||
      (model.kind === 'thematicBreak' && (el.localName !== 'hr' || el.hasChildNodes()));
    if (unexpected || found.has(id) || el.parentElement?.closest('[data-block-id]')) {
      return [issue('INTEGRITY_ARTICLE_BLOCK', 'ID blok tambahan, berulang atau bersarang di luar model sumber.', 'Unexpected, duplicate or nested block ID outside the source model.', id)];
    }
    found.add(id);
  }
  const footnotes = blocks.some(b => b.kind === 'footnoteDefinition');
  const owners = new Set<Element>();
  const labels = [docLabels('id'), docLabels('en')];
  function accounted(node: Node): boolean {
    if (node.nodeType === 3) return !node.nodeValue?.trim();
    if (node.nodeType !== 1) return true;
    const el = node as Element;
    if (el.hasAttribute('data-block-id')) return true;
    const parent = el.parentElement;
    if (parent && !owners.has(parent)) {
      if (footnotes && el.matches('h2.sr-only') && el.id.endsWith('footnote-label') &&
          parent.matches('section[data-footnotes]') && parent.firstElementChild === el &&
          labels.some(l => l.fn === el.textContent) && !el.children.length) {
        owners.add(parent); return true;
      }
      if (conversation?.outputMode === 'source-appendix' && el.matches('h2.pf-appendix-title') &&
          parent.matches('section.pf-appendix') && labels.some(l => l.appendix === el.textContent) &&
          parent.firstElementChild === el && !el.children.length) {
        owners.add(parent); return true;
      }
      if (conversation && el.matches('header.pf-msg-label') && parent.matches('section.pf-msg') && parent.firstElementChild === el) {
        const m = conversation.messages.find(msg => msg.selected && msg.id === parent.getAttribute('data-message-id'));
        if (m && (['id','en'] as const).some(lang => el.textContent === speakerDisplay(m,lang) + (m.timestamp ? ' ' + m.timestamp : ''))) {
          owners.add(parent); return true;
        }
      }
    }
    if (!el.children.length && !el.textContent?.trim()) return false;
    return Array.from(el.childNodes).every(accounted);
  }
  if (!Array.from(root.childNodes).every(accounted)) return [issue('INTEGRITY_ARTICLE_UNTRACKED',
    'Isi artikel di luar blok sumber atau label yang ditetapkan terdeteksi.', 'The article contains content outside its source blocks or authorized labels.')];
  return [];
}

export function verifyFormulaRepresentations(root: Element, blocks: BlockModel[], refs: FormulaReferences): CoreIssue[] {
  const byBlock = new Map<string, Element[]>();
  const nodes = root.getElementsByClassName('pf-math');
  for (const el of nodes) {
    const owner = el.closest('[data-block-id]')?.getAttribute('data-block-id') ?? '';
    const group = byBlock.get(owner);
    if (group) group.push(el); else byBlock.set(owner, [el]);
  }
  let count = 0;
  for (const block of blocks) {
    if (!block.formulas?.length) continue;
    const actual = byBlock.get(block.id) ?? [];
    // An unused footnote definition is intentionally omitted by the Markdown processor.
    if (block.kind === 'footnoteDefinition' && !actual.length && !blocks.some(b => b.fnRefs.some(ref => ref.toLowerCase() === block.fnLabel?.toLowerCase()))) continue;
    count += block.formulas.length;
    if (actual.length !== block.formulas.length || block.formulas.some((f,i) => !formulaMatches(actual[i]!,f,refs))) {
      return [issue('INTEGRITY_FORMULA_REPRESENTATION', 'Rumus, sumber TeX, mode atau hasil visual/MathML berbeda di blok sumber ini.',
        'Formula source, mode, visual markup or MathML differs in this source block.', block.id)];
    }
  }
  return count === nodes.length ? [] : [issue('INTEGRITY_FORMULA_UNEXPECTED', 'Rumus keluaran tidak memiliki pasangan pada sumber.', 'Output contains formulas without a source counterpart.')];
}
