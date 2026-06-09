import { describe, it, expect } from "vitest";
import {
  buildDiscoveryCarouselItems,
  buildWeeklyGemsCuration,
  computeDigestEngagement,
  DISCOVERY_RAW_HEALTHY_THRESHOLD,
  DISCOVERY_THIN_POOL_THRESHOLD,
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

describe("buildDiscoveryCarouselItems", () => {
  it("excludes shown or disliked IDs from the carousel", () => {
    const rawGems = [
      gem("raw1", 100),
      gem("raw2", 50),
      gem("raw3", 25),
      gem("raw4", 20),
      gem("raw5", 15),
    ];

    const discovery = buildDiscoveryCarouselItems(rawGems, [], {
      excludeIds: new Set(["raw1", "raw2"]),
      rotationSeed: "test-seed",
    });

    const ids = discovery.carouselItems.map((item) => item.bookmark.id);
    expect(ids).not.toContain("raw1");
    expect(ids).not.toContain("raw2");
    expect(discovery.rawCarouselCount).toBeGreaterThan(0);
  });

  it("fills the carousel with raw-only items when the untouched pool is healthy", () => {
    const rawGems = Array.from({ length: 8 }, (_, i) => gem(`raw${i + 1}`, 100 - i));

    const discovery = buildDiscoveryCarouselItems(rawGems, [gem("lib1", 10, { bookmarkedDaysAgo: 45 })], {
      rotationSeed: "stable-seed",
    });

    expect(rawGems.length).toBeGreaterThanOrEqual(DISCOVERY_RAW_HEALTHY_THRESHOLD);
    expect(discovery.carouselItems).toHaveLength(6);
    expect(discovery.carouselItems.every((item) => item.context === "raw")).toBe(true);
    expect(discovery.resurfacedCount).toBe(0);
  });

  it("adds library filler only when the filtered raw pool is thin", () => {
    const rawGems = [gem("raw1", 100), gem("raw2", 50)];
    const libraryGems = [
      gem("lib1", 80, { bookmarkedDaysAgo: 45 }),
      gem("lib2", 70),
    ];

    const discovery = buildDiscoveryCarouselItems(rawGems, libraryGems, {
      rotationSeed: "thin-pool",
    });

    expect(rawGems.length).toBeLessThan(DISCOVERY_THIN_POOL_THRESHOLD);
    expect(discovery.carouselItems.some((item) => item.context !== "raw")).toBe(true);
    expect(discovery.resurfacedCount).toBeGreaterThan(0);
  });

  it("uses a rotation seed to change ordering without changing membership", () => {
    const rawGems = Array.from({ length: 6 }, (_, i) => gem(`raw${i + 1}`, 100 - i));

    const first = buildDiscoveryCarouselItems(rawGems, [], { rotationSeed: "day-one" });
    const second = buildDiscoveryCarouselItems(rawGems, [], { rotationSeed: "day-two" });

    const firstIds = first.carouselItems.map((item) => item.bookmark.id);
    const secondIds = second.carouselItems.map((item) => item.bookmark.id);

    expect(new Set(firstIds)).toEqual(new Set(secondIds));
    expect(firstIds).not.toEqual(secondIds);
  });

  it("aligns ritualBatch engagement with visible carousel items", () => {
    const rawGems = [gem("raw1", 100), gem("raw2", 50), gem("raw3", 25), gem("raw4", 10)];
    const libraryGems = [gem("lib1", 5, { bookmarkedDaysAgo: 45 })];

    const discovery = buildDiscoveryCarouselItems(rawGems, libraryGems, {
      rotationSeed: "engagement",
    });

    expect(discovery.totalEngagement).toBe(
      computeDigestEngagement(discovery.ritualBatch)
    );
    expect(discovery.ritualBatch).toHaveLength(discovery.carouselItems.length);
  });
});

describe("weekly gems ritual batch engagement", () => {
  it("buildWeeklyGemsCuration still supports legacy digest excludeIds", () => {
    const rawGems = [gem("raw1", 100), gem("raw2", 50), gem("raw3", 25)];
    const libraryGems = [gem("lib1", 10, { bookmarkedDaysAgo: 45 })];
    const exclude = new Set(["raw1"]);

    const curation = buildWeeklyGemsCuration(rawGems, libraryGems, { excludeIds: exclude });

    expect(computeDigestEngagement(curation.allGems)).toBe(10 + 50 + 25);
    expect(curation.allGems.map((g) => g.id)).not.toContain("raw1");
  });
});
