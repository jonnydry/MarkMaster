import "server-only";

import {
  AuthenticationError,
  PermissionDeniedError,
  noul,
} from "@typesafe-ai/sdk";

import {
  ORBIT_JEV_TAG_STRONG_THRESHOLD,
  ORBIT_LIBRARY_PACK_CONCURRENCY,
  ORBIT_LIBRARY_PACK_SIZE,
  ORBIT_LIBRARY_PACK_TAG_CAP,
  ORBIT_MAX_TAGS_PER_BOOKMARK,
} from "@/lib/orbit-config";
import { OrbitScanError } from "@/lib/orbit-grok-schemas";
import { normalizeTagKey } from "@/lib/orbit-grok-normalize";
import {
  libraryDomains,
  libraryTopics,
  type LibrarySampleBookmark,
} from "@/lib/orbit-library-sample";
import {
  getOrbitArticlePreviewText,
  getOrbitArticleTitle,
  getOrbitAuthorBio,
  getOrbitNoteTweetText,
} from "@/lib/orbit-primary-text";
import { VIDEO_TAG_NAME, mediaIncludesVideo } from "@/lib/orbit-video-tag";
import { logWarn } from "@/lib/logger";
import { getTypeSafeClient, getTypeSafeModel } from "@/lib/typesafe";
import type { OrbitBookmarkSuggestion, OrbitScanPlan } from "@/types";

export interface LibraryAssignBookmark {
  id: string;
  tweetText: string;
  media: unknown;
  urls?: unknown;
  xMetadata?: unknown;
}

export interface LibraryVocabularyTag {
  name: string;
  color: string;
}

function questionKey(postIndex: number, tagIndex: number) {
  return `p${postIndex}t${tagIndex}`;
}

function dedupeTags(names: string[]): string[] {
  const picked: string[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    const key = normalizeTagKey(name);
    if (!key || seen.has(key) || picked.length >= ORBIT_MAX_TAGS_PER_BOOKMARK) {
      continue;
    }
    seen.add(key);
    picked.push(name);
  }
  return picked;
}

function postHasVideo(media: unknown) {
  return mediaIncludesVideo(media);
}

/**
 * Tags decided without a model: a matching X topic, plus Video when the post
 * has video. Jev still judges every post — X topics are broad ("Technology"),
 * so a topic match must not stop a more specific tag from being found.
 */
export function freeLibraryTags(
  bookmark: Pick<LibrarySampleBookmark, "media" | "xMetadata">,
  vocabulary: LibraryVocabularyTag[]
): string[] {
  const byKey = new Map(
    vocabulary.map((tag) => [normalizeTagKey(tag.name), tag.name])
  );
  const topicTags = libraryTopics(bookmark.xMetadata).flatMap((topic) => {
    const match = byKey.get(normalizeTagKey(topic));
    return match ? [match] : [];
  });
  const video = postHasVideo(bookmark.media)
    ? byKey.get(normalizeTagKey(VIDEO_TAG_NAME))
    : undefined;
  return dedupeTags([...(video ? [video] : []), ...topicTags]);
}

export function tagsFromPackedNouls(args: {
  posts: Array<{ id: string }>;
  tags: string[];
  nouls: Record<string, number>;
}): Map<string, string[]> {
  const assigned = new Map<string, string[]>();
  for (const [postIndex, post] of args.posts.entries()) {
    const names = args.tags
      .map((tag, tagIndex) => ({
        tag,
        noul: args.nouls[questionKey(postIndex, tagIndex)] ?? 0,
      }))
      .filter((entry) => entry.noul >= ORBIT_JEV_TAG_STRONG_THRESHOLD)
      .sort((left, right) => right.noul - left.noul)
      .map((entry) => entry.tag);
    const picked = dedupeTags(names);
    if (picked.length > 0) assigned.set(post.id, picked);
  }
  return assigned;
}

function noteTweetUrls(xMetadata: unknown): unknown {
  if (!xMetadata || typeof xMetadata !== "object") return [];
  const tweet = (xMetadata as { tweet?: unknown }).tweet;
  if (!tweet || typeof tweet !== "object") return [];
  const note = (tweet as { note_tweet?: unknown }).note_tweet;
  if (!note || typeof note !== "object") return [];
  const entities = (note as { entities?: unknown }).entities;
  if (!entities || typeof entities !== "object") return [];
  return (entities as { urls?: unknown }).urls ?? [];
}

function imageAltTexts(media: unknown): string[] {
  if (!Array.isArray(media)) return [];
  return media.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const alt = (item as { alt_text?: unknown }).alt_text;
    return typeof alt === "string" && alt.trim() ? [alt.trim()] : [];
  });
}

function linkPhrases(urls: unknown): string[] {
  if (!Array.isArray(urls)) return [];
  const phrases: string[] = [];
  for (const item of urls) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    for (const key of ["title", "description", "display_url", "expanded_url"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) phrases.push(value.trim().slice(0, 180));
    }
  }
  return phrases;
}

/** Note text when it already contains the opening; otherwise the short post plus the note. */
function libraryPostBody(bookmark: LibraryAssignBookmark): string {
  const note = getOrbitNoteTweetText(bookmark.xMetadata)?.trim() ?? "";
  const tweet = bookmark.tweetText.trim();
  if (note && tweet) {
    const opening = tweet.slice(0, 40);
    return opening && note.includes(opening) ? note : `${tweet}\n${note}`;
  }
  return note || tweet;
}

/**
 * Post text Jev judges and the shortlist matches against.
 * Author bio is not included; it is passed beside the post so it cannot
 * mark every bookmark from that account as being about the bio.
 */
export function libraryPostJudgmentText(bookmark: LibraryAssignBookmark): string {
  const parts = [
    libraryPostBody(bookmark),
    getOrbitArticleTitle(bookmark.xMetadata),
    getOrbitArticlePreviewText(bookmark.xMetadata),
    ...linkPhrases(bookmark.urls),
    ...linkPhrases(noteTweetUrls(bookmark.xMetadata)),
    ...libraryDomains(bookmark.urls),
    ...libraryDomains(noteTweetUrls(bookmark.xMetadata)),
    ...imageAltTexts(bookmark.media),
  ].filter((part): part is string => Boolean(part?.trim()));
  return parts.join("\n").slice(0, 1200);
}

function tagNameOverlaps(name: string, haystack: string): boolean {
  const tokens = name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2);
  if (tokens.length === 0) return false;
  const words = new Set(haystack.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  return tokens.every((token) => words.has(token));
}

/**
 * Tags for one pack. Names that appear in the posts come first, including
 * tags outside the most-used slice, then the most-used names fill the rest.
 */
export function shortlistLibraryPackTags(
  posts: LibraryAssignBookmark[],
  vocabulary: LibraryVocabularyTag[],
  maxCount = ORBIT_LIBRARY_PACK_TAG_CAP
): string[] {
  const haystack = posts.map((post) => libraryPostJudgmentText(post)).join("\n").toLowerCase();
  const matched: string[] = [];
  const rest: string[] = [];
  const seen = new Set<string>();
  for (const tag of vocabulary) {
    const key = normalizeTagKey(tag.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (tagNameOverlaps(tag.name, haystack)) matched.push(tag.name);
    else rest.push(tag.name);
  }
  const limit = Math.min(Math.max(maxCount, matched.length), maxCount + 16);
  return [...matched, ...rest].slice(0, limit);
}

/** Example posts per tag, keyed by normalized tag name. */
export type LibraryTagExamples = Map<string, string[]>;

const PACK_REQUEST_TIMEOUT_MS = 20_000;
const PACK_MAX_RETRIES = 1;

async function assignPack(
  posts: LibraryAssignBookmark[],
  tags: string[],
  examples: LibraryTagExamples | undefined,
  signal?: AbortSignal
): Promise<Map<string, string[]>> {
  const client = getTypeSafeClient();
  const questions: Record<string, ReturnType<typeof noul>> = {};
  for (const [postIndex, post] of posts.entries()) {
    for (const [tagIndex, tag] of tags.entries()) {
      questions[questionKey(postIndex, tagIndex)] = noul(
        {
          question: `Does \`posts[${postIndex}]\` belong under the tag "${tag}" (\`tags[${tagIndex}]\`)? When the tag has examples, they show what this library files under it.`,
          postId: post.id,
        },
        {
          true: `posts[${postIndex}] is about ${tag}.`,
          false: `posts[${postIndex}] is not about ${tag}.`,
        }
      );
    }
  }

  const response = await client.systemOne(
    {
      model: getTypeSafeModel(),
      state: {
        posts: posts.map((post) => ({
          id: post.id,
          text: libraryPostJudgmentText(post) || "(no text)",
          authorBio: getOrbitAuthorBio(post.xMetadata),
        })),
        tags: tags.map((name) => {
          const entry: { [key: string]: string | string[] } = { name };
          const tagExamples = examples?.get(normalizeTagKey(name));
          if (tagExamples?.length) entry.examples = tagExamples;
          return entry;
        }),
      },
      questions,
    },
    {
      ...(signal ? { signal } : {}),
      timeout: PACK_REQUEST_TIMEOUT_MS,
      retry: { maxRetries: PACK_MAX_RETRIES },
    }
  );

  const nouls: Record<string, number> = {};
  for (const [key, answer] of Object.entries(response.answers)) {
    nouls[key] = answer && "noul" in answer ? answer.noul : 0;
  }
  return tagsFromPackedNouls({ posts, tags, nouls });
}

/** Credential failures would fail every pack; stop the run instead of skipping the library. */
function isFatalPackError(error: unknown) {
  return (
    error instanceof AuthenticationError ||
    error instanceof PermissionDeniedError
  );
}

/** Runs a Jev pack call when a slot is free. */
export type PackLimiter = <T>(task: () => Promise<T>) => Promise<T>;

/**
 * At most `concurrency` Jev calls in flight, started in the order they were
 * queued. Sharing one limiter across library pages lets the next page's packs
 * take the slots the current page's slowest packs leave idle.
 */
export function createPackLimiter(
  concurrency = ORBIT_LIBRARY_PACK_CONCURRENCY
): PackLimiter {
  let active = 0;
  const waiting: Array<() => void> = [];

  return (task) =>
    new Promise((resolve, reject) => {
      const run = () => {
        task()
          .then(resolve, reject)
          .finally(() => {
            // Hand the slot straight to the next queued call.
            const next = waiting.shift();
            if (next) next();
            else active -= 1;
          });
      };
      if (active < concurrency) {
        active += 1;
        run();
      } else {
        waiting.push(run);
      }
    });
}

async function mapPacks(
  packs: LibraryAssignBookmark[][],
  tags: string[],
  options: {
    limiter: PackLimiter;
    examples?: LibraryTagExamples;
    signal?: AbortSignal;
  }
): Promise<{ assigned: Map<string, string[]>; failed: number }> {
  const assigned = new Map<string, string[]>();
  let failed = 0;
  let fatal: unknown = null;

  await Promise.all(
    packs.map((pack) =>
      options.limiter(async () => {
        // Packs still queued when the batch stops (credential failure, or the
        // page was abandoned) never reach Jev; abandoning also cancels the
        // calls and backoffs already in flight.
        if (fatal || options.signal?.aborted || pack.length === 0) return;
        try {
          const packTags = shortlistLibraryPackTags(
            pack,
            tags.map((name) => ({ name, color: "" }))
          );
          // Rate limits and transient failures are retried by the client.
          const packAssigned = await assignPack(
            pack,
            packTags,
            options.examples,
            options.signal
          );
          for (const [id, names] of packAssigned) assigned.set(id, names);
        } catch (error) {
          // Cancelled with its page: nothing will read this result.
          if (options.signal?.aborted) return;
          if (isFatalPackError(error)) {
            fatal = error;
            return;
          }
          failed += pack.length;
          logWarn(
            "OrbitLibrary",
            `Packed assignment failed for ${pack.length} posts; leaving them untagged.`,
            error instanceof Error ? error.message : error
          );
        }
      })
    )
  );
  if (fatal) {
    throw new OrbitScanError(
      "TypeSafe rejected the request. Confirm TYPESAFE_API_KEY.",
      502,
      "typesafe_auth"
    );
  }
  return { assigned, failed };
}

function suggestion(
  bookmarkId: string,
  names: string[],
  vocabulary: LibraryVocabularyTag[],
  reasoning: string
): OrbitBookmarkSuggestion {
  const colorFor = new Map(vocabulary.map((tag) => [normalizeTagKey(tag.name), tag.color]));
  return {
    bookmarkId,
    confidence: "high",
    reasoning,
    tags: names.map((name) => ({
      name,
      color: colorFor.get(normalizeTagKey(name)) ?? "#1d9bf0",
      reason: reasoning,
      reuseExisting: true,
    })),
    collection: null,
  };
}

export type LibraryAssignmentPlan = {
  plan: OrbitScanPlan;
  /** Posts that needed a Jev call. */
  modelChecked: number;
  /** Of those, posts whose pack still failed after retries. */
  failed: number;
};

export async function planLibraryAssignments(args: {
  bookmarks: LibraryAssignBookmark[];
  vocabulary: LibraryVocabularyTag[];
  /** Shared Jev slots (a run shares one across pages); defaults to a fresh pool. */
  limiter?: PackLimiter;
  /** Posts already under each tag, shown to Jev as what the tag means. */
  examples?: LibraryTagExamples;
  /** Abandons packs that have not started yet. */
  signal?: AbortSignal;
}): Promise<LibraryAssignmentPlan> {
  const tagNames = args.vocabulary.map((tag) => tag.name);
  const suggestions: OrbitBookmarkSuggestion[] = [];
  const needsModel = args.bookmarks;

  const packs: LibraryAssignBookmark[][] = [];
  for (let index = 0; index < needsModel.length; index += ORBIT_LIBRARY_PACK_SIZE) {
    packs.push(needsModel.slice(index, index + ORBIT_LIBRARY_PACK_SIZE));
  }
  const { assigned, failed } =
    tagNames.length > 0 && packs.length > 0
      ? await mapPacks(packs, tagNames, {
          limiter: args.limiter ?? createPackLimiter(),
          examples: args.examples,
          signal: args.signal,
        })
      : { assigned: new Map<string, string[]>(), failed: 0 };

  for (const bookmark of needsModel) {
    const names = dedupeTags([
      ...freeLibraryTags(bookmark, args.vocabulary),
      ...(assigned.get(bookmark.id) ?? []),
    ]);
    if (names.length === 0) continue;
    suggestions.push(
      suggestion(
        bookmark.id,
        names,
        args.vocabulary,
        "Matched the tag list for this library."
      )
    );
  }

  return {
    plan: {
      overview: {
        summary: `Tagged ${suggestions.length} of ${args.bookmarks.length} posts from the library tag list.`,
        taggingStrategy: "Assigned posts to the library tag list. Posts that fit nothing stayed untagged.",
        collectionStrategy: "Collections were left unchanged.",
      },
      suggestions,
    },
    modelChecked: tagNames.length > 0 ? needsModel.length : 0,
    failed,
  };
}
