"use client";

import { useEffect, type RefObject } from "react";

/**
 * Keeps `--app-header-height` (and therefore `--header-height`) aligned with the
 * measured sticky header, including compact toolbars and expanded search strips.
 */
export function useStickyHeaderHeight(
  enabled: boolean,
  headerRef: RefObject<HTMLElement | null>
) {
  useEffect(() => {
    if (!enabled) return;

    const root = document.documentElement;
    let observer: ResizeObserver | null = null;

    const sync = (el: HTMLElement) => {
      const height = el.getBoundingClientRect().height;
      if (height > 0) {
        root.style.setProperty("--app-header-height", `${Math.ceil(height)}px`);
      }
    };

    const attach = (el: HTMLElement) => {
      sync(el);
      observer = new ResizeObserver(() => sync(el));
      observer.observe(el);
    };

    const el = headerRef.current;
    if (el) {
      attach(el);
    }

    return () => {
      observer?.disconnect();
      root.style.removeProperty("--app-header-height");
    };
  }, [enabled, headerRef]);
}
