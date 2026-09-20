import { describe, expect, it } from "vitest";

import {
  buildOrbitJevEvalCaseFromEvent,
  scoreOrbitJevEvalCase,
  summarizeOrbitJevEval,
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
