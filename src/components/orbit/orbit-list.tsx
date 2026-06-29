"use client";

import { type RefObject } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";
import { useScrollElement } from "@/hooks/use-scroll-element";
import { useVirtualListFocus } from "@/hooks/use-virtual-list-focus";
import type { BookmarkWithRelations, OrbitBookmarkDecision } from "@/types";

import { orbitHairlineBorder } from "@/lib/orbit-route-chrome";
import { OrbitListRow } from "./orbit-list-row";

const ORBIT_ROW_ESTIMATE_PX = 152;

interface OrbitListProps {
  scrollRef?: RefObject<HTMLElement | null>;
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
      <div className="mt-1 h-10 w-[3px] shrink-0 rounded-[2px] skeleton-shimmer" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-2.5 w-40 rounded-sm skeleton-shimmer" />
        <div className="h-3.5 w-full rounded-sm skeleton-shimmer" />
        <div className="h-3.5 w-full rounded-sm skeleton-shimmer" />
        <div className="h-3.5 w-4/5 rounded-sm skeleton-shimmer" />
        <div className="flex justify-end pt-0.5">
          <div className="h-20 w-20 shrink-0 rounded-sm skeleton-shimmer" />
        </div>
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <div className="h-4 w-16 rounded-sm skeleton-shimmer" />
          <div className="h-7 w-16 rounded-sm skeleton-shimmer" />
        </div>
      </div>
    </div>
  );
}

function OrbitListStatic({
  bookmarks,
  selectedId,
  onSelect,
  onQuickAction,
  className,
  selectionMode,
  selectedIds,
  onToggleSelect,
  getDecision,
  dismissedBookmarkIds,
  appliedBookmarkIds,
}: Omit<OrbitListProps, "scrollRef" | "isLoading">) {
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
          onQuickAction={onQuickAction}
          onToggleSelect={onToggleSelect}
        />
      ))}
    </div>
  );
}

export function OrbitList({
  scrollRef,
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
  const scrollElement = useScrollElement(scrollRef);
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: bookmarks.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => ORBIT_ROW_ESTIMATE_PX,
    overscan: 5,
  });

  const focusedId = selectionMode ? null : selectedId;

  useVirtualListFocus(virtualizer, bookmarks, focusedId);

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
    return null;
  }

  const virtualItems = scrollElement ? virtualizer.getVirtualItems() : [];
  const useStaticFallback =
    bookmarks.length > 0 &&
    (!scrollElement || virtualItems.length === 0);

  if (useStaticFallback) {
    return (
      <OrbitListStatic
        bookmarks={bookmarks}
        selectedId={selectedId}
        onSelect={onSelect}
        onQuickAction={onQuickAction}
        className={className}
        selectionMode={selectionMode}
        selectedIds={selectedIds}
        onToggleSelect={onToggleSelect}
        getDecision={getDecision}
        dismissedBookmarkIds={dismissedBookmarkIds}
        appliedBookmarkIds={appliedBookmarkIds}
      />
    );
  }

  return (
    <div className={cn("relative w-full", className)}>
      <div
        className="relative w-full"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualItems.map((virtualRow) => {
          const bookmark = bookmarks[virtualRow.index];

          return (
            <div
              key={bookmark.id}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="absolute top-0 left-0 w-full"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <OrbitListRow
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
