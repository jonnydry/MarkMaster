import type { RefObject } from "react";

/** Dispatched when a surface should open its compact floating search strip. */
export const COMPACT_SEARCH_FOCUS_EVENT = "markmaster-compact-search-focus";

/** Opens compact search when collapsed; focuses the inline search input when visible. */
export function requestCompactSearchFocus(
  searchInputRef?: RefObject<HTMLInputElement | null> | null
) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(COMPACT_SEARCH_FOCUS_EVENT));
  searchInputRef?.current?.focus();
}
