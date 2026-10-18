import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));

import {
  formatDemoReport,
  keywordHitIds,
  parseBookmarkExport,
  smartHitIds,
  type DemoBookmark,
} from "./smart-search-demo";

function bookmark(id: string, overrides: Partial<DemoBookmark> = {}): DemoBookmark {
  return {
    id,
    tweetText: `note ${id}`,
    authorUsername: "ada",
    authorDisplayName: "Ada",
    urls: null,
    quotedTweet: null,
    tagNames: [],
    note: null,
    bookmarkedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("parseBookmarkExport", () => {
  it("reads a MarkMaster JSON export and a richer bookmark record", () => {
    const parsed = parseBookmarkExport([
      {
        tweetId: "1",
        author: { name: "Ada Lovelace", username: "ada" },
        text: "Ownership",
        tags: ["rust"],
        note: "later",
        bookmarkedDate: "2026-04-01T00:00:00.000Z",
      },
      {
        id: "b2",
        tweetText: "Quoted",
        authorUsername: "grace",
        authorDisplayName: "Grace",
        tags: [{ tag: { name: "compilers" } }],
        notes: [{ content: "margin" }],
        urls: [{ title: "Paper" }],
        quotedTweet: { text: "original" },
        bookmarkedAt: "2026-05-01T00:00:00.000Z",
      },
    ]);

    expect(parsed[0]).toMatchObject({
      id: "1",
      tweetText: "Ownership",
      authorUsername: "ada",
      authorDisplayName: "Ada Lovelace",
      tagNames: ["rust"],
      note: "later",
    });
    expect(parsed[1]).toMatchObject({
      id: "b2",
      tagNames: ["compilers"],
      note: "margin",
      urls: [{ title: "Paper" }],
    });
  });

  it("accepts a bookmarks envelope and rejects other shapes", () => {
    expect(parseBookmarkExport({ bookmarks: [] })).toEqual([]);
    expect(() => parseBookmarkExport({ items: [] })).toThrow(/JSON array/);
  });
});

describe("keyword and smart demo ranking", () => {
  const bookmarks = [
    bookmark("old", {
      tweetText: "sourdough starter",
      bookmarkedAt: "2026-01-01T00:00:00.000Z",
    }),
    bookmark("new", {
      tweetText: "rustc borrow checker",
      bookmarkedAt: "2026-06-01T00:00:00.000Z",
      tagNames: ["baking"],
    }),
    bookmark("tagged", {
      tweetText: "hello",
      tagNames: ["sourdough"],
      bookmarkedAt: "2026-07-01T00:00:00.000Z",
    }),
  ];

  it("matches the same fields as ILIKE and ignores tag names", () => {
    expect(keywordHitIds(bookmarks, "sourdough")).toEqual(["old"]);
    expect(keywordHitIds(bookmarks, "a")).toEqual([]);
  });

  it("ranks a hit that is in both lists ahead of a vector-only neighbor", () => {
    const vectors = new Map<string, number[]>([
      ["old", [1, 0]],
      ["new", [0, 1]],
      ["tagged", [0, 1]],
    ]);
    expect(smartHitIds(bookmarks, [1, 0], vectors, "borrow")).toEqual(["new", "old", "tagged"]);
  });

  it("formats keyword and smart top-5 lines", () => {
    const report = formatDemoReport({
      query: "borrow",
      bookmarks,
      keywordIds: ["new"],
      smartIds: ["old", "new"],
    });
    expect(report).toContain("query: borrow");
    expect(report).toContain("@ada — rustc borrow checker");
    expect(report).toContain("smart:");
  });
});
