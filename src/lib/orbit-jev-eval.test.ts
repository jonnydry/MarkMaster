import { describe, expect, it } from "vitest";

import {
  buildOrbitJevEvalCaseFromEvent,
  autoTagCalibrationEventWhere,
  calibrateOrbitTagThresholds,
  humanCalibrationEventWhere,
  isHumanOrbitDecision,
  scoreOrbitJevEvalCase,
  summarizeOrbitJevEval,
  tagOutcomesFromEvent,
} from "@/lib/orbit-jev-eval";

describe("orbit Jev eval harness", () => {
  it("treats accepted review labels as the expected pool", () => {
    const evalCase = buildOrbitJevEvalCaseFromEvent({
      bookmarkId: "bm-1",
      action: "accepted",
      originalSuggestion: {
        bookmarkId: "bm-1",
        confidence: "high",
        reasoning: "Grok",
        tags: [
          {
            name: "AI",
            color: "#1d9bf0",
            reason: "topic",
            reuseExisting: true,
          },
        ],
        collection: null,
      },
    });

    expect(evalCase.pool.tags.map((tag) => tag.name)).toContain("AI");

    const accepted = scoreOrbitJevEvalCase(evalCase, {
      tags: [{ name: "AI", color: "#1d9bf0", reason: "Jev" }],
      collection: null,
      abstain: false,
      needsNewLabel: false,
    });
    expect(accepted.useful).toBe(true);
    expect(accepted.tagHits).toBe(1);

    const miss = scoreOrbitJevEvalCase(evalCase, {
      tags: [],
      collection: null,
      abstain: true,
      needsNewLabel: true,
    });
    expect(miss.useful).toBe(false);
  });

  it("scores kept events as correct only when Jev abstains", () => {
    const evalCase = buildOrbitJevEvalCaseFromEvent({
      bookmarkId: "bm-2",
      action: "kept",
      originalSuggestion: {
        bookmarkId: "bm-2",
        confidence: "medium",
        reasoning: "Guess",
        tags: [
          {
            name: "AI",
            color: "#1d9bf0",
            reason: "guess",
            reuseExisting: true,
          },
        ],
        collection: null,
      },
    });

    const abstain = scoreOrbitJevEvalCase(evalCase, {
      tags: [],
      collection: null,
      abstain: true,
      needsNewLabel: false,
    });
    expect(abstain.useful).toBe(true);

    const falsePositive = scoreOrbitJevEvalCase(evalCase, {
      tags: [{ name: "AI", color: "#1d9bf0", reason: "Jev" }],
      collection: null,
      abstain: false,
      needsNewLabel: false,
    });
    expect(falsePositive.useful).toBe(false);
    expect(falsePositive.tagFalsePositives).toBe(1);

    expect(summarizeOrbitJevEval([abstain, falsePositive])).toMatchObject({
      caseCount: 2,
      usefulRate: 0.5,
      abstainCorrect: 1,
      falsePositiveCount: 1,
    });
  });
});

describe("calibration event queries", () => {
  type Row = { source: string | null; createdAt: number };

  function matches(row: Row, where: Record<string, unknown>): boolean {
    if (Array.isArray(where.OR)) {
      return where.OR.some((clause) => matches(row, clause as Record<string, unknown>));
    }
    if (!("source" in where)) return true;
    const source = where.source as { notIn?: string[] } | string | null;
    if (source && typeof source === "object" && source.notIn) {
      return row.source != null && !source.notIn.includes(row.source);
    }
    return row.source === source;
  }

  function newest(rows: Row[], where: Record<string, unknown>, take: number) {
    return [...rows]
      .filter((row) => matches(row, where))
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, take);
  }

  it("still loads human rows when newer auto-tag rows fill the window", () => {
    const rows: Row[] = [
      ...Array.from({ length: 500 }, (_, index) => ({
        source: "auto-tag",
        createdAt: 1_000 + index,
      })),
      ...Array.from({ length: 70 }, (_, index) => ({
        source: index % 2 === 0 ? "orbit-review" : null,
        createdAt: index,
      })),
    ];

    const human = newest(rows, humanCalibrationEventWhere() as Record<string, unknown>, 500);
    const autoTag = newest(rows, autoTagCalibrationEventWhere() as Record<string, unknown>, 500);

    expect(human).toHaveLength(70);
    expect(human.some((row) => row.source === "auto-tag")).toBe(false);
    expect(autoTag).toHaveLength(500);
    expect(autoTag.every((row) => row.source === "auto-tag")).toBe(true);
  });
});

describe("isHumanOrbitDecision", () => {
  it("keeps review events and drops auto-tag and tag-audit", () => {
    expect(isHumanOrbitDecision({ source: "orbit-review" })).toBe(true);
    expect(isHumanOrbitDecision({ source: null })).toBe(true);
    expect(isHumanOrbitDecision({})).toBe(true);
    expect(isHumanOrbitDecision({ source: "auto-tag" })).toBe(false);
    expect(isHumanOrbitDecision({ source: "tag-audit" })).toBe(false);
  });
});

describe("calibrateOrbitTagThresholds", () => {
  const scoredTag = (name: string, score: number, origin = "jev") => ({
    name,
    color: "#1d9bf0",
    reason: "match",
    reuseExisting: true,
    score,
    origin: origin as "jev" | "jev_new_name" | "grok",
  });
  const suggestion = (tags: ReturnType<typeof scoredTag>[]) => ({
    bookmarkId: "bm",
    confidence: "high" as const,
    reasoning: "r",
    tags,
    collection: null,
  });

  it("scores each threshold by what users kept", () => {
    const report = calibrateOrbitTagThresholds([
      // Accepted as-is: both kept.
      {
        action: "accepted",
        originalSuggestion: suggestion([scoredTag("AI", 0.92), scoredTag("Papers", 0.6)]),
        reviewedSuggestion: suggestion([scoredTag("AI", 0.92), scoredTag("Papers", 0.6)]),
      },
      // Edited: the weak tag was removed.
      {
        action: "edited",
        originalSuggestion: suggestion([scoredTag("AI", 0.88), scoredTag("Design", 0.57)]),
        reviewedSuggestion: suggestion([scoredTag("AI", 0.88)]),
      },
      // Kept in Orbit: nothing kept.
      {
        action: "kept",
        originalSuggestion: suggestion([scoredTag("Rust", 0.7, "grok")]),
        reviewedSuggestion: null,
      },
    ]);

    expect(report.tagCount).toBe(5);
    expect(report.scoredTagCount).toBe(5);
    const at = (threshold: number) =>
      report.rows.find((row) => row.threshold === threshold);
    expect(at(0.55)).toMatchObject({ suggested: 5, kept: 3, precision: 3 / 5, recall: 1 });
    expect(at(0.8)).toMatchObject({ suggested: 2, kept: 2, precision: 1, recall: 2 / 3 });
    expect(at(0.95)).toMatchObject({ suggested: 0, kept: 0, precision: null });
    expect(report.origins).toEqual(
      expect.arrayContaining([
        { origin: "jev", suggested: 4, kept: 3, keptRate: 0.75 },
        { origin: "grok", suggested: 1, kept: 0, keptRate: 0 },
      ])
    );
  });

  it("counts tags from older plans as unscored", () => {
    const report = calibrateOrbitTagThresholds([
      {
        action: "accepted",
        originalSuggestion: {
          bookmarkId: "bm",
          confidence: "high",
          reasoning: "Grok",
          tags: [{ name: "AI", color: "#1d9bf0", reason: "x", reuseExisting: true }],
          collection: null,
        },
      },
    ]);

    expect(report.tagCount).toBe(1);
    expect(report.scoredTagCount).toBe(0);
    expect(report.origins).toEqual([
      { origin: "unknown", suggested: 1, kept: 1, keptRate: 1 },
    ]);
  });
});

describe("tagOutcomesFromEvent", () => {
  it("keeps every tag on an accept with no reviewed copy", () => {
    expect(
      tagOutcomesFromEvent({
        action: "accepted",
        originalSuggestion: {
          bookmarkId: "bm",
          confidence: "high",
          reasoning: "r",
          tags: [{ name: "AI", color: "#1d9bf0", reason: "x", reuseExisting: true, score: 0.9 }],
          collection: null,
        },
      })
    ).toEqual([{ name: "AI", score: 0.9, origin: null, kept: true }]);
  });
});
