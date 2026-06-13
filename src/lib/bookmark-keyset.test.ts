import { describe, expect, it } from "vitest";

import {
  buildBookmarkListCursor,
  buildBookmarkKeysetSql,
  decodeBookmarkListCursor,
  encodeBookmarkListCursor,
  cursorMatchesRequest,
} from "./bookmark-keyset";

describe("bookmark keyset cursors", () => {
  const bookmark = {
    id: "bookmark-1",
    bookmarkedAt: new Date("2026-05-01T12:00:00.000Z"),
    tweetCreatedAt: new Date("2026-04-30T12:00:00.000Z"),
    authorUsername: "measure_plan",
    publicMetrics: {
      like_count: 12,
      retweet_count: 3,
      reply_count: 1,
      quote_count: 0,
      bookmark_count: 4,
    },
  };

  it("round-trips cursor payloads", () => {
    const cursor = buildBookmarkListCursor(bookmark, "bookmarkedAt", "desc");
    const encoded = encodeBookmarkListCursor(cursor);

    expect(decodeBookmarkListCursor(encoded)).toEqual(cursor);
  });

  it("rejects cursors that do not match the active sort", () => {
    const cursor = buildBookmarkListCursor(bookmark, "bookmarkedAt", "desc");

    expect(cursorMatchesRequest(cursor, "bookmarkedAt", "desc")).toBe(true);
    expect(cursorMatchesRequest(cursor, "tweetCreatedAt", "desc")).toBe(false);
  });

  it("builds bookmarkedAt keyset SQL", () => {
    const cursor = buildBookmarkListCursor(bookmark, "bookmarkedAt", "desc");
    const sql = buildBookmarkKeysetSql(cursor).strings.join(" ");

    expect(sql).toContain('"bookmarkedAt"');
    expect(sql).toContain('"id"');
  });
});
