import type { BookmarkWithRelations } from "@/types";

type OrbitScanBookmarkRow = {
  id: string;
  tweetId: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
  authorProfileImage: string | null;
  authorVerified: boolean;
  tweetText: string;
  publicMetrics: unknown;
  media: unknown;
  urls: unknown;
  quotedTweet: unknown;
  xMetadata?: unknown;
  tweetCreatedAt: Date | string;
  bookmarkedAt: Date | string;
  notes: Array<{ id: string; content: string }>;
  xFolderHints?: Array<{ id?: string; name: string }>;
  collectionItems?: Array<{
    collection: { id: string; name: string; type?: string };
  }>;
};

function toIsoString(value: Date | string): string {
  return typeof value === "string" ? value : value.toISOString();
}

/** Map orbit scan DB rows to client bookmark cards for the review overlay. */
export function mapOrbitScannedBookmarksForClient(
  bookmarks: OrbitScanBookmarkRow[]
): BookmarkWithRelations[] {
  return bookmarks.map((bookmark) => {
    const folderItems =
      bookmark.xFolderHints?.map((folder) => ({
        collection: {
          id: folder.id ?? folder.name,
          name: folder.name,
        },
      })) ??
      bookmark.collectionItems
        ?.filter((item) => item.collection.type === "x_folder")
        .map((item) => ({
          collection: {
            id: item.collection.id,
            name: item.collection.name,
          },
        })) ??
      [];

    return {
      id: bookmark.id,
      tweetId: bookmark.tweetId,
      authorId: bookmark.authorId,
      authorUsername: bookmark.authorUsername,
      authorDisplayName: bookmark.authorDisplayName,
      authorProfileImage: bookmark.authorProfileImage,
      authorVerified: bookmark.authorVerified,
      tweetText: bookmark.tweetText,
      publicMetrics:
        (bookmark.publicMetrics as BookmarkWithRelations["publicMetrics"]) ?? null,
      media: Array.isArray(bookmark.media)
        ? (bookmark.media as BookmarkWithRelations["media"])
        : null,
      urls: Array.isArray(bookmark.urls)
        ? (bookmark.urls as BookmarkWithRelations["urls"])
        : null,
      quotedTweet:
        (bookmark.quotedTweet as BookmarkWithRelations["quotedTweet"]) ?? null,
      xMetadata: bookmark.xMetadata
        ? (bookmark.xMetadata as BookmarkWithRelations["xMetadata"])
        : null,
      tweetCreatedAt: toIsoString(bookmark.tweetCreatedAt),
      bookmarkedAt: toIsoString(bookmark.bookmarkedAt),
      tags: [],
      notes: bookmark.notes,
      collectionItems: folderItems,
    };
  });
}
