import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

import { getContentTypeHints } from "@/lib/auto-tag";
import { getOrbitBookmarkPrimaryText } from "@/lib/orbit-primary-text";
import { prisma } from "./prisma";
import type {
  OrbitBookmarkSuggestion,
  OrbitDecisionEventPayload,
} from "@/types";
import type { OrbitLearningHint } from "@/lib/orbit-signal-extraction";

const MAX_EVENTS_PER_WRITE = 100;
const MAX_RECENT_LEARNING_EVENTS = 600;
/** Bound the learning scan to recent activity — most of the 600 cap
 * is noise from months-old activity the user no longer cares about. */
const LEARNING_LOOKBACK_DAYS = 60;
const POSITIVE_ACTIONS = new Set(["accepted", "edited"]);
const NEGATIVE_ACTIONS = new Set(["kept", "rejected"]);

type BookmarkForLearning = {
  id: string;
  authorUsername: string;
  tweetText?: string;
  media?: unknown;
  urls: unknown;
  xMetadata?: unknown;
  xFolderHints?: Array<{ name: string }>;
};

type LabelCounts = {
  tags: Map<string, number>;
  collections: Map<string, number>;
  avoidTags: Map<string, number>;
  avoidCollections: Map<string, number>;
  reasons: Set<string>;
};

export class OrbitDecisionEventOwnershipError extends Error {
  constructor() {
    super("One or more Orbit decision event bookmarks do not belong to the user.");
    this.name = "OrbitDecisionEventOwnershipError";
  }
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeKey(value: string) {
  return normalizeWhitespace(value).toLowerCase();
}

function truncate(value: string | null | undefined, maxLength: number) {
  if (!value) return null;
  const normalized = normalizeWhitespace(value);
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

function toPrismaJson(value: unknown) {
  if (value === null || value === undefined) return Prisma.JsonNull;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function suggestionFromJson(value: unknown): Partial<OrbitBookmarkSuggestion> | null {
  return isObject(value) ? (value as Partial<OrbitBookmarkSuggestion>) : null;
}

function extractLabels(value: unknown) {
  const suggestion = suggestionFromJson(value);
  if (!suggestion) return { tags: [], collections: [] };

  const tags = Array.isArray(suggestion.tags)
    ? suggestion.tags.flatMap((tag) =>
        isObject(tag) && getString(tag.name) ? [normalizeWhitespace(tag.name)] : []
      )
    : [];
  const collection = isObject(suggestion.collection)
    ? getString(suggestion.collection.name)
    : null;

  return {
    tags,
    collections: collection ? [normalizeWhitespace(collection)] : [],
  };
}

function addCounts(target: Map<string, number>, labels: string[]) {
  for (const label of labels) {
    const key = normalizeKey(label);
    if (!key) continue;
    target.set(label, (target.get(label) ?? 0) + 1);
  }
}

function parseDomain(value: string) {
  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function domainKeysFromUrls(input: unknown) {
  if (!Array.isArray(input)) return [];

  const seen = new Set<string>();
  for (const item of input) {
    if (!isObject(item)) continue;
    const raw =
      getString(item.expanded_url) ??
      getString(item.url) ??
      getString(item.display_url);
    const domain = raw ? parseDomain(raw) : null;
    if (domain) seen.add(domain);
  }

  return Array.from(seen);
}

function xTopicEntitiesFromMetadata(xMetadata: unknown) {
  if (!isObject(xMetadata)) return [];
  const tweet = xMetadata.tweet;
  if (!isObject(tweet)) return [];
  const annotations = tweet.context_annotations;
  if (!Array.isArray(annotations)) return [];

  const seen = new Set<string>();
  return annotations.flatMap((annotation) => {
    if (!isObject(annotation)) return [];
    const entity = isObject(annotation.entity) ? annotation.entity : null;
    const entityName = getString(entity?.name);
    if (!entityName) return [];
    const key = normalizeKey(entityName);
    if (!key || seen.has(key)) return [];
    seen.add(key);
    return [entityName];
  });
}

function contentTypeKeysFromBookmark(bookmark: BookmarkForLearning) {
  const hints = getContentTypeHints(
    getOrbitBookmarkPrimaryText({
      tweetText: bookmark.tweetText ?? "",
      xMetadata: bookmark.xMetadata,
    }),
    Array.isArray(bookmark.media) ? bookmark.media : null,
    Array.isArray(bookmark.urls) ? bookmark.urls : null
  );

  return hints.map((hint) => ({
    key: `contentType:${normalizeKey(hint)}`,
    reason: `same content type: ${hint}`,
  }));
}

function keysForBookmark(bookmark: BookmarkForLearning) {
  const keys: Array<{ key: string; reason: string }> = [];
  const author = normalizeKey(bookmark.authorUsername);
  if (author) {
    keys.push({ key: `author:${author}`, reason: "same author" });
  }

  for (const folder of bookmark.xFolderHints ?? []) {
    const name = truncate(folder.name, 80);
    if (name) {
      keys.push({
        key: `folder:${normalizeKey(name)}`,
        reason: `same X folder: ${name}`,
      });
    }
  }

  for (const domain of domainKeysFromUrls(bookmark.urls)) {
    keys.push({ key: `domain:${domain}`, reason: `same link domain: ${domain}` });
  }

  for (const entity of xTopicEntitiesFromMetadata(bookmark.xMetadata)) {
    keys.push({
      key: `xTopic:${normalizeKey(entity)}`,
      reason: `same X topic: ${entity}`,
    });
  }

  keys.push(...contentTypeKeysFromBookmark(bookmark));

  return keys;
}

function sortLabels(counts: Map<string, number>, limit: number) {
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([label]) => label);
}

function getCounts(bucket: Map<string, LabelCounts>, key: string) {
  const current = bucket.get(key);
  if (current) return current;
  const created: LabelCounts = {
    tags: new Map(),
    collections: new Map(),
    avoidTags: new Map(),
    avoidCollections: new Map(),
    reasons: new Set(),
  };
  bucket.set(key, created);
  return created;
}

export async function recordOrbitDecisionEvents(args: {
  userId: string;
  events: OrbitDecisionEventPayload[];
}) {
  const events = args.events.slice(0, MAX_EVENTS_PER_WRITE).flatMap((event) => {
    const bookmarkId = truncate(event.bookmarkId, 128);
    const action = truncate(event.action, 40);
    if (!bookmarkId || !action) return [];

    return [
      {
        id: randomUUID(),
        userId: args.userId,
        bookmarkId,
        action,
        source: truncate(event.source ?? null, 80),
        mode: truncate(event.mode ?? null, 40),
        originalSuggestion: toPrismaJson(event.originalSuggestion ?? null),
        reviewedSuggestion: toPrismaJson(event.reviewedSuggestion ?? null),
      },
    ];
  });

  if (events.length === 0) return { count: 0 };

  const bookmarkIds = Array.from(new Set(events.map((event) => event.bookmarkId)));
  const ownedBookmarks = await prisma.bookmark.findMany({
    where: {
      userId: args.userId,
      id: { in: bookmarkIds },
    },
    select: { id: true },
  });

  if (ownedBookmarks.length !== bookmarkIds.length) {
    throw new OrbitDecisionEventOwnershipError();
  }

  const result = await prisma.orbitDecisionEvent.createMany({
    data: events,
  });
  return { count: result.count };
}

export async function getOrbitLearningHintsForScan(args: {
  userId: string;
  bookmarks: BookmarkForLearning[];
}): Promise<OrbitLearningHint[]> {
  if (args.bookmarks.length === 0) return [];

  const currentKeysByBookmarkId = new Map(
    args.bookmarks.map((bookmark) => [bookmark.id, keysForBookmark(bookmark)])
  );
  const neededKeys = new Set(
    Array.from(currentKeysByBookmarkId.values()).flatMap((keys) =>
      keys.map((entry) => entry.key)
    )
  );
  if (neededKeys.size === 0) return [];

  const recentEvents = await prisma.orbitDecisionEvent.findMany({
    where: {
      userId: args.userId,
      createdAt: { gte: new Date(Date.now() - LEARNING_LOOKBACK_DAYS * 86_400_000) },
    },
    orderBy: { createdAt: "desc" },
    take: MAX_RECENT_LEARNING_EVENTS,
    select: {
      action: true,
      originalSuggestion: true,
      reviewedSuggestion: true,
      bookmark: {
        select: {
          authorUsername: true,
          tweetText: true,
          media: true,
          urls: true,
          xMetadata: true,
          collectionItems: {
            where: { collection: { type: "x_folder" } },
            select: {
              collection: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  const countsByKey = new Map<string, LabelCounts>();
  for (const event of recentEvents) {
    const eventKeys = keysForBookmark({
      id: "",
      authorUsername: event.bookmark.authorUsername,
      tweetText: event.bookmark.tweetText,
      media: event.bookmark.media,
      urls: event.bookmark.urls,
      xMetadata: event.bookmark.xMetadata,
      xFolderHints: event.bookmark.collectionItems.map((item) => ({
        name: item.collection.name,
      })),
    }).filter((entry) => neededKeys.has(entry.key));
    if (eventKeys.length === 0) continue;

    const positive = POSITIVE_ACTIONS.has(event.action);
    const negative = NEGATIVE_ACTIONS.has(event.action);
    if (!positive && !negative) continue;

    const labels = positive
      ? extractLabels(event.reviewedSuggestion ?? event.originalSuggestion)
      : extractLabels(event.originalSuggestion);

    for (const entry of eventKeys) {
      const counts = getCounts(countsByKey, entry.key);
      counts.reasons.add(entry.reason);
      if (positive) {
        addCounts(counts.tags, labels.tags);
        addCounts(counts.collections, labels.collections);
      } else {
        addCounts(counts.avoidTags, labels.tags);
        addCounts(counts.avoidCollections, labels.collections);
      }
    }
  }

  return args.bookmarks.flatMap((bookmark) => {
    const merged: LabelCounts = {
      tags: new Map(),
      collections: new Map(),
      avoidTags: new Map(),
      avoidCollections: new Map(),
      reasons: new Set(),
    };

    for (const entry of currentKeysByBookmarkId.get(bookmark.id) ?? []) {
      const counts = countsByKey.get(entry.key);
      if (!counts) continue;
      for (const reason of counts.reasons) merged.reasons.add(reason);
      for (const [label, count] of counts.tags) {
        merged.tags.set(label, (merged.tags.get(label) ?? 0) + count);
      }
      for (const [label, count] of counts.collections) {
        merged.collections.set(
          label,
          (merged.collections.get(label) ?? 0) + count
        );
      }
      for (const [label, count] of counts.avoidTags) {
        merged.avoidTags.set(label, (merged.avoidTags.get(label) ?? 0) + count);
      }
      for (const [label, count] of counts.avoidCollections) {
        merged.avoidCollections.set(
          label,
          (merged.avoidCollections.get(label) ?? 0) + count
        );
      }
    }

    const hint: OrbitLearningHint = {
      bookmarkId: bookmark.id,
      matchingTags: sortLabels(merged.tags, 5),
      matchingCollections: sortLabels(merged.collections, 4),
      avoidTags: sortLabels(merged.avoidTags, 5),
      avoidCollections: sortLabels(merged.avoidCollections, 4),
      reasons: Array.from(merged.reasons).slice(0, 4),
    };

    return hint.matchingTags.length ||
      hint.matchingCollections.length ||
      hint.avoidTags.length ||
      hint.avoidCollections.length
      ? [hint]
      : [];
  });
}
