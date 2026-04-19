import { describe, expect, it } from "vitest";
import { scanOrbitBookmarksWithXai } from "@/lib/orbit-grok";

const LIVE = Boolean(process.env.XAI_API_KEY?.trim());

describe.skipIf(!LIVE)("scanOrbitBookmarksWithXai (live xAI)", () => {
  it("returns a validated plan from the real Responses API", async () => {
    const now = new Date();
    const bookmarks = [
      {
        id: "bm-ai-1",
        tweetId: "1",
        authorUsername: "researcher",
        authorDisplayName: "AI Researcher",
        authorVerified: true,
        tweetText:
          "New paper: scaling laws for LLM evaluations on reasoning benchmarks. Link in reply.",
        tweetCreatedAt: now,
        bookmarkedAt: now,
        publicMetrics: {
          retweet_count: 12,
          reply_count: 4,
          like_count: 200,
          quote_count: 2,
          bookmark_count: 30,
        },
        media: [],
        urls: [
          {
            display_url: "arxiv.org/abs/2410.00001",
            expanded_url: "https://arxiv.org/abs/2410.00001",
            title: "Scaling laws for LLM evaluations",
            description: "Preprint",
          },
        ],
        quotedTweet: null,
        notes: [],
      },
      {
        id: "bm-ai-2",
        tweetId: "2",
        authorUsername: "mlpapers",
        authorDisplayName: "ML Papers",
        authorVerified: true,
        tweetText:
          "New preprint: mixture-of-experts routing for long-context LLM inference. Arxiv link.",
        tweetCreatedAt: now,
        bookmarkedAt: now,
        publicMetrics: null,
        media: [],
        urls: [
          {
            display_url: "arxiv.org/abs/2410.11111",
            expanded_url: "https://arxiv.org/abs/2410.11111",
            title: "Mixture-of-experts routing for long-context LLMs",
            description: "Preprint",
          },
        ],
        quotedTweet: null,
        notes: [],
      },
      {
        id: "bm-ts-1",
        tweetId: "3",
        authorUsername: "devx",
        authorDisplayName: "Dev X",
        authorVerified: false,
        tweetText:
          "Cool TypeScript trick: template literal types can encode state machines. Thread 🧵",
        tweetCreatedAt: now,
        bookmarkedAt: now,
        publicMetrics: null,
        media: [],
        urls: [],
        quotedTweet: null,
        notes: [],
      },
      {
        id: "bm-cook-1",
        tweetId: "4",
        authorUsername: "chef",
        authorDisplayName: "Chef",
        authorVerified: false,
        tweetText: "Perfect sourdough starter in 6 days, step-by-step.",
        tweetCreatedAt: now,
        bookmarkedAt: now,
        publicMetrics: null,
        media: [{ type: "photo" }],
        urls: [],
        quotedTweet: null,
        notes: [],
      },
    ];

    const result = await scanOrbitBookmarksWithXai({
      bookmarks,
      existingTags: [],
      existingCollections: [],
    });

    console.log("\n[live xAI] model:", result.model);
    console.log(
      "[live xAI] overview:",
      JSON.stringify(result.plan.overview, null, 2)
    );
    for (const suggestion of result.plan.suggestions) {
      console.log(
        `[live xAI] ${suggestion.bookmarkId} tags=${JSON.stringify(
          suggestion.tags.map((t) => `${t.name} ${t.color}`)
        )} collection=${suggestion.collection ? suggestion.collection.name : "null"}`
      );
    }
    console.log("[live xAI] summary:", JSON.stringify(result.summary, null, 2));

    expect(result.plan.suggestions).toHaveLength(bookmarks.length);
    for (const suggestion of result.plan.suggestions) {
      for (const tag of suggestion.tags) {
        expect(tag.color).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    }

    const aiSuggestions = result.plan.suggestions.filter((s) =>
      s.bookmarkId.startsWith("bm-ai-")
    );
    const aiCollectionNames = new Set(
      aiSuggestions.flatMap((s) => (s.collection ? [s.collection.name] : []))
    );
    expect(
      aiCollectionNames.size,
      "Expected both AI papers to share a new collection bucket"
    ).toBeGreaterThan(0);

    const singletonSuggestions = result.plan.suggestions.filter(
      (s) => s.bookmarkId === "bm-ts-1" || s.bookmarkId === "bm-cook-1"
    );
    for (const suggestion of singletonSuggestions) {
      expect(
        suggestion.collection,
        `Expected ${suggestion.bookmarkId} (singleton theme) to have collection=null`
      ).toBeNull();
    }
  }, 180_000);
});
