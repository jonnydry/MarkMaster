import { describe, expect, it } from "vitest";

import {
  pickDialogTargetIds,
  resolveDialogBookmarks,
} from "@/lib/bookmark-dialog-utils";
import type { BookmarkWithRelations } from "@/types";

function bookmark(id: string): BookmarkWithRelations {
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
  };
}

describe("pickDialogTargetIds", () => {
  it("prefers bulk selection ids when provided", () => {
    expect(pickDialogTargetIds(["a"], ["b", "c"])).toEqual(["b", "c"]);
  });

  it("falls back to stored target ids", () => {
    expect(pickDialogTargetIds(["a"], [])).toEqual(["a"]);
    expect(pickDialogTargetIds(["a"], undefined)).toEqual(["a"]);
  });
});

describe("resolveDialogBookmarks", () => {
  it("merges map and external bookmarks", () => {
    const byId = new Map([["a", bookmark("a")]]);
    const resolved = resolveDialogBookmarks(byId, ["a", "b"], [bookmark("b")]);
    expect(resolved.map((entry) => entry.id)).toEqual(["a", "b"]);
  });
});
