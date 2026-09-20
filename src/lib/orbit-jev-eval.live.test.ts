import { describe, expect, it } from "vitest";

import { assignOneOrbitBookmarkWithJev } from "@/lib/orbit-jev-assign";
import {
  buildOrbitJevEvalCaseFromEvent,
  scoreOrbitJevEvalCase,
} from "@/lib/orbit-jev-eval";
import { isTypeSafeConfigured } from "@/lib/typesafe";

const LIVE =
  process.env.RUN_LIVE_TYPESAFE_TESTS === "1" && isTypeSafeConfigured();

describe.skipIf(!LIVE)("orbit Jev eval (live TypeSafe)", () => {
  it("replays a past accepted AI decision against the then-existing pool", async () => {
    const evalCase = buildOrbitJevEvalCaseFromEvent({
      bookmarkId: "bm-live-1",
      action: "accepted",
      originalSuggestion: {
        bookmarkId: "bm-live-1",
        confidence: "high",
        reasoning: "Historical Grok plan",
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

    const assignment = await assignOneOrbitBookmarkWithJev({
      bookmark: {
        id: "bm-live-1",
        tweetId: "1",
        authorUsername: "researcher",
        authorDisplayName: "AI Researcher",
        authorVerified: true,
        tweetText:
          "New paper: scaling laws for LLM evaluations on reasoning benchmarks.",
        tweetCreatedAt: new Date(),
        bookmarkedAt: new Date(),
        publicMetrics: null,
        media: [],
        urls: [
          {
            expanded_url: "https://arxiv.org/abs/2410.00001",
            title: "Scaling laws for LLM evaluations",
          },
        ],
        quotedTweet: null,
        notes: [],
      },
      existingTags: [{ name: "AI", color: "#1d9bf0", bookmarkCount: 12 }],
      existingCollections: [],
      pool: evalCase.pool,
    });

    const score = scoreOrbitJevEvalCase(evalCase, assignment);
    expect(score.assignedTags.length + Number(score.abstained)).toBeGreaterThan(0);
  });
});
