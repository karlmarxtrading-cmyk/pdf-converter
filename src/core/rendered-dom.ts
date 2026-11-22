import type { RenderedBody } from './contracts';

/** The source tree is detached and each composition takes exclusive ownership.
 * The public body can be replaced by API clients; its exact bytes are the key. */
const sourceRoots = new WeakMap<RenderedBody, { html: string; root: HTMLElement; restored: boolean }>();

export function rememberRenderedRoot(body: RenderedBody, root: HTMLElement, restored = false): void {
  sourceRoots.set(body, { html: body.html, root, restored });
}
export function readRenderedRoot(body: RenderedBody): HTMLElement | undefined {
  const saved = sourceRoots.get(body);
  if (!saved || saved.html !== body.html) return;
  // An embedding application's previous verifyInput callback could retain a DOM reference.
  if (saved.restored && saved.root.innerHTML !== saved.html) return;
  return saved.root;
}

export function takeRenderedRoot(body: RenderedBody): HTMLElement | undefined {
  const root = readRenderedRoot(body);
  sourceRoots.delete(body);
  return root;
}

/** Most composition edits affect only wrappers or labels. Reversing those edits
 * saves reparsing all the KaTeX and table descendants on the next export.
 * Content comparison is mandatory before admitting a recovered tree.
 * Oversized bodies, large edit batches and unexpected DOM shapes use a fresh parse. */
export function recordComposition(body: RenderedBody, root: HTMLElement): (() => void) | undefined {
  // On small documents a fresh parse costs less than tracking and replaying
  // every wrapper mutation, including previews replaced by the next keystroke.
  if (body.html.length < 32_768 || body.html.length > 2_000_000 || typeof MutationObserver === 'undefined') return;
  const html = body.html;
  const changes: MutationRecord[] = [];
  let overflow = false;
  const collect = (batch: MutationRecord[]) => {
    if (changes.length + batch.length > 4096) {
      overflow = true;
      observer.disconnect();
      changes.length = 0;
    } else {
      changes.push(...batch);
    }
  };
  const observer = new MutationObserver(collect);
  observer.observe(root, {
    subtree: true, childList: true, attributes: true, attributeOldValue: true,
    characterData: true, characterDataOldValue: true,
  });
  return () => {
    collect(observer.takeRecords());
    observer.disconnect();
    if (overflow || body.html !== html) return;
    for (let i = changes.length - 1; i >= 0; i--) {
      const change = changes[i]!;
      const target = change.target;
      if (change.type === 'attributes') {
        if (change.attributeNamespace) return;
        const el = target as Element;
        if (change.oldValue === null) el.removeAttribute(change.attributeName!);
        else el.setAttribute(change.attributeName!, change.oldValue);
      } else if (change.type === 'characterData') {
        target.nodeValue = change.oldValue;
      } else {
        for (const node of change.addedNodes) {
          if (node.parentNode !== target) return;
          target.removeChild(node);
        }
        const anchor = change.nextSibling;
        if (anchor && anchor.parentNode !== target) return;
        for (const node of change.removedNodes) target.insertBefore(node, anchor);
      }
    }
    if (root.innerHTML === html) rememberRenderedRoot(body, root, true);
  };
}
