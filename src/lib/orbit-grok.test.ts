import { afterEach, describe, expect, it } from "vitest";
import { PRESET_COLORS } from "@/lib/constants";
import {
  buildOrbitPromptPayload,
  buildOrbitCollectionRollups,
  buildOrbitScanSummary,
  extractXaiResponsesOutputText,
  getOrbitXaiRuntimeStatus,
  normalizeOrbitScanPlan,
  orbitScanPlanSchema,
  parseXaiOrbitScanPlanJson,
} from "@/lib/orbit-grok";

const ORIGINAL_XAI_ENV = {
  XAI_API_KEY: process.env.XAI_API_KEY,
  XAI_API_BASE_URL: process.env.XAI_API_BASE_URL,
  XAI_ORBIT_MODEL: process.env.XAI_ORBIT_MODEL,
};

function restoreEnvValue(key: keyof typeof ORIGINAL_XAI_ENV) {
  const value = ORIGINAL_XAI_ENV[key];
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}

afterEach(() => {
  restoreEnvValue("XAI_API_KEY");
  restoreEnvValue("XAI_API_BASE_URL");
  restoreEnvValue("XAI_ORBIT_MODEL");
});

describe("getOrbitXaiRuntimeStatus", () => {
  it("reports a missing xAI key before Orbit retries", () => {
    delete process.env.XAI_API_KEY;
    delete process.env.XAI_API_BASE_URL;
    delete process.env.XAI_ORBIT_MODEL;

    const status = getOrbitXaiRuntimeStatus();

    expect(status).toMatchObject({
      state: "misconfigured",
      apiKeyConfigured: false,
      model: "grok-4.3",
      modelSource: "default",
      baseUrl: "https://api.x.ai/v1",
      baseUrlSource: "default",
      privacy: {
        storeDisabled: true,
        zeroDataRetention: null,
      },
      issues: [
        {
          code: "missing_api_key",
        },
      ],
    });
  });

  it("surfaces active model and last model failure", () => {
    process.env.XAI_API_KEY = "xai-test";
    process.env.XAI_ORBIT_MODEL = "grok-custom";
    process.env.XAI_API_BASE_URL = "https://api.x.ai/v1/";

    const status = getOrbitXaiRuntimeStatus({ lastFailureCode: "xai_model" });

    expect(status).toMatchObject({
      state: "misconfigured",
      apiKeyConfigured: true,
      model: "grok-custom",
      modelSource: "environment",
      baseUrl: "https://api.x.ai/v1",
      issues: [
        {
          code: "xai_model",
        },
      ],
    });
  });
});

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

  it("downgrades confidence when cleanup removes all applyable suggestions", () => {
    const parsed = orbitScanPlanSchema.parse({
      overview: {
        summary: "Noisy pass",
        taggingStrategy: "Clean up model labels",
        collectionStrategy: "Avoid one-off buckets",
      },
      suggestions: [
        {
          bookmarkId: "b1",
          confidence: "high",
          reasoning: "Looked useful at first glance.",
          tags: [
            {
              name: "Article",
              color: "#93c5fd",
              reason: "Generic metadata",
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

    expect(normalized.suggestions[0]).toMatchObject({
      confidence: "low",
      tags: [],
      collection: null,
      reasoning: "No applyable suggestion remained after cleanup.",
    });
  });

  it("matches plural tag suggestions to existing singular tags", () => {
    const parsed = orbitScanPlanSchema.parse({
      overview: {
        summary: "Plural pass",
        taggingStrategy: "Reuse tags",
        collectionStrategy: "No collections",
      },
      suggestions: [
        {
          bookmarkId: "b1",
          confidence: "high",
          reasoning: "Startup content",
          tags: [
            {
              name: "Startups",
              color: "#ef4444",
              reason: "Startup topic",
              reuseExisting: false,
            },
          ],
          collection: null,
        },
      ],
    });

    const normalized = normalizeOrbitScanPlan(parsed, {
      bookmarkIds: ["b1"],
      existingTags: [{ name: "Startup", color: "#1d9bf0" }],
      existingCollections: [],
    });

    expect(normalized.suggestions[0].tags[0]).toMatchObject({
      name: "Startup",
      reuseExisting: true,
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

    expect(payload.signalPriority[0]).toContain("signals.primaryText");
    expect(payload.signalPriority).toEqual(
      expect.arrayContaining([expect.stringContaining("priorDecisions")])
    );
    expect(payload.topicExtractionRules).toEqual(
      expect.arrayContaining([expect.stringContaining("domainHints")])
    );
    expect(payload.abstentionTriggers).toEqual(
      expect.arrayContaining([expect.stringContaining("signals.dataQuality")])
    );
    expect(payload.batchConsistencyRules).toEqual(
      expect.arrayContaining([expect.stringContaining("same tag spellings")])
    );
    expect(payload.collectionRules).toEqual(
      expect.arrayContaining([expect.stringContaining("read-only X folders")])
    );
    expect(payload.examples).toHaveLength(2);
    expect(payload.bookmarks[0]).toMatchObject({
      id: "b1",
      sourceFolders: [{ name: "AI Papers" }],
      signals: {
        sourceFolders: ["AI Papers"],
      },
    });
  });

  it("includes structured X topics, alt text, vocabulary matches, and learning hints", () => {
    const payload = buildOrbitPromptPayload({
      bookmarks: [
        {
          id: "b1",
          tweetId: "tweet-1",
          authorUsername: "researcher",
          authorDisplayName: "Researcher",
          authorVerified: true,
          tweetText: "A sparse save about evals.",
          tweetCreatedAt: new Date("2026-05-01T12:00:00.000Z"),
          bookmarkedAt: new Date("2026-05-02T12:00:00.000Z"),
          publicMetrics: null,
          media: null,
          urls: [
            {
              expanded_url: "https://arxiv.org/abs/2501.00001",
              display_url: "arxiv.org/abs/2501.00001",
              title: "AI evaluation benchmark",
              description: "A paper on model evaluation.",
            },
          ],
          quotedTweet: null,
          notes: [],
          xFolderHints: [{ name: "AI Papers" }],
          xMetadata: {
            tweet: {
              note_tweet: {
                text: "Full note tweet about AI benchmark evaluation systems.",
              },
              context_annotations: [
                {
                  domain: { name: "Technology" },
                  entity: {
                    name: "Artificial Intelligence",
                    description: "AI systems",
                  },
                },
              ],
            },
            media: [
              {
                media_key: "m1",
                type: "photo",
                alt_text: "Chart comparing AI benchmark scores",
              },
            ],
          },
        },
      ],
      existingTags: [{ name: "AI", color: "#1d9bf0", bookmarkCount: 10 }],
      existingCollections: [
        { name: "AI Papers", description: "Research papers", bookmarkCount: 5 },
      ],
      learningHints: [
        {
          bookmarkId: "b1",
          matchingTags: ["AI"],
          matchingCollections: ["AI Papers"],
          avoidTags: ["Article"],
          avoidCollections: [],
          reasons: ["same link domain: arxiv.org"],
        },
      ],
    });

    expect(payload.signalPriority).toEqual(
      expect.arrayContaining([expect.stringContaining("signals.localLearning")])
    );
    expect(payload.bookmarks[0].tweetText).toContain(
      "Full note tweet about AI benchmark evaluation systems."
    );
    expect(payload.bookmarks[0].signals).toMatchObject({
      primaryText: "Full note tweet about AI benchmark evaluation systems.",
      xTopics: [
        {
          domain: "Technology",
          entity: "Artificial Intelligence",
          description: "AI systems",
        },
      ],
      visualContext: {
        altTexts: ["Chart comparing AI benchmark scores"],
      },
      domainHints: ["Paper"],
      existingVocabularyMatches: {
        tags: ["AI"],
        collections: ["AI Papers"],
      },
      localLearning: {
        matchingTags: ["AI"],
        matchingCollections: ["AI Papers"],
        avoidTags: ["Article"],
        reasons: ["same link domain: arxiv.org"],
      },
      dataQuality: {
        hasFullText: true,
        hasNoteText: false,
        hasQuotedText: false,
        hasXTopics: true,
        hasMediaAltText: true,
      },
    });
  });

  it("includes neighbor hints and relevance-ranked vocabulary", () => {
    const payload = buildOrbitPromptPayload({
      bookmarks: [
        {
          id: "b1",
          tweetId: "tweet-1",
          authorUsername: "researcher",
          authorDisplayName: "Researcher",
          authorVerified: true,
          tweetText: "AI benchmark paper on arxiv.",
          tweetCreatedAt: new Date("2026-05-01T12:00:00.000Z"),
          bookmarkedAt: new Date("2026-05-02T12:00:00.000Z"),
          publicMetrics: null,
          media: null,
          urls: [
            {
              expanded_url: "https://arxiv.org/abs/2501.00001",
              display_url: "arxiv.org/abs/2501.00001",
            },
          ],
          quotedTweet: null,
          notes: [],
        },
      ],
      existingTags: [
        { name: "Gardening", color: "#22c55e", bookmarkCount: 100 },
        { name: "AI", color: "#1d9bf0", bookmarkCount: 5 },
      ],
      existingCollections: [
        { name: "Garden Ideas", description: null, bookmarkCount: 20 },
        { name: "AI Papers", description: "Research", bookmarkCount: 4 },
      ],
      neighborHints: [
        {
          bookmarkId: "b1",
          hint: {
            tags: ["Paper"],
            collections: ["AI Papers"],
            reasons: ["same author"],
          },
        },
      ],
    });

    expect(payload.existingTags[0]?.name).toBe("AI");
    expect(payload.existingCollections[0]?.name).toBe("AI Papers");
    expect(payload.bookmarks[0].signals.neighborHints).toMatchObject({
      tags: ["Paper"],
      collections: ["AI Papers"],
    });
  });

  it("promotes vocabulary matches into prompt existingTags even when low-count", () => {
    const payload = buildOrbitPromptPayload({
      bookmarks: [
        {
          id: "b1",
          tweetId: "tweet-1",
          authorUsername: "researcher",
          authorDisplayName: "Researcher",
          authorVerified: true,
          tweetText: "Niche quantum computing benchmark paper.",
          tweetCreatedAt: new Date("2026-05-01T12:00:00.000Z"),
          bookmarkedAt: new Date("2026-05-02T12:00:00.000Z"),
          publicMetrics: null,
          media: null,
          urls: null,
          quotedTweet: null,
          notes: [],
        },
      ],
      existingTags: Array.from({ length: 90 }, (_, index) => ({
        name: `Tag ${index}`,
        color: PRESET_COLORS[index % PRESET_COLORS.length],
        bookmarkCount: index,
      })).concat([{ name: "Quantum", color: "#a855f7", bookmarkCount: 1 }]),
      existingCollections: [],
    });

    expect(payload.existingTags.map((tag) => tag.name)).toContain("Quantum");
    expect(payload.bookmarks[0].signals.existingVocabularyMatches.tags).toContain(
      "Quantum"
    );
  });

  it("includes author prior hints on matching bookmarks", () => {
    const payload = buildOrbitPromptPayload({
      bookmarks: [
        {
          id: "b1",
          tweetId: "tweet-1",
          authorUsername: "researcher",
          authorDisplayName: "Researcher",
          authorVerified: true,
          tweetText: "A saved post.",
          tweetCreatedAt: new Date("2026-05-01T12:00:00.000Z"),
          bookmarkedAt: new Date("2026-05-02T12:00:00.000Z"),
          publicMetrics: null,
          media: null,
          urls: null,
          quotedTweet: null,
          notes: [],
        },
      ],
      existingTags: [],
      existingCollections: [],
      authorPriorHints: [
        {
          authorUsername: "researcher",
          priorCount: 5,
          tags: ["AI", "Paper"],
          collections: ["AI Papers"],
        },
      ],
    });

    expect(payload.bookmarks[0]).toMatchObject({
      priorDecisions: {
        priorBookmarkCount: 5,
        frequentTags: ["AI", "Paper"],
        frequentCollections: ["AI Papers"],
      },
    });
  });

  it("limits existing tags and collections to prompt caps by relevance", () => {
    const payload = buildOrbitPromptPayload({
      bookmarks: [
        {
          id: "b1",
          tweetId: "tweet-1",
          authorUsername: "researcher",
          authorDisplayName: "Researcher",
          authorVerified: true,
          tweetText: "A saved post.",
          tweetCreatedAt: new Date("2026-05-01T12:00:00.000Z"),
          bookmarkedAt: new Date("2026-05-02T12:00:00.000Z"),
          publicMetrics: null,
          media: null,
          urls: null,
          quotedTweet: null,
          notes: [],
        },
      ],
      existingTags: Array.from({ length: 90 }, (_, index) => ({
        name: `Tag ${index}`,
        color: PRESET_COLORS[index % PRESET_COLORS.length],
        bookmarkCount: index,
      })),
      existingCollections: Array.from({ length: 50 }, (_, index) => ({
        name: `Collection ${index}`,
        description: null,
        bookmarkCount: index,
      })),
    });

    expect(payload.existingTags).toHaveLength(80);
    expect(payload.existingCollections).toHaveLength(40);
    expect(payload.existingTags[0]).toMatchObject({
      name: "Tag 89",
      bookmarkCount: 89,
    });
  });

  it("expands the color palette as the existing tag list grows", () => {
    const payload = buildOrbitPromptPayload({
      bookmarks: [
        {
          id: "b1",
          tweetId: "tweet-1",
          authorUsername: "researcher",
          authorDisplayName: "Researcher",
          authorVerified: true,
          tweetText: "A saved post.",
          tweetCreatedAt: new Date("2026-05-01T12:00:00.000Z"),
          bookmarkedAt: new Date("2026-05-02T12:00:00.000Z"),
          publicMetrics: null,
          media: null,
          urls: null,
          quotedTweet: null,
          notes: [],
        },
      ],
      existingTags: Array.from({ length: PRESET_COLORS.length + 5 }, (_, index) => ({
        name: `Existing ${index}`,
        color: PRESET_COLORS[index % PRESET_COLORS.length],
      })),
      existingCollections: [],
    });

    expect(payload.palette.length).toBeGreaterThan(PRESET_COLORS.length);
    expect(new Set(payload.palette).size).toBe(payload.palette.length);
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
