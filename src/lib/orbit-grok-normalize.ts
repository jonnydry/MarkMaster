import { PRESET_COLORS } from "@/lib/constants";
import {
  extractOrbitBookmarkSignals,
  type OrbitLearningHint,
  type OrbitNeighborHint,
} from "@/lib/orbit-signal-extraction";
import type {
  OrbitAuthorPriorHint,
  OrbitBookmarkForScan,
  OrbitCollectionContext,
  OrbitTagContext,
} from "@/lib/orbit-grok-schemas";

const MAX_TEXT_LENGTH = 1_200;
const MAX_NOTE_LENGTH = 400;
const MAX_URLS_PER_BOOKMARK = 3;
const MAX_X_FOLDER_HINTS_PER_BOOKMARK = 5;
const MAX_X_FOLDER_HINT_LENGTH = 80;
export const MAX_PROMPT_TAG_COLORS = 160;
export const MAX_PROMPT_EXISTING_TAGS = 80;
export const MAX_PROMPT_EXISTING_COLLECTIONS = 40;
const FALLBACK_TAG_COLOR = PRESET_COLORS[0];
export const GENERIC_COLLECTION_NAMES = new Set([
  "bookmark",
  "bookmarks",
  "collection",
  "collections",
  "misc",
  "miscellaneous",
  "general",
  "other",
]);
export const GENERIC_TAG_NAMES = new Set([
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

export function normalizeKey(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizeWhitespace(value: string) {
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

export function normalizeSuggestedTagName(value: string) {
  const stripped = stripLabelNoise(value);
  if (!stripped) return "";
  return titleCaseLabel(stripped);
}

export function normalizeSuggestedCollectionName(value: string) {
  const stripped = stripLabelNoise(value);
  if (!stripped) return "";
  return titleCaseLabel(stripped);
}

export function isUrlLikeLabel(value: string) {
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

export function normalizeTagKey(value: string) {
  const key = normalizeKey(stripLabelNoise(value));
  return TAG_CANONICAL_ALIASES.get(key) ?? key;
}

/** Lookup keys including simple plural/singular variants for tag reuse. */
export function tagLookupKeys(value: string): string[] {
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

export function truncateText(value: string | null | undefined, maxLength: number) {
  if (!value) return "";
  const normalized = value.trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

export function normalizeColor(
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

export function buildDefaultSuggestion(bookmarkId: string) {
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

export function promoteMatchedVocabulary<T extends { name: string }>(args: {
  ranked: T[];
  allItems: T[];
  matchedNames: string[];
  maxCount: number;
}) {
  const rankedKeys = new Set(args.ranked.map((item) => normalizeKey(item.name)));
  const allByKey = new Map(
    args.allItems.map((item) => [normalizeKey(item.name), item])
  );
  const promoted = [...args.ranked];

  for (const name of args.matchedNames) {
    const key = normalizeKey(name);
    if (!key || rankedKeys.has(key)) continue;

    const item = allByKey.get(key);
    if (!item) continue;

    if (promoted.length < args.maxCount) {
      promoted.push(item);
    } else {
      promoted[promoted.length - 1] = item;
    }
    rankedKeys.add(key);
  }

  return promoted.slice(0, args.maxCount);
}

export function buildBookmarkPayload(args: {
  bookmark: OrbitBookmarkForScan;
  existingTags: OrbitTagContext[];
  existingCollections: OrbitCollectionContext[];
  authorPriorHint?: OrbitAuthorPriorHint;
  learningHint?: OrbitLearningHint;
  neighborHint?: OrbitNeighborHint;
}) {
  const {
    bookmark,
    authorPriorHint,
    existingTags,
    existingCollections,
    learningHint,
    neighborHint,
  } = args;

  const signals = extractOrbitBookmarkSignals({
    bookmark,
    existingTags,
    existingCollections,
    learningHint,
    neighborHint,
    tweetId: bookmark.tweetId,
  });

  return {
    id: bookmark.id,
    author: {
      username: bookmark.authorUsername,
      displayName: bookmark.authorDisplayName,
      verified: bookmark.authorVerified,
    },
    savedAt: new Date(bookmark.bookmarkedAt).toISOString(),
    tweetCreatedAt: new Date(bookmark.tweetCreatedAt).toISOString(),
    tweetText: truncateText(signals.primaryText, MAX_TEXT_LENGTH),
    note: truncateText(bookmark.notes[0]?.content, MAX_NOTE_LENGTH) || null,
    mediaTypes: asMediaTypes(bookmark.media),
    urls: asUrls(bookmark.urls),
    quotedTweet: asQuotedTweet(bookmark.quotedTweet),
    sourceFolders: asXFolderHints(bookmark.xFolderHints),
    metrics: asPublicMetrics(bookmark.publicMetrics),
    signals,
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
