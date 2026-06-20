import type { RefObject } from "react";

/**
 * Focuses the search input. The compact floating search bubble is always
 * visible, so this simply moves focus to it (or to the inline search bar when
 * the header is not compact).
 */
export function requestCompactSearchFocus(
  searchInputRef?: RefObject<HTMLInputElement | null> | null
) {
  if (typeof window === "undefined") return;
  searchInputRef?.current?.focus();
}
