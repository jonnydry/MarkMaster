import { getStaggerClass } from "@/lib/stagger";
import type { ViewMode } from "@/types";

interface DashboardSkeletonProps {
  viewMode: ViewMode;
}

export function DashboardSkeleton({ viewMode }: DashboardSkeletonProps) {
  if (viewMode === "grid") {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 p-3" role="status" aria-live="polite" aria-label="Loading bookmarks">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className={`rounded-xl border border-hairline-soft bg-surface-1 p-3 shadow-sm ${getStaggerClass(i, "animate-fade-in") ?? ""}`}
          >
            <div className="aspect-video w-full rounded-lg skeleton-shimmer mb-3" />
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-3 w-20 rounded skeleton-shimmer" />
                <div className="h-3 w-14 rounded skeleton-shimmer" />
              </div>
              <div className="h-3 w-full rounded skeleton-shimmer" />
              <div className="h-3 w-4/5 rounded skeleton-shimmer" />
            </div>
          </div>
        ))}
        <span className="sr-only">Loading bookmarks</span>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-0" role="status" aria-live="polite" aria-label="Loading bookmarks">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className={`border-b border-border px-4 py-3 sm:px-5 ${getStaggerClass(i, "animate-fade-in") ?? ""}`}
        >
          <div className="flex gap-4">
            <div className="w-10 h-10 rounded-full skeleton-shimmer shrink-0" />
            <div className="flex-1 space-y-2.5">
              <div className="flex items-center gap-2">
                <div className="h-3.5 w-20 rounded skeleton-shimmer" />
                <div className="h-3 w-14 rounded skeleton-shimmer" />
              </div>
              <div className="space-y-1.5">
                <div className="h-3 w-full rounded skeleton-shimmer" />
                <div className="h-3 w-4/5 rounded skeleton-shimmer" />
              </div>
            </div>
          </div>
        </div>
      ))}
      <span className="sr-only">Loading bookmarks</span>
    </div>
  );
}
