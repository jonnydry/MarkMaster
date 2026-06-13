"use client";

import { useEffect } from "react";
import type { Virtualizer } from "@tanstack/react-virtual";

export function useVirtualListFocus(
  virtualizer: Virtualizer<HTMLElement, Element>,
  items: ReadonlyArray<{ id: string }>,
  focusedId: string | null | undefined
) {
  const focusIndex = focusedId
    ? items.findIndex((item) => item.id === focusedId)
    : -1;

  useEffect(() => {
    if (focusIndex < 0) return;
    virtualizer.scrollToIndex(focusIndex, { align: "center" });
  }, [focusIndex, virtualizer]);
}
