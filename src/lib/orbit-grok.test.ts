import { describe, expect, it } from "vitest";
import {
  buildOrbitPromptPayload,
  buildOrbitCollectionRollups,
  buildOrbitScanSummary,
  extractXaiResponsesOutputText,
  normalizeOrbitScanPlan,
  orbitScanPlanSchema,
  parseXaiOrbitScanPlanJson,
} from "@/lib/orbit-grok";

describe("parseXaiOrbitScanPlanJson", () => {
  it("accepts recoverable provider drift so normalization can repair it", () => {
    const longReason = "Grok sometimes writes a longer rationale. ".repeat(8);
    const raw = {
      overview: {
        summary: "Provider pass",
        taggingStrategy: "Reuse clear tags",
        collectionStrategy: "Only clear homes",
      },
      suggestions: [
        {
          bookmarkId: "b1",
          confidence: "HIGH",
          reasoning: longReason,
          tags: [
            {
              name: "AI",
              color: "blue",
              reason: longReason,
              reuseExisting: "false",
            },
          ],
          collection: null,
        },
      ],
    };

    expect(orbitScanPlanSchema.safeParse(raw).success).toBe(false);

    const parsed = parseXaiOrbitScanPlanJson(raw);
    const normalized = normalizeOrbitScanPlan(parsed, {
      bookmarkIds: ["b1"],
      existingTags: [],
      existingCollections: [],
    });

    expect(normalized.suggestions[0]).toMatchObject({
      bookmarkId: "b1",
      confidence: "high",
      tags: [
        {
          name: "AI",
          reuseExisting: false,
        },
      ],
      collection: null,
    });
    expect(normalized.suggestions[0].tags[0].color).toMatch(/^#[0-9a-f]{6}$/);
    expect(normalized.suggestions[0].reasoning.length).toBeLessThanOrEqual(240);
    expect(normalized.suggestions[0].tags[0].reason.length).toBeLessThanOrEqual(
      180
    );
  });

  it("unwraps common scan plan envelopes from provider output", () => {
    const parsed = parseXaiOrbitScanPlanJson({
      plan: {
        overview: {
          summary: "Wrapped pass",
          taggingStrategy: "Use topics",
          collectionStrategy: "No collections",
        },
        suggestions: [
          {
            bookmarkId: "b1",
            confidence: "medium",
            reasoning: "Topic is inferable.",
            tags: [],
            collection: null,
          },
        ],
      },
    });

    expect(parsed.suggestions).toHaveLength(1);
    expect(parsed.suggestions[0]).toMatchObject({
      bookmarkId: "b1",
      confidence: "medium",
    });
  });
});

describe("normalizeOrbitScanPlan", () => {
  it("reuses existing tag and collection names and fills missing bookmarks", () => {
    const parsed = orbitScanPlanSchema.parse({
      overview: {
        summary: "A first pass",
        taggingStrategy: "Use strong topic tags",
        collectionStrategy: "Reuse clear homes",
      },
      suggestions: [
        {
          bookmarkId: "b1",
          confidence: "high",
          reasoning: "Useful AI systems bookmark",
          tags: [
            {
              name: " ai ",
              color: "#ef4444",
              reason: "AI topic",
              reuseExisting: false,
            },
            {
              name: "Tools",
              color: "#22c55e",
              reason: "Tooling bookmark",
              reuseExisting: false,
            },
            {
              name: "Tools",
              color: "#22c55e",
              reason: "Duplicate",
              reuseExisting: false,
            },
          ],
          collection: {
            name: " research ",
            description: "Deep work reads",
            reason: "Fits the research collection",
            reuseExisting: false,
          },
        },
      ],
    });

    const normalized = normalizeOrbitScanPlan(parsed, {
      bookmarkIds: ["b1", "b2"],
      existingTags: [{ name: "AI", color: "#1d9bf0" }],
      existingCollections: [{ name: "Research", description: "Saved research" }],
    });

    expect(normalized.suggestions).toHaveLength(2);
    expect(normalized.suggestions[0]).toMatchObject({
      bookmarkId: "b1",
      tags: [
        {
          name: "AI",
          color: "#1d9bf0",
          reuseExisting: true,
        },
        {
          name: "Tools",
          color: "#22c55e",
          reuseExisting: false,
        },
      ],
      collection: {
        name: "Research",
        description: "Saved research",
        reuseExisting: true,
      },
    });
    expect(normalized.suggestions[1]).toMatchObject({
      bookmarkId: "b2",
      confidence: "low",
      tags: [],
      collection: null,
    });
  });

  it("cleans noisy tags and collapses overlapping topic labels", () => {
    const parsed = orbitScanPlanSchema.parse({
      overview: {
        summary: "Noisy pass",
        taggingStrategy: "Clean up model labels",
        collectionStrategy: "Avoid one-off buckets",
      },
      suggestions: [
        {
          bookmarkId: "b1",
          confidence: "medium",
          reasoning: "Sparse bookmark, but URL preview mentions model evals.",
          tags: [
            {
              name: " Artificial Intelligence ",
              color: "#ef4444",
              reason: "Broad duplicate",
              reuseExisting: false,
            },
            {
              name: "#AI",
              color: "#22c55e",
              reason: "Duplicate alias",
              reuseExisting: false,
            },
            {
              name: "Article",
              color: "#93c5fd",
              reason: "Generic metadata",
              reuseExisting: false,
            },
            {
              name: "arxiv.org",
              color: "#06b6d4",
              reason: "Domain, not a topic",
              reuseExisting: false,
            },
          ],
          collection: null,
        },
      ],
    });

    const normalized = normalizeOrbitScanPlan(parsed, {
      bookmarkIds: ["b1"],
      existingTags: [{ name: "AI", color: "#1d9bf0" }],
      existingCollections: [],
    });

    expect(normalized.suggestions[0].tags).toEqual([
      {
        name: "AI",
        color: "#1d9bf0",
        reason: "Broad duplicate",
        reuseExisting: true,
      },
    ]);
  });

  it("keeps dotted technology tags while dropping bare domains", () => {
    const parsed = orbitScanPlanSchema.parse({
      overview: {
        summary: "Dotted labels",
        taggingStrategy: "Keep tech names",
        collectionStrategy: "No collections",
      },
      suggestions: [
        {
          bookmarkId: "b1",
          confidence: "high",
          reasoning: "Framework bookmark",
          tags: [
            {
              name: "Next.js",
              color: "#000000",
              reason: "Framework topic",
              reuseExisting: false,
            },
            {
              name: "node.js",
              color: "#22c55e",
              reason: "Runtime topic",
              reuseExisting: false,
            },
            {
              name: "example.com",
              color: "#ef4444",
              reason: "Domain, not topic",
              reuseExisting: false,
            },
          ],
          collection: null,
        },
      ],
    });

    const normalized = normalizeOrbitScanPlan(parsed, {
      bookmarkIds: ["b1"],
      existingTags: [],
      existingCollections: [],
    });

    expect(normalized.suggestions[0].tags.map((tag) => tag.name)).toEqual([
      "Next.js",
      "Node.js",
    ]);
  });

  it("prefers exact existing tag matches over canonical alias matches", () => {
    const parsed = orbitScanPlanSchema.parse({
      overview: {
        summary: "Alias pass",
        taggingStrategy: "Reuse exact tags",
        collectionStrategy: "No collections",
      },
      suggestions: [
        {
          bookmarkId: "b1",
          confidence: "high",
          reasoning: "AI topic",
          tags: [
            {
              name: "AI",
              color: "#ef4444",
              reason: "Exact short tag",
              reuseExisting: false,
            },
          ],
          collection: null,
        },
      ],
    });

    const normalized = normalizeOrbitScanPlan(parsed, {
      bookmarkIds: ["b1"],
      existingTags: [
        { name: "AI", color: "#1d9bf0" },
        { name: "Artificial Intelligence", color: "#a855f7" },
      ],
      existingCollections: [],
    });

    expect(normalized.suggestions[0].tags).toEqual([
      {
        name: "AI",
        color: "#1d9bf0",
        reason: "Exact short tag",
        reuseExisting: true,
      },
    ]);
  });

  it("drops singleton new collections while keeping repeated and existing homes", () => {
    const parsed = orbitScanPlanSchema.parse({
      overview: {
        summary: "Collection pass",
        taggingStrategy: "Use topics",
        collectionStrategy: "Only durable homes",
      },
      suggestions: [
        {
          bookmarkId: "b1",
          confidence: "medium",
          reasoning: "AI eval bookmark",
          tags: [],
          collection: {
            name: " AI Papers ",
            description: "AI papers and preprints.",
            reason: "Shared research theme",
            reuseExisting: false,
          },
        },
        {
          bookmarkId: "b2",
          confidence: "medium",
          reasoning: "Another AI paper bookmark",
          tags: [],
          collection: {
            name: "ai papers",
            description: "AI papers and preprints.",
            reason: "Shared research theme",
            reuseExisting: false,
          },
        },
        {
          bookmarkId: "b3",
          confidence: "medium",
          reasoning: "One-off garden bookmark",
          tags: [],
          collection: {
            name: "Garden Ideas",
            description: "Garden notes.",
            reason: "Singleton theme",
            reuseExisting: false,
          },
        },
        {
          bookmarkId: "b4",
          confidence: "high",
          reasoning: "Belongs in an existing reading collection",
          tags: [],
          collection: {
            name: "reading queue",
            description: "Model supplied description",
            reason: "Existing user collection",
            reuseExisting: false,
          },
        },
      ],
    });

    const normalized = normalizeOrbitScanPlan(parsed, {
      bookmarkIds: ["b1", "b2", "b3", "b4"],
      existingTags: [],
      existingCollections: [
        { name: "Reading Queue", description: "Saved long-form reads" },
      ],
    });

    expect(normalized.suggestions.map((suggestion) => suggestion.collection)).toEqual([
      {
        name: "AI Papers",
        description: "AI papers and preprints.",
        reason: "Shared research theme",
        reuseExisting: false,
      },
      {
        name: "AI Papers",
        description: "AI papers and preprints.",
        reason: "Shared research theme",
        reuseExisting: false,
      },
      null,
      {
        name: "Reading Queue",
        description: "Saved long-form reads",
        reason: "Existing user collection",
        reuseExisting: true,
      },
    ]);
    expect(normalized.suggestions[2].tags).toEqual([
      {
        name: "Garden Ideas",
        color: expect.stringMatching(/^#[0-9a-f]{6}$/),
        reason: "Singleton theme",
        reuseExisting: false,
      },
    ]);
  });

  it("does not salvage low-confidence generic collection labels as tags", () => {
    const parsed = orbitScanPlanSchema.parse({
      overview: {
        summary: "Weak pass",
        taggingStrategy: "Only clear topics",
        collectionStrategy: "Avoid generic homes",
      },
      suggestions: [
        {
          bookmarkId: "b1",
          confidence: "low",
          reasoning: "No clear topic.",
          tags: [],
          collection: {
            name: "Interesting Posts",
            description: "Interesting saved posts.",
            reason: "Generic collection.",
            reuseExisting: false,
          },
        },
      ],
    });

    const normalized = normalizeOrbitScanPlan(parsed, {
      bookmarkIds: ["b1"],
      existingTags: [],
      existingCollections: [],
    });

    expect(normalized.suggestions[0]).toMatchObject({
      tags: [],
      collection: null,
    });
  });
});

describe("buildOrbitPromptPayload", () => {
  it("includes synced X folder names as source-folder hints", () => {
    const payload = buildOrbitPromptPayload({
      bookmarks: [
        {
          id: "b1",
          tweetId: "tweet-1",
          authorUsername: "researcher",
          authorDisplayName: "Researcher",
          authorVerified: true,
          tweetText: "Sparse note about a benchmark paper.",
          tweetCreatedAt: new Date("2026-05-01T12:00:00.000Z"),
          bookmarkedAt: new Date("2026-05-02T12:00:00.000Z"),
          publicMetrics: null,
          media: null,
          urls: null,
          quotedTweet: null,
          notes: [],
          xFolderHints: [
            { id: "folder-1", name: "AI Papers" },
            { id: "folder-duplicate", name: " ai papers " },
          ],
        },
      ],
      existingTags: [],
      existingCollections: [],
    });

    expect(payload.signalPriority).toEqual(
      expect.arrayContaining([expect.stringContaining("sourceFolders")])
    );
    expect(payload.collectionRules).toEqual(
      expect.arrayContaining([expect.stringContaining("read-only X folders")])
    );
    expect(payload.bookmarks[0]).toMatchObject({
      id: "b1",
      sourceFolders: [{ name: "AI Papers" }],
    });
  });
});

describe("buildOrbitScanSummary", () => {
  it("aggregates tag and collection rollups from the normalized plan", () => {
    const parsed = orbitScanPlanSchema.parse({
      overview: {
        summary: "A first pass",
        taggingStrategy: "Use strong topic tags",
        collectionStrategy: "Reuse clear homes",
      },
      suggestions: [
        {
          bookmarkId: "b1",
          confidence: "high",
          reasoning: "Fits AI research",
          tags: [
            {
              name: "AI",
              color: "#1d9bf0",
              reason: "Topic",
              reuseExisting: true,
            },
          ],
          collection: {
            name: "Research",
            description: "Saved research",
            reason: "Shared theme",
            reuseExisting: true,
          },
        },
        {
          bookmarkId: "b2",
          confidence: "medium",
          reasoning: "Useful tools bookmark",
          tags: [
            {
              name: "Tools",
              color: "#22c55e",
              reason: "Tooling",
              reuseExisting: false,
            },
          ],
          collection: {
            name: "Research",
            description: "Saved research",
            reason: "Shared theme",
            reuseExisting: true,
          },
        },
      ],
    });

    expect(buildOrbitScanSummary(parsed)).toEqual({
      bookmarkCount: 2,
      bookmarksWithTags: 2,
      bookmarksWithCollections: 2,
      tagAssignments: 2,
      uniqueTags: 2,
      collectionBuckets: 1,
      reusedExistingTags: 1,
      reusedExistingCollections: 1,
      newCollectionBuckets: 0,
    });

    expect(buildOrbitCollectionRollups(parsed)).toEqual([
      {
        name: "Research",
        description: "Saved research",
        count: 2,
        reuseExisting: true,
        bookmarkIds: ["b1", "b2"],
      },
    ]);
  });
});

describe("extractXaiResponsesOutputText", () => {
  it("reads output_text from xAI Responses API message blocks", () => {
    const payload = {
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: '{"overview":{"summary":"ok"}}' }],
        },
      ],
    };
    expect(extractXaiResponsesOutputText(payload)).toBe(
      '{"overview":{"summary":"ok"}}'
    );
  });

  it("returns null when no output_text is present", () => {
    expect(extractXaiResponsesOutputText(null)).toBeNull();
    expect(extractXaiResponsesOutputText(undefined)).toBeNull();
    expect(extractXaiResponsesOutputText({})).toBeNull();
    expect(extractXaiResponsesOutputText({ output: [] })).toBeNull();
    expect(
      extractXaiResponsesOutputText({
        output: [{ type: "message", content: [{ type: "other", text: "x" }] }],
      })
    ).toBeNull();
  });
});
