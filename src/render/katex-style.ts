import { KATEX_FONT_INFO } from './font-coverage.generated';

// These rules control visible fractions, vertical layout, display math and the hidden accessible copy.
// They come from the minified stylesheet shipped by the locked KaTeX package.
const requiredRules: [string, string][] = [
  ['.katex', 'KaTeX_Main'],
  ['.katex-display', 'display:block'],
  ['.katex .vlist-t', 'display:inline-table'],
  ['.katex .mfrac .frac-line', 'border-bottom-style:solid'],
  ['.katex .katex-mathml', 'position:absolute'],
  ['.katex .katex-mathml', 'overflow:hidden'],
  ['.katex .katex-version:after', `content:"${KATEX_FONT_INFO.version}"`],
];

/** Only trusted, generated document styles are checked here. */
export function hasKatexLayout(css: string): boolean {
  for (const [selector, declaration] of requiredRules) {
    const start = css.indexOf(selector + '{');
    if (start === -1) return false;
    const end = css.indexOf('}', start + selector.length + 1);
    if (end === -1 || !css.slice(start + selector.length + 1, end).includes(declaration)) return false;
  }
  return true;
}
