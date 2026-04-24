import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { PRESET_COLORS } from "@/lib/constants";
import type {
  OrbitApplyResult,
  OrbitCollectionRollup,
  OrbitScanResponsePayload,
  OrbitScanSummary,
  OrbitTagRollup,
} from "@/types";

const DEFAULT_XAI_BASE_URL = "https://api.x.ai/v1";
const DEFAULT_XAI_MODEL = "grok-4.20-reasoning";

/** Upper bound for bookmarks sent to xAI per Orbit scan (prompt size + API limits). */
export const ORBIT_GROK_MAX_BOOKMARKS_PER_SCAN = 24;
const MAX_TEXT_LENGTH = 1_200;
const MAX_NOTE_LENGTH = 400;
const MAX_URLS_PER_BOOKMARK = 3;
const FALLBACK_TAG_COLOR = PRESET_COLORS[0];
const GENERIC_COLLECTION_NAMES = new Set([
  "bookmark",
  "bookmarks",
  "collection",
  "collections",
  "misc",
  "miscellaneous",
  "general",
  "other",
]);

export class OrbitGrokError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "OrbitGrokError";
    this.status = status;
  }
}

export interface OrbitBookmarkForScan {
  id: string;
  tweetId: string;
  authorUsername: string;
  authorDisplayName: string;
  authorVerified: boolean;
  tweetText: string;
  tweetCreatedAt: Date | string;
  bookmarkedAt: Date | string;
  publicMetrics: unknown;
  media: unknown;
  urls: unknown;
  quotedTweet: unknown;
  notes: Array<{ id: string; content: string }>;
}

export interface OrbitTagContext {
  id?: string;
  name: string;
  color: string;
}

export interface OrbitCollectionContext {
  id?: string;
  name: string;
  description: string | null;
}

export const orbitConfidenceSchema = z.enum(["high", "medium", "low"]);

export const orbitTagSuggestionSchema = z.object({
  name: z.string().trim().min(1).max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  reason: z.string().trim().min(1).max(180),
  reuseExisting: z.boolean(),
});

export const orbitCollectionSuggestionSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(240),
  reason: z.string().trim().min(1).max(180),
  reuseExisting: z.boolean(),
});

export const orbitBookmarkSuggestionSchema = z.object({
  bookmarkId: z.string().trim().min(1),
  confidence: orbitConfidenceSchema,
  reasoning: z.string().trim().min(1).max(240),
  tags: z.array(orbitTagSuggestionSchema),
  collection: z.union([orbitCollectionSuggestionSchema, z.null()]),
});

export const orbitScanOverviewSchema = z.object({
  summary: z.string().trim().min(1).max(240),
  taggingStrategy: z.string().trim().min(1).max(240),
  collectionStrategy: z.string().trim().min(1).max(240),
});

export const orbitScanPlanSchema = z.object({
  overview: orbitScanOverviewSchema,
  suggestions: z
    .array(orbitBookmarkSuggestionSchema)
    .max(
      ORBIT_GROK_MAX_BOOKMARKS_PER_SCAN,
      `Apply up to ${ORBIT_GROK_MAX_BOOKMARKS_PER_SCAN} Orbit suggestions at a time`
    ),
});

export const orbitScanRequestSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("scan"),
    bookmarkIds: z
      .array(z.string().trim().min(1, "Bookmark ID is required"))
      .min(1, "Select at least one bookmark to scan")
      .max(
        ORBIT_GROK_MAX_BOOKMARKS_PER_SCAN,
        `Scan up to ${ORBIT_GROK_MAX_BOOKMARKS_PER_SCAN} bookmarks at a time`
      ),
  }),
  z.object({
    mode: z.literal("apply"),
    createCollections: z.boolean().default(true),
    plan: orbitScanPlanSchema,
  }),
]);

type OrbitScanPlan = z.infer<typeof orbitScanPlanSchema>;

const ORBIT_SCAN_PLAN_JSON_SCHEMA = {
  type: "object",
  properties: {
    overview: {
      type: "object",
      properties: {
        summary: { type: "string", description: "A concise summary of the queue." },
        taggingStrategy: {
          type: "string",
          description: "A short description of the tag pattern you used.",
        },
        collectionStrategy: {
          type: "string",
          description: "A short description of the collection grouping you used.",
        },
      },
      required: ["summary", "taggingStrategy", "collectionStrategy"],
      additionalProperties: false,
    },
    suggestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          bookmarkId: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          reasoning: {
            type: "string",
            description: "A short rationale for the suggestion.",
          },
          tags: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                color: { type: "string" },
                reason: { type: "string" },
                reuseExisting: { type: "boolean" },
              },
              required: ["name", "color", "reason", "reuseExisting"],
              additionalProperties: false,
            },
          },
          collection: {
            anyOf: [
              {
                type: "object",
                properties: {
                  name: { type: "string" },
                  description: { type: "string" },
                  reason: { type: "string" },
                  reuseExisting: { type: "boolean" },
                },
                required: ["name", "description", "reason", "reuseExisting"],
                additionalProperties: false,
              },
              { type: "null" },
            ],
          },
        },
        required: ["bookmarkId", "confidence", "reasoning", "tags", "collection"],
        additionalProperties: false,
      },
    },
  },
  required: ["overview", "suggestions"],
  additionalProperties: false,
} as const;

function normalizeKey(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function truncateText(value: string | null | undefined, maxLength: number) {
  if (!value) return "";
  const normalized = value.trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function normalizeColor(name: string, input: string | null | undefined) {
  if (input && /^#[0-9a-fA-F]{6}$/.test(input)) {
    return input.toLowerCase();
  }

  let hash = 0;
  for (const char of name) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0;
  }

  return PRESET_COLORS[Math.abs(hash) % PRESET_COLORS.length] ?? FALLBACK_TAG_COLOR;
}

function buildDefaultSuggestion(bookmarkId: string) {
  return {
    bookmarkId,
    confidence: "low" as const,
    reasoning: "No confident auto-sort suggestion yet.",
    tags: [],
    collection: null,
  };
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asPublicMetrics(input: unknown) {
  if (!input || typeof input !== "object") return null;

  const metrics = input as Record<string, unknown>;
  return {
    retweet_count: asNumber(metrics.retweet_count),
    reply_count: asNumber(metrics.reply_count),
    like_count: asNumber(metrics.like_count),
    quote_count: asNumber(metrics.quote_count),
    bookmark_count: asNumber(metrics.bookmark_count),
  };
}

function asMediaTypes(input: unknown) {
  if (!Array.isArray(input)) return [];

  return input.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const type = (item as { type?: unknown }).type;
    return typeof type === "string" ? [type] : [];
  });
}

function asUrls(input: unknown) {
  if (!Array.isArray(input)) return [];

  return input.slice(0, MAX_URLS_PER_BOOKMARK).flatMap((item) => {
    if (!item || typeof item !== "object") return [];

    const candidate = item as Record<string, unknown>;
    const displayUrl =
      typeof candidate.display_url === "string" ? candidate.display_url : null;
    const expandedUrl =
      typeof candidate.expanded_url === "string" ? candidate.expanded_url : null;

    if (!displayUrl || !expandedUrl) return [];

    return [
      {
        displayUrl,
        expandedUrl,
        title:
          typeof candidate.title === "string"
            ? truncateText(candidate.title, 120)
            : null,
        description:
          typeof candidate.description === "string"
            ? truncateText(candidate.description, 180)
            : null,
      },
    ];
  });
}

function asQuotedTweet(input: unknown) {
  if (!input || typeof input !== "object") return null;

  const quoted = input as Record<string, unknown>;
  if (typeof quoted.text !== "string") return null;

  const author =
    quoted.author && typeof quoted.author === "object"
      ? (quoted.author as Record<string, unknown>)
      : null;

  return {
    text: truncateText(quoted.text, 400),
    author:
      author &&
      typeof author.name === "string" &&
      typeof author.username === "string"
        ? {
            name: author.name,
            username: author.username,
          }
        : null,
  };
}

function buildBookmarkPayload(bookmark: OrbitBookmarkForScan) {
  return {
    id: bookmark.id,
    author: {
      username: bookmark.authorUsername,
      displayName: bookmark.authorDisplayName,
      verified: bookmark.authorVerified,
    },
    savedAt: new Date(bookmark.bookmarkedAt).toISOString(),
    tweetCreatedAt: new Date(bookmark.tweetCreatedAt).toISOString(),
    tweetText: truncateText(bookmark.tweetText, MAX_TEXT_LENGTH),
    note: truncateText(bookmark.notes[0]?.content, MAX_NOTE_LENGTH) || null,
    mediaTypes: asMediaTypes(bookmark.media),
    urls: asUrls(bookmark.urls),
    quotedTweet: asQuotedTweet(bookmark.quotedTweet),
    metrics: asPublicMetrics(bookmark.publicMetrics),
  };
}

function buildPromptPayload(args: {
  bookmarks: OrbitBookmarkForScan[];
  existingTags: OrbitTagContext[];
  existingCollections: OrbitCollectionContext[];
}) {
  return {
    goal:
      "For each bookmark, (1) assign up to 3 tags and (2) if and only if it clearly fits, assign one collection home. Optimize so the user can later re-find these posts by topic.",

    signalPriority: [
      "Read tweetText first, then quotedTweet.text, then note, then urls[].title and urls[].description.",
      "Use author.username, mediaTypes, and metrics only as weak secondary signals.",
      "If tweetText references a link (e.g. 'paper in replies', 'link below'), treat the urls[] entries as authoritative context.",
    ],

    taggingRules: [
      "Reuse an existingTag exactly (case-insensitive name match) whenever it clearly fits. Set reuseExisting=true and keep that tag's exact color.",
      "Otherwise create a new tag: a short, reusable topic or content-type label, 1-3 words, Title Case (e.g. 'Machine Learning', 'TypeScript', 'Recipe').",
      "For new tags pick a color from the palette. Use the SAME color for semantically related new tags when reasonable.",
      "Max 3 tags per bookmark. No near-duplicates (e.g. don't pair 'LLM' and 'LLMs', or 'AI' and 'Artificial Intelligence').",
      "Prefer topic or content-type tags over stylistic or sentiment tags.",
      "Never use generic labels: General, Misc, Other, Interesting, Saved, Bookmark, Thread (unless Thread is a content type used on purpose).",
    ],

    collectionRules: [
      "A collection is a durable, themed home for multiple related bookmarks — not a tag alias.",
      "Reuse an existingCollection (reuseExisting=true) for any bookmark that clearly belongs there, even if it's the only one in this batch.",
      "Only propose a NEW collection (reuseExisting=false) when at least 2 bookmarks in THIS batch clearly share the same theme. Otherwise set collection to null.",
      "Collection name: 2-4 words, Title Case, specific (not 'Interesting Posts', 'Saved Stuff').",
      "Collection description: one short sentence describing what belongs here.",
      "It is expected and correct that many bookmarks have collection=null. Only suggest when the fit is obvious.",
    ],

    confidenceRubric: {
      high: "Content explicitly signals a specific topic; an obvious reusable tag applies.",
      medium: "Topic is inferable but not explicit; tags are reasonable defaults.",
      low: "Content is vague, personal, or off-topic for any clean tag. Return empty tags and null collection.",
    },

    outputContract: [
      "For every bookmark id in `bookmarks`, return exactly one suggestion with the same id.",
      "Never invent bookmark ids that were not provided.",
      "If uncertain, return { confidence: 'low', reasoning: '<short>', tags: [], collection: null } instead of guessing.",
      "Keep `reason` and `reasoning` strings short and practical (under 180 characters).",
    ],

    palette: PRESET_COLORS,

    existingTags: args.existingTags.map((tag) => ({
      name: tag.name,
      color: tag.color,
    })),
    existingCollections: args.existingCollections.map((collection) => ({
      name: collection.name,
      description: collection.description,
    })),

    example: {
      bookmark: {
        id: "example-1",
        author: {
          username: "ai_researcher",
          displayName: "AI Researcher",
          verified: true,
        },
        tweetText:
          "New paper: scaling laws for evaluation benchmarks on reasoning tasks. arxiv link below.",
        urls: [
          {
            displayUrl: "arxiv.org/abs/2410.00001",
            expandedUrl: "https://arxiv.org/abs/2410.00001",
            title: "Scaling laws for evaluation benchmarks",
            description: null,
          },
        ],
        mediaTypes: [],
      },
      expectedSuggestion: {
        bookmarkId: "example-1",
        confidence: "high",
        reasoning: "Explicit AI research paper with arxiv link.",
        tags: [
          {
            name: "AI",
            color: "#1d9bf0",
            reason: "AI research topic",
            reuseExisting: false,
          },
          {
            name: "Paper",
            color: "#a855f7",
            reason: "Academic paper format",
            reuseExisting: false,
          },
        ],
        collection: {
          name: "AI Papers",
          description: "Academic papers and preprints on AI and ML.",
          reason: "Durable home for research papers.",
          reuseExisting: false,
        },
      },
    },

    bookmarks: args.bookmarks.map(buildBookmarkPayload),
  };
}

function buildOrbitSystemPrompt() {
  return [
    "You are MarkMaster's Orbit librarian.",
    "Orbit is an inbox of bookmarked X posts that have no tags and are not in any user collection.",
    "Your job: for each bookmark, propose up to 3 concise tags and, only when it clearly fits, a single collection home — so the user can retrieve these posts later by topic.",
    "Optimize for reuse and recall, not novelty: always prefer an existing tag or collection when it fits.",
    "Never invent bookmark ids. Return exactly one suggestion per provided id.",
    "When content is ambiguous, return confidence 'low' with empty tags and null collection instead of guessing.",
    "Use only hex colors from the provided palette for new tags. Return strict JSON matching the provided schema.",
  ].join(" ");
}

/** Parses xAI Responses API JSON bodies (message / output_text shape). Exported for tests. */
export function extractXaiResponsesOutputText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;

  const output = (payload as { output?: unknown[] }).output;
  if (!Array.isArray(output)) return null;

  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    if ((item as { type?: string }).type !== "message") continue;

    const content = (item as { content?: unknown[] }).content;
    if (!Array.isArray(content)) continue;

    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      if ((part as { type?: string }).type === "output_text") {
        const text = (part as { text?: unknown }).text;
        if (typeof text === "string" && text.trim()) {
          return text;
        }
      }
    }
  }

  return null;
}

export function normalizeOrbitScanPlan(
  rawPlan: OrbitScanPlan,
  context: {
    bookmarkIds: string[];
    existingTags: OrbitTagContext[];
    existingCollections: OrbitCollectionContext[];
  }
): OrbitScanPlan {
  const bookmarkIdSet = new Set(context.bookmarkIds);
  const existingTagMap = new Map(
    context.existingTags.map((tag) => [normalizeKey(tag.name), tag])
  );
  const existingCollectionMap = new Map(
    context.existingCollections.map((collection) => [
      normalizeKey(collection.name),
      collection,
    ])
  );

  const suggestionMap = new Map<string, OrbitScanPlan["suggestions"][number]>();

  for (const suggestion of rawPlan.suggestions) {
    if (!bookmarkIdSet.has(suggestion.bookmarkId)) continue;
    if (suggestionMap.has(suggestion.bookmarkId)) continue;

    const seenTagKeys = new Set<string>();
    const normalizedTags = suggestion.tags
      .map((tag) => {
        const normalizedName = normalizeWhitespace(tag.name);
        if (!normalizedName) return null;

        const key = normalizeKey(normalizedName);
        if (seenTagKeys.has(key)) return null;
        seenTagKeys.add(key);

        const existingTag = existingTagMap.get(key);
        return {
          name: existingTag?.name ?? normalizedName.slice(0, 50),
          color: existingTag?.color ?? normalizeColor(normalizedName, tag.color),
          reason: truncateText(tag.reason, 180) || "Suggested from bookmark content.",
          reuseExisting: Boolean(existingTag),
        };
      })
      .filter(Boolean)
      .slice(0, 3) as OrbitScanPlan["suggestions"][number]["tags"];

    let normalizedCollection: OrbitScanPlan["suggestions"][number]["collection"] = null;
    if (suggestion.collection) {
      const normalizedName = normalizeWhitespace(suggestion.collection.name);
      const key = normalizeKey(normalizedName);
      const existingCollection = existingCollectionMap.get(key);

      if (
        normalizedName &&
        !GENERIC_COLLECTION_NAMES.has(key) &&
        normalizedName.length <= 100
      ) {
        normalizedCollection = {
          name: existingCollection?.name ?? normalizedName,
          description:
            truncateText(
              existingCollection?.description ??
                suggestion.collection.description,
              240
            ) || "Auto-sorted from Orbit by Grok.",
          reason:
            truncateText(suggestion.collection.reason, 180) ||
            "Suggested from bookmark content.",
          reuseExisting: Boolean(existingCollection),
        };
      }
    }

    suggestionMap.set(suggestion.bookmarkId, {
      bookmarkId: suggestion.bookmarkId,
      confidence: suggestion.confidence,
      reasoning:
        truncateText(suggestion.reasoning, 240) ||
        "Suggested from bookmark content.",
      tags: normalizedTags,
      collection: normalizedCollection,
    });
  }

  return {
    overview: {
      summary:
        truncateText(rawPlan.overview.summary, 240) ||
        "Grok scanned your Orbit queue and suggested a first organizational pass.",
      taggingStrategy:
        truncateText(rawPlan.overview.taggingStrategy, 240) ||
        "Tags focus on reusable themes and content types.",
      collectionStrategy:
        truncateText(rawPlan.overview.collectionStrategy, 240) ||
        "Collections are only suggested when there is a clear home for the bookmark.",
    },
    suggestions: context.bookmarkIds.map(
      (bookmarkId) => suggestionMap.get(bookmarkId) ?? buildDefaultSuggestion(bookmarkId)
    ),
  };
}

export function buildOrbitTagRollups(plan: OrbitScanPlan): OrbitTagRollup[] {
  const tagMap = new Map<
    string,
    { name: string; color: string; count: number; reuseExisting: boolean }
  >();

  for (const suggestion of plan.suggestions) {
    for (const tag of suggestion.tags) {
      const key = normalizeKey(tag.name);
      const current = tagMap.get(key);
      if (current) {
        current.count += 1;
        current.reuseExisting = current.reuseExisting || tag.reuseExisting;
      } else {
        tagMap.set(key, {
          name: tag.name,
          color: tag.color,
          count: 1,
          reuseExisting: tag.reuseExisting,
        });
      }
    }
  }

  return Array.from(tagMap.values()).sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name)
  );
}

export function buildOrbitCollectionRollups(
  plan: OrbitScanPlan
): OrbitCollectionRollup[] {
  const collectionMap = new Map<
    string,
    {
      name: string;
      description: string;
      count: number;
      reuseExisting: boolean;
      bookmarkIds: string[];
    }
  >();

  for (const suggestion of plan.suggestions) {
    if (!suggestion.collection) continue;

    const key = normalizeKey(suggestion.collection.name);
    const current = collectionMap.get(key);
    if (current) {
      current.count += 1;
      current.reuseExisting = current.reuseExisting || suggestion.collection.reuseExisting;
      current.bookmarkIds.push(suggestion.bookmarkId);
      continue;
    }

    collectionMap.set(key, {
      name: suggestion.collection.name,
      description: suggestion.collection.description,
      count: 1,
      reuseExisting: suggestion.collection.reuseExisting,
      bookmarkIds: [suggestion.bookmarkId],
    });
  }

  return Array.from(collectionMap.values()).sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name)
  );
}

export function buildOrbitScanSummary(plan: OrbitScanPlan): OrbitScanSummary {
  const tagRollups = buildOrbitTagRollups(plan);
  const collectionRollups = buildOrbitCollectionRollups(plan);

  return {
    bookmarkCount: plan.suggestions.length,
    bookmarksWithTags: plan.suggestions.filter((suggestion) => suggestion.tags.length > 0)
      .length,
    bookmarksWithCollections: plan.suggestions.filter(
      (suggestion) => suggestion.collection !== null
    ).length,
    tagAssignments: plan.suggestions.reduce(
      (total, suggestion) => total + suggestion.tags.length,
      0
    ),
    uniqueTags: tagRollups.length,
    collectionBuckets: collectionRollups.length,
    reusedExistingTags: tagRollups.filter((tag) => tag.reuseExisting).length,
    reusedExistingCollections: collectionRollups.filter((collection) => collection.reuseExisting)
      .length,
    newCollectionBuckets: collectionRollups.filter((collection) => !collection.reuseExisting)
      .length,
  };
}

export async function scanOrbitBookmarksWithXai(args: {
  bookmarks: OrbitBookmarkForScan[];
  existingTags: OrbitTagContext[];
  existingCollections: OrbitCollectionContext[];
}): Promise<OrbitScanResponsePayload> {
  if (args.bookmarks.length === 0) {
    throw new OrbitGrokError("Select at least one bookmark to scan.", 400);
  }

  if (args.bookmarks.length > ORBIT_GROK_MAX_BOOKMARKS_PER_SCAN) {
    throw new OrbitGrokError(
      `Scan up to ${ORBIT_GROK_MAX_BOOKMARKS_PER_SCAN} bookmarks at a time.`,
      400
    );
  }

  const apiKey = process.env.XAI_API_KEY?.trim();
  if (!apiKey) {
    throw new OrbitGrokError(
      "Set XAI_API_KEY before scanning Orbit with Grok.",
      503
    );
  }

  const baseUrl = (process.env.XAI_API_BASE_URL?.trim() || DEFAULT_XAI_BASE_URL).replace(
    /\/$/,
    ""
  );
  const model = process.env.XAI_ORBIT_MODEL?.trim() || DEFAULT_XAI_MODEL;
  const promptPayload = buildPromptPayload(args);

  const response = await fetch(`${baseUrl}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content: buildOrbitSystemPrompt(),
        },
        {
          role: "user",
          content: JSON.stringify(promptPayload),
        },
      ],
      store: false,
      text: {
        format: {
          type: "json_schema",
          name: "orbit_scan_plan",
          schema: ORBIT_SCAN_PLAN_JSON_SCHEMA,
          strict: true,
        },
      },
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : `xAI request failed with status ${response.status}`;

    if (response.status === 401 || response.status === 403) {
      throw new OrbitGrokError(
        "xAI rejected the request. Confirm your API key and model access.",
        502
      );
    }

    if (response.status === 404) {
      throw new OrbitGrokError(
        "xAI could not find the configured Grok model.",
        502
      );
    }

    if (response.status === 429) {
      throw new OrbitGrokError(
        "xAI rate limit reached. Try the scan again in a moment.",
        429
      );
    }

    throw new OrbitGrokError(message, 502);
  }

  const payload = await response.json().catch(() => null);
  const rawText = extractXaiResponsesOutputText(payload);

  if (!rawText) {
    throw new OrbitGrokError("xAI returned an empty Orbit scan.", 502);
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText);
  } catch {
    throw new OrbitGrokError("xAI returned invalid JSON for the Orbit scan.", 502);
  }

  const parsedPlan = orbitScanPlanSchema.safeParse(parsedJson);
  if (!parsedPlan.success) {
    throw new OrbitGrokError("xAI returned a scan plan in an unexpected format.", 502);
  }

  const plan = normalizeOrbitScanPlan(parsedPlan.data, {
    bookmarkIds: args.bookmarks.map((bookmark) => bookmark.id),
    existingTags: args.existingTags,
    existingCollections: args.existingCollections,
  });

  return {
    model,
    scannedAt: new Date().toISOString(),
    privacy: {
      storeDisabled: true,
      zeroDataRetention:
        response.headers.get("x-zero-data-retention") === "true"
          ? true
          : response.headers.get("x-zero-data-retention") === "false"
            ? false
            : null,
    },
    plan,
    summary: buildOrbitScanSummary(plan),
    tagRollups: buildOrbitTagRollups(plan),
    collectionRollups: buildOrbitCollectionRollups(plan),
  };
}

export async function applyOrbitScanPlan(args: {
  userId: string;
  plan: OrbitScanPlan;
  createCollections: boolean;
}): Promise<OrbitApplyResult> {
  const bookmarkIds = Array.from(
    new Set(args.plan.suggestions.map((suggestion) => suggestion.bookmarkId))
  );

  if (bookmarkIds.length === 0) {
    throw new OrbitGrokError("The scan plan does not contain any bookmarks.", 400);
  }

  const bookmarks = await prisma.bookmark.findMany({
    where: {
      userId: args.userId,
      id: { in: bookmarkIds },
    },
    select: { id: true },
  });

  if (bookmarks.length !== bookmarkIds.length) {
    throw new OrbitGrokError("One or more bookmarks in the scan plan no longer exist.", 404);
  }

  const [existingTags, existingCollections] = await Promise.all([
    prisma.tag.findMany({
      where: { userId: args.userId },
      orderBy: { name: "asc" },
    }),
    prisma.collection.findMany({
      where: {
        userId: args.userId,
        type: "user_collection",
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const tagMap = new Map(existingTags.map((tag) => [normalizeKey(tag.name), tag]));
  const collectionMap = new Map(
    existingCollections.map((collection) => [normalizeKey(collection.name), collection])
  );

  const tagDefinitions = new Map<string, { name: string; color: string }>();
  const tagAssignments: Array<{ bookmarkId: string; tagKey: string }> = [];
  const collectionBuckets = new Map<
    string,
    {
      name: string;
      description: string;
      reuseExisting: boolean;
      bookmarkIds: Set<string>;
    }
  >();

  for (const suggestion of args.plan.suggestions) {
    for (const tag of suggestion.tags) {
      const tagKey = normalizeKey(tag.name);
      if (!tagKey) continue;

      if (!tagDefinitions.has(tagKey)) {
        tagDefinitions.set(tagKey, {
          name: tagMap.get(tagKey)?.name ?? normalizeWhitespace(tag.name).slice(0, 50),
          color: tagMap.get(tagKey)?.color ?? normalizeColor(tag.name, tag.color),
        });
      }

      tagAssignments.push({ bookmarkId: suggestion.bookmarkId, tagKey });
    }

    if (!suggestion.collection) continue;

    const collectionKey = normalizeKey(suggestion.collection.name);
    if (!collectionKey || GENERIC_COLLECTION_NAMES.has(collectionKey)) continue;

    const bucket = collectionBuckets.get(collectionKey);
    if (bucket) {
      bucket.bookmarkIds.add(suggestion.bookmarkId);
      bucket.reuseExisting = bucket.reuseExisting || suggestion.collection.reuseExisting;
      continue;
    }

    collectionBuckets.set(collectionKey, {
      name:
        collectionMap.get(collectionKey)?.name ??
        normalizeWhitespace(suggestion.collection.name).slice(0, 100),
      description:
        truncateText(
          collectionMap.get(collectionKey)?.description ??
            suggestion.collection.description,
          240
        ) || "Auto-sorted from Orbit by Grok.",
      reuseExisting: suggestion.collection.reuseExisting,
      bookmarkIds: new Set([suggestion.bookmarkId]),
    });
  }

  const result: OrbitApplyResult = {
    bookmarkCount: bookmarkIds.length,
    createdTags: 0,
    reusedTags: 0,
    tagAssignments: 0,
    createdCollections: 0,
    reusedCollections: 0,
    collectionAssignments: 0,
    skippedNewCollectionSingletons: 0,
  };

  await prisma.$transaction(async (tx) => {
    for (const [tagKey, tagDefinition] of tagDefinitions) {
      const existingTag = tagMap.get(tagKey);
      if (existingTag) {
        result.reusedTags += 1;
        continue;
      }

      const createdTag = await tx.tag.create({
        data: {
          userId: args.userId,
          name: tagDefinition.name,
          color: tagDefinition.color,
        },
      });

      tagMap.set(tagKey, createdTag);
      result.createdTags += 1;
    }

    if (tagAssignments.length > 0) {
      const assignmentRows = Array.from(
        new Set(tagAssignments.map((assignment) => `${assignment.bookmarkId}:${assignment.tagKey}`))
      )
        .map((compoundKey) => {
          const [bookmarkId, tagKey] = compoundKey.split(":");
          const tag = tagMap.get(tagKey);
          if (!tag) return null;

          return {
            bookmarkId,
            tagId: tag.id,
          };
        })
        .filter(Boolean) as Array<{ bookmarkId: string; tagId: string }>;

      if (assignmentRows.length > 0) {
        const createManyResult = await tx.bookmarkTag.createMany({
          data: assignmentRows,
          skipDuplicates: true,
        });
        result.tagAssignments = createManyResult.count;
      }
    }

    for (const [collectionKey, bucket] of collectionBuckets) {
      let collection = collectionMap.get(collectionKey) ?? null;

      if (!collection) {
        if (!args.createCollections) {
          continue;
        }

        if (bucket.bookmarkIds.size < 2) {
          result.skippedNewCollectionSingletons += 1;
          continue;
        }

        collection = await tx.collection.create({
          data: {
            userId: args.userId,
            name: bucket.name,
            description: bucket.description,
            type: "user_collection",
            isPublic: false,
          },
        });

        collectionMap.set(collectionKey, collection);
        result.createdCollections += 1;
      } else {
        result.reusedCollections += 1;
      }

      const maxOrder = await tx.collectionItem.findFirst({
        where: { collectionId: collection.id },
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });

      const baseOrder = (maxOrder?.sortOrder ?? -1) + 1;
      const bookmarkIdList = Array.from(bucket.bookmarkIds);

      if (bookmarkIdList.length === 0) continue;

      const createManyResult = await tx.collectionItem.createMany({
        data: bookmarkIdList.map((bookmarkId, index) => ({
          collectionId: collection.id,
          bookmarkId,
          sortOrder: baseOrder + index,
        })),
        skipDuplicates: true,
      });

      result.collectionAssignments += createManyResult.count;
    }
  });

  return result;
}
