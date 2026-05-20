import type { ViewMode } from "@/types";

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

/**
 * Inspector-aware helpers for two-column mission-control layout (dashboard/library + orbit).
 * Only affects layout when `data-theme="orbital"` (via parent conditional), no-op otherwise.
 * Mirrors the proven Orbit two-column pattern.
 */

/** Left column wrapper class when right inspector is shown (constrains feed on lg+). */
export const bookmarkFeedLeftInspectorClassName = "min-w-0 flex-1 lg:max-w-[640px]";

/**
 * Right inspector column wrapper (sticky card container).
 * Use with `hidden lg:block lg:w-[380px] lg:shrink-0`
 */
export const bookmarkFeedRightInspectorWrapperClassName = "hidden lg:block lg:w-[380px] lg:shrink-0";

/** Returns the list root className, suppressing centering mx-auto when two-col inspector active. */
export function getBookmarkListContainerClassName(
  inspectorActive: boolean,
  viewMode: ViewMode = "feed"
): string {
  if (viewMode === "grid") return "";
  if (inspectorActive) {
    return "w-full"; // width + constraints come from flex parent + left class above
  }
  return bookmarkFeedColumnClassName;
}
