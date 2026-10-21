import { describe, expect, it } from "vitest";

import {
  DUAL_MATCH_SCORE_BONUS,
  IMAGE_HIT_SCORE_OFFSET,
  IMAGE_HIT_SIMILARITY_CUTOFF,
  imageHitScore,
  imageHitSimilarityCutoff,
  MIN_IMAGE_HIT_SIMILARITY_CUTOFF,
  mergeTextAndImageHits,
} from "./smart-search-merge";

describe("mergeTextAndImageHits", () => {
  it("drops a 0.651 image hit because it is below the cutoff", () => {
    expect(IMAGE_HIT_SIMILARITY_CUTOFF).toBe(0.68);
    const merged = mergeTextAndImageHits(
      [{ id: "text", similarity: 0.5 }],
      [
        { id: "low", similarity: 0.651 },
        { id: "also-low", similarity: 0.679 },
        { id: "low", similarity: 0.65 },
      ]
    );
    expect(merged.orderedIds).toEqual(["text"]);
    expect(merged.imageMatchedIds).toEqual([]);
  });

  it("ranks a 0.92 text hit above a 0.70 image hit", () => {
    expect(imageHitScore(0.7)).toBeCloseTo(0.7 - IMAGE_HIT_SCORE_OFFSET, 10);
    const merged = mergeTextAndImageHits(
      [{ id: "text", similarity: 0.92 }],
      [{ id: "image", similarity: 0.7 }]
    );
    expect(merged.orderedIds).toEqual(["text", "image"]);
    expect(merged.imageMatchedIds).toEqual(["image"]);
  });

  it("ranks a 0.85 image hit above a 0.60 text hit", () => {
    const merged = mergeTextAndImageHits(
      [{ id: "text", similarity: 0.6 }],
      [{ id: "image", similarity: 0.85 }]
    );
    expect(merged.orderedIds).toEqual(["image", "text"]);
  });

  it("ranks a 0.74 image hit above a 0.64 text hit", () => {
    const merged = mergeTextAndImageHits(
      [{ id: "text", similarity: 0.64 }],
      [{ id: "image", similarity: 0.74 }]
    );
    expect(merged.orderedIds).toEqual(["image", "text"]);
  });

  it("ranks a 0.69 text hit above a 0.71 image hit", () => {
    expect(imageHitScore(0.71)).toBeCloseTo(0.68, 10);
    const merged = mergeTextAndImageHits(
      [{ id: "text", similarity: 0.69 }],
      [{ id: "image", similarity: 0.71 }]
    );
    expect(merged.orderedIds).toEqual(["text", "image"]);
  });

  it("lets a 0.83 text-only hit beat a dual match of 0.80 and 0.80", () => {
    const merged = mergeTextAndImageHits(
      [
        { id: "dual", similarity: 0.8 },
        { id: "text-only", similarity: 0.83 },
      ],
      [{ id: "dual", similarity: 0.8 }]
    );
    expect(merged.orderedIds).toEqual(["text-only", "dual"]);
  });

  it("uses the text cosine when both match and text is higher", () => {
    const merged = mergeTextAndImageHits(
      [
        { id: "dual", similarity: 0.9 },
        { id: "text-only", similarity: 0.91 },
      ],
      [{ id: "dual", similarity: 0.7 }]
    );
    expect(merged.orderedIds).toEqual(["dual", "text-only"]);
  });

  it("scores a below-cutoff image as text only, with no dual-match bonus", () => {
    const merged = mergeTextAndImageHits(
      [
        { id: "dual", similarity: 0.75 },
        { id: "text-only", similarity: 0.76 },
      ],
      [{ id: "dual", similarity: 0.6 }]
    );
    expect(merged.orderedIds).toEqual(["text-only", "dual"]);
    expect(merged.imageMatchedIds).toEqual([]);
  });

  it("drops an image hit at 0.6799", () => {
    const merged = mergeTextAndImageHits([], [{ id: "low", similarity: 0.6799 }]);
    expect(merged.orderedIds).toEqual([]);
    expect(merged.imageMatchedIds).toEqual([]);
  });

  it("does not penalise text-only bookmarks", () => {
    const textOnly = mergeTextAndImageHits(
      [
        { id: "high", similarity: 0.8 },
        { id: "low", similarity: 0.55 },
      ],
      []
    );
    const besideAnImage = mergeTextAndImageHits(
      [
        { id: "high", similarity: 0.8 },
        { id: "low", similarity: 0.55 },
      ],
      [{ id: "pic", similarity: 0.9 }]
    );
    expect(textOnly.orderedIds).toEqual(["high", "low"]);
    expect(besideAnImage.orderedIds.filter((id) => id !== "pic")).toEqual(["high", "low"]);
    expect(besideAnImage.orderedIds).toContain("low");

    const lone = mergeTextAndImageHits([{ id: "only", similarity: 0.2 }], []);
    expect(lone.orderedIds).toEqual(["only"]);
    expect(lone.imageMatchedIds).toEqual([]);
  });

  it("does not let a weak dual match outrank a strong text-only bookmark", () => {
    const merged = mergeTextAndImageHits(
      [
        { id: "text-only", similarity: 0.92 },
        { id: "dual", similarity: 0.2 },
      ],
      [{ id: "dual", similarity: 0.7 }]
    );
    expect(merged.orderedIds).toEqual(["text-only", "dual"]);
    expect(merged.imageMatchedIds).toEqual(["dual"]);
  });

  it("adds the dual-match bonus so a bookmark on both lists can edge ahead", () => {
    expect(DUAL_MATCH_SCORE_BONUS).toBe(0.02);
    const merged = mergeTextAndImageHits(
      [
        { id: "both", similarity: 0.7 },
        { id: "text-only", similarity: 0.72 },
      ],
      [{ id: "both", similarity: 0.74 }]
    );
    expect(merged.orderedIds).toEqual(["both", "text-only"]);
    expect(merged.imageMatchedIds).toEqual(["both"]);
  });

  it("keeps one row per bookmark and a stable id order when scores tie", () => {
    const hits = [
      { id: "b", similarity: 0.7 },
      { id: "a", similarity: 0.7 },
      { id: "a", similarity: 0.6 },
    ];
    const forward = mergeTextAndImageHits(hits, [
      { id: "d", similarity: IMAGE_HIT_SIMILARITY_CUTOFF },
      { id: "c", similarity: 0.9 },
      { id: "c", similarity: 0.651 },
      { id: "drop", similarity: 0.651 },
    ]);
    const backward = mergeTextAndImageHits([...hits].reverse(), [
      { id: "drop", similarity: 0.651 },
      { id: "c", similarity: 0.651 },
      { id: "c", similarity: 0.9 },
      { id: "d", similarity: IMAGE_HIT_SIMILARITY_CUTOFF },
    ]);
    expect(forward.orderedIds).toEqual(backward.orderedIds);
    expect(forward.orderedIds.indexOf("a")).toBeLessThan(forward.orderedIds.indexOf("b"));
    expect(forward.imageMatchedIds).toEqual(["c", "d"]);
    expect(forward.orderedIds).not.toContain("drop");
    expect(forward.orderedIds).toEqual(["c", "a", "b", "d"]);
  });
});

describe("imageHitSimilarityCutoff", () => {
  it("reads a cutoff in [0.3, 1) and ignores anything else", () => {
    expect(MIN_IMAGE_HIT_SIMILARITY_CUTOFF).toBe(0.3);
    expect(imageHitSimilarityCutoff({})).toBe(IMAGE_HIT_SIMILARITY_CUTOFF);
    expect(imageHitSimilarityCutoff({ IMAGE_HIT_SIMILARITY_CUTOFF: "0.5" })).toBe(0.5);
    expect(imageHitSimilarityCutoff({ IMAGE_HIT_SIMILARITY_CUTOFF: "0.3" })).toBe(0.3);
    expect(imageHitSimilarityCutoff({ IMAGE_HIT_SIMILARITY_CUTOFF: "0.29" })).toBe(0.68);
    expect(imageHitSimilarityCutoff({ IMAGE_HIT_SIMILARITY_CUTOFF: "1e-300" })).toBe(0.68);
    expect(imageHitSimilarityCutoff({ IMAGE_HIT_SIMILARITY_CUTOFF: "0" })).toBe(0.68);
    expect(imageHitSimilarityCutoff({ IMAGE_HIT_SIMILARITY_CUTOFF: "0.0" })).toBe(0.68);
    expect(imageHitSimilarityCutoff({ IMAGE_HIT_SIMILARITY_CUTOFF: "1" })).toBe(0.68);
    expect(imageHitSimilarityCutoff({ IMAGE_HIT_SIMILARITY_CUTOFF: "-0.1" })).toBe(0.68);
    expect(imageHitSimilarityCutoff({ IMAGE_HIT_SIMILARITY_CUTOFF: "nope" })).toBe(0.68);
    expect(imageHitSimilarityCutoff({ IMAGE_HIT_SIMILARITY_CUTOFF: "  " })).toBe(0.68);
  });
});
