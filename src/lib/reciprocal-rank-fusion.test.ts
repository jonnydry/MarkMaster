import { describe, expect, it } from "vitest";

import { cosineDistance, reciprocalRankFusion, RRF_K } from "./reciprocal-rank-fusion";

describe("reciprocalRankFusion", () => {
  it("scores a single ranking with 1-based ranks and k=60", () => {
    const fused = reciprocalRankFusion([["a", "b", "c"]]);

    expect(RRF_K).toBe(60);
    expect(fused.map((row) => row.id)).toEqual(["a", "b", "c"]);
    expect(fused[0]?.score).toBeCloseTo(1 / 61, 12);
    expect(fused[1]?.score).toBeCloseTo(1 / 62, 12);
    expect(fused[2]?.score).toBeCloseTo(1 / 63, 12);
  });

  it("adds the vector rank and the keyword rank", () => {
    const fused = reciprocalRankFusion([
      ["v1", "both", "v2"],
      ["both", "k1"],
    ]);

    const score = Object.fromEntries(fused.map((row) => [row.id, row.score]));
    expect(score.both).toBeCloseTo(1 / 62 + 1 / 61, 12);
    expect(score.v1).toBeCloseTo(1 / 61, 12);
    expect(score.k1).toBeCloseTo(1 / 62, 12);
    expect(fused.map((row) => row.id)).toEqual(["both", "v1", "k1", "v2"]);
  });

  it("breaks equal scores by id", () => {
    const fused = reciprocalRankFusion([["b", "a"]]);
    expect(fused.map((row) => row.id)).toEqual(["b", "a"]);

    const tied = reciprocalRankFusion([["b"], ["a"]]);
    expect(tied[0]?.score).toBeCloseTo(tied[1]?.score ?? 0, 12);
    expect(tied.map((row) => row.id)).toEqual(["a", "b"]);
  });

  it("ignores a repeated id inside one list", () => {
    const fused = reciprocalRankFusion([["a", "a", "b"]]);
    expect(fused.map((row) => row.id)).toEqual(["a", "b"]);
    expect(fused[1]?.score).toBeCloseTo(1 / 62, 12);
  });

  it("returns nothing for empty rankings", () => {
    expect(reciprocalRankFusion([[], []])).toEqual([]);
  });
});

describe("cosineDistance", () => {
  it("is 0 for the same direction and 1 for orthogonal vectors", () => {
    expect(cosineDistance([1, 0], [1, 0])).toBeCloseTo(0, 12);
    expect(cosineDistance([1, 0], [0, 1])).toBeCloseTo(1, 12);
    expect(cosineDistance([0, 0], [1, 0])).toBe(1);
    expect(cosineDistance([1], [1, 0])).toBe(1);
  });
});
