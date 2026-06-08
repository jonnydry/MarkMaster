import { describe, expect, it } from "vitest";

import {
  buildCollectionsSummary,
  collectionMatchesSearch,
  computeCollectionStats,
  filterCollections,
  matchesCollectionFilter,
  splitCollections,
} from "@/lib/collections-presentation";
import type { CollectionWithCount } from "@/types";

function collection(
  overrides: Partial<CollectionWithCount> & Pick<CollectionWithCount, "id" | "name">
): CollectionWithCount {
  return {
    description: null,
    color: "#000000",
    isPublic: false,
    type: "user_collection",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    _count: { items: 0 },
    ...overrides,
  };
}

describe("splitCollections", () => {
  it("groups user collections and X folders", () => {
    const grouped = splitCollections([
      collection({ id: "a", name: "Mine" }),
      collection({ id: "b", name: "X Folder", type: "x_folder" }),
    ]);

    expect(grouped.userCollections.map((entry) => entry.id)).toEqual(["a"]);
    expect(grouped.xFolders.map((entry) => entry.id)).toEqual(["b"]);
  });
});

describe("filterCollections", () => {
  it("filters by type and search text", () => {
    const entries = [
      collection({ id: "a", name: "Research", isPublic: true, _count: { items: 2 } }),
      collection({ id: "b", name: "Archive", _count: { items: 1 } }),
      collection({ id: "c", name: "Synced", type: "x_folder", _count: { items: 3 } }),
    ];

    expect(filterCollections(entries, "public", "")).toEqual([entries[0]]);
    expect(filterCollections(entries, "all", "synced")).toEqual([entries[2]]);
  });
});

describe("computeCollectionStats", () => {
  it("summarizes bookmark totals and largest shelf", () => {
    const userCollections = [
      collection({ id: "a", name: "Small", _count: { items: 1 } }),
      collection({ id: "b", name: "Big", isPublic: true, _count: { items: 5 } }),
    ];

    const stats = computeCollectionStats(userCollections, userCollections);

    expect(stats.totalBookmarks).toBe(6);
    expect(stats.publicCount).toBe(1);
    expect(stats.largestCollection?.id).toBe("b");
    expect(stats.maxItems).toBe(5);
  });
});

describe("collectionMatchesSearch", () => {
  it("matches public status text", () => {
    const entry = collection({ id: "a", name: "Hidden", isPublic: true });
    expect(collectionMatchesSearch(entry, "public")).toBe(true);
    expect(matchesCollectionFilter(entry, "public")).toBe(true);
  });
});

describe("buildCollectionsSummary", () => {
  it("describes personal and X folder counts", () => {
    expect(
      buildCollectionsSummary(
        false,
        false,
        [collection({ id: "a", name: "A" })],
        [collection({ id: "b", name: "B", type: "x_folder" })],
        2
      )
    ).toBe("1 personal collection · 1 X folder");
  });
});
