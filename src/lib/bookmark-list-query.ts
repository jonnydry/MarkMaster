import type { Prisma } from "@prisma/client";

/** Relations needed for feed/grid cards — shared by list API routes. */
export const bookmarkListInclude = {
  tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
  notes: { select: { id: true, content: true } },
  collectionItems: {
    select: { collection: { select: { id: true, name: true } } },
  },
} as const satisfies Prisma.BookmarkInclude;

/**
 * Slim bookmark row for paginated library/collection lists.
 * Omits quotedTweet and xMetadata — large JSON blobs not needed in feed cards.
 */
export const bookmarkListSelect = {
  id: true,
  userId: true,
  tweetId: true,
  authorId: true,
  authorUsername: true,
  authorDisplayName: true,
  authorProfileImage: true,
  authorVerified: true,
  tweetText: true,
  publicMetrics: true,
  media: true,
  urls: true,
  tweetCreatedAt: true,
  bookmarkedAt: true,
  syncedAt: true,
  tags: bookmarkListInclude.tags,
  notes: bookmarkListInclude.notes,
  collectionItems: bookmarkListInclude.collectionItems,
} as const satisfies Prisma.BookmarkSelect;

/**
 * Compact bookmark row for feed/grid cards.
 * Drops `urls` (not rendered in cards) and small unused columns
 * (`userId`, `authorId`, `syncedAt`) to shrink the JSON payload.
 */
export const bookmarkCompactSelect = {
  id: true,
  tweetId: true,
  authorUsername: true,
  authorDisplayName: true,
  authorProfileImage: true,
  authorVerified: true,
  tweetText: true,
  publicMetrics: true,
  media: true,
  tweetCreatedAt: true,
  bookmarkedAt: true,
  tags: bookmarkListInclude.tags,
  notes: bookmarkListInclude.notes,
  collectionItems: bookmarkListInclude.collectionItems,
} as const satisfies Prisma.BookmarkSelect;

/** Include quotedTweet when a single bookmark is requested by id. */
export const bookmarkDetailSelect = {
  ...bookmarkListSelect,
  quotedTweet: true,
  xMetadata: true,
} as const satisfies Prisma.BookmarkSelect;

export function bookmarkListQueryOptions(options?: {
  includeDetailFields?: boolean;
  compact?: boolean;
}) {
  if (options?.includeDetailFields) {
    return { select: bookmarkDetailSelect } as const;
  }
  if (options?.compact) {
    return { select: bookmarkCompactSelect } as const;
  }
  return { select: bookmarkListSelect } as const;
}
