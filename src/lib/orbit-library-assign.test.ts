import { AuthenticationError, RateLimitError } from "@typesafe-ai/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  libraryPostJudgmentText,
  planLibraryAssignments,
  shortlistLibraryPackTags,
} from "@/lib/orbit-library-assign";

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

describe("libraryPostJudgmentText", () => {
  it("includes the long-post note, article, link, and image alt text", () => {
    const text = libraryPostJudgmentText({
      id: "bm-1",
      tweetText: "Today we’re announcing OrcaSAQ-2",
      media: [{ type: "photo", alt_text: "Gradient card for the model" }],
      urls: [{ expanded_url: "https://example.com/ignored" }],
      xMetadata: {
        tweet: {
          note_tweet: {
            text: "A 27B model you can deploy.\nhttps://t.co/FqslE1kYnw",
            entities: {
              urls: [{ expanded_url: "https://huggingface.co/orcarouter/OrcaSAQ-2-27B" }],
            },
          },
          article: { title: "OrcaSAQ-2" },
        },
        author: { description: "Quantization research." },
      },
    });

    expect(text).toContain("A 27B model you can deploy.");
    expect(text).toContain("Today we’re announcing");
    expect(text).toContain("OrcaSAQ-2");
    expect(text).toContain("huggingface.co/orcarouter/OrcaSAQ-2-27B");
    expect(text).toContain("Gradient card for the model");
    expect(text).not.toContain("Quantization research.");
  });
});

describe("shortlistLibraryPackTags", () => {
  it("keeps a rare tag whose name is in the post ahead of unused popular tags", () => {
    const vocabulary = [
      ...Array.from({ length: 40 }, (_, index) => ({
        name: `Popular ${index}`,
        color: "#111111",
      })),
      { name: "Quantization", color: "#222222" },
    ];
    const shortlist = shortlistLibraryPackTags(
      [
        {
          id: "bm-1",
          tweetText: "Notes on quantization for long-horizon agents.",
          media: null,
        },
      ],
      vocabulary,
      8
    );

    expect(shortlist[0]).toBe("Quantization");
    expect(shortlist).toHaveLength(8);
  });

  it("does not treat a tag as present when it is only a fragment of another word", () => {
    const shortlist = shortlistLibraryPackTags(
      [{ id: "bm-1", tweetText: "This is available at the start.", media: null }],
      [
        { name: "Cooking", color: "#333333" },
        { name: "AI", color: "#111111" },
        { name: "Art", color: "#222222" },
      ],
      3
    );

    expect(shortlist).toEqual(["Cooking", "AI", "Art"]);
  });

  it("dedupes vocabulary names before packing questions", () => {
    const shortlist = shortlistLibraryPackTags(
      [{ id: "bm-1", tweetText: "Notes on quantization.", media: null }],
      [
        { name: "Quantization", color: "#111111" },
        { name: "quantization", color: "#222222" },
        { name: "Cooking", color: "#333333" },
      ],
      8
    );

    expect(shortlist.filter((name) => /quantization/i.test(name))).toHaveLength(1);
    expect(shortlist[0]).toBe("Quantization");
  });
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
