import { prisma } from "@/lib/prisma";
import { getBookmarkTweetUrl } from "@/lib/bookmark-url";
import {
  buildBookmarkListNextCursor,
  buildPrismaBookmarkKeysetFilter,
  decodeBookmarkListCursor,
  type BookmarkListCursor,
} from "@/lib/bookmark-keyset";

export const EXPORT_LIMIT = 10_000;
export const EXPORT_BATCH_SIZE = 500;

export const CSV_EXPORT_HEADER =
  "Tweet ID,Author,Username,Text,Likes,Retweets,Replies,Tags,Note,Tweet Date,Bookmarked Date,URL\n";

type ExportBookmark = Awaited<
  ReturnType<typeof fetchBookmarkExportBatch>
>["bookmarks"][number];

export function escapeCsvField(value: string): string {
  if (
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r") ||
    value.includes(",")
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function sanitizeCsvField(value: string): string {
  if (/^[=+\-@\t\r]/.test(value)) {
    return escapeCsvField(`'${value}`);
  }
  return escapeCsvField(value);
}

export function formatBookmarkCsvRow(b: ExportBookmark): string {
  const metrics = b.publicMetrics as Record<string, number> | null;
  const tags = b.tags.map((t) => t.tag.name).join("; ");
  const note = b.notes[0]?.content || "";
  const text = sanitizeCsvField(b.tweetText);
  const url = getBookmarkTweetUrl(b) ?? "";

  return `${escapeCsvField(b.tweetId)},${escapeCsvField(b.authorDisplayName)},${escapeCsvField("@" + b.authorUsername)},${text},${metrics?.like_count || 0},${metrics?.retweet_count || 0},${metrics?.reply_count || 0},${escapeCsvField(tags)},${sanitizeCsvField(note)},${escapeCsvField(b.tweetCreatedAt.toISOString())},${escapeCsvField(b.bookmarkedAt.toISOString())},${escapeCsvField(url)}`;
}

export function formatBookmarkJsonRecord(b: ExportBookmark) {
  return {
    tweetId: b.tweetId,
    author: { name: b.authorDisplayName, username: b.authorUsername },
    text: b.tweetText,
    metrics: b.publicMetrics,
    tags: b.tags.map((t) => t.tag.name),
    note: b.notes[0]?.content || null,
    tweetDate: b.tweetCreatedAt,
    bookmarkedDate: b.bookmarkedAt,
    url: getBookmarkTweetUrl(b) ?? "",
  };
}

export async function fetchBookmarkExportBatch(
  userId: string,
  cursor: string | undefined,
  remaining: number
) {
  const take = Math.min(EXPORT_BATCH_SIZE, remaining);
  const decodedCursor = cursor ? decodeBookmarkListCursor(cursor) : null;

  const bookmarks = await prisma.bookmark.findMany({
    where: {
      userId,
      ...(decodedCursor
        ? buildPrismaBookmarkKeysetFilter(decodedCursor as BookmarkListCursor)
        : {}),
    },
    include: {
      tags: { include: { tag: true } },
      notes: { select: { content: true } },
    },
    orderBy: [{ bookmarkedAt: "desc" }, { id: "desc" }],
    take,
  });

  const nextCursor =
    bookmarks.length === take
      ? buildBookmarkListNextCursor(bookmarks, "bookmarkedAt", "desc", take)
      : undefined;

  return { bookmarks, nextCursor };
}

export async function* iterateBookmarkExportBatches(
  userId: string,
  maxRows = EXPORT_LIMIT
) {
  let cursor: string | undefined;
  let exported = 0;

  while (exported < maxRows) {
    const remaining = maxRows - exported;
    const batch = await fetchBookmarkExportBatch(userId, cursor, remaining);
    if (batch.bookmarks.length === 0) break;

    exported += batch.bookmarks.length;
    yield batch.bookmarks;

    if (!batch.nextCursor) break;
    cursor = batch.nextCursor;
  }
}
