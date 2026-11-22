/** RC6-M01–M04: narrowly scoped recovery of Markdown-escaped TeX from AI copies.
 * Called only after a complete doubled delimiter pair has been recognized outside code.
 * Never unescape a document globally: TeX row separators and literal text have different rules.
 */
export type MathAdaptation = 'copied-delimiters' | 'copied-subscript' | 'copied-row-break' | 'copied-spacing';

/** A doubled slash may be an intentional CommonMark escape. Ordinary prose stays literal. */
export function looksLikeCopiedMath(tex: string): boolean {
  const s = tex.trim();
  if (!s) return false;
  if (/\\[A-Za-z]+/.test(s)) return true;
  const withoutFunctions = s.replace(/\b(?:sin|cos|tan|cot|sec|csc|log|ln|exp|max|min|lim|mod)\b/g, '');
  if (/^[\p{L}\p{N}([{]/u.test(s) && /[=+*/^_<>≤≥≠±∓−|-]/u.test(s) && !/[a-z]{3,}/.test(withoutFunctions)) return true;
  if (/^[A-Z]{2,4}$/.test(s) || /^[\p{L}](?:\s*,\s*[\p{L}])+$/u.test(s)) return true;
  if (/^[[(]\s*[+-]?(?:\d+(?:\.\d+)?|[\p{L}])\s*,\s*[+-]?(?:\d+(?:\.\d+)?|[\p{L}])\s*[\])]$/u.test(s)) return true;
  return /^[+-]?(?:\d+(?:[.,]\d+)?|[\p{L}])(?:[°′″])?$/u.test(s);
}

/** Ranges containing literal text/URLs are not mathematical subscript candidates. */
function literalRanges(tex: string): [number, number][] {
  const ranges: [number, number][] = [];
  const command = /\\(?:text[A-Za-z]*|mbox|operatorname|url|href)\*?\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = command.exec(tex))) {
    let depth = 1, end = command.lastIndex;
    while (end < tex.length && depth) {
      if (tex[end] === '\\') { end += 2; continue; }
      if (tex[end] === '{') depth++;
      if (tex[end] === '}') depth--;
      end++;
    }
    ranges.push([m.index, end]);
    command.lastIndex = end;
  }
  return ranges;
}

export function adaptCopiedTex(source: string): { tex: string; adaptations: MathAdaptation[] } {
  const protectedRanges = literalRanges(source);
  const rowEnvironment = /\\begin\{(?:aligned(?:at)?|align\*?|gather(?:ed|\*)?|split|array|(?:[pbBvV]?matrix)|cases)\}/.test(source);
  const adaptations = new Set<MathAdaptation>();
  let out = '', range = 0;
  for (let i = 0; i < source.length;) {
    while (range < protectedRanges.length && protectedRanges[range]![1] <= i) range++;
    const protectedRange = protectedRanges[range];
    if (protectedRange && i === protectedRange[0]) {
      out += source.slice(i, protectedRange[1]); i = protectedRange[1]; continue;
    }
    if (source[i] !== '\\') { out += source[i++]; continue; }
    let end = i + 1; while (source[end] === '\\') end++;
    const run = end - i, next = source[end];
    // Only the braced mathematical form is recovered. Literal \_ and text/URL arguments stay exact.
    if (run === 1 && next === '_' && source[end + 1] === '{') {
      adaptations.add('copied-subscript'); out += '_'; i = end + 1; continue;
    }
    if (rowEnvironment && ((run === 3 && /\s/.test(next ?? '')) || (run === 4 && /^\[[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:pt|em|ex|mu|mm|cm|in)\]/.test(source.slice(end))))) {
      adaptations.add('copied-row-break'); out += '\\\\'; i = end; continue;
    }
    // Copy serializers may escape an existing TeX spacing command once more.
    if (run === 2 && next !== undefined && /[,;!:]/.test(next)) {
      adaptations.add('copied-spacing'); out += '\\' + next; i = end + 1; continue;
    }
    out += source.slice(i, end); i = end;
  }
  return { tex: out, adaptations: [...adaptations] };
}
