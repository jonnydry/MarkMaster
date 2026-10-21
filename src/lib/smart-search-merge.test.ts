import { describe, expect, it } from "vitest";

import {
  IMAGE_HIT_SCORE_WEIGHT,
  IMAGE_HIT_SIMILARITY_CUTOFF,
  imageClearanceScore,
  imageHitSimilarityCutoff,
  mergeTextAndImageHits,
} from "./smart-search-merge";

describe("mergeTextAndImageHits", () => {
  it("keeps text scores absolute and weights image clearance below them", () => {
    expect(IMAGE_HIT_SCORE_WEIGHT).toBe(0.5);
    expect(imageClearanceScore(0.651, 0.65)).toBeCloseTo((0.651 - 0.65) / 0.35, 10);

    const merged = mergeTextAndImageHits(
      [
        { id: "strong-text", similarity: 0.92 },
        { id: "mid-text", similarity: 0.8 },
      ],
      [{ id: "weak-image", similarity: 0.651 }]
    );
    expect(merged.orderedIds).toEqual(["strong-text", "mid-text", "weak-image"]);
    expect(merged.imageMatchedIds).toEqual(["weak-image"]);
  });

  it("does not cap a strong text-only bookmark below a weak dual match", () => {
    const merged = mergeTextAndImageHits(
      [
        { id: "text-only", similarity: 0.92 },
        { id: "dual", similarity: 0.2 },
      ],
      [{ id: "dual", similarity: 0.651 }]
    );
    expect(merged.orderedIds[0]).toBe("text-only");
    expect(merged.orderedIds).toEqual(["text-only", "dual"]);
    expect(merged.imageMatchedIds).toEqual(["dual"]);
  });

  it("ranks a bookmark that matches both lists ahead of a weaker text-only hit", () => {
    const merged = mergeTextAndImageHits(
      [
        { id: "both", similarity: 0.8 },
        { id: "text-only", similarity: 0.4 },
      ],
      [{ id: "both", similarity: 0.7 }]
    );
    expect(merged.orderedIds[0]).toBe("both");
    expect(merged.imageMatchedIds).toEqual(["both"]);
  });

  it("drops image hits below the cutoff and keeps one row per bookmark", () => {
    expect(IMAGE_HIT_SIMILARITY_CUTOFF).toBe(0.65);
    const merged = mergeTextAndImageHits(
      [],
      [
        { id: "keep", similarity: 0.64 },
        { id: "keep", similarity: IMAGE_HIT_SIMILARITY_CUTOFF },
        { id: "drop", similarity: 0.649 },
        { id: "also", similarity: 0.8 },
      ]
    );
    expect(merged.imageMatchedIds).toEqual(["also", "keep"]);
    expect(merged.orderedIds).toEqual(["also", "keep"]);
  });

  it("keeps a lone text hit at its raw similarity", () => {
    const merged = mergeTextAndImageHits([{ id: "only", similarity: 0.2 }], []);
    expect(merged.orderedIds).toEqual(["only"]);
    expect(merged.imageMatchedIds).toEqual([]);
  });
});

describe("imageHitSimilarityCutoff", () => {
  it("reads a cutoff in [0, 1) and ignores anything else", () => {
    expect(imageHitSimilarityCutoff({})).toBe(IMAGE_HIT_SIMILARITY_CUTOFF);
    expect(imageHitSimilarityCutoff({ IMAGE_HIT_SIMILARITY_CUTOFF: "0.5" })).toBe(0.5);
    expect(imageHitSimilarityCutoff({ IMAGE_HIT_SIMILARITY_CUTOFF: "0" })).toBe(0);
    expect(imageHitSimilarityCutoff({ IMAGE_HIT_SIMILARITY_CUTOFF: "1" })).toBe(0.65);
    expect(imageHitSimilarityCutoff({ IMAGE_HIT_SIMILARITY_CUTOFF: "-0.1" })).toBe(0.65);
    expect(imageHitSimilarityCutoff({ IMAGE_HIT_SIMILARITY_CUTOFF: "nope" })).toBe(0.65);
    expect(imageHitSimilarityCutoff({ IMAGE_HIT_SIMILARITY_CUTOFF: "  " })).toBe(0.65);
  });
});
