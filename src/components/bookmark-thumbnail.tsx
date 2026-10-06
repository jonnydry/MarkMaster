"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";

import {
  bookmarkThumbnailPlan,
  type ThumbnailBookmark,
} from "@/lib/bookmark-preview";
import { cn } from "@/lib/utils";

/**
 * Start a proxy thumbnail once it is this close to the viewport. Farther
 * cards never request `/api/bookmarks/:id/card-image`.
 */
const CARD_IMAGE_ROOT_MARGIN_PX = 300;

function isNearViewport(node: HTMLElement): boolean {
  const rect = node.getBoundingClientRect();
  // A zero box has not been laid out yet. Wait for IntersectionObserver
  // rather than treating it as on-screen.
  if (rect.width <= 0 || rect.height <= 0) return false;

  const margin = CARD_IMAGE_ROOT_MARGIN_PX;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

  return (
    rect.bottom >= -margin &&
    rect.right >= -margin &&
    rect.top <= viewportHeight + margin &&
    rect.left <= viewportWidth + margin
  );
}

/**
 * Proxy card images are a plain img whose src is the slow card-image route.
 * Withhold that src until the card is near the viewport. Cards already
 * visible (or within the root margin) resolve before paint so they stay eager.
 */
function useLoadCardImageWhenNear(enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useLayoutEffect(() => {
    if (!enabled || near) return;
    const node = ref.current;
    if (!node) return;

    if (isNearViewport(node)) {
      setNear(true);
      return;
    }

    if (typeof IntersectionObserver === "undefined") {
      // No observer to subscribe to. The node is already mounted, so load
      // rather than leaving the card on its placeholder forever.
      if (node.isConnected) setNear(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
        }
      },
      { rootMargin: `${CARD_IMAGE_ROOT_MARGIN_PX}px` }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, near]);

  return { ref, ready: !enabled || near };
}

export function BookmarkThumbnail({
  bookmark,
  alt,
  sizes,
  priority = false,
  className,
  fallback = null,
}: {
  bookmark: ThumbnailBookmark;
  alt: string;
  sizes: string;
  priority?: boolean;
  className?: string;
  fallback?: React.ReactNode;
}) {
  const plan = bookmarkThumbnailPlan(bookmark);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const deferCardImage = Boolean(plan && !plan.optimized && !priority);
  const { ref, ready } = useLoadCardImageWhenNear(deferCardImage);

  if (!plan || failedSrc === plan.src) return fallback;

  if (plan.optimized) {
    return (
      <Image
        src={plan.src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        className={cn("object-cover", className)}
        onError={() => setFailedSrc(plan.src)}
      />
    );
  }

  return (
    // Card images from other sites are proxied same-origin. next/image would
    // request this route without the session cookie. The slot stays mounted
    // so the parent's placeholder box does not shift before the image loads.
    <div ref={ref} className="size-full">
      {ready ? (
        <img
          src={plan.src}
          alt={alt}
          loading="eager"
          className={cn("size-full object-cover", className)}
          onError={() => setFailedSrc(plan.src)}
        />
      ) : null}
    </div>
  );
}
