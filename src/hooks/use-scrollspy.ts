"use client";

import { useEffect, useState } from "react";

const DEFAULT_SCROLL_MARGIN_PX = 24; // 1.5rem — matches SettingsSection scroll-mt

function readHeaderHeightPx(): number {
  if (typeof document === "undefined") return 72;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(
    "--app-header-height"
  );
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 72;
}

function resolveScrollRoot(anchor: Element | null): Element | Window {
  let node = anchor?.parentElement ?? null;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      node.scrollHeight > node.clientHeight + 1
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return window;
}

/**
 * Returns the last section whose top has crossed the activation line (sticky
 * header + scroll margin). Sections are evaluated in document order.
 */
export function computeScrollspyActiveId(
  ids: readonly string[],
  offsetPx: number
): string {
  if (ids.length === 0) return "";

  let active = ids[0];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (el.getBoundingClientRect().top <= offsetPx + 2) {
      active = id;
    } else {
      break;
    }
  }
  return active;
}

/**
 * Tracks which section is active while scrolling. Uses scroll position rather
 * than IntersectionObserver so highlights stay stable on long, uneven sections.
 *
 * The activation line sits at `topOffsetPx + scrollMarginPx` from the viewport
 * top (defaults: measured header + 1.5rem scroll margin).
 */
export function useScrollspy(
  ids: readonly string[],
  opts?: {
    /** Pixels from the viewport top before scroll-margin (defaults to header height). */
    topOffsetPx?: number;
    /** Extra offset below the header, e.g. section scroll-margin-top (default 1.5rem). */
    scrollMarginPx?: number;
  }
): string {
  const [activeId, setActiveId] = useState<string>(ids[0] ?? "");

  useEffect(() => {
    if (ids.length === 0 || typeof window === "undefined") return;

    const headerPx = opts?.topOffsetPx ?? readHeaderHeightPx();
    const scrollMarginPx = opts?.scrollMarginPx ?? DEFAULT_SCROLL_MARGIN_PX;
    const offsetPx = headerPx + scrollMarginPx;

    const anchor = document.getElementById(ids[0]);
    const scrollRoot = resolveScrollRoot(anchor);

    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const next = computeScrollspyActiveId(ids, offsetPx);
        setActiveId((prev) => (prev === next ? prev : next));
      });
    };

    update();
    scrollRoot.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      scrollRoot.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
    // Depend on the joined id list (not the array identity) so callers passing
    // a fresh array literal each render don't tear down and re-attach the
    // scroll listeners; `opts` is likewise tracked by its primitive fields.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(","), opts?.topOffsetPx, opts?.scrollMarginPx]);

  return activeId;
}
