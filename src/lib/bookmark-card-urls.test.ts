import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
}));

vi.mock("./prisma", () => ({
  prisma: { $queryRaw: mocks.queryRaw },
}));

import { withBookmarkCardUrls } from "./bookmark-card-urls";

describe("withBookmarkCardUrls", () => {
  beforeEach(() => {
    mocks.queryRaw.mockReset();
  });

  it("leaves photo posts alone", async () => {
    const bookmarks = [
      {
        id: "photo",
        media: [{ type: "photo", url: "https://pbs.twimg.com/media/a.jpg" }],
        urls: null,
      },
    ];

    await expect(withBookmarkCardUrls(bookmarks)).resolves.toEqual(bookmarks);
    expect(mocks.queryRaw).not.toHaveBeenCalled();
  });

  it("reads a long-post link that was not stored on urls", async () => {
    mocks.queryRaw.mockResolvedValue([
      {
        id: "note",
        note_urls: [{ expanded_url: "https://huggingface.co/orcarouter/OrcaSAQ-2-27B" }],
        tweet_urls: null,
      },
    ]);

    const [bookmark] = await withBookmarkCardUrls([
      { id: "note", media: null, urls: null },
    ]);

    expect(bookmark?.cardUrl).toBe("https://huggingface.co/orcarouter/OrcaSAQ-2-27B");
  });

  it("uses a stored page link without reading xMetadata", async () => {
    const [bookmark] = await withBookmarkCardUrls([
      {
        id: "link",
        media: null,
        urls: [{ expanded_url: "https://github.com/example/repo" }],
      },
    ]);

    expect(bookmark?.cardUrl).toBe("https://github.com/example/repo");
    expect(mocks.queryRaw).not.toHaveBeenCalled();
  });
});
