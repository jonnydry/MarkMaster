import "server-only";

import { getContentTypeHints } from "@/lib/auto-tag";
import { getDomainHints } from "@/lib/orbit-domain-hints";
import {
  getOrbitBookmarkPrimaryText,
  textHasUsefulSignal,
} from "@/lib/orbit-primary-text";

const MAX_SIGNAL_TEXT = 500;
const MAX_LINKS = 3;
const MAX_TOPICS = 8;
const MAX_ALT_TEXTS = 4;
const MAX_VOCAB_MATCHES = 8;
const MAX_AUTHOR_BIO = 200;

type JsonObject = Record<string, unknown>;

export interface OrbitSignalBookmark {
  tweetText: string;
  authorUsername: string;
  authorDisplayName: string;
  media: unknown;
  urls: unknown;
  quotedTweet: unknown;
  notes: Array<{ content: string }>;
  xMetadata?: unknown;
  xFolderHints?: Array<{ name: string }>;
}

export interface OrbitSignalVocabularyItem {
  name: string;
  bookmarkCount?: number;
}

export interface OrbitSignalPriorHint {
  priorCount: number;
  tags: string[];
  collections: string[];
}

export interface OrbitLearningHint {
  bookmarkId: string;
  matchingTags: string[];
  matchingCollections: string[];
  avoidTags: string[];
  avoidCollections: string[];
  reasons: string[];
}

export interface OrbitNeighborHint {
  tags: string[];
  collections: string[];
  reasons: string[];
}

export interface OrbitExtractedSignals {
  primaryText: string;
  noteText: string | null;
  quotedText: string | null;
  linkContext: Array<{
    domain: string | null;
    title: string | null;
    description: string | null;
  }>;
  articleContext: { title?: string; previewText?: string } | null;
  threadContext: {
    isThread: boolean;
    isReply: boolean;
    conversationId?: string;
  };
  authorContext: { bio?: string } | null;
  xTopics: Array<{
    domain: string | null;
    entity: string;
    description: string | null;
  }>;
  visualContext: {
    mediaTypes: string[];
    altTexts: string[];
  };
  sourceFolders: string[];
  contentTypeHints: string[];
  domainHints: string[];
  existingVocabularyMatches: {
    tags: string[];
    collections: string[];
  };
  localLearning: {
    matchingTags: string[];
    matchingCollections: string[];
    avoidTags: string[];
    avoidCollections: string[];
    reasons: string[];
  } | null;
  neighborHints: OrbitNeighborHint | null;
  dataQuality: {
    hasFullText: boolean;
    hasNoteText: boolean;
    hasQuotedText: boolean;
    hasUrlMetadata: boolean;
    hasXTopics: boolean;
    hasMediaAltText: boolean;
    hasArticle: boolean;
    hasThreadContext: boolean;
    hasAuthorBio: boolean;
  };
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string | null | undefined, maxLength = MAX_SIGNAL_TEXT) {
  if (!value) return "";
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function normalizeKey(value: string) {
  return normalizeWhitespace(value).toLowerCase();
}

function getNestedObject(value: unknown, key: string): JsonObject | null {
  if (!isObject(value)) return null;
  const nested = value[key];
  return isObject(nested) ? nested : null;
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function getTweetMetadata(bookmark: OrbitSignalBookmark): JsonObject | null {
  return getNestedObject(bookmark.xMetadata, "tweet");
}

function getAuthorMetadata(bookmark: OrbitSignalBookmark): JsonObject | null {
  return getNestedObject(bookmark.xMetadata, "author");
}

function getNoteTweetUrls(bookmark: OrbitSignalBookmark): unknown[] {
  const noteTweet = getNestedObject(getTweetMetadata(bookmark), "note_tweet");
  const entities = getNestedObject(noteTweet, "entities");
  const urls = entities?.urls;
  return Array.isArray(urls) ? urls : [];
}

function getQuotedText(input: unknown): string | null {
  if (!isObject(input)) return null;
  return getString(input.text);
}

function getMediaTypes(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  for (const item of input) {
    if (!isObject(item)) continue;
    const type = getString(item.type);
    if (type) seen.add(type);
  }
  return Array.from(seen);
}

function domainFromUrl(value: unknown): string | null {
  const url = getString(value);
  if (!url) return null;
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function urlContextKey(item: JsonObject) {
  const expandedUrl = getString(item.expanded_url) ?? getString(item.url);
  const displayUrl = getString(item.display_url);
  return normalizeKey(expandedUrl ?? displayUrl ?? "");
}

function getUrlContext(inputs: unknown[]): OrbitExtractedSignals["linkContext"] {
  const deduped = new Map<string, OrbitExtractedSignals["linkContext"][number]>();

  for (const input of inputs) {
    if (!Array.isArray(input)) continue;

    for (const item of input) {
      if (!isObject(item)) continue;
      const key = urlContextKey(item);
      if (!key) continue;

      const expandedUrl = getString(item.expanded_url) ?? getString(item.url);
      const title = truncate(getString(item.title), 160) || null;
      const description = truncate(getString(item.description), 220) || null;
      const domain = domainFromUrl(expandedUrl ?? getString(item.display_url));

      if (!domain && !title && !description) continue;
      if (!deduped.has(key)) {
        deduped.set(key, { domain, title, description });
      }
    }
  }

  return Array.from(deduped.values()).slice(0, MAX_LINKS);
}

function getArticleContext(bookmark: OrbitSignalBookmark) {
  const article = getNestedObject(getTweetMetadata(bookmark), "article");
  if (!article) return null;

  const title = truncate(getString(article.title), 160) || undefined;
  const previewText =
    truncate(
      getString(article.preview_text) ??
        getString(article.previewText) ??
        getString(article.description),
      300
    ) || undefined;

  if (!title && !previewText) return null;
  return { title, previewText };
}

function getThreadContext(bookmark: OrbitSignalBookmark, tweetId?: string) {
  const tweet = getTweetMetadata(bookmark);
  const conversationId = getString(tweet?.conversation_id) ?? undefined;
  const referenced = Array.isArray(tweet?.referenced_tweets)
    ? tweet.referenced_tweets
    : [];
  const isReply = referenced.some(
    (item) => isObject(item) && getString(item.type) === "replied_to"
  );
  const isThread =
    isReply ||
    Boolean(conversationId && tweetId && conversationId !== tweetId) ||
    /🧵|\bthread\b/i.test(bookmark.tweetText) ||
    /\b1\/\d+\b/.test(bookmark.tweetText);

  return {
    isThread,
    isReply,
    ...(conversationId ? { conversationId } : {}),
  };
}

function getAuthorContext(bookmark: OrbitSignalBookmark) {
  const bio = truncate(getString(getAuthorMetadata(bookmark)?.description), MAX_AUTHOR_BIO);
  return bio ? { bio } : null;
}

function getContextAnnotations(bookmark: OrbitSignalBookmark) {
  const tweet = getTweetMetadata(bookmark);
  const annotations = tweet?.context_annotations;
  if (!Array.isArray(annotations)) return [];

  const deduped = new Map<string, OrbitExtractedSignals["xTopics"][number]>();
  for (const annotation of annotations) {
    if (!isObject(annotation)) continue;
    const domain = isObject(annotation.domain) ? annotation.domain : null;
    const entity = isObject(annotation.entity) ? annotation.entity : null;
    const entityName = getString(entity?.name);
    if (!entityName) continue;

    const item = {
      domain: truncate(getString(domain?.name), 80) || null,
      entity: truncate(entityName, 100),
      description: truncate(getString(entity?.description), 160) || null,
    };
    const key = normalizeKey(`${item.domain ?? ""}:${item.entity}`);
    if (!deduped.has(key)) deduped.set(key, item);
  }

  return Array.from(deduped.values()).slice(0, MAX_TOPICS);
}

function getMediaAltTexts(bookmark: OrbitSignalBookmark): string[] {
  const fromStoredMedia = Array.isArray(bookmark.media)
    ? bookmark.media.flatMap((item) =>
        isObject(item) && getString(item.alt_text)
          ? [truncate(getString(item.alt_text), 220)]
          : []
      )
    : [];
  const metadataMedia = isObject(bookmark.xMetadata)
    ? bookmark.xMetadata.media
    : null;
  const fromMetadata = Array.isArray(metadataMedia)
    ? metadataMedia.flatMap((item) =>
        isObject(item) && getString(item.alt_text)
          ? [truncate(getString(item.alt_text), 220)]
          : []
      )
    : [];

  const seen = new Set<string>();
  return [...fromStoredMedia, ...fromMetadata].flatMap((text) => {
    const key = normalizeKey(text);
    if (!key || seen.has(key)) return [];
    seen.add(key);
    return [text];
  }).slice(0, MAX_ALT_TEXTS);
}

function labelMatchesText(label: string, text: string) {
  const key = normalizeKey(label);
  if (!key) return false;
  if (key.length <= 3) {
    return new RegExp(`(^|[^a-z0-9])${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i").test(text);
  }
  return text.includes(key);
}

function getVocabularyMatches(
  items: OrbitSignalVocabularyItem[],
  haystack: string
) {
  const normalizedHaystack = normalizeKey(haystack);
  return [...items]
    .sort(
      (a, b) =>
        (b.bookmarkCount ?? 0) - (a.bookmarkCount ?? 0) ||
        a.name.localeCompare(b.name)
    )
    .flatMap((item) => (labelMatchesText(item.name, normalizedHaystack) ? [item.name] : []))
    .slice(0, MAX_VOCAB_MATCHES);
}

function cleanLearningHint(hint?: OrbitLearningHint | null) {
  if (!hint) return null;

  const localLearning = {
    matchingTags: hint.matchingTags.slice(0, 5),
    matchingCollections: hint.matchingCollections.slice(0, 4),
    avoidTags: hint.avoidTags.slice(0, 5),
    avoidCollections: hint.avoidCollections.slice(0, 4),
    reasons: hint.reasons.slice(0, 4),
  };

  return Object.values(localLearning).some((value) => value.length > 0)
    ? localLearning
    : null;
}

function cleanNeighborHint(hint?: OrbitNeighborHint | null): OrbitNeighborHint | null {
  if (!hint) return null;

  const cleaned = {
    tags: hint.tags.slice(0, 5),
    collections: hint.collections.slice(0, 4),
    reasons: hint.reasons.slice(0, 4),
  };

  return cleaned.tags.length || cleaned.collections.length ? cleaned : null;
}

export function extractOrbitBookmarkSignals(args: {
  bookmark: OrbitSignalBookmark;
  existingTags: OrbitSignalVocabularyItem[];
  existingCollections: OrbitSignalVocabularyItem[];
  learningHint?: OrbitLearningHint | null;
  neighborHint?: OrbitNeighborHint | null;
  tweetId?: string;
}): OrbitExtractedSignals {
  const primaryText = truncate(getOrbitBookmarkPrimaryText(args.bookmark));
  const noteText = truncate(args.bookmark.notes[0]?.content, 300) || null;
  const quotedText = truncate(getQuotedText(args.bookmark.quotedTweet), 300) || null;
  const linkContext = getUrlContext([
    args.bookmark.urls,
    getNoteTweetUrls(args.bookmark),
  ]);
  const articleContext = getArticleContext(args.bookmark);
  const threadContext = getThreadContext(args.bookmark, args.tweetId);
  const authorContext = getAuthorContext(args.bookmark);
  const xTopics = getContextAnnotations(args.bookmark);
  const altTexts = getMediaAltTexts(args.bookmark);
  const sourceFolders = Array.from(
    (args.bookmark.xFolderHints ?? []).reduce((map, folder) => {
      const name = truncate(folder.name, 80);
      const key = name ? normalizeKey(name) : "";
      if (name && key && !map.has(key)) map.set(key, name);
      return map;
    }, new Map<string, string>()).values()
  );
  const contentTypeHints = getContentTypeHints(
    primaryText,
    Array.isArray(args.bookmark.media) ? args.bookmark.media : null,
    Array.isArray(args.bookmark.urls) ? args.bookmark.urls : null
  );
  const domainHints = getDomainHints(linkContext.map((link) => link.domain));

  const vocabularyHaystack = [
    primaryText,
    noteText,
    quotedText,
    articleContext?.title,
    articleContext?.previewText,
    authorContext?.bio,
    ...linkContext.flatMap((link) => [link.domain, link.title, link.description]),
    ...xTopics.flatMap((topic) => [topic.domain, topic.entity, topic.description]),
    ...altTexts,
    ...sourceFolders,
    ...contentTypeHints,
    ...domainHints,
  ]
    .filter(Boolean)
    .join(" ");

  const dataQuality = {
    hasFullText: textHasUsefulSignal(primaryText),
    hasNoteText: textHasUsefulSignal(noteText),
    hasQuotedText: textHasUsefulSignal(quotedText),
    hasUrlMetadata: linkContext.some((link) => link.title || link.description),
    hasXTopics: xTopics.length > 0,
    hasMediaAltText: altTexts.length > 0,
    hasArticle: Boolean(articleContext),
    hasThreadContext: threadContext.isThread || threadContext.isReply,
    hasAuthorBio: Boolean(authorContext?.bio),
  };

  return {
    primaryText,
    noteText,
    quotedText,
    linkContext,
    articleContext,
    threadContext,
    authorContext,
    xTopics,
    visualContext: {
      mediaTypes: getMediaTypes(args.bookmark.media),
      altTexts,
    },
    sourceFolders,
    contentTypeHints,
    domainHints,
    existingVocabularyMatches: {
      tags: getVocabularyMatches(args.existingTags, vocabularyHaystack),
      collections: getVocabularyMatches(
        args.existingCollections,
        vocabularyHaystack
      ),
    },
    localLearning: cleanLearningHint(args.learningHint),
    neighborHints: cleanNeighborHint(args.neighborHint),
    dataQuality,
  };
}