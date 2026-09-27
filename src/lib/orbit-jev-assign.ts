import "server-only";

import {
  AuthenticationError,
  PermissionDeniedError,
  RateLimitError,
  choice,
  noul,
  score,
  type EntryType,
} from "@typesafe-ai/sdk";

import {
  ORBIT_JEV_ASSIGN_CONCURRENCY,
  ORBIT_JEV_COLLECTION_CONFIDENCE_THRESHOLD,
  ORBIT_JEV_MAX_COLLECTION_SHORTLIST,
  ORBIT_JEV_MAX_TAG_SHORTLIST,
  ORBIT_MAX_TAGS_PER_BOOKMARK,
  ORBIT_JEV_NEEDS_NEW_LABEL_THRESHOLD,
  ORBIT_JEV_SHORTLIST_LEXICAL_RESERVE,
  ORBIT_JEV_SHORTLIST_PROPOSED_CAP,
  ORBIT_JEV_TAG_INCLUDE_THRESHOLD,
  ORBIT_JEV_TAG_STRONG_THRESHOLD,
} from "@/lib/orbit-config";
import { OrbitGrokError } from "@/lib/orbit-grok-schemas";
import {
  GENERIC_COLLECTION_NAMES,
  GENERIC_TAG_NAMES,
  buildBookmarkPayload,
  isUrlLikeLabel,
  normalizeKey,
  normalizeSuggestedCollectionName,
  normalizeSuggestedTagName,
} from "@/lib/orbit-grok-normalize";
import type {
  OrbitAuthorPriorHint,
  OrbitBookmarkForScan,
  OrbitCollectionContext,
  OrbitHybridLeftoverNote,
  OrbitScanPlanFromXai,
  OrbitTagContext,
} from "@/lib/orbit-grok-schemas";
import type { OrbitLearningHint, OrbitNeighborHint } from "@/lib/orbit-signal-extraction";
import { logWarn } from "@/lib/logger";
import { getTypeSafeClient, getTypeSafeModel } from "@/lib/typesafe";
import type { OrbitScanConfidence } from "@/types";

function toJsonState(value: unknown): EntryType {
  return JSON.parse(JSON.stringify(value)) as EntryType;
}

export type OrbitLabelPoolItem = {
  name: string;
  existing: boolean;
  description?: string | null;
  reason?: string;
};

export type OrbitLabelPool = {
  tags: OrbitLabelPoolItem[];
  collections: OrbitLabelPoolItem[];
};

export type OrbitBatchVocabulary = {
  tags: string[];
  collections: string[];
};

export type { OrbitHybridLeftoverNote };

function mapTypeSafeAssignError(error: unknown): OrbitGrokError {
  if (error instanceof OrbitGrokError) return error;
  if (
    error instanceof AuthenticationError ||
    error instanceof PermissionDeniedError
  ) {
    return new OrbitGrokError(
      "TypeSafe rejected the request. Confirm TYPESAFE_API_KEY.",
      502,
      "typesafe_auth"
    );
  }
  if (error instanceof RateLimitError) {
    return new OrbitGrokError(
      "TypeSafe rate limit reached. Try the scan again in a moment.",
      429,
      "typesafe_unavailable"
    );
  }
  return new OrbitGrokError(
    "TypeSafe could not assign labels for this Orbit batch.",
    502,
    "typesafe_unavailable"
  );
}

export type OrbitJevAssignment = {
  bookmarkId: string;
  confidence: OrbitScanConfidence;
  reasoning: string;
  tags: Array<{ name: string; color: string; reason: string }>;
  collection: {
    name: string;
    description: string;
    reason: string;
  } | null;
  needsNewLabel: boolean;
  abstain: boolean;
};

/**
 * Word-set overlap only. Substring matches ("AI" in "available", "Art" in
 * "start") must not promote a tag onto the shortlist.
 */
function lexicalOverlap(name: string, haystack: string) {
  const key = normalizeKey(name);
  if (!key) return 0;
  const words = new Set(
    haystack
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
  );
  const tokens = key.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 0;
  if (tokens.every((token) => words.has(token))) return 4;
  return tokens.filter((token) => token.length > 2 && words.has(token)).length;
}

function usableTagName(name: string) {
  const normalized = normalizeSuggestedTagName(name);
  if (!normalized) return false;
  const key = normalizeKey(normalized);
  return !GENERIC_TAG_NAMES.has(key) && !isUrlLikeLabel(normalized);
}

function usableCollectionName(name: string) {
  const normalized = normalizeSuggestedCollectionName(name);
  if (!normalized) return false;
  const key = normalizeKey(normalized);
  return !GENERIC_COLLECTION_NAMES.has(key) && !isUrlLikeLabel(normalized);
}

type ShortlistEntry = {
  item: OrbitLabelPoolItem;
  key: string;
  overlap: number;
};

function bucketShortlistEntries(args: {
  pool: OrbitLabelPoolItem[];
  usable: (name: string) => boolean;
  preferredKeys: Set<string>;
  haystack: string;
}) {
  const seen = new Set<string>();
  const matched: ShortlistEntry[] = [];
  const proposed: ShortlistEntry[] = [];
  const lexicalRest: ShortlistEntry[] = [];
  const otherRest: ShortlistEntry[] = [];

  for (const raw of args.pool) {
    const name = raw.name.trim();
    const key = normalizeKey(name);
    if (!name || !key || seen.has(key) || !args.usable(name)) continue;
    seen.add(key);
    const entry: ShortlistEntry = {
      item: { ...raw, name },
      key,
      overlap: lexicalOverlap(name, args.haystack),
    };
    if (args.preferredKeys.has(key)) matched.push(entry);
    else if (!raw.existing) proposed.push(entry);
    else if (entry.overlap > 0) lexicalRest.push(entry);
    else otherRest.push(entry);
  }

  // Names Grok just proposed are preferred and new. Rank them ahead of
  // existing tags so a full shortlist of old names cannot drop them.
  matched.sort((left, right) => Number(left.item.existing) - Number(right.item.existing));
  lexicalRest.sort((left, right) => right.overlap - left.overlap);
  return { matched, proposed, lexicalRest, otherRest };
}

/**
 * Text used to decide which tag names are worth asking about.
 * Author bio is omitted: it describes the person, not this post, and would
 * pull the same tags onto every bookmark from that account.
 */
function jevSignalHaystack(payload: ReturnType<typeof buildBookmarkPayload>) {
  const { signals } = payload;
  return [
    signals.primaryText,
    payload.tweetText,
    payload.note,
    signals.articleContext?.title,
    signals.articleContext?.previewText,
    ...signals.linkContext.flatMap((link) => [link.title, link.description, link.domain]),
    ...signals.visualContext.altTexts,
    ...signals.xTopics.flatMap((topic) => [topic.entity, topic.description]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/**
 * The judgment state for one bookmark. Same textual signals Grok receives:
 * article, link cards, image alt text, and author bio. Jev only reads text.
 */
function jevJudgmentState(payload: ReturnType<typeof buildBookmarkPayload>) {
  const { signals } = payload;
  return {
    bookmark: {
      id: payload.id,
      author: payload.author,
      text: payload.tweetText,
      note: payload.note,
      urls: payload.urls,
      quotedTweet: payload.quotedTweet,
      sourceFolders: payload.sourceFolders,
    },
    signals: {
      primaryText: signals.primaryText,
      article: signals.articleContext,
      links: signals.linkContext,
      imageAltTexts: signals.visualContext.altTexts,
      authorBio: signals.authorContext?.bio ?? null,
      thread: {
        isThread: signals.threadContext.isThread,
        isReply: signals.threadContext.isReply,
      },
      xTopics: signals.xTopics,
      contentTypeHints: signals.contentTypeHints,
      domainHints: signals.domainHints,
      vocabularyMatches: signals.existingVocabularyMatches,
      localLearning: signals.localLearning,
      neighborHints: signals.neighborHints,
      priorDecisions: payload.priorDecisions ?? null,
      dataQuality: signals.dataQuality,
    },
  };
}

export function shortlistOrbitTagsForJev(args: {
  pool: OrbitLabelPoolItem[];
  payload: ReturnType<typeof buildBookmarkPayload>;
  maxCount?: number;
  batchVocabulary?: OrbitBatchVocabulary;
}): OrbitLabelPoolItem[] {
  const maxCount = args.maxCount ?? ORBIT_JEV_MAX_TAG_SHORTLIST;
  const preferred = [
    ...args.payload.signals.existingVocabularyMatches.tags,
    ...(args.payload.signals.localLearning?.matchingTags ?? []),
    ...(args.payload.signals.neighborHints?.tags ?? []),
    ...(args.payload.priorDecisions?.frequentTags ?? []),
    ...(args.batchVocabulary?.tags ?? []),
  ];
  const haystack = jevSignalHaystack(args.payload);

  const { matched, proposed, lexicalRest, otherRest } = bucketShortlistEntries({
    pool: args.pool,
    usable: usableTagName,
    preferredKeys: new Set(preferred.map((name) => normalizeKey(name))),
    haystack,
  });

  // Preferred matches rank first but still respect the shortlist budget: a
  // batch vocabulary larger than maxCount must not explode the question count.
  const kept = matched.slice(0, maxCount);
  const remainingAfterMatched = maxCount - kept.length;
  const lexicalKept = lexicalRest.slice(
    0,
    Math.min(ORBIT_JEV_SHORTLIST_LEXICAL_RESERVE, Math.max(0, remainingAfterMatched))
  );
  const proposedKept = proposed.slice(
    0,
    Math.min(
      ORBIT_JEV_SHORTLIST_PROPOSED_CAP,
      Math.max(0, remainingAfterMatched - lexicalKept.length)
    )
  );
  const restKept = otherRest.slice(
    0,
    Math.max(0, remainingAfterMatched - lexicalKept.length - proposedKept.length)
  );

  return [...kept, ...lexicalKept, ...proposedKept, ...restKept].map(
    (entry) => entry.item
  );
}

export function shortlistOrbitCollectionsForJev(args: {
  pool: OrbitLabelPoolItem[];
  payload: ReturnType<typeof buildBookmarkPayload>;
  maxCount?: number;
  batchVocabulary?: OrbitBatchVocabulary;
}): OrbitLabelPoolItem[] {
  const maxCount = args.maxCount ?? ORBIT_JEV_MAX_COLLECTION_SHORTLIST;
  const preferred = [
    ...args.payload.signals.existingVocabularyMatches.collections,
    ...(args.payload.signals.localLearning?.matchingCollections ?? []),
    ...(args.payload.signals.neighborHints?.collections ?? []),
    ...(args.payload.priorDecisions?.frequentCollections ?? []),
    ...(args.batchVocabulary?.collections ?? []),
  ];

  const { matched, proposed, lexicalRest, otherRest } = bucketShortlistEntries({
    pool: args.pool,
    usable: usableCollectionName,
    preferredKeys: new Set(preferred.map((name) => normalizeKey(name))),
    haystack: jevSignalHaystack(args.payload),
  });

  // Same recall protection as tags: proposed collections are capped so Grok
  // suggestions cannot crowd every existing collection off the choice list.
  const kept = matched.slice(0, maxCount);
  const proposedKept = proposed.slice(
    0,
    Math.min(ORBIT_JEV_SHORTLIST_PROPOSED_CAP, Math.max(0, maxCount - kept.length))
  );
  const restKept = [...lexicalRest, ...otherRest].slice(
    0,
    Math.max(0, maxCount - kept.length - proposedKept.length)
  );
  return [...kept, ...proposedKept, ...restKept].map((entry) => entry.item);
}

export function harvestOrbitAcceptedLabels(
  assignments: OrbitJevAssignment[]
): OrbitLabelPool {
  const tags: OrbitLabelPoolItem[] = [];
  const collections: OrbitLabelPoolItem[] = [];
  const seenTags = new Set<string>();
  const seenCollections = new Set<string>();

  for (const assignment of assignments) {
    if (assignment.abstain) continue;
    for (const tag of assignment.tags) {
      const key = normalizeKey(tag.name);
      if (!key || seenTags.has(key) || !usableTagName(tag.name)) continue;
      seenTags.add(key);
      tags.push({ name: tag.name, existing: true });
    }
    if (!assignment.collection) continue;
    const key = normalizeKey(assignment.collection.name);
    if (!key || seenCollections.has(key) || !usableCollectionName(assignment.collection.name)) {
      continue;
    }
    seenCollections.add(key);
    collections.push({
      name: assignment.collection.name,
      existing: true,
      description: assignment.collection.description,
    });
  }

  return { tags, collections };
}

export function leftoverNotesFromAssignments(
  assignments: OrbitJevAssignment[]
): OrbitHybridLeftoverNote[] {
  return assignments.map((assignment) => ({
    bookmarkId: assignment.bookmarkId,
    matchedTags: assignment.tags.map((tag) => tag.name),
    matchedCollection: assignment.collection?.name ?? null,
    reason: assignment.reasoning,
  }));
}

export function batchVocabularyFromPool(pool: OrbitLabelPool): OrbitBatchVocabulary {
  return {
    tags: pool.tags.map((tag) => tag.name),
    collections: pool.collections.map((collection) => collection.name),
  };
}

export function replaceOrbitJevAssignments(
  current: OrbitJevAssignment[],
  next: OrbitJevAssignment[]
) {
  const byId = new Map(next.map((assignment) => [assignment.bookmarkId, assignment]));
  return current.map((assignment) => byId.get(assignment.bookmarkId) ?? assignment);
}

export function mapJevScoreToConfidence(
  scoreValue: number,
  strongestTagNoul: number,
  collectionConfidence: number | null
): OrbitScanConfidence {
  const evidence = Math.max(
    scoreValue / 2,
    strongestTagNoul,
    collectionConfidence ?? 0
  );
  if (evidence >= ORBIT_JEV_TAG_STRONG_THRESHOLD) return "high";
  if (evidence >= ORBIT_JEV_TAG_INCLUDE_THRESHOLD) return "medium";
  return "low";
}

function buildTagColorLookup(existingTags: OrbitTagContext[]) {
  const colors = new Map<string, string>();
  for (const tag of existingTags) {
    const key = normalizeKey(tag.name);
    if (key && !colors.has(key)) colors.set(key, tag.color);
  }
  return (name: string) => colors.get(normalizeKey(name)) ?? "#64748b";
}

export function buildJevAssignmentFromAnswers(args: {
  bookmarkId: string;
  tagShortlist: OrbitLabelPoolItem[];
  collectionShortlist: OrbitLabelPoolItem[];
  tagNouls: Record<string, number>;
  collectionChoice: string;
  collectionConfidence: number;
  needsNewLabel: number;
  matchScore: number;
  existingTags: OrbitTagContext[];
}): OrbitJevAssignment {
  const includedTags: Array<{ tag: OrbitLabelPoolItem; noul: number }> = [];
  for (const [index, tag] of args.tagShortlist.entries()) {
    const noulValue = args.tagNouls[`tag_${index}`] ?? 0;
    if (noulValue >= ORBIT_JEV_TAG_INCLUDE_THRESHOLD) {
      includedTags.push({ tag, noul: noulValue });
    }
  }

  const collectionIndex =
    args.collectionChoice.startsWith("coll_") &&
    args.collectionChoice !== "none"
      ? Number(args.collectionChoice.slice("coll_".length))
      : Number.NaN;
  const pickedCollection =
    Number.isInteger(collectionIndex) &&
    args.collectionChoice !== "none" &&
    args.collectionConfidence >= ORBIT_JEV_COLLECTION_CONFIDENCE_THRESHOLD
      ? args.collectionShortlist[collectionIndex] ?? null
      : null;

  const strongestTagNoul = Math.max(0, ...Object.values(args.tagNouls));
  // Only flag a new-label gap when nothing was placed. Otherwise a high
  // needs_new_label noul would re-queue an already-matched bookmark through
  // refine and Grok escalation.
  const needsNewLabel =
    includedTags.length === 0 &&
    !pickedCollection &&
    args.needsNewLabel >= ORBIT_JEV_NEEDS_NEW_LABEL_THRESHOLD;
  const abstain =
    includedTags.length === 0 &&
    !pickedCollection &&
    (needsNewLabel || strongestTagNoul < ORBIT_JEV_TAG_INCLUDE_THRESHOLD);

  const confidence = abstain
    ? "low"
    : mapJevScoreToConfidence(
        args.matchScore,
        strongestTagNoul,
        pickedCollection ? args.collectionConfidence : null
      );

  const colorFor = buildTagColorLookup(args.existingTags);
  const tagReasons = includedTags.map(({ tag, noul }) => ({
    name: tag.name,
    color: colorFor(tag.name),
    reason:
      tag.reason ??
      (tag.existing
        ? `Matched your existing tag (score ${noul.toFixed(2)})`
        : `Accepted proposed tag (score ${noul.toFixed(2)})`),
  }));

  return {
    bookmarkId: args.bookmarkId,
    confidence,
    reasoning: needsNewLabel
      ? "None of your existing tags fit this bookmark — it needs a new name."
      : abstain
        ? "No existing tag matched confidently enough to apply."
        : `Matched ${tagReasons.length} existing tag${
            tagReasons.length === 1 ? "" : "s"
          } from your library.`,
    tags: tagReasons.slice(0, ORBIT_MAX_TAGS_PER_BOOKMARK),
    collection: pickedCollection
      ? {
          name: pickedCollection.name,
          description:
            pickedCollection.description?.trim() ||
            `Suggested home for ${pickedCollection.name}.`,
          reason:
            pickedCollection.reason ??
            "Chosen from your existing collections.",
        }
      : null,
    needsNewLabel,
    abstain,
  };
}

async function mapInPool<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(items[index]!);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
  return results;
}

function buildQuestions(
  tagShortlist: OrbitLabelPoolItem[],
  collectionShortlist: OrbitLabelPoolItem[]
) {
  const questions: Record<string, ReturnType<typeof noul> | ReturnType<typeof choice> | ReturnType<typeof score>> =
    {
      needs_new_label: noul(
        "The candidate tags and collections miss this bookmark's actual topic, so a new label would be needed.",
        {
          true: "The closed pool cannot name the topic.",
          false: "An existing or proposed label covers the topic.",
        }
      ),
      match_quality: score(
        "How cleanly does this bookmark match the candidate labels?",
        [
          "No useful topic; tags and collection should stay empty.",
          "Partial or generic fit; a person should review before applying.",
          "Clear topical fit with the selected labels.",
        ]
      ),
    };

  for (const [index, tag] of tagShortlist.entries()) {
    questions[`tag_${index}`] = noul(
      `Does this bookmark belong under the tag "${tag.name}"?`,
      {
        true: tag.existing
          ? `The post is about the existing tag ${tag.name}.`
          : `The post is about the proposed tag ${tag.name}.`,
        false: `The tag ${tag.name} does not describe this post.`,
      }
    );
  }

  const collectionCriteria: Record<string, string> = {
    none: "Does not belong in any listed collection.",
  };
  for (const [index, collection] of collectionShortlist.entries()) {
    collectionCriteria[`coll_${index}`] = collection.description?.trim()
      || (collection.existing
        ? `Existing collection ${collection.name}.`
        : `Proposed collection ${collection.name}.`);
  }
  questions.collection = choice(
    "Which collection is the best single home for this bookmark?",
    collectionCriteria
  );

  return questions;
}

export async function assignOneOrbitBookmarkWithJev(args: {
  bookmark: OrbitBookmarkForScan;
  existingTags: OrbitTagContext[];
  existingCollections: OrbitCollectionContext[];
  pool: OrbitLabelPool;
  authorPriorHint?: OrbitAuthorPriorHint;
  learningHint?: OrbitLearningHint;
  neighborHint?: OrbitNeighborHint;
  batchVocabulary?: OrbitBatchVocabulary;
  /** Overrides the tag shortlist size. The leftover pass raises it so new names fit. */
  maxTagShortlist?: number;
  /** Overrides the collection shortlist size for the leftover pass. */
  maxCollectionShortlist?: number;
}): Promise<OrbitJevAssignment> {
  const payload = buildBookmarkPayload({
    bookmark: args.bookmark,
    existingTags: args.existingTags,
    existingCollections: args.existingCollections,
    authorPriorHint: args.authorPriorHint,
    learningHint: args.learningHint,
    neighborHint: args.neighborHint,
  });
  const tagShortlist = shortlistOrbitTagsForJev({
    pool: args.pool.tags,
    payload,
    batchVocabulary: args.batchVocabulary,
    maxCount: args.maxTagShortlist,
  });
  const collectionShortlist = shortlistOrbitCollectionsForJev({
    pool: args.pool.collections,
    payload,
    batchVocabulary: args.batchVocabulary,
    maxCount: args.maxCollectionShortlist,
  });

  const client = getTypeSafeClient();
  const questions = buildQuestions(tagShortlist, collectionShortlist);
  let response: Awaited<ReturnType<typeof client.systemOne>>;
  try {
    response = await client.systemOne({
      model: getTypeSafeModel(),
      state: toJsonState({
        ...jevJudgmentState(payload),
        candidateTags: tagShortlist.map((tag) => ({
          name: tag.name,
          existing: tag.existing,
        })),
        candidateCollections: collectionShortlist.map((collection) => ({
          name: collection.name,
          existing: collection.existing,
        })),
        batchAcceptedLabels: args.batchVocabulary ?? null,
      }),
      questions,
    });
  } catch (error) {
    throw mapTypeSafeAssignError(error);
  }

  const tagNouls: Record<string, number> = {};
  for (const [index] of tagShortlist.entries()) {
    const answer = response.answers[`tag_${index}`];
    tagNouls[`tag_${index}`] =
      answer && "noul" in answer ? answer.noul : 0;
  }

  const collectionAnswer = response.answers.collection;
  const needsNew = response.answers.needs_new_label;
  const matchQuality = response.answers.match_quality;

  return buildJevAssignmentFromAnswers({
    bookmarkId: args.bookmark.id,
    tagShortlist,
    collectionShortlist,
    tagNouls,
    collectionChoice:
      collectionAnswer && "choice" in collectionAnswer
        ? String(collectionAnswer.choice)
        : "none",
    collectionConfidence:
      collectionAnswer && "confidence" in collectionAnswer
        ? collectionAnswer.confidence
        : 0,
    needsNewLabel: needsNew && "noul" in needsNew ? needsNew.noul : 0,
    matchScore: matchQuality && "score" in matchQuality ? matchQuality.score : 0,
    existingTags: args.existingTags,
  });
}

/** Retries per item when TypeSafe reports a rate limit (jittered backoff). */
const JEV_ASSIGN_RATE_LIMIT_RETRIES = 2;
const JEV_ASSIGN_RETRY_BASE_DELAY_MS = 300;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function isRateLimitedAssignError(error: unknown): boolean {
  return error instanceof OrbitGrokError && error.status === 429;
}

/**
 * A per-item failure becomes an abstain/leftover so the hybrid refine and
 * Grok-escalation paths pick the bookmark up instead of the whole batch
 * rejecting and discarding every completed assignment (Speed-M2).
 */
function abstainAssignmentForFailure(bookmarkId: string): OrbitJevAssignment {
  return {
    bookmarkId,
    confidence: "low",
    reasoning:
      "This bookmark could not be checked on this pass — it stays in Orbit.",
    tags: [],
    collection: null,
    needsNewLabel: false,
    abstain: true,
  };
}

export async function assignOrbitBookmarksWithJev(args: {
  bookmarks: OrbitBookmarkForScan[];
  existingTags: OrbitTagContext[];
  existingCollections: OrbitCollectionContext[];
  pool: OrbitLabelPool;
  authorPriorHints?: OrbitAuthorPriorHint[];
  learningHints?: OrbitLearningHint[];
  neighborHints?: Array<{ bookmarkId: string; hint: OrbitNeighborHint }>;
  batchVocabulary?: OrbitBatchVocabulary;
  /** Overrides the tag shortlist size. The leftover pass raises it so new names fit. */
  maxTagShortlist?: number;
  /** Overrides the collection shortlist size for the leftover pass. */
  maxCollectionShortlist?: number;
  /** Called as each bookmark's answer lands (including abstains), for live progress. */
  onAssigned?: (assignment: OrbitJevAssignment) => void;
  /** Test hook — base backoff for rate-limit retries. */
  retryBaseDelayMs?: number;
}): Promise<OrbitJevAssignment[]> {
  const authorHintByUsername = new Map(
    (args.authorPriorHints ?? []).map((hint) => [
      normalizeKey(hint.authorUsername),
      hint,
    ])
  );
  const learningById = new Map(
    (args.learningHints ?? []).map((hint) => [hint.bookmarkId, hint])
  );
  const neighborById = new Map(
    (args.neighborHints ?? []).map((entry) => [entry.bookmarkId, entry.hint])
  );
  const retryBaseDelayMs =
    args.retryBaseDelayMs ?? JEV_ASSIGN_RETRY_BASE_DELAY_MS;

  const assignWithRetry = async (
    bookmark: OrbitBookmarkForScan
  ): Promise<OrbitJevAssignment> => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await assignOneOrbitBookmarkWithJev({
          bookmark,
          existingTags: args.existingTags,
          existingCollections: args.existingCollections,
          pool: args.pool,
          authorPriorHint: authorHintByUsername.get(
            normalizeKey(bookmark.authorUsername)
          ),
          learningHint: learningById.get(bookmark.id),
          neighborHint: neighborById.get(bookmark.id),
          batchVocabulary: args.batchVocabulary,
          maxTagShortlist: args.maxTagShortlist,
          maxCollectionShortlist: args.maxCollectionShortlist,
        });
      } catch (error) {
        const rateLimited = isRateLimitedAssignError(error);
        if (rateLimited && attempt < JEV_ASSIGN_RATE_LIMIT_RETRIES) {
          const backoff = retryBaseDelayMs * 2 ** attempt;
          await sleep(backoff + Math.random() * backoff);
          continue;
        }
        logWarn(
          "OrbitJevAssign",
          rateLimited
            ? `Bookmark ${bookmark.id} still rate limited after ${
                attempt + 1
              } attempts; abstaining.`
            : `Assignment failed for bookmark ${bookmark.id}; abstaining.`,
          error
        );
        return abstainAssignmentForFailure(bookmark.id);
      }
    }
  };

  return mapInPool(args.bookmarks, ORBIT_JEV_ASSIGN_CONCURRENCY, async (bookmark) => {
    const assignment = await assignWithRetry(bookmark);
    args.onAssigned?.(assignment);
    return assignment;
  });
}

export function jevAssignmentsToRawPlan(
  assignments: OrbitJevAssignment[]
): OrbitScanPlanFromXai {
  const assigned = assignments.filter(
    (assignment) => assignment.tags.length > 0 || assignment.collection
  ).length;
  const total = assignments.length;
  // Outcome language — engine names and scoring jargon stay out of user copy
  // (Consistency-H1); the overview strip shows the model id for power users.
  const summary =
    assigned === total && total > 0
      ? `Matched all ${total} bookmark${
          total === 1 ? "" : "s"
        } to your existing tags and collections.`
      : `Matched ${assigned} of ${total} bookmarks to your existing tags and collections.`;
  return {
    overview: {
      summary,
      taggingStrategy:
        "Reused tags from your library — only confident matches were applied.",
      collectionStrategy:
        "Each bookmark went to at most one existing collection, or none when nothing fit.",
    },
    suggestions: assignments.map((assignment) => ({
      bookmarkId: assignment.bookmarkId,
      confidence: assignment.confidence,
      reasoning: assignment.reasoning,
      tags: assignment.tags,
      collection: assignment.collection,
    })),
  };
}
