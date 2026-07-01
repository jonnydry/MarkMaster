import type { ViewMode } from "@/types";
import type { BookmarkMediaJson } from "@/lib/bookmark-media";

/**
 * How many leading media bookmarks get eager (LCP-priority) image loading.
 * Grid view renders several cards above the fold, so one is not enough.
 */
const ABOVE_FOLD_PRIORITY_MEDIA_COUNT = 3;

/** Ids of the first few bookmarks with renderable media — these get `priorityMedia`. */
export function getAboveFoldMediaBookmarkIds(
  bookmarks: Array<{ id: string; media?: BookmarkMediaJson[] | null }>
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const bookmark of bookmarks) {
    const media = bookmark.media?.[0];
    if (media?.url || media?.preview_image_url) {
      ids.add(bookmark.id);
      if (ids.size >= ABOVE_FOLD_PRIORITY_MEDIA_COUNT) break;
    }
  }
  return ids;
}

/**
 * Primary bookmark/post column width, aligned with x.com’s timeline (~600px).
 */
export const BOOKMARK_FEED_MAX_WIDTH_PX = 600;

/** Max width only (compose with padding / margin as needed). */
export const bookmarkFeedMaxWidthClassName = "max-w-[600px]";

/**
 * Centered feed column for list/feed bookmark views (dashboard, Orbit queue, etc.).
 */
export const bookmarkFeedColumnClassName = "mx-auto w-full max-w-[600px]";

/**
 * Collection detail row with reorder controls: keeps the card at feed width with
 * space for the side control column. Use with `flex gap-2 sm:gap-3` on the same element.
 */
export const bookmarkCollectionRowWithReorderClassName = "mx-auto w-full max-w-[672px]";

/** Collection detail when items are read-only (synced folder): single feed column. */
export const bookmarkCollectionRowSyncedClassName = bookmarkFeedColumnClassName;

/** Inner cell so the bookmark card never exceeds feed width beside controls. */
export const bookmarkCollectionCardCellClassName =
  "min-w-0 flex-1 max-w-[600px]";

/** Returns the list root className for feed/list view modes. */
export function getBookmarkListContainerClassName(viewMode: ViewMode = "feed"): string {
  if (viewMode === "grid") return "";
  return bookmarkFeedColumnClassName;
}
