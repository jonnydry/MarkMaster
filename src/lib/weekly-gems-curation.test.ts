import { describe, it, expect } from "vitest";
import {
  buildDiscoveryCarouselItems,
  buildWeeklyGemsCuration,
  computeDigestEngagement,
} from "./weekly-gems-curation";
import type { BookmarkWithRelations } from "@/types";

function gem(
  id: string,
  likes: number,
  opts?: { bookmarkedDaysAgo?: number }
): BookmarkWithRelations {
  const days = opts?.bookmarkedDaysAgo ?? 1;
  const bookmarkedAt = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  return {
    id,
    tweetId: `tweet-${id}`,
    authorId: "a1",
    authorUsername: "user",
    authorDisplayName: "User",
    authorProfileImage: null,
    authorVerified: false,
    tweetText: `text ${id}`,
    publicMetrics: {
      like_count: likes,
      reply_count: 0,
      retweet_count: 0,
      quote_count: 0,
      bookmark_count: 0,
    },
    media: null,
    urls: null,
    quotedTweet: null,
    tweetCreatedAt: bookmarkedAt,
    bookmarkedAt,
    tags: [],
    notes: [],
    collectionItems: [],
  };
}

describe("weekly gems ritual batch engagement", () => {
  it("buildDiscoveryCarouselItems counts engagement from full ritualBatch including quick-pick overlap", () => {
    const rawGems = [gem("raw1", 100), gem("raw2", 50), gem("raw3", 25)];
    const libraryGems = [gem("lib1", 10, { bookmarkedDaysAgo: 45 })];
    const exclude = new Set(["raw1"]);

    const discovery = buildDiscoveryCarouselItems(rawGems, libraryGems, {
      excludeIdsForBatch: exclude,
    });

    const curation = buildWeeklyGemsCuration(rawGems, libraryGems, { excludeIds: exclude });
    const fromQuickPicks = curation.primaryGems.filter((g) => exclude.has(g.id));
    const panelBatch = [...fromQuickPicks, ...curation.allGems];

    expect(computeDigestEngagement(curation.allGems)).toBe(10 + 50 + 25);
    expect(computeDigestEngagement(panelBatch)).toBe(100 + 10 + 50 + 25);
    expect(discovery.totalEngagement).toBe(computeDigestEngagement(panelBatch));
  });
});
