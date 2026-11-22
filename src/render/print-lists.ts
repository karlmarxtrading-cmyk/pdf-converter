/** Paged.js starts each page's ol at an ascending offset and ignores li resets.
 * Resolve those native HTML ordinals on the layout copy before it is split. */
export function preservePrintListOrdinals(root: ParentNode): void {
  let itemId = 0;
  for (const list of root.querySelectorAll('ol, ul')) {
    const items = Array.from(list.children).filter((el): el is HTMLLIElement => el.localName === 'li');
    if (list.localName === 'ul') {
      for (const item of items) if (list.hasAttribute('type') || item.hasAttribute('type')) item.dataset.pfListItem = String(++itemId);
      continue;
    }
    const orderedList = list as HTMLOListElement;
    if (!orderedList.reversed && !list.hasAttribute('type') && !list.hasAttribute('start') && !items.some(item => item.hasAttribute('value') || item.hasAttribute('type'))) continue;
    const step = orderedList.reversed ? -1 : 1;
    let ordinal = list.hasAttribute('start') ? orderedList.start : orderedList.reversed ? items.length : 1;
    for (const item of items) {
      item.dataset.pfListItem = String(++itemId);
      if (item.hasAttribute('value')) ordinal = item.value;
      else item.value = ordinal;
      ordinal += step;
    }
  }
}

/** Ignore only a matching continuation of the same physical item when a page
 * boundary passes through it. A changed marker in a later fragment still fails. */
export function collectPrintListMarkers(root: Element, out: string[], seen: Map<string,string>): void {
  for (const item of root.querySelectorAll<HTMLElement>('[data-pf-list-item]')) {
    const list = item.parentElement;
    const key = item.dataset.pfListItem!;
    const parentItem = list?.closest<HTMLElement>('[data-pf-list-item]');
    const marker = JSON.stringify([key, parentItem?.dataset.pfListItem ?? null, item.localName,
      list?.localName, list?.getAttribute('type'), list?.hasAttribute('reversed'), item.getAttribute('value'), item.getAttribute('type')]);
    const ref = item.dataset.ref;
    if (!(ref && item.dataset.splitFrom === ref && seen.get(key) === marker)) out.push(marker);
    seen.set(key,marker);
  }
}
