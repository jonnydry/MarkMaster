import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    orbitDecisionEvent: {
      createMany: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("./prisma", () => ({ prisma: mocks.prisma }));

import {
  getOrbitLearningHintsForScan,
  recordOrbitDecisionEvents,
} from "./orbit-decision-events";

describe("orbit decision events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records bounded review outcome events", async () => {
    mocks.prisma.orbitDecisionEvent.createMany.mockResolvedValue({ count: 1 });

    await expect(
      recordOrbitDecisionEvents({
        userId: "user-1",
        events: [
          {
            bookmarkId: "bookmark-1",
            action: "edited",
            source: "orbit-review",
            mode: "deep",
            originalSuggestion: {
              bookmarkId: "bookmark-1",
              confidence: "high",
              reasoning: "Original",
              tags: [],
              collection: null,
            },
            reviewedSuggestion: {
              bookmarkId: "bookmark-1",
              confidence: "high",
              reasoning: "Reviewed",
              tags: [
                {
                  name: "AI",
                  color: "#1d9bf0",
                  reason: "Edited",
                  reuseExisting: true,
                },
              ],
              collection: null,
            },
          },
        ],
      })
    ).resolves.toEqual({ count: 1 });

    expect(mocks.prisma.orbitDecisionEvent.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            userId: "user-1",
            bookmarkId: "bookmark-1",
            action: "edited",
            source: "orbit-review",
            mode: "deep",
          }),
        ],
      })
    );
  });

  it("derives positive and negative hints from recent matching decisions", async () => {
    mocks.prisma.orbitDecisionEvent.findMany.mockResolvedValue([
      {
        action: "accepted",
        originalSuggestion: null,
        reviewedSuggestion: {
          bookmarkId: "old-1",
          tags: [{ name: "AI" }],
          collection: { name: "AI Papers" },
        },
        bookmark: {
          authorUsername: "researcher",
          urls: [
            {
              expanded_url: "https://arxiv.org/abs/1",
            },
          ],
          collectionItems: [
            {
              collection: { name: "AI Papers" },
            },
          ],
        },
      },
      {
        action: "kept",
        originalSuggestion: {
          bookmarkId: "old-2",
          tags: [{ name: "Article" }],
          collection: null,
        },
        reviewedSuggestion: null,
        bookmark: {
          authorUsername: "researcher",
          urls: [],
          collectionItems: [],
        },
      },
    ]);

    const hints = await getOrbitLearningHintsForScan({
      userId: "user-1",
      bookmarks: [
        {
          id: "bookmark-1",
          authorUsername: "researcher",
          urls: [{ expanded_url: "https://arxiv.org/abs/2" }],
          xFolderHints: [{ name: "AI Papers" }],
        },
      ],
    });

    expect(hints).toEqual([
      {
        bookmarkId: "bookmark-1",
        matchingTags: ["AI"],
        matchingCollections: ["AI Papers"],
        avoidTags: ["Article"],
        avoidCollections: [],
        reasons: expect.arrayContaining([
          "same author",
          "same X folder: AI Papers",
          "same link domain: arxiv.org",
        ]),
      },
    ]);
  });
});
