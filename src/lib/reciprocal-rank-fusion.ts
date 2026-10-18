/** Common RRF constant. Rank is 1-based: score += 1 / (k + rank). */
export const RRF_K = 60;

export type FusedRank = {
  id: string;
  score: number;
};

/**
 * Reciprocal Rank Fusion over ordered id lists.
 * A list may contain an id once; later duplicates in that list are ignored.
 * Ties break on id so pages stay stable.
 */
export function reciprocalRankFusion(
  rankings: readonly (readonly string[])[],
  k = RRF_K
): FusedRank[] {
  const scores = new Map<string, number>();

  for (const ranking of rankings) {
    const seen = new Set<string>();
    let rank = 0;
    for (const id of ranking) {
      if (seen.has(id)) continue;
      seen.add(id);
      rank += 1;
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank));
    }
  }

  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Cosine distance, matching pgvector `<=>` (1 - cosine similarity). */
export function cosineDistance(left: readonly number[], right: readonly number[]): number {
  const length = Math.min(left.length, right.length);
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  if (left.length !== right.length) return 1;
  const denom = Math.sqrt(leftNorm) * Math.sqrt(rightNorm);
  if (denom === 0) return 1;
  return 1 - dot / denom;
}
