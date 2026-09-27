import { Prisma } from "@prisma/client";

import {
  directThumbnailUrl,
  previewableCardPageUrl,
} from "@/lib/bookmark-preview";
import { prisma } from "@/lib/prisma";

type CardRow = {
  id: string;
  media: unknown;
  urls: unknown;
};

/**
 * Tells the feed which text posts still have a link card to preview.
 * Attached photos and Twitter-hosted card images are already on the row.
 * Long-post links live only in xMetadata, so those need one narrow lookup.
 */
export async function withBookmarkCardUrls<T extends CardRow>(
  bookmarks: T[]
): Promise<Array<T & { cardUrl?: string }>> {
  const needsMetadata: T[] = [];
  const pageById = new Map<string, string>();

  for (const bookmark of bookmarks) {
    if (directThumbnailUrl(bookmark)) continue;
    const pageUrl = previewableCardPageUrl(bookmark.urls);
    if (pageUrl) {
      pageById.set(bookmark.id, pageUrl);
      continue;
    }
    needsMetadata.push(bookmark);
  }

  if (needsMetadata.length > 0) {
    const ids = needsMetadata.map((bookmark) => bookmark.id);
    const rows = await prisma.$queryRaw<
      Array<{ id: string; note_urls: unknown; tweet_urls: unknown }>
    >(Prisma.sql`
      SELECT b.id,
        b."xMetadata"#>'{tweet,note_tweet,entities,urls}' AS note_urls,
        b."xMetadata"#>'{tweet,entities,urls}' AS tweet_urls
      FROM "Bookmark" b
      WHERE b.id IN (${Prisma.join(ids)})
    `);

    for (const row of rows) {
      const pageUrl =
        previewableCardPageUrl(row.note_urls) ?? previewableCardPageUrl(row.tweet_urls);
      if (pageUrl) pageById.set(row.id, pageUrl);
    }
  }

  if (pageById.size === 0) return bookmarks;

  return bookmarks.map((bookmark) => {
    const cardUrl = pageById.get(bookmark.id);
    return cardUrl ? { ...bookmark, cardUrl } : bookmark;
  });
}
