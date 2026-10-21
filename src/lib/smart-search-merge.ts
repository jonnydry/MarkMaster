/** Cosine similarity. Image hits below this are dropped before the merge. */
export const IMAGE_HIT_SIMILARITY_CUTOFF = 0.65;

/**
 * Override for {@link IMAGE_HIT_SIMILARITY_CUTOFF}.
 * A non-finite value, or a value outside [0, 1), is ignored.
 */
export const IMAGE_HIT_SIMILARITY_CUTOFF_ENV = "IMAGE_HIT_SIMILARITY_CUTOFF";

/**
 * Image hits add this fraction of their cutoff clearance.
 * Text scores stay on the raw cosine scale, so a weak image cannot outrank a strong text hit.
 */
export const IMAGE_HIT_SCORE_WEIGHT = 0.5;

export type ScoredHit = {
  id: string;
  similarity: number;
};

export type MergedSearchHits = {
  orderedIds: string[];
  imageMatchedIds: string[];
};

export function imageHitSimilarityCutoff(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env[IMAGE_HIT_SIMILARITY_CUTOFF_ENV];
  if (raw === undefined || raw.trim() === "") return IMAGE_HIT_SIMILARITY_CUTOFF;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value >= 1) return IMAGE_HIT_SIMILARITY_CUTOFF;
  return value;
}

/** How far `similarity` sits between the cutoff and 1, clamped to 0–1. Zero at the cutoff. */
export function imageClearanceScore(similarity: number, cutoff: number): number {
  const span = 1 - cutoff;
  if (!(span > 0) || !Number.isFinite(similarity)) return 0;
  const raw = (similarity - cutoff) / span;
  if (raw <= 0) return 0;
  if (raw >= 1) return 1;
  return raw;
}

/**
 * Text scores stay as cosine similarity. An image hit adds
 * `IMAGE_HIT_SCORE_WEIGHT * imageClearanceScore(similarity, cutoff)`.
 * Image rows for one bookmark collapse to the best similarity, then the cutoff applies.
 */
export function mergeTextAndImageHits(
  textHits: readonly ScoredHit[],
  imageHits: readonly ScoredHit[],
  cutoff = IMAGE_HIT_SIMILARITY_CUTOFF,
  imageWeight = IMAGE_HIT_SCORE_WEIGHT
): MergedSearchHits {
  const text = dedupeByBestSimilarity(textHits);
  const acceptedImages = dedupeByBestSimilarity(imageHits).filter((hit) =>
    passesImageCutoff(hit.similarity, cutoff)
  );

  const scores = new Map<string, number>();
  for (const hit of text) scores.set(hit.id, hit.similarity);
  for (const hit of acceptedImages) {
    const imageScore = imageWeight * imageClearanceScore(hit.similarity, cutoff);
    scores.set(hit.id, (scores.get(hit.id) ?? 0) + imageScore);
  }

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
