"use client";

import { useCallback, useState, type RefObject } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { BookmarkCard } from "@/components/bookmark-card";
import { GridBookmarkCard } from "@/components/grid-bookmark-card";
import { getBookmarkListContainerClassName } from "@/lib/bookmark-feed-layout";
import { useScrollElement } from "@/hooks/use-scroll-element";
import { useVirtualListFocus } from "@/hooks/use-virtual-list-focus";
import { getStaggerClass } from "@/lib/stagger";
import type { ViewMode, BookmarkWithRelations } from "@/types";

const FEED_ROW_ESTIMATE_PX = 168;
const COMPACT_ROW_ESTIMATE_PX = 72;

interface BookmarkListProps {
  scrollRef: RefObject<HTMLElement | null>;
  bookmarks: BookmarkWithRelations[];
  viewMode: ViewMode;
  searchQuery?: string;
  aboveFoldMediaBookmarkIds: ReadonlySet<string>;
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
  onDelete?: (bookmarkIds: string | string[]) => void;
  deleteLabel?: string;
  performanceHighlightId?: string | null;
  /** Collection detail paginates ≤20 rows — skip virtualizer (broken with this scroll shell). */
  disableVirtualization?: boolean;
}

type BookmarkRowListProps = Omit<BookmarkListProps, "disableVirtualization"> & {
  expandedCompactBookmarkIds: Set<string>;
  onCompactExpandedChange: (bookmarkId: string, expanded: boolean) => void;
  viewMode: Exclude<ViewMode, "grid">;
};

function VirtualizedBookmarkRows({
  scrollRef,
  bookmarks,
  viewMode,
  searchQuery,
  aboveFoldMediaBookmarkIds,
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
  deleteLabel,
  performanceHighlightId,
  expandedCompactBookmarkIds,
  onCompactExpandedChange,
}: BookmarkRowListProps) {
  const scrollElement = useScrollElement(scrollRef);
  const rowEstimate =
    viewMode === "compact" ? COMPACT_ROW_ESTIMATE_PX : FEED_ROW_ESTIMATE_PX;

  // TanStack Virtual returns functions that cannot be memoized — React Compiler
  // skips this component by design. Suppressed until the library addresses it.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: bookmarks.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => rowEstimate,
    overscan: 4,
  });

  const focusedBookmarkId = selectionMode ? null : activeBookmarkId;

  useVirtualListFocus(virtualizer, bookmarks, focusedBookmarkId);

  const listContainerClass = getBookmarkListContainerClassName(viewMode);
  const virtualItems = scrollElement ? virtualizer.getVirtualItems() : [];
  const useStaticFallback =
    bookmarks.length > 0 &&
    (!scrollElement || virtualItems.length === 0);

  if (useStaticFallback) {
    return (
      <StaticBookmarkRows
        bookmarks={bookmarks}
        viewMode={viewMode}
        searchQuery={searchQuery}
        aboveFoldMediaBookmarkIds={aboveFoldMediaBookmarkIds}
        selectionMode={selectionMode}
        selectedBookmarkIdSet={selectedBookmarkIdSet}
        activeBookmarkId={activeBookmarkId}
        onSelect={onSelect}
        onSelectionChange={onSelectionChange}
        onTagClick={onTagClick}
        onAddTag={onAddTag}
        onAddToCollection={onAddToCollection}
        onAddNote={onAddNote}
        onOpenExpanded={onOpenExpanded}
        onDelete={onDelete}
        deleteLabel={deleteLabel}
        performanceHighlightId={performanceHighlightId}
        expandedCompactBookmarkIds={expandedCompactBookmarkIds}
        onCompactExpandedChange={onCompactExpandedChange}
      />
    );
  }

  return (
    <div className={listContainerClass}>
      <div
        className="relative w-full"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualItems.map((virtualRow) => {
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
                priorityMedia={aboveFoldMediaBookmarkIds.has(bookmark.id)}
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
                onDelete={onDelete ? (id) => onDelete(id) : undefined}
                deleteLabel={deleteLabel}
                className={getStaggerClass(index, "animate-fade-in")}
                isPerformanceHighlight={performanceHighlightId === bookmark.id}
                compactExpanded={
                  viewMode === "compact" &&
                  expandedCompactBookmarkIds.has(bookmark.id)
                }
                onCompactExpandedChange={
                  viewMode === "compact" ? onCompactExpandedChange : undefined
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StaticBookmarkRows({
  bookmarks,
  viewMode,
  searchQuery,
  aboveFoldMediaBookmarkIds,
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
  deleteLabel,
  performanceHighlightId,
  expandedCompactBookmarkIds,
  onCompactExpandedChange,
}: Omit<BookmarkRowListProps, "scrollRef">) {
  const listContainerClass = getBookmarkListContainerClassName(viewMode);

  return (
    <div className={listContainerClass}>
      {bookmarks.map((bookmark, index) => (
        <BookmarkCard
          key={bookmark.id}
          bookmark={bookmark}
          viewMode={viewMode}
          searchQuery={searchQuery}
          rank={index + 1}
          priorityMedia={aboveFoldMediaBookmarkIds.has(bookmark.id)}
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
          onDelete={onDelete ? (id) => onDelete(id) : undefined}
          deleteLabel={deleteLabel}
          className={getStaggerClass(index, "animate-fade-in")}
          isPerformanceHighlight={performanceHighlightId === bookmark.id}
          compactExpanded={
            viewMode === "compact" && expandedCompactBookmarkIds.has(bookmark.id)
          }
          onCompactExpandedChange={
            viewMode === "compact" ? onCompactExpandedChange : undefined
          }
        />
      ))}
    </div>
  );
}

export function BookmarkList({
  scrollRef,
  bookmarks,
  viewMode,
  searchQuery,
  aboveFoldMediaBookmarkIds,
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
  deleteLabel,
  performanceHighlightId,
  disableVirtualization = false,
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

  if (viewMode === "grid") {
    return (
      <div className="columns-1 gap-3 p-3 sm:columns-2 lg:columns-3 xl:columns-4 2xl:columns-5">
        {bookmarks.map((bookmark, i) => (
          <GridBookmarkCard
            key={bookmark.id}
            bookmark={bookmark}
            searchQuery={searchQuery}
            priorityMedia={aboveFoldMediaBookmarkIds.has(bookmark.id)}
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

  const rowProps = {
    bookmarks,
    viewMode: viewMode as Exclude<ViewMode, "grid">,
    searchQuery,
    aboveFoldMediaBookmarkIds,
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
    deleteLabel,
    performanceHighlightId,
    expandedCompactBookmarkIds,
    onCompactExpandedChange: handleCompactExpandedChange,
  };

  if (disableVirtualization) {
    return <StaticBookmarkRows {...rowProps} />;
  }

  return <VirtualizedBookmarkRows scrollRef={scrollRef} {...rowProps} />;
}
