"use client";

import type { ReactNode } from "react";

import { appContentGutterClassName } from "@/lib/app-chrome";
import { bookmarkFeedColumnClassName } from "@/lib/bookmark-feed-layout";
import { cn } from "@/lib/utils";

type CompactFloatingSearchBubbleProps = {
  /** The search field to float — provides its own shell (border + surface). */
  children: ReactNode;
  className?: string;
};

/**
 * Always-visible search "bubble" that floats just below the compact header bar.
 * Rendered inside the sticky (now transparent) header region so it stays pinned
 * while scrolling, but sits on its own — feed content scrolls behind it. Centers
 * on the feed column to mirror the inline search bar it replaces.
 */
export function CompactFloatingSearchBubble({
  children,
  className,
}: CompactFloatingSearchBubbleProps) {
  return (
    <div
      className={cn(
        "min-w-0 w-full max-w-full pt-2 pb-1 animate-slide-down-fade motion-reduce:animate-none",
        appContentGutterClassName,
        className
      )}
    >
      <div
        className={cn(
          "relative z-[var(--z-sticky-subbar)] mx-auto w-full rounded-sm bg-background/70 supports-[backdrop-filter]:bg-background/60 backdrop-blur-md shadow-[0_18px_44px_-30px_color-mix(in_srgb,var(--foreground)_70%,transparent)]",
          bookmarkFeedColumnClassName
        )}
      >
        {children}
      </div>
    </div>
  );
}
