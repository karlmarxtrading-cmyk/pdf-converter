import katex from 'katex';
import { LIMITS } from './limits';
import { escapeHtml } from './util';

export interface KatexResult { ok: boolean; html: string; error?: string }

/** KaTeX dengan trust:false, maxExpand terbatas; kegagalan → fallback terlihat berisi sumber. */
export function renderTex(tex: string, display: boolean): KatexResult {
  if (tex.length > LIMITS.mathChars) {
    return { ok: false, error: `MATH_TOO_LONG:${tex.length}`, html: fallbackHtml(tex, display) };
  }
  try {
    const html = katex.renderToString(tex, { displayMode: display, throwOnError: true, output: 'htmlAndMathml', trust: false, strict: 'ignore', maxExpand: 1000, maxSize: 50 });
    return { ok: true, html };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e).slice(0, 300), html: fallbackHtml(tex, display) };
  }
}

function fallbackHtml(tex: string, display: boolean): string {
  const d = display ? '$$' : '$';
  return `<code class="pf-math-src">${escapeHtml(d + tex + d)}</code>`;
}
