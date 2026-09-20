import { describe, expect, it } from "vitest";

import { normalizeKey } from "@/lib/orbit-grok-normalize";
import {
  buildSeedOrbitLabelPool,
  labelPoolFromAppliedNames,
  mergeOrbitLabelPool,
} from "@/lib/orbit-label-pool";
import type { OrbitBookmarkForScan } from "@/lib/orbit-grok-schemas";

function bookmark(): OrbitBookmarkForScan {
  return {
    id: "bm-1",
    tweetId: "1",
    authorUsername: "researcher",
    authorDisplayName: "Researcher",
    authorVerified: false,
    tweetText: "Notes on TypeScript compiler performance.",
    tweetCreatedAt: new Date("2026-01-01"),
    bookmarkedAt: new Date("2026-01-02"),
    publicMetrics: null,
    media: null,
    urls: [],
    quotedTweet: null,
    notes: [],
  };
}

describe("buildSeedOrbitLabelPool", () => {
  it("keeps existing vocab and prior names that are not created yet", () => {
    const pool = buildSeedOrbitLabelPool({
      bookmarks: [bookmark()],
      existingTags: [{ name: "TypeScript", color: "#3178c6", bookmarkCount: 4 }],
      existingCollections: [
        { name: "Language Design", description: null, bookmarkCount: 2 },
      ],
      authorPriorHints: [
        {
          authorUsername: "researcher",
          priorCount: 3,
          tags: ["Compilers"],
          collections: ["Language Design"],
        },
      ],
    });

    expect(pool.tags.map((tag) => normalizeKey(tag.name))).toEqual(
      expect.arrayContaining(["typescript", "compilers"])
    );
    expect(
      pool.tags.find((tag) => normalizeKey(tag.name) === "typescript")?.existing
    ).toBe(true);
    expect(pool.tags.find((tag) => tag.name === "Compilers")?.existing).toBe(false);
    expect(pool.collections.map((collection) => collection.name)).toContain(
      "Language Design"
    );
  });

  it("drops generic and URL-like names", () => {
    const pool = buildSeedOrbitLabelPool({
      bookmarks: [bookmark()],
      existingTags: [
        { name: "Bookmarks", color: "#000000" },
        { name: "https://example.com", color: "#000000" },
      ],
      existingCollections: [{ name: "Misc", description: null }],
    });

    expect(pool.tags).toEqual([]);
    expect(pool.collections).toEqual([]);
  });
});

describe("labelPoolFromAppliedNames", () => {
  it("promotes applied names into a warm existing pool", () => {
    const pool = labelPoolFromAppliedNames({
      tags: ["TypeScript", "Bookmarks"],
      collections: [{ name: "Language Design", description: "Compilers" }],
    });

    expect(pool.tags.map((tag) => tag.name)).toEqual(["Typescript"]);
    expect(pool.tags[0]?.existing).toBe(true);
    expect(pool.collections).toEqual([
      {
        name: "Language Design",
        existing: true,
        description: "Compilers",
      },
    ]);
  });
});

describe("mergeOrbitLabelPool", () => {
  it("adds Grok-proposed names without overwriting existing entries", () => {
    const merged = mergeOrbitLabelPool(
      {
        tags: [{ name: "AI", existing: true }],
        collections: [],
      },
      {
        tags: [
          { name: "AI", existing: false, reason: "repeat" },
          { name: "LLM Evals", existing: false },
        ],
        collections: [{ name: "Research Bench", existing: false }],
      }
    );

    expect(merged.tags).toEqual([
      { name: "AI", existing: true },
      { name: "LLM Evals", existing: false },
    ]);
    expect(merged.collections).toEqual([
      { name: "Research Bench", existing: false },
    ]);
  });

  it("preserves existing flags for warm and harvested labels", () => {
    const merged = mergeOrbitLabelPool(
      { tags: [{ name: "AI", existing: true }], collections: [] },
      {
        tags: [{ name: "Rust", existing: true }],
        collections: [{ name: "Language Design", existing: true }],
      },
      { asProposed: false }
    );

    expect(merged.tags).toEqual([
      { name: "AI", existing: true },
      { name: "Rust", existing: true },
    ]);
    expect(merged.collections).toEqual([
      { name: "Language Design", existing: true },
    ]);
  });
});
