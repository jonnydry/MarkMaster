import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const scanOrbitBookmarksWithXaiMock = vi.hoisted(() => vi.fn());
const applyOrbitScanPlanMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  getDbUser: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/lib/orbit-author-history", () => ({
  getAuthorPriorHintsForScan: vi.fn(async () => []),
}));

vi.mock("@/lib/orbit-decision-events", () => ({
  getOrbitLearningHintsForScan: vi.fn(async () => []),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    bookmark: {
      findMany: vi.fn(),
    },
    tag: {
      findMany: vi.fn(),
    },
    collection: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/orbit-grok", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/orbit-grok")>();
  return {
    ...actual,
    scanOrbitBookmarksWithXai: scanOrbitBookmarksWithXaiMock,
    applyOrbitScanPlan: applyOrbitScanPlanMock,
  };
});

async function mockScanData() {
  const { prisma } = await import("@/lib/prisma");

  vi.mocked(prisma.bookmark.findMany).mockResolvedValue([
    {
      id: "bookmark-1",
      tweetId: "tweet-1",
      authorId: "author-1",
      authorUsername: "researcher",
      authorDisplayName: "Researcher",
      authorProfileImage: null,
      authorVerified: false,
      tweetText: "Sparse saved post",
      publicMetrics: null,
      media: null,
      urls: null,
      quotedTweet: null,
      tweetCreatedAt: new Date("2026-05-01T00:00:00.000Z"),
      bookmarkedAt: new Date("2026-05-02T00:00:00.000Z"),
      syncedAt: new Date("2026-05-02T00:00:00.000Z"),
      userId: "user-1",
      notes: [],
      collectionItems: [],
    },
  ]);
  vi.mocked(prisma.tag.findMany).mockResolvedValue([]);
  vi.mocked(prisma.collection.findMany).mockResolvedValue([]);
}

function createScanRequest() {
  return new NextRequest("http://localhost/api/orbit/scan", {
    method: "POST",
    body: JSON.stringify({
      mode: "scan",
      bookmarkIds: ["bookmark-1"],
    }),
  });
}

describe("/api/orbit/scan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scanOrbitBookmarksWithXaiMock.mockResolvedValue({
      model: "test-model",
      scannedAt: "2026-05-11T00:00:00.000Z",
      privacy: {
        storeDisabled: true,
        zeroDataRetention: null,
      },
      plan: {
        overview: {
          summary: "Test scan",
          taggingStrategy: "Use hints",
          collectionStrategy: "Stay conservative",
        },
        suggestions: [],
      },
      summary: {
        bookmarkCount: 0,
        bookmarksWithTags: 0,
        bookmarksWithCollections: 0,
        tagAssignments: 0,
        uniqueTags: 0,
        collectionBuckets: 0,
        reusedExistingTags: 0,
        reusedExistingCollections: 0,
        newCollectionBuckets: 0,
      },
      tagRollups: [],
      collectionRollups: [],
    });
  });

  it("passes synced X folder names as scan hints, not editable collections", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { POST } = await import("./route");

    vi.mocked(prisma.bookmark.findMany).mockResolvedValue([
      {
        id: "bookmark-1",
        tweetId: "tweet-1",
        authorId: "author-1",
        authorUsername: "researcher",
        authorDisplayName: "Researcher",
        authorProfileImage: null,
        authorVerified: false,
        tweetText: "Sparse saved post",
        publicMetrics: null,
        media: null,
        urls: null,
        quotedTweet: null,
        tweetCreatedAt: new Date("2026-05-01T00:00:00.000Z"),
        bookmarkedAt: new Date("2026-05-02T00:00:00.000Z"),
        syncedAt: new Date("2026-05-02T00:00:00.000Z"),
        userId: "user-1",
        notes: [],
        collectionItems: [
          {
            collection: {
              id: "x-folder-1",
              name: "AI Papers",
              type: "x_folder",
            },
          },
          {
            collection: {
              id: "collection-1",
              name: "Research",
              type: "user_collection",
            },
          },
        ],
      },
    ]);
    vi.mocked(prisma.tag.findMany).mockResolvedValue([]);
    vi.mocked(prisma.collection.findMany).mockResolvedValue([
      {
        id: "collection-1",
        name: "Research",
        description: "Editable research collection",
        _count: { items: 3 },
      },
    ]);

    const response = await POST(
      new NextRequest("http://localhost/api/orbit/scan", {
        method: "POST",
        body: JSON.stringify({
          mode: "scan",
          bookmarkIds: ["bookmark-1"],
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(prisma.bookmark.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          collectionItems: {
            select: {
              collection: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                },
              },
            },
          },
        }),
      })
    );
    expect(scanOrbitBookmarksWithXaiMock).toHaveBeenCalledWith(
      expect.objectContaining({
        bookmarks: [
          expect.objectContaining({
            id: "bookmark-1",
            xFolderHints: [{ id: "x-folder-1", name: "AI Papers" }],
          }),
        ],
        existingCollections: [
          {
            id: "collection-1",
            name: "Research",
            description: "Editable research collection",
            bookmarkCount: 3,
          },
        ],
        authorPriorHints: [],
        learningHints: [],
      })
    );
  });

  it.each([
    {
      code: "xai_auth",
      status: 502,
      message: "xAI rejected the request. Confirm your API key and model access.",
    },
    {
      code: "xai_model",
      status: 502,
      message: "xAI could not find the configured Grok model.",
    },
    {
      code: "xai_rate_limited",
      status: 429,
      message: "xAI rate limit reached. Try the scan again in a moment.",
      retryAfterSeconds: 45,
    },
  ] as const)(
    "returns structured $code failures from xAI scans",
    async ({ code, status, message, retryAfterSeconds }) => {
      const { POST } = await import("./route");
      const { OrbitGrokError } = await import("@/lib/orbit-grok");

      await mockScanData();
      scanOrbitBookmarksWithXaiMock.mockRejectedValueOnce(
        new OrbitGrokError(message, status, code, { retryAfterSeconds })
      );

      const response = await POST(createScanRequest());

      expect(response.status).toBe(status);
      await expect(response.json()).resolves.toMatchObject({
        error: message,
        code,
        ...(retryAfterSeconds ? { retryAfterSeconds } : {}),
      });
    }
  );
});
