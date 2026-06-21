"use client";

import type { ReactNode } from "react";

import { appContentGutterClassName } from "@/lib/app-chrome";
import { bookmarkFeedColumnClassName } from "@/lib/bookmark-feed-layout";
import { cn } from "@/lib/utils";

type CompactFloatingSearchBubbleProps = {
  children: ReactNode;
  className?: string;
};

/** Search bubble pinned below the compact feed toolbar; centered on the feed column. */
export function CompactFloatingSearchBubble({
  children,
  className,
}: CompactFloatingSearchBubbleProps) {
  return (
    <div
      className={cn(
        "w-full min-w-0 pt-2 pb-1 animate-slide-down-fade motion-reduce:animate-none",
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
