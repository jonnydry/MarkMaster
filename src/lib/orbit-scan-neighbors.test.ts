import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    bookmark: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

import { getOrbitNeighborHintsForScan } from "./orbit-scan-neighbors";

describe("getOrbitNeighborHintsForScan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns neighbor tag and collection hints for matching author and domain", async () => {
    mocks.prisma.bookmark.findMany.mockResolvedValue([
      {
        id: "neighbor-1",
        authorUsername: "researcher",
        urls: [{ expanded_url: "https://arxiv.org/abs/1" }],
        tags: [{ tag: { name: "AI" } }, { tag: { name: "Paper" } }],
        collectionItems: [{ collection: { name: "AI Papers" } }],
      },
    ]);

    const hints = await getOrbitNeighborHintsForScan({
      userId: "user-1",
      bookmarks: [
        {
          id: "bookmark-1",
          authorUsername: "researcher",
          urls: [{ expanded_url: "https://arxiv.org/abs/2" }],
        },
      ],
    });

    expect(mocks.prisma.bookmark.findMany).toHaveBeenCalledTimes(1);
    expect(hints).toEqual([
      {
        bookmarkId: "bookmark-1",
        hint: {
          tags: ["AI", "Paper"],
          collections: ["AI Papers"],
          reasons: expect.arrayContaining([
            "same author",
            "same link domain: arxiv.org",
          ]),
        },
      },
    ]);
  });

  it("dedupes neighbors that match both author and domain", async () => {
    mocks.prisma.bookmark.findMany.mockResolvedValue([
      {
        id: "neighbor-1",
        authorUsername: "researcher",
        urls: [{ expanded_url: "https://arxiv.org/abs/1" }],
        tags: [{ tag: { name: "AI" } }],
        collectionItems: [{ collection: { name: "AI Papers" } }],
      },
    ]);

    const hints = await getOrbitNeighborHintsForScan({
      userId: "user-1",
      bookmarks: [
        {
          id: "bookmark-1",
          authorUsername: "researcher",
          urls: [{ expanded_url: "https://arxiv.org/abs/2" }],
        },
      ],
    });

    expect(hints[0]?.hint.tags).toEqual(["AI"]);
    expect(hints[0]?.hint.collections).toEqual(["AI Papers"]);
  });
});