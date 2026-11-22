import type { Issue } from '../core/contracts';

/** PDF-specific decisions. A user font mapping for private glyphs is not supported. */
export function pdfGlyphRestrictions(issues: Issue[], source = ''): Issue[] {
  return issues.filter(issue => issue.code === 'PDF_PRIVATE_GLYPH').map(issue => {
    const point = issue.id.slice('private-glyph-U+'.length);
    const cp = Number.parseInt(point, 16);
    const offset = Number.isFinite(cp) ? source.indexOf(String.fromCodePoint(cp)) : -1;
    const line = offset < 0 ? undefined : source.slice(0, offset).split('\n').length;
    return { ...issue, severity: 'error', blocking: true, line,
      message: (line === undefined ? '' : `Baris ${line}. `) + issue.message };
  });
}
