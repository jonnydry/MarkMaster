import { bookmarkFeedColumnClassName } from "@/lib/bookmark-feed-layout";
import { getStaggerClass } from "@/lib/stagger";
import { cn } from "@/lib/utils";
import type { ViewMode } from "@/types";

interface DashboardSkeletonProps {
  viewMode: ViewMode;
}

export function DashboardSkeleton({ viewMode }: DashboardSkeletonProps) {
  if (viewMode === "grid") {
    return (
      <div
        className="space-y-1 p-3"
        role="status"
        aria-live="polite"
        aria-label="Loading bookmarks"
      >
        <div className="h-8 w-full surface-inset-strong skeleton-shimmer" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className={`flex min-h-[92px] items-center gap-3 surface-solid p-3 ${getStaggerClass(i, "animate-fade-in") ?? ""}`}
          >
            <div className="h-[68px] w-24 shrink-0 rounded-sm skeleton-shimmer" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3 w-full rounded-sm skeleton-shimmer" />
              <div className="h-3 w-4/5 rounded-sm skeleton-shimmer" />
              <div className="h-4 w-20 rounded-sm skeleton-shimmer" />
            </div>
          </div>
        ))}
        <span className="sr-only">Loading bookmarks</span>
      </div>
    );
  }

  if (viewMode === "compact") {
    return (
      <div
        className={cn(bookmarkFeedColumnClassName, "space-y-0")}
        role="status"
        aria-live="polite"
        aria-label="Loading bookmarks"
      >
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className={`h-[72px] border-b border-hairline-soft px-4 sm:px-5 ${getStaggerClass(i, "animate-fade-in") ?? ""}`}
          >
            <div className="flex h-full items-center gap-3">
              <div className="h-3 w-6 shrink-0 rounded-sm skeleton-shimmer" />
              <div className="h-3 w-3/4 rounded-sm skeleton-shimmer" />
            </div>
          </div>
        ))}
        <span className="sr-only">Loading bookmarks</span>
      </div>
    );
  }

  return (
    <div
      className={cn(bookmarkFeedColumnClassName, "space-y-0")}
      role="status"
      aria-live="polite"
      aria-label="Loading bookmarks"
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className={`border-b border-hairline-soft px-4 py-3 sm:px-5 ${getStaggerClass(i, "animate-fade-in") ?? ""}`}
        >
          <div className="flex gap-4">
            <div className="w-10 h-10 rounded-full skeleton-shimmer shrink-0" />
            <div className="flex-1 space-y-2.5">
              <div className="flex items-center gap-2">
                <div className="h-3.5 w-20 rounded-sm skeleton-shimmer" />
                <div className="h-3 w-14 rounded-sm skeleton-shimmer" />
              </div>
              <div className="space-y-1.5">
                <div className="h-3 w-full rounded-sm skeleton-shimmer" />
                <div className="h-3 w-4/5 rounded-sm skeleton-shimmer" />
              </div>
            </div>
          </div>
        </div>
      ))}
      <span className="sr-only">Loading bookmarks</span>
    </div>
  );
}
