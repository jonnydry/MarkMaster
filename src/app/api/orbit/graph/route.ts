import { NextRequest, NextResponse } from "next/server";
import { getDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type {
  OrbitGraphEdge,
  OrbitGraphNode,
  OrbitGraphPayload,
  OrbitGraphStats,
} from "@/types";

const DEFAULT_NODE_CAP = 1_500;
const MAX_NODE_CAP = 4_000;
const RECENT_WINDOW_MS = 1000 * 60 * 60 * 24 * 14;
const TITLE_LENGTH = 140;

function truncateTitle(text: string) {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (normalized.length <= TITLE_LENGTH) return normalized;
  return `${normalized.slice(0, TITLE_LENGTH - 1).trimEnd()}…`;
}

function parseNodeCap(value: string | null): number {
  if (!value) return DEFAULT_NODE_CAP;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_NODE_CAP;
  return Math.min(parsed, MAX_NODE_CAP);
}

export async function GET(req: NextRequest) {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const nodeCap = parseNodeCap(req.nextUrl.searchParams.get("nodeCap"));

  const [tagsRaw, collectionsRaw, totalBookmarks, bookmarksRaw] =
    await Promise.all([
      prisma.tag.findMany({
        where: { userId: user.id },
        select: {
          id: true,
          name: true,
          color: true,
          _count: { select: { bookmarks: true } },
        },
        orderBy: { name: "asc" },
      }),
      prisma.collection.findMany({
        where: { userId: user.id },
        select: {
          id: true,
          name: true,
          type: true,
          _count: { select: { items: true } },
        },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.bookmark.count({ where: { userId: user.id } }),
      prisma.bookmark.findMany({
        where: { userId: user.id },
        select: {
          id: true,
          tweetText: true,
          authorUsername: true,
          authorDisplayName: true,
          bookmarkedAt: true,
          tags: { select: { tagId: true } },
          collectionItems: { select: { collectionId: true } },
        },
        orderBy: { bookmarkedAt: "desc" },
        take: nodeCap,
      }),
    ]);

  const nodes: OrbitGraphNode[] = [];
  const edges: OrbitGraphEdge[] = [];

  let looseRendered = 0;
  const renderedBookmarkIds = new Set<string>();
  const tagBookmarkCounts = new Map<string, number>();
  const collectionBookmarkCounts = new Map<string, number>();
  const now = Date.now();

  for (const bookmark of bookmarksRaw) {
    renderedBookmarkIds.add(bookmark.id);

    const affiliated =
      bookmark.tags.length > 0 || bookmark.collectionItems.length > 0;
    const bookmarkedAtMs = new Date(bookmark.bookmarkedAt).getTime();
    const recent = now - bookmarkedAtMs <= RECENT_WINDOW_MS;

    if (!affiliated) {
      looseRendered += 1;
    }

    nodes.push({
      kind: "bookmark",
      id: bookmark.id,
      title: truncateTitle(bookmark.tweetText),
      authorUsername: bookmark.authorUsername,
      authorDisplayName: bookmark.authorDisplayName,
      affiliated,
      recent,
    });

    for (const { tagId } of bookmark.tags) {
      edges.push({ kind: "bookmark-tag", bookmarkId: bookmark.id, tagId });
      tagBookmarkCounts.set(
        tagId,
        (tagBookmarkCounts.get(tagId) ?? 0) + 1
      );
    }

    for (const { collectionId } of bookmark.collectionItems) {
      edges.push({
        kind: "bookmark-collection",
        bookmarkId: bookmark.id,
        collectionId,
      });
      collectionBookmarkCounts.set(
        collectionId,
        (collectionBookmarkCounts.get(collectionId) ?? 0) + 1
      );
    }

    if (!affiliated) {
      edges.push({ kind: "loose", bookmarkId: bookmark.id });
    }
  }

  const tagNodeIds = new Set<string>();
  for (const tag of tagsRaw) {
    nodes.push({
      kind: "tag",
      id: tag.id,
      name: tag.name,
      color: tag.color,
      count: tag._count.bookmarks,
    });
    tagNodeIds.add(tag.id);

    const renderedCount = tagBookmarkCounts.get(tag.id) ?? 0;
    const remaining = tag._count.bookmarks - renderedCount;
    if (remaining > 0) {
      const overflowId = `tag-overflow-${tag.id}`;
      nodes.push({
        kind: "overflow",
        id: overflowId,
        anchorId: tag.id,
        anchorKind: "tag",
        remaining,
      });
      edges.push({
        kind: "overflow",
        overflowId,
        anchorId: tag.id,
      });
    }
  }

  let userCollectionCount = 0;
  let xFolderCount = 0;
  const collectionNodeIds = new Set<string>();

  for (const collection of collectionsRaw) {
    const variant = collection.type === "x_folder" ? "x_folder" : "user_collection";
    if (variant === "x_folder") {
      xFolderCount += 1;
    } else {
      userCollectionCount += 1;
    }

    nodes.push({
      kind: "collection",
      id: collection.id,
      name: collection.name,
      variant,
      count: collection._count.items,
    });
    collectionNodeIds.add(collection.id);

    const renderedCount = collectionBookmarkCounts.get(collection.id) ?? 0;
    const remaining = collection._count.items - renderedCount;
    if (remaining > 0) {
      const overflowId = `collection-overflow-${collection.id}`;
      nodes.push({
        kind: "overflow",
        id: overflowId,
        anchorId: collection.id,
        anchorKind: "collection",
        remaining,
      });
      edges.push({
        kind: "overflow",
        overflowId,
        anchorId: collection.id,
      });
    }
  }

  const totalLooseBookmarks = await prisma.bookmark.count({
    where: {
      userId: user.id,
      tags: { none: {} },
      collectionItems: { none: {} },
    },
  });

  nodes.push({
    kind: "core",
    id: "orbit-index",
    totalBookmarks,
    looseBookmarks: totalLooseBookmarks,
  });

  const looseOverflow = totalLooseBookmarks - looseRendered;
  if (looseOverflow > 0) {
    const overflowId = "core-overflow";
    nodes.push({
      kind: "overflow",
      id: overflowId,
      anchorId: "orbit-index",
      anchorKind: "core",
      remaining: looseOverflow,
    });
    edges.push({
      kind: "overflow",
      overflowId,
      anchorId: "orbit-index",
    });
  }

  const filteredEdges = edges.filter((edge) => {
    switch (edge.kind) {
      case "bookmark-tag":
        return (
          renderedBookmarkIds.has(edge.bookmarkId) && tagNodeIds.has(edge.tagId)
        );
      case "bookmark-collection":
        return (
          renderedBookmarkIds.has(edge.bookmarkId) &&
          collectionNodeIds.has(edge.collectionId)
        );
      case "loose":
        return renderedBookmarkIds.has(edge.bookmarkId);
      case "overflow":
        return true;
      default:
        edge satisfies never;
        return false;
    }
  });

  const stats: OrbitGraphStats = {
    totalBookmarks,
    affiliatedBookmarks: totalBookmarks - totalLooseBookmarks,
    looseBookmarks: totalLooseBookmarks,
    renderedBookmarks: bookmarksRaw.length,
    truncatedBookmarks: Math.max(totalBookmarks - bookmarksRaw.length, 0),
    tagCount: tagsRaw.length,
    userCollectionCount,
    xFolderCount,
  };

  const payload: OrbitGraphPayload = {
    nodes,
    edges: filteredEdges,
    stats,
    generatedAt: new Date().toISOString(),
    nodeCap,
  };

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}
