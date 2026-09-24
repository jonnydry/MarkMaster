"use client";

import { useCallback, useLayoutEffect, useState } from "react";

/**
 * Distance from the top of `scrollElement`'s content to the list element — the
 * TanStack Virtual `scrollMargin`. Virtualized lists sit below sticky headers,
 * status rows, and discovery strips inside the same scroller; without this the
 * virtualizer assumes the list starts at scrollTop 0, so `scrollToIndex` (J/K)
 * lands off-centre and can park the active row under the sticky header.
 *
 * Re-measures whenever anything in the scroller resizes (header compaction,
 * banners appearing, filter panels opening).
 */
export function useListScrollMargin(scrollElement: HTMLElement | null) {
  const [listElement, setListElement] = useState<HTMLElement | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  const listRef = useCallback((node: HTMLElement | null) => {
    setListElement(node);
  }, []);

  useLayoutEffect(() => {
    if (!scrollElement || !listElement) return;

    const measure = () => {
      const next = Math.round(
        listElement.getBoundingClientRect().top -
          scrollElement.getBoundingClientRect().top +
          scrollElement.scrollTop
      );
      setScrollMargin((current) => (current === next ? current : next));
    };

    measure();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    // Anything above the list lives in one of the scroller's direct children or
    // in the list's own ancestor chain — observing both catches every shift.
    for (const child of Array.from(scrollElement.children)) {
      observer.observe(child);
    }
    for (
      let node = listElement.parentElement;
      node && node !== scrollElement;
      node = node.parentElement
    ) {
      observer.observe(node);
    }
    return () => observer.disconnect();
  }, [scrollElement, listElement]);

  return { listRef, scrollMargin };
}
