import type { IncomingFinding } from './review.ts';

const SEVERITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

/** "4.2" becomes [4, 2]. A part that is not a number sorts after the numbers. */
function clauseParts(clause: string): number[] {
  return clause.split('.').map((part) => {
    const value = Number(part);
    return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
  });
}

function compareClauses(a: string | null, b: string | null): number {
  if (a === null || b === null) return (a === null ? 1 : 0) - (b === null ? 1 : 0);
  const left = clauseParts(a);
  const right = clauseParts(b);
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    if (l !== r) return l < r ? -1 : 1;
  }
  return left.length - right.length;
}

/** High first, then by clause in natural order, no clause last. Stable; returns a new array. */
export function orderFindings<T extends IncomingFinding>(findings: readonly T[]): T[] {
  return findings
    .map((finding, index) => ({ finding, index }))
    .sort(
      (a, b) =>
        (SEVERITY_RANK[a.finding.severity] ?? 3) - (SEVERITY_RANK[b.finding.severity] ?? 3) ||
        compareClauses(a.finding.clause, b.finding.clause) ||
        a.index - b.index,
    )
    .map(({ finding }) => finding);
}
