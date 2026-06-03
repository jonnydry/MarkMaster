import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { PRESET_COLORS } from "@/lib/constants";
import {
  ORBIT_GROK_MAX_BOOKMARKS_PER_SCAN,
  ORBIT_SCAN_BATCH_PROFILES,
} from "@/lib/orbit-config";
import {
  extractOrbitBookmarkSignals,
  type OrbitLearningHint,
} from "@/lib/orbit-signal-extraction";
import { getTagColorSpectrum } from "@/lib/tag-colors";
import type {
  OrbitApplyResult,
  OrbitScanBatchMetadata,
  OrbitCollectionRollup,
  OrbitScanFailureCode,
  OrbitScanResponsePayload,
  OrbitScanSummary,
  OrbitTagRollup,
  OrbitXaiStatusPayload,
} from "@/types";

const DEFAULT_XAI_BASE_URL = "https://api.x.ai/v1";
const DEFAULT_XAI_MODEL = "grok-4.3";

const MAX_TEXT_LENGTH = 1_200;
const MAX_NOTE_LENGTH = 400;
const MAX_URLS_PER_BOOKMARK = 3;
const MAX_X_FOLDER_HINTS_PER_BOOKMARK = 5;
const MAX_X_FOLDER_HINT_LENGTH = 80;
const MAX_PROMPT_TAG_COLORS = 160;
const MAX_PROMPT_EXISTING_TAGS = 80;
const MAX_PROMPT_EXISTING_COLLECTIONS = 40;
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
const GENERIC_TAG_NAMES = new Set([
  ...GENERIC_COLLECTION_NAMES,
  "interesting",
  "saved",
  "post",
  "posts",
  "tweet",
  "tweets",
  "x",
  "link",
  "links",
  "article",
  "articles",
  "read",
  "reading",
  "resource",
  "resources",
]);
const TAG_CANONICAL_ALIASES = new Map([
  ["artificial intelligence", "ai"],
  ["a i", "ai"],
  ["large language model", "llm"],
  ["large language models", "llm"],
  ["llms", "llm"],
  ["machine learning", "ml"],
  ["typescript", "ts"],
  ["javascript", "js"],
  ["reactjs", "react"],
  ["react.js", "react"],
  ["vuejs", "vue.js"],
  ["nodejs", "node.js"],
  ["node", "node.js"],
  ["startups", "startup"],
  ["dev ops", "devops"],
  ["k8s", "kubernetes"],
  ["py", "python"],
  ["golang", "go"],
  ["go lang", "go"],
  ["postgres", "postgresql"],
  ["postgre sql", "postgresql"],
  ["infra", "infrastructure"],
  ["design systems", "design system"],
]);
const ACRONYMS = new Set([
  "ai",
  "api",
  "css",
  "html",
  "js",
  "llm",
  "ml",
  "pdf",
  "sql",
  "ts",
  "ui",
  "ux",
]);
const DOTTED_TECH_TAG_NAMES = new Set([
  "asp.net",
  "d3.js",
  "deno.land",
  "express.js",
  "next.js",
  "node.js",
  "nuxt.js",
  "p5.js",
  "react.js",
  "socket.io",
  "three.js",
  "vue.js",
]);

export class OrbitGrokError extends Error {
  status: number;
  code: OrbitScanFailureCode;
  retryAfterSeconds?: number;

  constructor(
    message: string,
    status = 500,
    code: OrbitScanFailureCode = "unknown",
    opts?: { retryAfterSeconds?: number }
  ) {
    super(message);
    this.name = "OrbitGrokError";
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = opts?.retryAfterSeconds;
  }
}

export function getOrbitXaiRuntimeStatus(args?: {
  lastFailureCode?: OrbitScanFailureCode | null;
}): OrbitXaiStatusPayload {
  const configuredApiKey = process.env.XAI_API_KEY?.trim();
  const configuredBaseUrl = process.env.XAI_API_BASE_URL?.trim();
  const configuredModel = process.env.XAI_ORBIT_MODEL?.trim();
  const issues: OrbitXaiStatusPayload["issues"] = [];

  if (!configuredApiKey) {
    issues.push({
      code: "missing_api_key",
      title: "xAI API key is missing",
      message: "Set XAI_API_KEY on the server, then restart MarkMaster.",
    });
  } else if (args?.lastFailureCode === "xai_auth") {
    issues.push({
      code: "xai_auth",
      title: "xAI rejected the last Orbit scan",
      message:
        "Confirm the server key is valid and has access to the configured Grok model.",
    });
  }

  if (args?.lastFailureCode === "xai_model") {
    issues.push({
      code: "xai_model",
      title: "Configured Grok model was not found",
      message:
        "Update XAI_ORBIT_MODEL or enable this model for the current xAI key.",
    });
  }

  return {
    state: issues.length > 0 ? "misconfigured" : "ready",
    checkedAt: new Date().toISOString(),
    apiKeyConfigured: Boolean(configuredApiKey),
    model: configuredModel || DEFAULT_XAI_MODEL,
    modelSource: configuredModel ? "environment" : "default",
    baseUrl: (configuredBaseUrl || DEFAULT_XAI_BASE_URL).replace(/\/$/, ""),
    baseUrlSource: configuredBaseUrl ? "environment" : "default",
    privacy: {
      storeDisabled: true,
      zeroDataRetention: null,
    },
    issues,
  };
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
  xMetadata?: unknown;
  notes: Array<{ id: string; content: string }>;
  xFolderHints?: Array<{ id?: string; name: string }>;
}

export interface OrbitTagContext {
  id?: string;
  name: string;
  color: string;
  bookmarkCount?: number;
}

export interface OrbitCollectionContext {
  id?: string;
  name: string;
  description: string | null;
  bookmarkCount?: number;
}

export interface OrbitAuthorPriorHint {
  authorUsername: string;
  priorCount: number;
  tags: string[];
  collections: string[];
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

const orbitScanBatchProfileSchema = z.enum(["quick", "balanced", "deep"]);

export const orbitScanBatchMetadataSchema = z.object({
  mode: z.enum(["auto", "quick", "balanced", "deep"]),
  profile: orbitScanBatchProfileSchema,
  requestedCount: z.number().int().min(1).max(ORBIT_GROK_MAX_BOOKMARKS_PER_SCAN),
  candidatePoolCount: z.number().int().min(1).max(100),
  sharedSignalCount: z.number().min(0),
  sourceUnknownCount: z.number().int().min(0).max(100),
  sourceUnknownRate: z.number().min(0).max(1),
  selectedSourceUnknownCount: z
    .number()
    .int()
    .min(0)
    .max(ORBIT_GROK_MAX_BOOKMARKS_PER_SCAN),
  selectedSourceUnknownRate: z.number().min(0).max(1),
  usefulSignalCount: z.number().int().min(0),
  selectionReason: z.string().trim().min(1).max(240),
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
    batch: orbitScanBatchMetadataSchema.optional(),
  }),
  z.object({
    mode: z.literal("apply"),
    createCollections: z.boolean().default(true),
    plan: orbitScanPlanSchema,
  }),
]);

type OrbitScanPlan = z.infer<typeof orbitScanPlanSchema>;

const looseStringSchema = z.preprocess((value) => {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}, z.string());

const looseBooleanSchema = z.preprocess((value) => {
  if (value === true || value === 1) return true;
  if (typeof value === "string") return value.trim().toLowerCase() === "true";
  return false;
}, z.boolean());

const looseConfidenceSchema = z.preprocess((value) => {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return normalized === "high" || normalized === "medium" || normalized === "low"
    ? normalized
    : "low";
}, orbitConfidenceSchema);

const looseOrbitTagSuggestionSchema = z.object({
  name: looseStringSchema,
  color: looseStringSchema,
  reason: looseStringSchema,
  reuseExisting: looseBooleanSchema,
});

const looseOrbitCollectionSuggestionSchema = z.object({
  name: looseStringSchema,
  description: looseStringSchema,
  reason: looseStringSchema,
  reuseExisting: looseBooleanSchema,
});

const looseOrbitScanOverviewSchema = z.preprocess(
  (value) => (value && typeof value === "object" ? value : {}),
  z.object({
    summary: looseStringSchema,
    taggingStrategy: looseStringSchema,
    collectionStrategy: looseStringSchema,
  })
);

const looseOrbitBookmarkSuggestionSchema = z.object({
  bookmarkId: looseStringSchema,
  confidence: looseConfidenceSchema,
  reasoning: looseStringSchema,
  tags: z.preprocess(
    (value) => (Array.isArray(value) ? value : []),
    z.array(looseOrbitTagSuggestionSchema)
  ),
  collection: z.preprocess(
    (value) => (value && typeof value === "object" ? value : null),
    z.union([looseOrbitCollectionSuggestionSchema, z.null()])
  ),
});

const looseOrbitScanPlanSchema = z.object({
  overview: looseOrbitScanOverviewSchema,
  suggestions: z.array(looseOrbitBookmarkSuggestionSchema),
});

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

function stripLabelNoise(value: string) {
  return normalizeWhitespace(value)
    .replace(/^[#"'`“”‘’()[\]{}]+/, "")
    .replace(/[,"'`“”‘’()[\]{}]+$/, "");
}

function titleCaseLabel(value: string) {
  return value
    .split(" ")
    .map((word) => {
      const lower = word.toLowerCase();
      if (ACRONYMS.has(lower)) return lower.toUpperCase();
      if (/^[A-Z0-9]+$/.test(word)) return word;
      return `${lower.slice(0, 1).toUpperCase()}${lower.slice(1)}`;
    })
    .join(" ");
}

function normalizeSuggestedTagName(value: string) {
  const stripped = stripLabelNoise(value);
  if (!stripped) return "";
  return titleCaseLabel(stripped);
}

function normalizeSuggestedCollectionName(value: string) {
  const stripped = stripLabelNoise(value);
  if (!stripped) return "";
  return titleCaseLabel(stripped);
}

function isUrlLikeLabel(value: string) {
  const normalized = stripLabelNoise(value).toLowerCase();
  if (/^https?:\/\//.test(normalized) || /^www\./.test(normalized)) {
    return true;
  }
  if (
    DOTTED_TECH_TAG_NAMES.has(normalized) ||
    /^[a-z0-9+#-]+\.js$/.test(normalized)
  ) {
    return false;
  }
  return /^[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/.*)?$/.test(normalized);
}

function normalizeTagKey(value: string) {
  const key = normalizeKey(stripLabelNoise(value));
  return TAG_CANONICAL_ALIASES.get(key) ?? key;
}

/** Lookup keys including simple plural/singular variants for tag reuse. */
function tagLookupKeys(value: string): string[] {
  const key = normalizeTagKey(value);
  const keys = [key];

  if (key.length > 2 && key.endsWith("s") && !key.endsWith("ss")) {
    keys.push(key.slice(0, -1));
  } else if (key.length > 1 && !key.endsWith("s")) {
    keys.push(`${key}s`);
  }

  return keys;
}

export function trimTagsForOrbitPrompt(tags: OrbitTagContext[]): OrbitTagContext[] {
  return [...tags]
    .sort(
      (a, b) =>
        (b.bookmarkCount ?? 0) - (a.bookmarkCount ?? 0) ||
        a.name.localeCompare(b.name)
    )
    .slice(0, MAX_PROMPT_EXISTING_TAGS);
}

export function trimCollectionsForOrbitPrompt(
  collections: OrbitCollectionContext[]
): OrbitCollectionContext[] {
  return [...collections]
    .sort(
      (a, b) =>
        (b.bookmarkCount ?? 0) - (a.bookmarkCount ?? 0) ||
        a.name.localeCompare(b.name)
    )
    .slice(0, MAX_PROMPT_EXISTING_COLLECTIONS);
}

function truncateText(value: string | null | undefined, maxLength: number) {
  if (!value) return "";
  const normalized = value.trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function normalizeColor(
  name: string,
  input: string | null | undefined,
  palette: readonly string[] = PRESET_COLORS
) {
  if (input && /^#[0-9a-fA-F]{6}$/.test(input)) {
    return input.toLowerCase();
  }

  let hash = 0;
  for (const char of name) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0;
  }

  return palette[Math.abs(hash) % palette.length] ?? FALLBACK_TAG_COLOR;
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

function asXFolderHints(input: OrbitBookmarkForScan["xFolderHints"]) {
  if (!Array.isArray(input)) return [];

  const deduped = new Map<string, { name: string }>();
  for (const folder of input) {
    const name = truncateText(folder.name, MAX_X_FOLDER_HINT_LENGTH);
    const key = normalizeKey(name);
    if (!key || deduped.has(key)) continue;
    deduped.set(key, { name });
  }

  return Array.from(deduped.values()).slice(0, MAX_X_FOLDER_HINTS_PER_BOOKMARK);
}

function buildBookmarkPayload(args: {
  bookmark: OrbitBookmarkForScan;
  existingTags: OrbitTagContext[];
  existingCollections: OrbitCollectionContext[];
  authorPriorHint?: OrbitAuthorPriorHint;
  learningHint?: OrbitLearningHint;
}) {
  const { bookmark, authorPriorHint, existingTags, existingCollections, learningHint } =
    args;

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
    sourceFolders: asXFolderHints(bookmark.xFolderHints),
    metrics: asPublicMetrics(bookmark.publicMetrics),
    signals: extractOrbitBookmarkSignals({
      bookmark,
      existingTags,
      existingCollections,
      learningHint,
    }),
    ...(authorPriorHint
      ? {
          priorDecisions: {
            priorBookmarkCount: authorPriorHint.priorCount,
            frequentTags: authorPriorHint.tags,
            frequentCollections: authorPriorHint.collections,
          },
        }
      : {}),
  };
}

export function buildOrbitPromptPayload(args: {
  bookmarks: OrbitBookmarkForScan[];
  existingTags: OrbitTagContext[];
  existingCollections: OrbitCollectionContext[];
  authorPriorHints?: OrbitAuthorPriorHint[];
  learningHints?: OrbitLearningHint[];
}) {
  const palette = getTagColorSpectrum(
    Math.min(
      MAX_PROMPT_TAG_COLORS,
      Math.max(
        PRESET_COLORS.length,
        args.existingTags.length + args.bookmarks.length * 3
      )
    )
  );

  const authorHintByUsername = new Map(
    (args.authorPriorHints ?? []).map((hint) => [
      normalizeKey(hint.authorUsername),
      hint,
    ])
  );
  const learningHintByBookmarkId = new Map(
    (args.learningHints ?? []).map((hint) => [hint.bookmarkId, hint])
  );

  const promptTags = trimTagsForOrbitPrompt(args.existingTags);
  const promptCollections = trimCollectionsForOrbitPrompt(args.existingCollections);

  return {
    goal:
      "For each bookmark, (1) assign up to 3 tags and (2) if and only if it clearly fits, assign one collection home. Optimize so the user can later re-find these posts by topic.",

    signalPriority: [
      "Start with bookmarks[].signals: xTopics, existingVocabularyMatches, sourceFolders, linkContext, visualContext.altTexts, and localLearning are deterministic hints extracted before the model call.",
      "Read tweetText first, then quotedTweet.text, then note, then urls[].title and urls[].description.",
      "When a bookmark includes priorDecisions, treat frequentTags/frequentCollections as strong hints for that author — but never override explicit tweet/quote/note topic.",
      "When signals.localLearning appears, treat matchingTags/matchingCollections as strong local preference signals and avoidTags/avoidCollections as negative examples.",
      "Use signals.existingVocabularyMatches as preferred candidates when they fit the content; do not copy them if the bookmark topic does not support them.",
      "Use signals.xTopics and signals.visualContext.altTexts as strong context when tweet text is sparse.",
      "Use sourceFolders as weak-but-useful context because they are synced X folder names for that bookmark.",
      "Use author.username, mediaTypes, and metrics only as weak secondary signals.",
      "If tweetText references a link (e.g. 'paper in replies', 'link below'), treat the urls[] entries as authoritative context.",
      "Sparse titles, bare URLs, previews, engagement copy, and boilerplate excerpts are weak signals. Do not tag from metadata noise alone.",
      "When title and excerpt disagree, prefer the explicit tweet/quoted text and choose the narrower topic, or return low confidence if no topic is clear.",
    ],

    batchConsistencyRules: [
      "Before finalizing, scan all bookmarks in this batch and reuse the same tag spellings for the same topic.",
      "Prefer tags you already assigned to earlier bookmarks in this batch when the topic matches.",
      "Align new collection names across bookmarks that share a theme.",
    ],

    taggingRules: [
      "Strongly prefer existingTags with high bookmarkCount when they fit — use the exact name and color.",
      "For existing tags/collections, use the exact name; the server determines whether it is reused.",
      "Otherwise create a new tag: a short, reusable topic or content-type label, 1-3 words, Title Case (e.g. 'Machine Learning', 'TypeScript', 'Recipe').",
      "Prefer abstention over weak tags: only tag when tweet/quote/note/url context supports a specific topic.",
      "If you propose any collection, also include at least one tag that captures the same topic or content type.",
      "For new tags pick a color from the palette. Use the SAME color for semantically related new tags when reasonable.",
      "Max 3 tags per bookmark. No near-duplicates or parent/child duplicates (e.g. don't pair 'LLM' and 'LLMs', 'AI' and 'Artificial Intelligence', or 'TypeScript' and 'Programming' unless both add clear recall value).",
      "Prefer topic or content-type tags over stylistic or sentiment tags.",
      "Never use generic or source labels: General, Misc, Other, Interesting, Saved, Bookmark, Post, Tweet, X, Link, Article, Resource, Thread (unless Thread is a content type used on purpose), domain names, or URL fragments.",
      "For sparse bookmarks, return at most one precise tag; if the topic is only guessed from an excerpt or title, use confidence medium or low.",
    ],

    collectionRules: [
      "A collection is a durable, themed home for multiple related bookmarks — not a tag alias.",
      "sourceFolders are read-only X folders, not editable existingCollections. Use them as hints only.",
      "Reuse an existingCollection for any bookmark that clearly belongs there, even if it is the only one in this batch.",
      "Only propose a NEW collection when at least 2 bookmarks in THIS batch clearly share the same theme. Otherwise set collection to null.",
      "Do not create a collection from overlapping but different topics. If bookmarks only share a broad parent theme, use tags and leave collection null.",
      "Collection name: 2-4 words, Title Case, specific (not 'Interesting Posts', 'Saved Stuff').",
      "Collection description: one short sentence describing what belongs here.",
      "It is expected and correct that many bookmarks have collection=null. Only suggest when the fit is obvious.",
    ],

    confidenceRubric: {
      high: "Content explicitly signals a specific topic; an obvious reusable tag applies.",
      medium: "Topic is inferable but not explicit; tags are reasonable defaults.",
      low: "Content is weakly inferable or ambiguous. Return empty tags and null collection unless one specific topic is clearly supported.",
    },

    outputContract: [
      "For every bookmark id in `bookmarks`, return exactly one suggestion with the same id.",
      "Never invent bookmark ids that were not provided.",
      "Return { confidence: 'low', tags: [], collection: null } when tweetText, quotedTweet, note, and url context do not support any clean topic — do not guess.",
      "Keep `reason` and `reasoning` strings short and practical (under 180 characters).",
    ],

    palette,

    existingTags: promptTags.map((tag) => ({
      name: tag.name,
      color: tag.color,
      ...(typeof tag.bookmarkCount === "number"
        ? { bookmarkCount: tag.bookmarkCount }
        : {}),
    })),
    existingCollections: promptCollections.map((collection) => ({
      name: collection.name,
      description: collection.description,
      ...(typeof collection.bookmarkCount === "number"
        ? { bookmarkCount: collection.bookmarkCount }
        : {}),
    })),

    examples: [
      {
        note: "Two bookmarks in one batch share a new collection — required for reuseExisting=false collections.",
        bookmarks: [
          {
            id: "example-1",
            tweetText:
              "New paper: scaling laws for evaluation benchmarks on reasoning tasks. arxiv link below.",
            urls: [
              {
                displayUrl: "arxiv.org/abs/2410.00001",
                title: "Scaling laws for evaluation benchmarks",
              },
            ],
          },
          {
            id: "example-2",
            tweetText:
              "Follow-up preprint on mixture-of-experts routing for long-context LLM inference.",
            urls: [
              {
                displayUrl: "arxiv.org/abs/2410.11111",
                title: "Mixture-of-experts routing for long-context LLMs",
              },
            ],
          },
        ],
        expectedSuggestions: [
          {
            bookmarkId: "example-1",
            confidence: "high",
            reasoning: "Explicit AI research paper with arxiv link.",
            tags: [
              { name: "AI", color: "#1d9bf0", reason: "AI research topic" },
              { name: "Paper", color: "#a855f7", reason: "Academic paper format" },
            ],
            collection: {
              name: "AI Papers",
              description: "Academic papers and preprints on AI and ML.",
              reason: "Shared research theme with example-2.",
            },
          },
          {
            bookmarkId: "example-2",
            confidence: "high",
            reasoning: "Another explicit AI/LLM research preprint.",
            tags: [
              { name: "AI", color: "#1d9bf0", reason: "Same topic label as example-1" },
              { name: "LLM", color: "#22c55e", reason: "Long-context LLM focus" },
            ],
            collection: {
              name: "AI Papers",
              description: "Academic papers and preprints on AI and ML.",
              reason: "Same batch theme as example-1.",
            },
          },
        ],
      },
      {
        note: "Sparse bookmark — abstain instead of guessing.",
        bookmark: {
          id: "example-sparse",
          tweetText: "👀",
          urls: [],
        },
        expectedSuggestion: {
          bookmarkId: "example-sparse",
          confidence: "low",
          reasoning: "No topical signal in text or links.",
          tags: [],
          collection: null,
        },
      },
    ],

    bookmarks: args.bookmarks.map((bookmark) =>
      buildBookmarkPayload({
        bookmark,
        existingTags: args.existingTags,
        existingCollections: args.existingCollections,
        authorPriorHint: authorHintByUsername.get(
          normalizeKey(bookmark.authorUsername)
        ),
        learningHint: learningHintByBookmarkId.get(bookmark.id),
      })
    ),
  };
}

function buildOrbitSystemPrompt() {
  return [
    "You are MarkMaster's Orbit librarian.",
    "Orbit is an inbox of bookmarked X posts that have no tags and are not in any user collection.",
    "Your job: for each bookmark, propose up to 3 concise tags and, only when it clearly fits, a single collection home — so the user can retrieve these posts later by topic.",
    "Optimize for reuse and recall, not novelty: always prefer high-usage existing tags and collections when they fit.",
    "Keep tag vocabulary consistent across the entire batch.",
    "Never invent bookmark ids. Return exactly one suggestion per provided id.",
    "When content is ambiguous, prefer confidence 'low' with empty tags and null collection over guessing.",
    "Use only hex colors from the provided palette for new tags. Return strict JSON matching the provided schema.",
  ].join(" ");
}

function unwrapOrbitScanPlanJson(value: unknown) {
  if (!value || typeof value !== "object") return value;

  const record = value as Record<string, unknown>;
  for (const key of ["plan", "scanPlan", "orbitScanPlan", "orbit_scan_plan"]) {
    const candidate = record[key];
    if (candidate && typeof candidate === "object") {
      const nested = candidate as Record<string, unknown>;
      if ("suggestions" in nested || "overview" in nested) {
        return candidate;
      }
    }
  }

  return value;
}

function formatZodIssues(error: z.ZodError) {
  return error.issues
    .slice(0, 8)
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

export function parseXaiOrbitScanPlanJson(parsedJson: unknown): OrbitScanPlan {
  const candidate = unwrapOrbitScanPlanJson(parsedJson);
  const parsedPlan = orbitScanPlanSchema.safeParse(candidate);
  if (parsedPlan.success) {
    return parsedPlan.data;
  }

  const parsedLoosePlan = looseOrbitScanPlanSchema.safeParse(candidate);
  if (parsedLoosePlan.success) {
    return parsedLoosePlan.data;
  }

  console.warn(
    "[orbit] xAI scan plan failed schema validation:",
    formatZodIssues(parsedPlan.error),
    "loose:",
    formatZodIssues(parsedLoosePlan.error)
  );

  throw new OrbitGrokError(
    "xAI returned a scan plan in an unexpected format.",
    502,
    "xai_response"
  );
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
  const existingTagAliasMap = new Map<string, OrbitTagContext>();
  for (const tag of context.existingTags) {
    const exactKey = normalizeKey(tag.name);
    const aliasKey = normalizeTagKey(tag.name);
    if (aliasKey === exactKey || existingTagMap.has(aliasKey)) continue;
    if (!existingTagAliasMap.has(aliasKey)) {
      existingTagAliasMap.set(aliasKey, tag);
    }
  }
  const existingCollectionMap = new Map(
    context.existingCollections.map((collection) => [
      normalizeKey(collection.name),
      collection,
    ])
  );
  const palette = getTagColorSpectrum(
    Math.max(
      PRESET_COLORS.length,
      context.existingTags.length + rawPlan.suggestions.length * 3
    )
  );
  const resolveExistingTag = (normalizedName: string) => {
    for (const lookupKey of tagLookupKeys(normalizedName)) {
      const fromMap = existingTagMap.get(lookupKey);
      if (fromMap) return fromMap;
      const fromAlias = existingTagAliasMap.get(lookupKey);
      if (fromAlias) return fromAlias;
    }
    return existingTagMap.get(normalizeKey(normalizedName));
  };
  const collectionSuggestionBookmarkIds = new Map<string, Set<string>>();
  for (const suggestion of rawPlan.suggestions) {
    if (!bookmarkIdSet.has(suggestion.bookmarkId) || !suggestion.collection) continue;

    const normalizedName = normalizeSuggestedCollectionName(suggestion.collection.name);
    const key = normalizeKey(normalizedName);
    if (!normalizedName || GENERIC_COLLECTION_NAMES.has(key)) continue;

    if (existingCollectionMap.has(key)) continue;
    const bookmarkIds =
      collectionSuggestionBookmarkIds.get(key) ?? new Set<string>();
    bookmarkIds.add(suggestion.bookmarkId);
    collectionSuggestionBookmarkIds.set(key, bookmarkIds);
  }

  const suggestionMap = new Map<string, OrbitScanPlan["suggestions"][number]>();

  for (const suggestion of rawPlan.suggestions) {
    if (!bookmarkIdSet.has(suggestion.bookmarkId)) continue;
    if (suggestionMap.has(suggestion.bookmarkId)) continue;

    const seenTagKeys = new Set<string>();
    const normalizedTags = suggestion.tags
      .map((tag) => {
        const normalizedName = normalizeSuggestedTagName(tag.name);
        if (!normalizedName) return null;

        const key = normalizeTagKey(normalizedName);
        if (GENERIC_TAG_NAMES.has(key) || isUrlLikeLabel(normalizedName)) return null;
        if (seenTagKeys.has(key)) return null;
        seenTagKeys.add(key);

        const existingTag = resolveExistingTag(normalizedName);
        return {
          name: existingTag?.name ?? normalizedName.slice(0, 50),
          color:
            existingTag?.color ??
            normalizeColor(normalizedName, tag.color, palette),
          reason: truncateText(tag.reason, 180) || "Suggested from bookmark content.",
          reuseExisting: Boolean(existingTag),
        };
      })
      .filter(Boolean)
      .slice(0, 3) as OrbitScanPlan["suggestions"][number]["tags"];

    let normalizedCollection: OrbitScanPlan["suggestions"][number]["collection"] = null;
    if (suggestion.collection) {
      const normalizedName = normalizeSuggestedCollectionName(
        suggestion.collection.name
      );
      const key = normalizeKey(normalizedName);
      const existingCollection = existingCollectionMap.get(key);
      const hasSpecificCollectionName = Boolean(
        normalizedName &&
          !GENERIC_COLLECTION_NAMES.has(key) &&
          normalizedName.length <= 100
      );

      if (
        hasSpecificCollectionName &&
        (existingCollection ||
          (collectionSuggestionBookmarkIds.get(key)?.size ?? 0) >= 2) &&
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
      } else if (
        hasSpecificCollectionName &&
        normalizedTags.length === 0 &&
        suggestion.confidence !== "low" &&
        normalizedName.length <= 50 &&
        !isUrlLikeLabel(normalizedName)
      ) {
        const tagKey = normalizeTagKey(normalizedName);
        if (!GENERIC_TAG_NAMES.has(tagKey) && !seenTagKeys.has(tagKey)) {
          seenTagKeys.add(tagKey);
          const existingTag = resolveExistingTag(normalizedName);
          normalizedTags.push({
            name: existingTag?.name ?? normalizedName,
            color:
              existingTag?.color ??
              normalizeColor(normalizedName, undefined, palette),
            reason:
              truncateText(suggestion.collection.reason, 180) ||
              "Preserved from a one-off collection suggestion.",
            reuseExisting: Boolean(existingTag),
          });
        }
      }
    }

    const hasApplyable =
      normalizedTags.length > 0 || normalizedCollection !== null;
    let reasoning: string;
    if (!hasApplyable) {
      reasoning =
        suggestion.confidence !== "low"
          ? "No applyable suggestion remained after cleanup."
          : truncateText(suggestion.reasoning, 240) ||
            "No confident auto-sort suggestion yet.";
    } else {
      reasoning =
        truncateText(suggestion.reasoning, 240) ||
        "Suggested from bookmark content.";
    }

    suggestionMap.set(suggestion.bookmarkId, {
      bookmarkId: suggestion.bookmarkId,
      confidence: hasApplyable ? suggestion.confidence : "low",
      reasoning,
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

function parseRetryAfterSeconds(value: string | null): number | undefined {
  if (!value) return undefined;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.ceil(seconds);
  }

  const resetTime = Date.parse(value);
  if (!Number.isNaN(resetTime)) {
    const resetSeconds = Math.ceil((resetTime - Date.now()) / 1000);
    return resetSeconds > 0 ? resetSeconds : undefined;
  }

  return undefined;
}

function extractXaiErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object" || !("error" in body)) {
    return fallback;
  }

  const error = (body as { error: unknown }).error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }

  return fallback;
}

export async function scanOrbitBookmarksWithXai(args: {
  bookmarks: OrbitBookmarkForScan[];
  existingTags: OrbitTagContext[];
  existingCollections: OrbitCollectionContext[];
  authorPriorHints?: OrbitAuthorPriorHint[];
  learningHints?: OrbitLearningHint[];
  batch?: OrbitScanBatchMetadata;
}): Promise<OrbitScanResponsePayload> {
  if (args.bookmarks.length === 0) {
    throw new OrbitGrokError(
      "Select at least one bookmark to scan.",
      400,
      "scan_request"
    );
  }

  if (args.bookmarks.length > ORBIT_GROK_MAX_BOOKMARKS_PER_SCAN) {
    throw new OrbitGrokError(
      `Scan up to ${ORBIT_GROK_MAX_BOOKMARKS_PER_SCAN} bookmarks at a time.`,
      400,
      "scan_request"
    );
  }

  const apiKey = process.env.XAI_API_KEY?.trim();
  if (!apiKey) {
    throw new OrbitGrokError(
      "Set XAI_API_KEY before scanning Orbit with Grok.",
      503,
      "xai_auth"
    );
  }

  const runtimeStatus = getOrbitXaiRuntimeStatus();
  const baseUrl = runtimeStatus.baseUrl;
  const model = runtimeStatus.model;
  const promptPayload = buildOrbitPromptPayload(args);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
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
  } catch {
    throw new OrbitGrokError(
      "xAI could not be reached. Try the scan again in a moment.",
      503,
      "xai_unavailable"
    );
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = extractXaiErrorMessage(
      body,
      `xAI request failed with status ${response.status}`
    );

    if (response.status === 401 || response.status === 403) {
      throw new OrbitGrokError(
        "xAI rejected the request. Confirm your API key and model access.",
        502,
        "xai_auth"
      );
    }

    if (response.status === 404) {
      throw new OrbitGrokError(
        "xAI could not find the configured Grok model.",
        502,
        "xai_model"
      );
    }

    if (response.status === 429) {
      throw new OrbitGrokError(
        "xAI rate limit reached. Try the scan again in a moment.",
        429,
        "xai_rate_limited",
        {
          retryAfterSeconds: parseRetryAfterSeconds(
            response.headers.get("retry-after")
          ),
        }
      );
    }

    throw new OrbitGrokError(message, 502, "xai_unavailable");
  }

  const payload = await response.json().catch(() => null);
  const rawText = extractXaiResponsesOutputText(payload);

  if (!rawText) {
    throw new OrbitGrokError(
      "xAI returned an empty Orbit scan.",
      502,
      "xai_response"
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText);
  } catch {
    throw new OrbitGrokError(
      "xAI returned invalid JSON for the Orbit scan.",
      502,
      "xai_response"
    );
  }

  const rawPlan = parseXaiOrbitScanPlanJson(parsedJson);
  const plan = normalizeOrbitScanPlan(rawPlan, {
    bookmarkIds: args.bookmarks.map((bookmark) => bookmark.id),
    existingTags: args.existingTags,
    existingCollections: args.existingCollections,
  });
  const requestedCount = args.bookmarks.length;
  const batch: OrbitScanBatchMetadata =
    args.batch ??
    {
      mode: "balanced",
      profile:
        requestedCount <= ORBIT_SCAN_BATCH_PROFILES.quick.size
          ? "quick"
          : requestedCount <= ORBIT_SCAN_BATCH_PROFILES.balanced.size
            ? "balanced"
            : "deep",
      requestedCount,
      candidatePoolCount: requestedCount,
      sharedSignalCount: 0,
      sourceUnknownCount: 0,
      sourceUnknownRate: 0,
      selectedSourceUnknownCount: 0,
      selectedSourceUnknownRate: 0,
      usefulSignalCount: 0,
      selectionReason: "Scanned the provided bookmark IDs.",
    };

  return {
    scanRunId: randomUUID(),
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
    batch,
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
    throw new OrbitGrokError(
      "The scan plan does not contain any bookmarks.",
      400,
      "scan_request"
    );
  }

  const bookmarks = await prisma.bookmark.findMany({
    where: {
      userId: args.userId,
      id: { in: bookmarkIds },
    },
    select: { id: true },
  });

  if (bookmarks.length !== bookmarkIds.length) {
    throw new OrbitGrokError(
      "One or more bookmarks in the scan plan no longer exist.",
      404,
      "bookmark_not_found"
    );
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
      const seenAssignments = new Set<string>();
      const assignmentRows: Array<{ bookmarkId: string; tagId: string }> = [];

      for (const assignment of tagAssignments) {
        const tag = tagMap.get(assignment.tagKey);
        if (!tag) continue;

        const assignmentKey = `${assignment.bookmarkId}\0${tag.id}`;
        if (seenAssignments.has(assignmentKey)) continue;

        seenAssignments.add(assignmentKey);
        assignmentRows.push({
          bookmarkId: assignment.bookmarkId,
          tagId: tag.id,
        });
      }

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
