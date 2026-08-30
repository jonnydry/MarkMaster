import { describe, expect, it } from "vitest";

import {
  buildBookmarkListCursor,
  buildBookmarkKeysetSql,
  decodeBookmarkListCursor,
  encodeBookmarkListCursor,
  cursorMatchesRequest,
  getBookmarkSortValue,
  parsePerformanceCursorCounts,
  type BookmarkListCursor,
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

  it("builds bookmarkedAt keyset SQL as a row-value comparison", () => {
    const cursor = buildBookmarkListCursor(bookmark, "bookmarkedAt", "desc");
    const fragment = buildBookmarkKeysetSql(cursor);
    const sql = fragment.strings.join("?");

    expect(sql).toContain('(b."bookmarkedAt", b."id") <');
    expect(sql).not.toContain(" OR ");
    expect(fragment.values).toContain("bookmark-1");
  });

  it("flips the row-value operator for ascending sorts", () => {
    const cursor = buildBookmarkListCursor(bookmark, "likes", "asc");
    const sql = buildBookmarkKeysetSql(cursor).strings.join("?");

    expect(sql).toContain("'like_count')::int, 0), b.\"id\") >");
  });

  it("carries raw metric counts in performance cursors", () => {
    expect(getBookmarkSortValue(bookmark, "performance")).toBe("12,3,1,0,4");

    const cursor = buildBookmarkListCursor(bookmark, "performance", "desc");
    const decoded = decodeBookmarkListCursor(encodeBookmarkListCursor(cursor));

    expect(decoded).toEqual(cursor);
    expect(parsePerformanceCursorCounts(cursor.sortValue)).toEqual([
      12, 3, 1, 0, 4,
    ]);
  });

  it("rebuilds the performance boundary score in SQL from cursor counts", () => {
    const cursor = buildBookmarkListCursor(bookmark, "performance", "desc");
    const fragment = buildBookmarkKeysetSql(cursor);
    const sql = fragment.strings.join("?");

    // Both sides of the comparison are LN expressions computed by Postgres —
    // the boundary side is parameterized with the raw counts, never a JS float.
    expect(sql).toContain("LN(1 + ?::int)");
    expect(fragment.values).toEqual(
      expect.arrayContaining([12, 3, 1, 0, 4, "bookmark-1"])
    );
    expect(sql).not.toContain(" OR ");
  });

  it("keeps accepting legacy v1 performance cursors with a float sortValue", () => {
    const legacyCursor: BookmarkListCursor = {
      sortField: "performance",
      sortDirection: "desc",
      sortValue: 24.514382345,
      id: "bookmark-1",
    };
    const decoded = decodeBookmarkListCursor(
      encodeBookmarkListCursor(legacyCursor)
    );

    expect(decoded).toEqual(legacyCursor);

    const fragment = buildBookmarkKeysetSql(legacyCursor);
    expect(fragment.values).toContain(24.514382345);
  });

  it("rejects malformed performance count strings", () => {
    const badCursor: BookmarkListCursor = {
      sortField: "performance",
      sortDirection: "desc",
      sortValue: "12,3,nope,0,4",
      id: "bookmark-1",
    };

    expect(
      decodeBookmarkListCursor(encodeBookmarkListCursor(badCursor))
    ).toBeNull();
    expect(parsePerformanceCursorCounts("1,2,3")).toBeNull();
    expect(parsePerformanceCursorCounts("1,2,3,4,-5")).toBeNull();
  });

  it("rejects metric-sort cursors whose sortValue is not numeric", () => {
    const badCursor: BookmarkListCursor = {
      sortField: "likes",
      sortDirection: "desc",
      sortValue: "not-a-number",
      id: "bookmark-1",
    };

    expect(
      decodeBookmarkListCursor(encodeBookmarkListCursor(badCursor))
    ).toBeNull();
  });
});
