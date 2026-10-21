import { describe, expect, it } from "vitest";

import {
  IMAGE_HIT_SIMILARITY_CUTOFF,
  mergeTextAndImageHits,
  normalizeSimilarities,
} from "./smart-search-merge";

describe("mergeTextAndImageHits", () => {
  it("normalizes each score set on its own before adding them", () => {
    const text = normalizeSimilarities([
      { id: "a", similarity: 0.2 },
      { id: "b", similarity: 0.1 },
    ]);
    const image = normalizeSimilarities([
      { id: "c", similarity: 0.99 },
      { id: "d", similarity: 0.9 },
    ]);

    expect(text.get("a")).toBe(1);
    expect(text.get("b")).toBe(0);
    expect(image.get("c")).toBe(1);
    expect(image.get("d")).toBe(0);

    const merged = mergeTextAndImageHits(
      [
        { id: "a", similarity: 0.2 },
        { id: "b", similarity: 0.1 },
      ],
      [
        { id: "c", similarity: 0.99 },
        { id: "d", similarity: 0.9 },
      ]
    );
    expect(merged.orderedIds.slice(0, 2).sort()).toEqual(["a", "c"]);
    expect(merged.imageMatchedIds).toEqual(["c", "d"]);
  });

  it("ranks a bookmark that matches both lists ahead of either list alone", () => {
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

  it("maps a single-hit list to 1 so it still outranks nothing", () => {
    const merged = mergeTextAndImageHits([{ id: "only", similarity: 0.2 }], []);
    expect(merged.orderedIds).toEqual(["only"]);
    expect(merged.imageMatchedIds).toEqual([]);
  });
});
