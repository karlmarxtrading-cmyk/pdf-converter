import type { Change } from 'diff';

/** PF-AUD-U02: bound both comparison work and DOM rows; a full-text review never changes the input. */
export const REVIEW_DIFF_LIMITS = Object.freeze({ chars: 200_000, lines: 2_000, rows: 1_200, timeoutMs: 80, maxEditLength: 600 });
export type ReviewDiff = { kind: 'diff'; parts: Change[] } | { kind: 'full'; reason: 'size' | 'complexity' };
function tooManyLines(text: string): boolean {
  let lines = 1;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10 && ++lines > REVIEW_DIFF_LIMITS.lines) return true;
  return false;
}
export async function reviewDiff(before: string, after: string): Promise<ReviewDiff> {
  if (before.length + after.length > REVIEW_DIFF_LIMITS.chars || tooManyLines(before) || tooManyLines(after)) return { kind: 'full', reason: 'size' };
  const { diffLines } = await import('diff');
  const parts = await new Promise<Change[] | undefined>(resolve => {
    diffLines(before, after, { timeout: REVIEW_DIFF_LIMITS.timeoutMs, maxEditLength: REVIEW_DIFF_LIMITS.maxEditLength, callback: resolve });
  });
  if (!parts) return { kind: 'full', reason: 'complexity' };
  let rows = 0;
  for (const part of parts) {
    const count = part.count ?? 0;
    rows += part.added || part.removed ? count : Math.min(count, 7);
    if (rows > REVIEW_DIFF_LIMITS.rows) return { kind: 'full', reason: 'size' };
  }
  return { kind: 'diff', parts };
}
