import "server-only";

import { PRESET_COLORS } from "@/lib/constants";
import {
  ORBIT_LIBRARY_EXISTING_TAG_CAP,
  ORBIT_LIBRARY_GROWTH_MAX_TAGS,
  ORBIT_LIBRARY_GROWTH_MIN_POSTS,
  ORBIT_LIBRARY_SAMPLE_POOL,
  ORBIT_LIBRARY_SAMPLE_SIZE,
  ORBIT_LIBRARY_VOCAB_MAX,
} from "@/lib/orbit-config";
import { OrbitScanError, getOrbitXaiRuntimeStatus } from "@/lib/orbit-grok-schemas";
import { normalizeColor, normalizeTagKey } from "@/lib/orbit-grok-normalize";
import { VIDEO_TAG_NAME } from "@/lib/orbit-video-tag";
import { extractXaiResponsesOutputText } from "@/lib/orbit-grok-parse";
import {
  libraryDomains,
  librarySampleHasVideo,
  libraryTopics,
  parseLibraryVocabularyTags,
  selectStratifiedLibrarySample,
  type LibrarySampleBookmark,
} from "@/lib/orbit-library-sample";
import type { LibraryVocabularyTag } from "@/lib/orbit-library-assign";
import { prisma } from "@/lib/prisma";

const VOCAB_SCHEMA = {
  type: "object",
  properties: {
    tags: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["tags"],
  additionalProperties: false,
} as const;

function untaggedSampleWhere(userId: string) {
  return {
    userId,
    tags: { none: {} },
    collectionItems: {
      none: { collection: { type: "user_collection" as const } },
    },
  };
}

function formatSamplePost(bookmark: LibrarySampleBookmark) {
  const text = bookmark.tweetText.replace(/\s+/g, " ").trim().slice(0, 320);
  const topics = libraryTopics(bookmark.xMetadata);
  const domains = libraryDomains(bookmark.urls);
  const lines = [`@${bookmark.authorUsername}: ${text || "(no text)"}`];
  if (topics.length > 0) lines.push(`topics: ${topics.slice(0, 4).join(", ")}`);
  if (domains.length > 0) lines.push(`links: ${domains.slice(0, 3).join(", ")}`);
  if (librarySampleHasVideo([bookmark])) lines.push("media: video");
  return lines.join("\n");
}

function vocabularyPrompt(sample: LibrarySampleBookmark[]) {
  return [
    "Name reusable tags for this untagged X bookmark library.",
    "The list should describe the library, not one tag per post.",
    `Return at most ${ORBIT_LIBRARY_VOCAB_MAX} tags. Each tag is 1-3 words in Title Case.`,
    "No generic labels: Post, Tweet, Link, Article, Bookmark, Misc, Other, Saved.",
    "Include Video when posts are videos.",
    "",
    "Posts:",
    sample.map(formatSamplePost).join("\n\n"),
  ].join("\n");
}

function growthPrompt(
  sample: LibrarySampleBookmark[],
  existing: Array<{ name: string }>
) {
  return [
    "These X bookmarks did not fit any tag on the library's tag list.",
    `Name at most ${ORBIT_LIBRARY_GROWTH_MAX_TAGS} NEW reusable tags, each covering several of these posts. Each tag is 1-3 words in Title Case.`,
    "Do not repeat, reword, or pluralize a tag already on the list.",
    "No generic labels: Post, Tweet, Link, Article, Bookmark, Misc, Other, Saved.",
    "Return an empty list when the posts share no reusable topic.",
    "",
    `Existing tags: ${existing.map((tag) => tag.name).join(", ")}`,
    "",
    "Posts:",
    sample.map(formatSamplePost).join("\n\n"),
  ].join("\n");
}

async function requestLibraryVocabulary(
  sample: LibrarySampleBookmark[],
  options: { prompt?: string; cacheKey?: string; allowEmpty?: boolean } = {}
): Promise<string[]> {
  const apiKey = process.env.XAI_API_KEY?.trim();
  if (!apiKey) {
    throw new OrbitScanError(
      "Set XAI_API_KEY before tagging an untagged library.",
      503,
      "xai_auth"
    );
  }

  const runtime = getOrbitXaiRuntimeStatus();
  let response: Response;
  try {
    response = await fetch(`${runtime.baseUrl}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: runtime.model,
        input: [
          {
            role: "system",
            content:
              "You name a short reusable tag list for a bookmark library. Reply with the JSON schema only.",
          },
          { role: "user", content: options.prompt ?? vocabularyPrompt(sample) },
        ],
        store: false,
        prompt_cache_key: options.cacheKey ?? "markmaster-orbit-library-vocab",
        reasoning: { effort: "low" },
        text: {
          format: {
            type: "json_schema",
            name: "library_vocabulary",
            schema: VOCAB_SCHEMA,
            strict: true,
          },
        },
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new OrbitScanError(
      "xAI could not be reached. Try tagging the library again in a moment.",
      503,
      "xai_unavailable"
    );
  }

  if (!response.ok) {
    throw new OrbitScanError(
      "xAI could not name tags for this library.",
      response.status === 429 ? 429 : 502,
      response.status === 429 ? "xai_rate_limited" : "xai_unavailable"
    );
  }

  const payload = await response.json().catch(() => null);
  const rawText = extractXaiResponsesOutputText(payload);
  if (!rawText) {
    throw new OrbitScanError(
      "xAI returned an empty tag list.",
      502,
      "xai_response"
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new OrbitScanError(
      "xAI returned an unreadable tag list.",
      502,
      "xai_response"
    );
  }

  const names = parseLibraryVocabularyTags(parsed, {
    includeVideo: !options.allowEmpty && librarySampleHasVideo(sample),
  });
  if (names.length === 0 && options.allowEmpty) return [];
  if (names.length === 0) {
    throw new OrbitScanError(
      "No usable tags came back for this library.",
      502,
      "xai_response"
    );
  }
  return names;
}

function includesVideoTag(tags: Array<{ name: string }>) {
  const videoKey = normalizeTagKey(VIDEO_TAG_NAME);
  return tags.some((tag) => normalizeTagKey(tag.name) === videoKey);
}

/**
 * Video is a format tag, so it stays on the list when the untagged posts
 * include video. Like every name on the list, it becomes a Tag row only when
 * a post is actually tagged with it.
 */
async function withVideoTag(
  userId: string,
  tags: LibraryVocabularyTag[]
): Promise<LibraryVocabularyTag[]> {
  if (includesVideoTag(tags)) return tags;
  const probe = await prisma.bookmark.findMany({
    where: untaggedSampleWhere(userId),
    select: { media: true },
    take: 80,
  });
  if (!librarySampleHasVideo(probe)) return tags;

  const color = normalizeColor(VIDEO_TAG_NAME, undefined, PRESET_COLORS);
  const kept =
    tags.length > ORBIT_LIBRARY_VOCAB_MAX
      ? tags
      : tags.slice(0, ORBIT_LIBRARY_VOCAB_MAX - 1);
  return [...kept, { name: VIDEO_TAG_NAME, color }];
}

function untaggedSamplePool(userId: string) {
  return prisma.bookmark.findMany({
    where: untaggedSampleWhere(userId),
    select: {
      id: true,
      authorUsername: true,
      tweetText: true,
      urls: true,
      media: true,
      xMetadata: true,
    },
    orderBy: [{ bookmarkedAt: "desc" }, { id: "desc" }],
    take: ORBIT_LIBRARY_SAMPLE_POOL,
  });
}

/**
 * Existing tags, or one new list learned from a sample of the untagged
 * library. A learned list is kept on the run, not written as Tag rows:
 * applying a page creates each tag the first time a post receives it, so
 * names no post fits never become empty tags.
 */
export async function ensureLibraryVocabulary(
  userId: string
): Promise<LibraryVocabularyTag[]> {
  const existing = await prisma.tag.findMany({
    where: { userId },
    select: { name: true, color: true },
    orderBy: { bookmarks: { _count: "desc" } },
    take: ORBIT_LIBRARY_EXISTING_TAG_CAP,
  });
  if (existing.length > 0) return withVideoTag(userId, existing);

  const pool = await untaggedSamplePool(userId);
  if (pool.length === 0) return [];

  const sample = selectStratifiedLibrarySample(pool, ORBIT_LIBRARY_SAMPLE_SIZE);
  const names = await requestLibraryVocabulary(sample);
  return names.map((name) => ({
    name,
    color: normalizeColor(name, undefined, PRESET_COLORS),
  }));
}

/**
 * New tags for the posts a library pass left untagged, named by Grok from a
 * sample of them. Empty when too few posts are left or they share no topic.
 */
export async function requestLibraryGrowthTags(
  userId: string,
  existing: LibraryVocabularyTag[]
): Promise<LibraryVocabularyTag[]> {
  const pool = await untaggedSamplePool(userId);
  if (pool.length < ORBIT_LIBRARY_GROWTH_MIN_POSTS) return [];

  const sample = selectStratifiedLibrarySample(pool, ORBIT_LIBRARY_SAMPLE_SIZE);
  const names = await requestLibraryVocabulary(sample, {
    prompt: growthPrompt(sample, existing),
    cacheKey: "markmaster-orbit-library-growth",
    allowEmpty: true,
  });
  const taken = new Set(existing.map((tag) => normalizeTagKey(tag.name)));
  return names
    .filter((name) => !taken.has(normalizeTagKey(name)))
    .slice(0, ORBIT_LIBRARY_GROWTH_MAX_TAGS)
    .map((name) => ({
      name,
      color: normalizeColor(name, undefined, PRESET_COLORS),
    }));
}
