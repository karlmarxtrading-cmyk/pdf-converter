// PF-R4-06: PDF text assertions retain signs and verify prose adjacent to formula/figure nodes.
// This is an inspection helper, not a PDF renderer. A successful text check is not visual math proof.
export const UNBUNDLED_TEXT = /[\uE000-\uF8FF\u{F0000}-\u{10FFFF}\p{Emoji_Presentation}\uFE0F]|\u200D|\p{Emoji_Modifier}/gu;

export function normalizePdfText(s, omitUnsupported = false) {
  let text = s.normalize('NFC').toLowerCase();
  if (omitUnsupported) text = text.replace(UNBUNDLED_TEXT, '');
  // Preserve ASCII hyphen/minus and U+2212: dropping them hides changes to negative quantities.
  return text.replace(/[\s\u00ad\u200b]/g, '');
}

/** One complete extraction order must match; never switch between logical/raw streams mid-page. */
export function orderedTextCheck(expected, candidates, omitUnsupported = false) {
  const wanted = expected.map(x => normalizePdfText(typeof x === 'string' ? x : x.text, omitUnsupported)).filter(Boolean);
  let best = { pass: false, matched: 0, total: wanted.length, mode: null, firstMissing: wanted[0] ?? null };
  for (const [mode, text] of Object.entries(candidates)) {
    const actual = normalizePdfText(text, omitUnsupported);
    let cur = 0, matched = 0;
    for (const value of wanted) {
      const at = actual.indexOf(value, cur);
      if (at < 0) break;
      cur = at + value.length; matched++;
    }
    const result = { pass: matched === wanted.length, matched, total: wanted.length, mode, firstMissing: wanted[matched] ?? null };
    if (result.pass) return result;
    if (matched > best.matched) best = result;
  }
  return best;
}

/** Serializable into browser evaluate; uses the actual paginated DOM there. */
export function pdfFragments() {
  const pages = [...document.querySelectorAll('.pagedjs_page')];
  const prose = (root) => {
    const parts = []; let current = '';
    const flush = () => { if (current.trim()) parts.push(current.trim()); current = ''; };
    const walk = (node) => {
      if (node.nodeType === 3) { current += node.nodeValue ?? ''; return; }
      if (node.nodeType !== 1) return;
      if (node.matches('.pf-math, .katex, math, img, svg, [data-pf-repeat], sup[data-footnote-ref], .pf-ui-label')) { flush(); return; }
      if (node.tagName === 'BR') { current += '\n'; return; }
      for (const child of node.childNodes) walk(child);
    };
    walk(root); flush(); return parts;
  };
  return pages.map(pg => {
    const area = pg.querySelector('.pagedjs_page_content');
    if (!area) return { blocks: [], cells: [], formulas: 0, images: 0 };
    const blocks = [], cells = [];
    for (const el of area.querySelectorAll('[data-block-id]')) {
      if (el.parentElement?.closest('[data-block-id]')) continue;
      const id = el.getAttribute('data-block-id');
      const c = el.cloneNode(true);
      c.querySelectorAll('.katex-mathml, annotation, [data-pf-repeat], sup[data-footnote-ref], .pf-ui-label').forEach(n => n.remove());
      if (el.tagName === 'TABLE') {
        if (c.caption) for (const text of prose(c.caption)) blocks.push({ id, text });
        for (const td of c.querySelectorAll('td, th')) cells.push(...prose(td));
        continue;
      }
      if (el.tagName === 'UL' || el.tagName === 'OL') {
        for (const li of c.querySelectorAll('li')) {
          const x = li.cloneNode(true); x.querySelectorAll('ul, ol').forEach(n => n.remove());
          for (const text of prose(x)) blocks.push({ id, text });
        }
        continue;
      }
      for (const text of prose(c)) blocks.push({ id, text });
    }
    return { blocks, cells, formulas: area.querySelectorAll('.pf-math').length, images: area.querySelectorAll('img').length,
      label: JSON.parse(pg.style.getPropertyValue('--pf-pnum') || '""'), cover: pg.classList.contains('pagedjs_pf-cover_page') };
  });
}
