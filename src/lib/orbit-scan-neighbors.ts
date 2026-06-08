import "server-only";

import { prisma } from "@/lib/prisma";
import type { OrbitNeighborHint } from "@/lib/orbit-signal-extraction";

const MAX_NEIGHBOR_BOOKMARKS = 40;
const MAX_TAGS_PER_HINT = 5;
const MAX_COLLECTIONS_PER_HINT = 4;

export interface OrbitNeighborBookmark {
  id: string;
  authorUsername: string;
  urls: unknown;
}

function normalizeKey(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
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
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const raw =
      typeof record.expanded_url === "string"
        ? record.expanded_url
        : typeof record.url === "string"
          ? record.url
          : typeof record.display_url === "string"
            ? record.display_url
            : null;
    const domain = raw ? parseDomain(raw) : null;
    if (domain) seen.add(domain);
  }

  return Array.from(seen);
}

function sortLabels(counts: Map<string, number>, limit: number) {
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([label]) => label);
}

export async function getOrbitNeighborHintsForScan(args: {
  userId: string;
  bookmarks: OrbitNeighborBookmark[];
}): Promise<Array<{ bookmarkId: string; hint: OrbitNeighborHint }>> {
  if (args.bookmarks.length === 0) return [];

  const authors = Array.from(
    new Set(
      args.bookmarks
        .map((bookmark) => bookmark.authorUsername.trim())
        .filter(Boolean)
    )
  );
  const domains = Array.from(
    new Set(
      args.bookmarks.flatMap((bookmark) => domainKeysFromUrls(bookmark.urls))
    )
  );

  if (authors.length === 0 && domains.length === 0) return [];

  const neighborBookmarks = await prisma.bookmark.findMany({
    where: {
      userId: args.userId,
      id: { notIn: args.bookmarks.map((bookmark) => bookmark.id) },
      OR: [
        authors.length > 0 ? { authorUsername: { in: authors } } : undefined,
        domains.length > 0
          ? {
              OR: domains.map((domain) => ({
                urls: { string_contains: domain },
              })),
            }
          : undefined,
      ].filter(Boolean) as Array<Record<string, unknown>>,
      tags: { some: {} },
    },
    select: {
      id: true,
      authorUsername: true,
      urls: true,
      tags: {
        select: {
          tag: { select: { name: true } },
        },
      },
      collectionItems: {
        where: { collection: { type: "user_collection" } },
        select: {
          collection: { select: { name: true } },
        },
      },
    },
    take: MAX_NEIGHBOR_BOOKMARKS,
    orderBy: { bookmarkedAt: "desc" },
  });

  const byAuthor = new Map<string, typeof neighborBookmarks>();
  const byDomain = new Map<string, typeof neighborBookmarks>();

  for (const neighbor of neighborBookmarks) {
    const authorKey = normalizeKey(neighbor.authorUsername);
    if (authorKey) {
      const current = byAuthor.get(authorKey) ?? [];
      current.push(neighbor);
      byAuthor.set(authorKey, current);
    }

    for (const domain of domainKeysFromUrls(neighbor.urls)) {
      const current = byDomain.get(domain) ?? [];
      current.push(neighbor);
      byDomain.set(domain, current);
    }
  }

  return args.bookmarks.flatMap((bookmark) => {
    const tagCounts = new Map<string, number>();
    const collectionCounts = new Map<string, number>();
    const reasons = new Set<string>();
    const seenNeighborIds = new Set<string>();

    const aggregateNeighbor = (neighbor: (typeof neighborBookmarks)[number]) => {
      if (seenNeighborIds.has(neighbor.id)) return;
      seenNeighborIds.add(neighbor.id);

      for (const entry of neighbor.tags) {
        tagCounts.set(entry.tag.name, (tagCounts.get(entry.tag.name) ?? 0) + 1);
      }
      for (const entry of neighbor.collectionItems) {
        collectionCounts.set(
          entry.collection.name,
          (collectionCounts.get(entry.collection.name) ?? 0) + 1
        );
      }
    };

    const authorNeighbors = byAuthor.get(normalizeKey(bookmark.authorUsername)) ?? [];
    if (authorNeighbors.length > 0) {
      reasons.add("same author");
      for (const neighbor of authorNeighbors) {
        aggregateNeighbor(neighbor);
      }
    }

    for (const domain of domainKeysFromUrls(bookmark.urls)) {
      const domainNeighbors = byDomain.get(domain) ?? [];
      if (domainNeighbors.length === 0) continue;
      reasons.add(`same link domain: ${domain}`);
      for (const neighbor of domainNeighbors) {
        aggregateNeighbor(neighbor);
      }
    }

    const hint: OrbitNeighborHint = {
      tags: sortLabels(tagCounts, MAX_TAGS_PER_HINT),
      collections: sortLabels(collectionCounts, MAX_COLLECTIONS_PER_HINT),
      reasons: Array.from(reasons).slice(0, 4),
    };

    return hint.tags.length || hint.collections.length
      ? [{ bookmarkId: bookmark.id, hint }]
      : [];
  });
}