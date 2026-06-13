"use client";

import { useCallback, useState, type RefObject } from "react";
import dynamic from "next/dynamic";
import { useVirtualizer } from "@tanstack/react-virtual";
import { BookmarkCard } from "@/components/bookmark-card";
import { getBookmarkListContainerClassName } from "@/lib/bookmark-feed-layout";
import { useVirtualListFocus } from "@/hooks/use-virtual-list-focus";
import { getStaggerClass } from "@/lib/stagger";
import type { ViewMode, BookmarkWithRelations } from "@/types";

const GridBookmarkCard = dynamic(
  () =>
    import("@/components/grid-bookmark-card").then((m) => m.GridBookmarkCard),
  {
    ssr: false,
    loading: () => (
      <div className="mb-3 h-48 break-inside-avoid surface-veil" />
    ),
  }
);

const FEED_ROW_ESTIMATE_PX = 168;
const COMPACT_ROW_ESTIMATE_PX = 72;

interface BookmarkListProps {
  scrollRef: RefObject<HTMLElement | null>;
  bookmarks: BookmarkWithRelations[];
  viewMode: ViewMode;
  searchQuery?: string;
  aboveFoldMediaBookmarkId: string | null;
  selectionMode: boolean;
  selectedBookmarkIdSet: Set<string>;
  activeBookmarkId: string | null;
  onSelect: (id: string) => void;
  onSelectionChange: (id: string, selected: boolean) => void;
  onTagClick: (tagId: string) => void;
  onAddTag: (id: string) => void;
  onAddToCollection: (id: string) => void;
  onAddNote: (id: string) => void;
  onOpenExpanded: (id: string) => void;
  onDelete: (bookmarkIds: string | string[]) => void;
  performanceHighlightId?: string | null;
}

export function BookmarkList({
  scrollRef,
  bookmarks,
  viewMode,
  searchQuery,
  aboveFoldMediaBookmarkId,
  selectionMode,
  selectedBookmarkIdSet,
  activeBookmarkId,
  onSelect,
  onSelectionChange,
  onTagClick,
  onAddTag,
  onAddToCollection,
  onAddNote,
  onOpenExpanded,
  onDelete,
  performanceHighlightId,
}: BookmarkListProps) {
  const [expandedCompactBookmarkIds, setExpandedCompactBookmarkIds] = useState<
    Set<string>
  >(() => new Set());

  const handleCompactExpandedChange = useCallback(
    (bookmarkId: string, expanded: boolean) => {
      setExpandedCompactBookmarkIds((current) => {
        const next = new Set(current);
        if (expanded) {
          next.add(bookmarkId);
        } else {
          next.delete(bookmarkId);
        }
        return next;
      });
    },
    []
  );

  const rowEstimate =
    viewMode === "compact" ? COMPACT_ROW_ESTIMATE_PX : FEED_ROW_ESTIMATE_PX;

  const virtualizer = useVirtualizer({
    count: bookmarks.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowEstimate,
    overscan: 4,
  });

  const focusedBookmarkId =
    selectionMode || viewMode === "grid" ? null : activeBookmarkId;

  useVirtualListFocus(virtualizer, bookmarks, focusedBookmarkId);

  if (viewMode === "grid") {
    return (
      <div className="columns-1 gap-3 p-3 sm:columns-2 lg:columns-3 xl:columns-4 2xl:columns-5">
        {bookmarks.map((bookmark, i) => (
          <GridBookmarkCard
            key={bookmark.id}
            bookmark={bookmark}
            searchQuery={searchQuery}
            priorityMedia={bookmark.id === aboveFoldMediaBookmarkId}
            selected={
              selectionMode
                ? selectedBookmarkIdSet.has(bookmark.id)
                : activeBookmarkId === bookmark.id
            }
            onSelect={onSelect}
            selectionMode={selectionMode}
            onSelectionChange={onSelectionChange}
            onTagClick={onTagClick}
            onAddTag={onAddTag}
            onAddToCollection={onAddToCollection}
            onAddNote={onAddNote}
            className={getStaggerClass(i, "animate-fade-in-up")}
            isPerformanceHighlight={performanceHighlightId === bookmark.id}
          />
        ))}
      </div>
    );
  }

  const listContainerClass = getBookmarkListContainerClassName(viewMode);

  return (
    <div className={listContainerClass}>
      <div
        className="relative w-full"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const bookmark = bookmarks[virtualRow.index];
          const index = virtualRow.index;

          return (
            <div
              key={bookmark.id}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="absolute top-0 left-0 w-full"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <BookmarkCard
                bookmark={bookmark}
                viewMode={viewMode}
                searchQuery={searchQuery}
                rank={index + 1}
                priorityMedia={bookmark.id === aboveFoldMediaBookmarkId}
                selected={
                  selectionMode
                    ? selectedBookmarkIdSet.has(bookmark.id)
                    : activeBookmarkId === bookmark.id
                }
                onSelect={onSelect}
                selectionMode={selectionMode}
                onSelectionChange={onSelectionChange}
                onTagClick={onTagClick}
                onAddTag={onAddTag}
                onAddToCollection={onAddToCollection}
                onAddNote={onAddNote}
                onOpenExpanded={onOpenExpanded}
                onDelete={(id) => onDelete(id)}
                className={getStaggerClass(index, "animate-fade-in")}
                isPerformanceHighlight={performanceHighlightId === bookmark.id}
                compactExpanded={
                  viewMode === "compact" &&
                  expandedCompactBookmarkIds.has(bookmark.id)
                }
                onCompactExpandedChange={
                  viewMode === "compact" ? handleCompactExpandedChange : undefined
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
