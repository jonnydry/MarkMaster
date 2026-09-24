import "server-only";

import { RateLimitError, noul } from "@typesafe-ai/sdk";

import {
  ORBIT_JEV_TAG_STRONG_THRESHOLD,
  ORBIT_LIBRARY_PACK_CONCURRENCY,
  ORBIT_LIBRARY_PACK_SIZE,
  ORBIT_MAX_TAGS_PER_BOOKMARK,
} from "@/lib/orbit-config";
import { normalizeTagKey } from "@/lib/orbit-grok-normalize";
import {
  libraryTopics,
  type LibrarySampleBookmark,
} from "@/lib/orbit-library-sample";
import { VIDEO_TAG_NAME, mediaIncludesVideo } from "@/lib/orbit-video-tag";
import { logWarn } from "@/lib/logger";
import { getTypeSafeClient, getTypeSafeModel } from "@/lib/typesafe";
import type { OrbitBookmarkSuggestion, OrbitScanPlan } from "@/types";

export interface LibraryAssignBookmark {
  id: string;
  tweetText: string;
  media: unknown;
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

/** Tags decided without a model: a matching X topic, plus Video when the post has video. */
export function freeLibraryTags(
  bookmark: Pick<LibrarySampleBookmark, "media" | "xMetadata">,
  vocabulary: LibraryVocabularyTag[]
): { tags: string[]; skipModel: boolean } {
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
  return {
    tags: dedupeTags([...(video ? [video] : []), ...topicTags]),
    skipModel: topicTags.length > 0,
  };
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

function postText(bookmark: LibraryAssignBookmark) {
  return bookmark.tweetText.replace(/\s+/g, " ").trim().slice(0, 400);
}

async function assignPack(
  posts: LibraryAssignBookmark[],
  tags: string[]
): Promise<Map<string, string[]>> {
  const client = getTypeSafeClient();
  const questions: Record<string, ReturnType<typeof noul>> = {};
  for (const [postIndex, post] of posts.entries()) {
    for (const [tagIndex, tag] of tags.entries()) {
      questions[questionKey(postIndex, tagIndex)] = noul(
        {
          question: `Does posts[${postIndex}] belong under the tag "${tag}"?`,
          postId: post.id,
        },
        {
          true: `posts[${postIndex}] is about ${tag}.`,
          false: `posts[${postIndex}] is not about ${tag}.`,
        }
      );
    }
  }

  const response = await client.systemOne({
    model: getTypeSafeModel(),
    state: {
      posts: posts.map((post) => ({
        id: post.id,
        text: postText(post) || "(no text)",
      })),
      tags,
    },
    questions,
  });

  const nouls: Record<string, number> = {};
  for (const [key, answer] of Object.entries(response.answers)) {
    nouls[key] = answer && "noul" in answer ? answer.noul : 0;
  }
  return tagsFromPackedNouls({ posts, tags, nouls });
}

async function assignPackWithRetry(
  posts: LibraryAssignBookmark[],
  tags: string[]
): Promise<Map<string, string[]>> {
  try {
    return await assignPack(posts, tags);
  } catch (error) {
    if (!(error instanceof RateLimitError)) throw error;
    await new Promise((resolve) => setTimeout(resolve, 400));
    return assignPack(posts, tags);
  }
}

async function mapPacks(
  packs: LibraryAssignBookmark[][],
  tags: string[]
): Promise<Map<string, string[]>> {
  const assigned = new Map<string, string[]>();
  let next = 0;

  async function worker() {
    while (next < packs.length) {
      const index = next;
      next += 1;
      const pack = packs[index];
      if (!pack || pack.length === 0) continue;
      try {
        const packAssigned = await assignPackWithRetry(pack, tags);
        for (const [id, names] of packAssigned) assigned.set(id, names);
      } catch (error) {
        logWarn(
          "OrbitLibrary",
          `Packed assignment failed for ${pack.length} posts; leaving them untagged.`,
          error instanceof Error ? error.message : error
        );
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(ORBIT_LIBRARY_PACK_CONCURRENCY, packs.length) },
      () => worker()
    )
  );
  return assigned;
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

export async function planLibraryAssignments(args: {
  bookmarks: LibraryAssignBookmark[];
  vocabulary: LibraryVocabularyTag[];
}): Promise<OrbitScanPlan> {
  const tagNames = args.vocabulary.map((tag) => tag.name);
  const suggestions: OrbitBookmarkSuggestion[] = [];
  const needsModel: LibraryAssignBookmark[] = [];

  for (const bookmark of args.bookmarks) {
    const free = freeLibraryTags(bookmark, args.vocabulary);
    if (free.skipModel) {
      if (free.tags.length > 0) {
        suggestions.push(
          suggestion(
            bookmark.id,
            free.tags,
            args.vocabulary,
            "Matched a topic already stored on the post."
          )
        );
      }
      continue;
    }
    needsModel.push(bookmark);
  }

  const packs: LibraryAssignBookmark[][] = [];
  for (let index = 0; index < needsModel.length; index += ORBIT_LIBRARY_PACK_SIZE) {
    packs.push(needsModel.slice(index, index + ORBIT_LIBRARY_PACK_SIZE));
  }
  const assigned =
    tagNames.length > 0 && packs.length > 0
      ? await mapPacks(packs, tagNames)
      : new Map<string, string[]>();

  for (const bookmark of needsModel) {
    const free = freeLibraryTags(bookmark, args.vocabulary);
    const names = dedupeTags([
      ...free.tags,
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
    overview: {
      summary: `Tagged ${suggestions.length} of ${args.bookmarks.length} posts from the library tag list.`,
      taggingStrategy: "Assigned posts to the library tag list. Posts that fit nothing stayed untagged.",
      collectionStrategy: "Collections were left unchanged.",
    },
    suggestions,
  };
}
