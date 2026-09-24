import { hasVideoLikeMedia, type BookmarkMediaJson } from "@/lib/bookmark-media";
import { ORBIT_LIBRARY_VOCAB_MAX } from "@/lib/orbit-config";
import {
  GENERIC_TAG_NAMES,
  isUrlLikeLabel,
  normalizeSuggestedTagName,
  normalizeTagKey,
} from "@/lib/orbit-grok-normalize";
import { VIDEO_TAG_NAME } from "@/lib/orbit-video-tag";

export interface LibrarySampleBookmark {
  id: string;
  authorUsername: string;
  tweetText: string;
  urls: unknown;
  media: unknown;
  xMetadata?: unknown;
}

function normalize(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function domainFromUrl(value: string) {
  try {
    const parsed = new URL(value.startsWith("http") ? value : `https://${value}`);
    return parsed.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

export function libraryDomains(urls: unknown): string[] {
  if (!Array.isArray(urls)) return [];
  const seen = new Set<string>();
  for (const item of urls) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const raw =
      typeof record.expanded_url === "string"
        ? record.expanded_url
        : typeof record.url === "string"
          ? record.url
          : null;
    const domain = raw ? domainFromUrl(raw) : null;
    if (domain) seen.add(domain);
  }
  return Array.from(seen);
}

export function libraryTopics(xMetadata: unknown): string[] {
  if (!xMetadata || typeof xMetadata !== "object") return [];
  const tweet = (xMetadata as { tweet?: unknown }).tweet;
  if (!tweet || typeof tweet !== "object") return [];
  const annotations = (tweet as { context_annotations?: unknown }).context_annotations;
  if (!Array.isArray(annotations)) return [];

  const seen = new Set<string>();
  const topics: string[] = [];
  for (const annotation of annotations) {
    if (!annotation || typeof annotation !== "object") continue;
    const entity = (annotation as { entity?: unknown }).entity;
    if (!entity || typeof entity !== "object") continue;
    const name = (entity as { name?: unknown }).name;
    if (typeof name !== "string") continue;
    const trimmed = name.trim();
    const key = normalize(trimmed);
    if (!trimmed || !key || seen.has(key)) continue;
    seen.add(key);
    topics.push(trimmed);
  }
  return topics;
}

export function librarySampleHasVideo(
  bookmarks: Array<{ media: unknown }>
): boolean {
  return bookmarks.some((bookmark) =>
    Array.isArray(bookmark.media)
      ? hasVideoLikeMedia(bookmark.media as BookmarkMediaJson[])
      : false
  );
}

/**
 * Cover the library with as many distinct authors, domains, and X topics as
 * the sample allows, then fill any remaining slots in the original order.
 */
export function selectStratifiedLibrarySample<T extends LibrarySampleBookmark>(
  bookmarks: T[],
  limit: number
): T[] {
  const picked: T[] = [];
  const used = new Set<string>();
  const seenAuthors = new Set<string>();
  const seenDomains = new Set<string>();
  const seenTopics = new Set<string>();

  const take = (bookmark: T) => {
    picked.push(bookmark);
    used.add(bookmark.id);
    const author = normalize(bookmark.authorUsername);
    if (author) seenAuthors.add(author);
    for (const domain of libraryDomains(bookmark.urls)) seenDomains.add(domain);
    for (const topic of libraryTopics(bookmark.xMetadata)) {
      seenTopics.add(normalize(topic));
    }
  };

  for (const bookmark of bookmarks) {
    if (picked.length >= limit || used.has(bookmark.id)) continue;
    const author = normalize(bookmark.authorUsername);
    const addsAuthor = Boolean(author) && !seenAuthors.has(author);
    const addsDomain = libraryDomains(bookmark.urls).some(
      (domain) => !seenDomains.has(domain)
    );
    const addsTopic = libraryTopics(bookmark.xMetadata).some(
      (topic) => !seenTopics.has(normalize(topic))
    );
    if (addsAuthor || addsDomain || addsTopic) take(bookmark);
  }

  for (const bookmark of bookmarks) {
    if (picked.length >= limit) break;
    if (!used.has(bookmark.id)) take(bookmark);
  }

  return picked;
}

export function parseLibraryVocabularyTags(
  payload: unknown,
  options: { includeVideo: boolean }
): string[] {
  const rawTags =
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as { tags?: unknown }).tags)
      ? (payload as { tags: unknown[] }).tags
      : [];

  const names: string[] = [];
  const seen = new Set<string>();
  for (const raw of rawTags) {
    if (typeof raw !== "string") continue;
    const name = normalizeSuggestedTagName(raw);
    const key = normalizeTagKey(name);
    if (!name || !key || seen.has(key)) continue;
    if (GENERIC_TAG_NAMES.has(key) || isUrlLikeLabel(name)) continue;
    seen.add(key);
    names.push(name);
    if (names.length >= ORBIT_LIBRARY_VOCAB_MAX) break;
  }

  if (
    options.includeVideo &&
    !names.some((name) => normalizeTagKey(name) === normalizeTagKey(VIDEO_TAG_NAME))
  ) {
    if (names.length >= ORBIT_LIBRARY_VOCAB_MAX) names.pop();
    names.unshift(VIDEO_TAG_NAME);
  }

  return names;
}
