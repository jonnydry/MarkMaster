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
