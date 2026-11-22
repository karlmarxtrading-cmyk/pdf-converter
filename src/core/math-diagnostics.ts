import { scanMath } from './math';
import { looksLikeCopiedMath } from './math-copy';
import { mkIssue, type CoreIssue } from './util';

export interface MathRecovery { line: number; tex: string; sourceTex: string; adaptations: string[] }

/** Display-only adaptations are disclosed; original source is retained on each formula. */
export function mathRecoveryIssues(recoveries: MathRecovery[]): CoreIssue[] {
  if (!recoveries.length) return [];
  const body = recoveries.filter(r => r.adaptations.some(a => a !== 'copied-delimiters'));
  const types = [...new Set(recoveries.flatMap(r => r.adaptations))];
  const samples = (body.length ? body : recoveries).slice(0, 3).map(r => ({
    line: r.line, before: r.sourceTex.slice(0, 180), after: r.tex.slice(0, 180), adaptations: r.adaptations,
  }));
  return [mkIssue('MATH_COPY_RECOVERED', body.length ? 'warning' : 'info', 'math', {
    id: `${recoveries.length} rumus dikenali dari format salinan. ${body.length ? `${body.length} rumus juga memerlukan pemulihan indeks atau pemisah baris; periksa tampilannya. ` : ''}Sumber asli tetap disimpan; pemulihan hanya dipakai untuk tampilan.`,
    en: `${recoveries.length} formulas were recognized from copied formatting. ${body.length ? `${body.length} formulas also needed subscript or row-separator recovery; review their appearance. ` : ''}The original source is retained; recovery is used only for display.`,
  }, { line: recoveries[0]!.line, detail: { count: recoveries.length, bodyAdaptations: body.length, types, samples: samples.map(s => JSON.stringify(s)) } })];
}

const INLINE = new Set(['a', 'abbr', 'b', 'cite', 'del', 'dfn', 'em', 'i', 'ins', 'mark', 'q', 's', 'small', 'span', 'strong', 'sub', 'sup', 'u', 'var']);
const EXCLUDED = new Set(['pre', 'code', 'kbd', 'samp', 'script', 'style', 'img']);

/** A separate output check catches missed/unsupported TeX instead of a false 'ready'. */
export function residualMathIssues(body: HTMLElement): CoreIssue[] {
  const samples: { line?: number; snippet: string }[] = [];
  let count = 0;
  const tex = /\\(?:frac|dfrac|tfrac|sqrt|boxed|sum|prod|int|iint|lim|theta|alpha|beta|gamma|pi|sin|cos|tan|arcsin|arccos|arctan)\b|\\(?:begin|end)\{(?:equation\*?|align\*?|aligned|gather\*?|gathered|cases|[pbBvV]?matrix|array|split)\}/;
  // Read each inline text flow once. Links and emphasis contribute their visible labels;
  // block boundaries, code, images and already rendered equations terminate the flow.
  let parts: string[] = [], first: Node | undefined;
  const flush = () => {
    if (!parts.length) return;
    const value = parts.length === 1 ? parts[0]! : parts.join('');
    let offset = value.search(tex);
    if (offset < 0 && parts.length > 1 && (value.includes('\\(') || value.includes('\\[') || value.includes('$'))) {
      // On escaped dollars the rendered text has lost the Markdown escape. Only
      // diagnose pairs that actually cross a DOM boundary and look mathematical.
      const positions: number[] = [];
      let end = 0;
      for (const part of parts) { end += part.length; positions.push(end); }
      const spans = scanMath(value).spans;
      let boundary = 0;
      for (const span of spans) {
        while (boundary < positions.length && positions[boundary]! <= span.start) boundary++;
        if (boundary < positions.length && positions[boundary]! < span.end && looksLikeCopiedMath(span.tex)) {
          offset = span.start;
          break;
        }
      }
    }
    if (offset >= 0) {
      count++;
      if (samples.length < 5) {
        const ref = first?.parentElement?.closest('[data-line]');
        const line = Number(ref?.getAttribute('data-line')) || undefined;
        samples.push({ ...(line ? { line } : {}), snippet: value.slice(Math.max(0, offset - 24), offset + 136).trim() });
      }
    }
    parts = [];
    first = undefined;
  };
  const walk = (node: Node): void => {
    if (node.nodeType === 3) {
      const value = node.nodeValue;
      if (value) { first ??= node; parts.push(value); }
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    if (EXCLUDED.has(el.localName) || el.classList.contains('pf-math') || el.classList.contains('pf-ui-label')) { flush(); return; }
    const block = !INLINE.has(el.localName);
    if (block) flush();
    for (let child = node.firstChild; child; child = child.nextSibling) walk(child);
    if (block) flush();
  };
  walk(body);
  if (!count) return [];
  return [mkIssue('MATH_UNRENDERED_SOURCE', 'warning', 'math', {
    id: `${count} bagian masih memuat perintah atau pembatas rumus dalam teks. Periksa delimiter, blok HTML, atau perintah yang belum didukung. Gunakan backtick bila teks tersebut memang contoh kode.`,
    en: `${count} text segments still contain mathematical commands or delimiters. Review delimiters, HTML blocks, or unsupported commands. Use backticks if they are intentional code examples.`,
  }, { ...(samples[0]?.line ? { line: samples[0].line } : {}), detail: { count, samples: samples.map(s => JSON.stringify(s)) } })];
}
