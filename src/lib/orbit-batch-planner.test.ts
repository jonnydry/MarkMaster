import { describe, expect, it } from "vitest";

import { planOrbitScanBatch } from "./orbit-batch-planner";
import type { BookmarkWithRelations } from "@/types";

function bookmark(
  id: string,
  overrides: Partial<BookmarkWithRelations> = {}
): BookmarkWithRelations {
  return {
    id,
    tweetId: `tweet-${id}`,
    authorId: `author-${id}`,
    authorUsername: `author${id}`,
    authorDisplayName: `Author ${id}`,
    authorProfileImage: null,
    authorVerified: false,
    tweetText: `Saved post ${id}`,
    publicMetrics: null,
    media: null,
    urls: null,
    quotedTweet: null,
    xMetadata: null,
    tweetCreatedAt: "2026-05-01T00:00:00.000Z",
    bookmarkedAt: "2026-05-02T00:00:00.000Z",
    tags: [],
    notes: [],
    collectionItems: [],
    ...overrides,
  };
}

describe("planOrbitScanBatch", () => {
  it("keeps all current bookmarks when the candidate pool is under the limit", () => {
    const plan = planOrbitScanBatch([bookmark("a"), bookmark("b")], 24);
    expect(plan.bookmarkIds).toEqual(["a", "b"]);
  });

  it("prefers a coherent cluster when selected bookmarks exceed the scan cap", () => {
    const aiFolder = {
      collection: { id: "folder-ai", name: "AI Papers" },
    };
    const candidates = [
      bookmark("garden", { tweetText: "Tomato planting notes" }),
      bookmark("ai-1", {
        tweetText: "AI benchmark paper",
        collectionItems: [aiFolder],
        urls: [
          {
            url: "https://arxiv.org/abs/1",
            expanded_url: "https://arxiv.org/abs/1",
            display_url: "arxiv.org/abs/1",
            title: "AI benchmark",
          },
        ],
      }),
      bookmark("ai-2", {
        tweetText: "Model evaluation paper",
        collectionItems: [aiFolder],
        urls: [
          {
            url: "https://arxiv.org/abs/2",
            expanded_url: "https://arxiv.org/abs/2",
            display_url: "arxiv.org/abs/2",
            title: "Evaluation benchmark",
          },
        ],
      }),
      bookmark("cooking", { tweetText: "Pasta sauce recipe" }),
    ];

    const plan = planOrbitScanBatch(candidates, 2);

    expect(new Set(plan.bookmarkIds)).toEqual(new Set(["ai-1", "ai-2"]));
    expect(plan.sharedSignalCount).toBeGreaterThan(0);
  });
});
