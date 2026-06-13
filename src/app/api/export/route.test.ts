import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  getDbUser: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/lib/bookmark-export", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bookmark-export")>();
  return {
    ...actual,
    iterateBookmarkExportBatches: vi.fn(),
  };
});

describe("/api/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("streams CSV export in batches", async () => {
    const { iterateBookmarkExportBatches } = await import("@/lib/bookmark-export");
    const { GET } = await import("./route");

    vi.mocked(iterateBookmarkExportBatches).mockImplementation(async function* () {
      yield [
        {
          tweetId: "1",
          authorDisplayName: "Author",
          authorUsername: "author",
          tweetText: "Hello",
          publicMetrics: null,
          tags: [],
          notes: [],
          tweetCreatedAt: new Date("2026-05-01T12:00:00.000Z"),
          bookmarkedAt: new Date("2026-05-02T12:00:00.000Z"),
          tweetUrl: "https://x.com/author/status/1",
          urls: null,
        },
      ] as never;
    });

    const response = await GET(
      new NextRequest("http://localhost/api/export?format=csv")
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/csv");
    expect(iterateBookmarkExportBatches).toHaveBeenCalledWith("user-1");

    const body = await response.text();
    expect(body.startsWith("Tweet ID,Author")).toBe(true);
    expect(body).toContain("author");
  });
});
