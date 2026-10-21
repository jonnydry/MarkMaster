/** Cosine similarity. Image hits below this are dropped before the merge. */
export const IMAGE_HIT_SIMILARITY_CUTOFF = 0.68;

/**
 * Override for {@link IMAGE_HIT_SIMILARITY_CUTOFF}.
 * A non-finite value, or a value outside [0, 1), is ignored.
 */
export const IMAGE_HIT_SIMILARITY_CUTOFF_ENV = "IMAGE_HIT_SIMILARITY_CUTOFF";

/**
 * Subtracted from an image cosine so it sits on the same scale as a text cosine.
 * A 0.74 image scores 0.71 and can outrank a mid text hit; a 0.70 image scores 0.67.
 */
export const IMAGE_HIT_SCORE_OFFSET = 0.03;

/** Added when a bookmark is on both the text list and the accepted image list. */
export const DUAL_MATCH_SCORE_BONUS = 0.02;

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

/** Image cosine shifted onto the text scale. Only call this for a hit that cleared the cutoff. */
export function imageHitScore(similarity: number, offset = IMAGE_HIT_SCORE_OFFSET): number {
  return similarity - offset;
}

/**
 * Text scores stay as cosine similarity. An image hit at or above the cutoff scores
 * `similarity - IMAGE_HIT_SCORE_OFFSET`. The bookmark's score is the higher of the two.
 * A bookmark on both lists also gains `DUAL_MATCH_SCORE_BONUS`. Text-only rows are not reduced.
 * Keyword hits are fused later and are not an input here.
 * Image rows for one bookmark collapse to the best similarity, then the cutoff applies.
 */
export function mergeTextAndImageHits(
  textHits: readonly ScoredHit[],
  imageHits: readonly ScoredHit[],
  cutoff = IMAGE_HIT_SIMILARITY_CUTOFF,
  imageOffset = IMAGE_HIT_SCORE_OFFSET,
  dualMatchBonus = DUAL_MATCH_SCORE_BONUS
): MergedSearchHits {
  const text = dedupeByBestSimilarity(textHits);
  const acceptedImages = dedupeByBestSimilarity(imageHits).filter((hit) =>
    passesImageCutoff(hit.similarity, cutoff)
  );

  const textById = new Map(text.map((hit) => [hit.id, hit.similarity]));
  const imageById = new Map(
    acceptedImages.map((hit) => [hit.id, imageHitScore(hit.similarity, imageOffset)])
  );

  const scores = new Map<string, number>();
  for (const [id, textScore] of textById) {
    const imageScore = imageById.get(id);
    scores.set(
      id,
      imageScore === undefined ? textScore : Math.max(textScore, imageScore) + dualMatchBonus
    );
  }
  for (const [id, imageScore] of imageById) {
    if (!scores.has(id)) scores.set(id, imageScore);
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
  // The cutoff is not always exact in floating point (1 - 0.32 is not always 0.68).
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
