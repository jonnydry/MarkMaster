"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { BookmarkCard } from "@/components/bookmark-card";
import { getBookmarkListContainerClassName } from "@/lib/bookmark-feed-layout";
import { getStaggerClass } from "@/lib/stagger";
import type { ViewMode, BookmarkWithRelations } from "@/types";

const GridBookmarkCard = dynamic(
  () =>
    import("@/components/grid-bookmark-card").then((m) => m.GridBookmarkCard),
  {
    ssr: false,
    loading: () => (
      <div className="mb-3 h-48 break-inside-avoid rounded-sm border border-hairline-soft bg-surface-1/55" />
    ),
  }
);

interface BookmarkListProps {
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
  onDelete: (bookmarkIds: string | string[]) => void;
  performanceHighlightId?: string | null;
}

export function BookmarkList({
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

  const listContainerClass = getBookmarkListContainerClassName(!!activeBookmarkId, viewMode);

  return (
    <div className={listContainerClass}>
      {bookmarks.map((bookmark, i) => (
        <BookmarkCard
          key={bookmark.id}
          bookmark={bookmark}
          viewMode={viewMode}
          searchQuery={searchQuery}
          rank={i + 1}
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
          onDelete={(id) => onDelete(id)}
          className={getStaggerClass(i, "animate-fade-in")}
          isPerformanceHighlight={performanceHighlightId === bookmark.id}
          compactExpanded={
            viewMode === "compact" && expandedCompactBookmarkIds.has(bookmark.id)
          }
          onCompactExpandedChange={
            viewMode === "compact" ? handleCompactExpandedChange : undefined
          }
        />
      ))}
    </div>
  );
}
