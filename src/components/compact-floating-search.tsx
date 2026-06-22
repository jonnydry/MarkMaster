"use client";

import type { ReactNode } from "react";

import { appContentGutterClassName, appFloatingSearchShellClassName } from "@/lib/app-chrome";
import { bookmarkFeedColumnClassName } from "@/lib/bookmark-feed-layout";
import { highlightSearchShellClass } from "@/lib/highlight-chrome";
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
        "min-w-0 w-full max-w-full pt-2 pb-1 animate-slide-down-fade motion-reduce:animate-none",
        appContentGutterClassName,
        className
      )}
    >
      <div
        className={cn(
          "relative z-[var(--z-sticky-subbar)] mx-auto w-full",
          highlightSearchShellClass,
          appFloatingSearchShellClassName,
          bookmarkFeedColumnClassName
        )}
      >
        {children}
      </div>
    </div>
  );
}
