"use client";

import { cn } from "@/lib/utils";
import type { BookmarkWithRelations, OrbitBookmarkDecision } from "@/types";

import { orbitHairlineBorder } from "@/lib/orbit-route-chrome";
import { OrbitListRow } from "./orbit-list-row";

interface OrbitListProps {
  bookmarks: BookmarkWithRelations[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onQuickAction?: (id: string, action: string, event?: React.MouseEvent) => void;
  className?: string;
  isLoading?: boolean;
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  getDecision?: (bookmarkId: string) => OrbitBookmarkDecision | null;
  dismissedBookmarkIds?: Set<string>;
  appliedBookmarkIds?: Set<string>;
}

function OrbitListRowSkeleton() {
  return (
    <div
      className={cn(
        "flex items-stretch gap-3 border-b px-5 py-2.5",
        orbitHairlineBorder()
      )}
    >
      <div className="mt-1 h-10 w-[3px] shrink-0 rounded-full skeleton-shimmer" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-2.5 w-40 rounded skeleton-shimmer" />
        <div className="h-3.5 w-full rounded skeleton-shimmer" />
        <div className="h-3.5 w-full rounded skeleton-shimmer" />
        <div className="h-3.5 w-4/5 rounded skeleton-shimmer" />
        <div className="flex justify-end pt-0.5">
          <div className="h-20 w-20 shrink-0 rounded-sm skeleton-shimmer" />
        </div>
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <div className="h-4 w-16 rounded skeleton-shimmer" />
          <div className="h-7 w-16 rounded-full skeleton-shimmer" />
        </div>
      </div>
    </div>
  );
}

export function OrbitList({
  bookmarks,
  selectedId,
  onSelect,
  onQuickAction,
  className,
  isLoading,
  selectionMode = false,
  selectedIds,
  onToggleSelect,
  getDecision,
  dismissedBookmarkIds,
  appliedBookmarkIds,
}: OrbitListProps) {

  if (isLoading) {
    return (
      <div className={cn("flex flex-col", className)} role="status" aria-label="Loading Orbit">
        {Array.from({ length: 6 }).map((_, index) => (
          <OrbitListRowSkeleton key={index} />
        ))}
      </div>
    );
  }

  if (bookmarks.length === 0) {
    return (
      <div className="flex h-40 flex-col items-center justify-center text-center text-primary/50">
        <div className="mb-1 text-[13px]">Queue is clear</div>
        <div className="text-xs text-primary/35">
          All caught up. New bookmarks will appear here.
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col", className)}>
      {bookmarks.map((bookmark) => (
        <OrbitListRow
          key={bookmark.id}
          bookmark={bookmark}
          selected={selectedId === bookmark.id}
          selectionMode={selectionMode}
          bulkSelected={selectedIds?.has(bookmark.id) ?? false}
          decision={getDecision?.(bookmark.id) ?? null}
          dismissedBookmarkIds={dismissedBookmarkIds}
          appliedBookmarkIds={appliedBookmarkIds}
          onSelect={onSelect}
          onToggleSelect={onToggleSelect}
          onQuickAction={onQuickAction}
        />
      ))}
    </div>
  );
}
