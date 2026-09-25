import { AuthenticationError, RateLimitError } from "@typesafe-ai/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { planLibraryAssignments } from "@/lib/orbit-library-assign";

const systemOneMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/typesafe", () => ({
  getTypeSafeClient: () => ({ systemOne: systemOneMock }),
  getTypeSafeModel: () => "jev-latest",
}));

vi.mock("@/lib/logger", () => ({ logWarn: vi.fn(), logError: vi.fn() }));

const vocabulary = [
  { name: "AI", color: "#1d9bf0" },
  { name: "Cooking", color: "#f97316" },
];

function posts(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `bm-${index}`,
    tweetText: `post ${index}`,
    media: null,
    xMetadata: null,
  }));
}

/** Every post in the pack matches the first tag strongly. */
function strongFirstTag(request: { questions: Record<string, unknown> }) {
  const answers: Record<string, { noul: number }> = {};
  for (const key of Object.keys(request.questions)) {
    answers[key] = { noul: key.endsWith("t0") ? 0.95 : 0.1 };
  }
  return { answers };
}

const rateLimited = () =>
  new RateLimitError(429, null, new Headers(), "rate limited");

beforeEach(() => {
  systemOneMock.mockReset();
});

describe("planLibraryAssignments", () => {
  it("retries a rate-limited pack instead of skipping its posts", async () => {
    systemOneMock
      .mockRejectedValueOnce(rateLimited())
      .mockRejectedValueOnce(rateLimited())
      .mockImplementation(async (request) => strongFirstTag(request));

    const result = await planLibraryAssignments({
      bookmarks: posts(3),
      vocabulary,
      retryBaseDelayMs: 0,
    });

    expect(systemOneMock).toHaveBeenCalledTimes(3);
    expect(result.failed).toBe(0);
    expect(result.modelChecked).toBe(3);
    expect(result.plan.suggestions.map((s) => s.tags.map((t) => t.name))).toEqual([
      ["AI"],
      ["AI"],
      ["AI"],
    ]);
  });

  it("counts a pack that stays rate limited as failed and keeps the rest", async () => {
    // Pack 1 (6 posts) always rate limited; pack 2 (2 posts) succeeds.
    systemOneMock.mockImplementation(async (request) => {
      const ids = (request.state.posts as Array<{ id: string }>).map((p) => p.id);
      if (ids.includes("bm-0")) throw rateLimited();
      return strongFirstTag(request);
    });

    const result = await planLibraryAssignments({
      bookmarks: posts(8),
      vocabulary,
      retryBaseDelayMs: 0,
    });

    expect(result.failed).toBe(6);
    expect(result.plan.suggestions.map((s) => s.bookmarkId)).toEqual([
      "bm-6",
      "bm-7",
    ]);
  });

  it("stops on a credential failure rather than failing every pack", async () => {
    systemOneMock.mockRejectedValue(
      new AuthenticationError(401, null, new Headers(), "bad key")
    );

    await expect(
      planLibraryAssignments({
        bookmarks: posts(12),
        vocabulary,
        retryBaseDelayMs: 0,
      })
    ).rejects.toMatchObject({ code: "typesafe_auth" });
  });
});
