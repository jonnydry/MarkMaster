/** Cosine similarity. Image hits below this are dropped before the merge. */
export const IMAGE_HIT_SIMILARITY_CUTOFF = 0.65;

export type ScoredHit = {
  id: string;
  similarity: number;
};

export type MergedSearchHits = {
  orderedIds: string[];
  imageMatchedIds: string[];
};

/**
 * Min-max each list on its own, then add the scores for a shared bookmark.
 * A list whose scores are all equal maps every id to 1, so a lone hit still ranks.
 * Image rows for one bookmark collapse to the best similarity, then the cutoff applies.
 */
export function mergeTextAndImageHits(
  textHits: readonly ScoredHit[],
  imageHits: readonly ScoredHit[],
  cutoff = IMAGE_HIT_SIMILARITY_CUTOFF
): MergedSearchHits {
  const textScores = normalizeSimilarities(dedupeByBestSimilarity(textHits));
  const acceptedImages = dedupeByBestSimilarity(imageHits).filter((hit) =>
    passesImageCutoff(hit.similarity, cutoff)
  );
  const imageScores = normalizeSimilarities(acceptedImages);

  const scores = new Map<string, number>();
  for (const [id, score] of textScores) scores.set(id, score);
  for (const [id, score] of imageScores) scores.set(id, (scores.get(id) ?? 0) + score);

  const orderedIds = [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([id]) => id);

  const imageMatchedIds = [...acceptedImages]
    .sort(
      (a, b) => b.similarity - a.similarity || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    )
    .map((hit) => hit.id);

  return { orderedIds, imageMatchedIds };
}

export function passesImageCutoff(similarity: number, cutoff = IMAGE_HIT_SIMILARITY_CUTOFF): boolean {
  // 1 - 0.35 is not always exactly 0.65 in floating point.
  return Number.isFinite(similarity) && similarity + 1e-9 >= cutoff;
}

export function dedupeByBestSimilarity(hits: readonly ScoredHit[]): ScoredHit[] {
  const best = new Map<string, number>();
  for (const hit of hits) {
    if (!Number.isFinite(hit.similarity)) continue;
    const current = best.get(hit.id);
    if (current === undefined || hit.similarity > current) best.set(hit.id, hit.similarity);
  }
  return [...best.entries()].map(([id, similarity]) => ({ id, similarity }));
}

export function normalizeSimilarities(hits: readonly ScoredHit[]): Map<string, number> {
  if (hits.length === 0) return new Map();
  let min = Infinity;
  let max = -Infinity;
  for (const hit of hits) {
    if (hit.similarity < min) min = hit.similarity;
    if (hit.similarity > max) max = hit.similarity;
  }
  const span = max - min;
  const scores = new Map<string, number>();
  for (const hit of hits) {
    scores.set(hit.id, span === 0 ? 1 : (hit.similarity - min) / span);
  }
  return scores;
}
