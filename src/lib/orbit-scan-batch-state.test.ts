import { describe, expect, it } from "vitest";
import { deriveOrbitScanBatchState, mergeReviewBookmarks } from "@/lib/orbit-scan-batch-state";
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

describe("mergeReviewBookmarks", () => {
  it("merges queue and candidate bookmarks with queue winning conflicts", () => {
    const queue = [bookmark("a"), bookmark("b")];
    const candidates = [bookmark("b"), bookmark("c")];

    const merged = mergeReviewBookmarks(queue, candidates);
    expect(merged.map((entry) => entry.id).sort()).toEqual(["a", "b", "c"]);
  });
});

describe("deriveOrbitScanBatchState", () => {
  it("returns clear labels when the queue is empty", () => {
    const state = deriveOrbitScanBatchState({
      scanCandidateBookmarks: [],
      bookmarkById: new Map(),
      scanQuality: undefined,
      scanBatchMode: "auto",
      selectionMode: false,
      selectedBookmarkIds: new Set(),
      queueSortDirection: "desc",
      queueIsLoading: false,
      hasSearchQuery: false,
      scanning: false,
      hasPlan: false,
    });

    expect(state.scanTargetIds).toEqual([]);
    expect(state.scanHelperText).toBe("Orbit is clear.");
    expect(state.scanButtonLabel).toBe("Orbit is clear");
  });

  it("describes selection scans when bookmarks are selected", () => {
    const bookmarks = [bookmark("one"), bookmark("two")];
    const bookmarkById = new Map(bookmarks.map((entry) => [entry.id, entry]));

    const state = deriveOrbitScanBatchState({
      scanCandidateBookmarks: bookmarks,
      bookmarkById,
      scanQuality: undefined,
      scanBatchMode: "auto",
      selectionMode: true,
      selectedBookmarkIds: new Set(["one"]),
      queueSortDirection: "desc",
      queueIsLoading: false,
      hasSearchQuery: false,
      scanning: false,
      hasPlan: false,
    });

    expect(state.scanningSelection).toBe(true);
    expect(state.scanTargetIds).toEqual(["one"]);
    expect(state.scanButtonLabel).toBe("Auto-categorize selection");
  });
});
