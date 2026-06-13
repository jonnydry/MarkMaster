"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, ChevronUp, FolderOpen, Layers } from "lucide-react";
import { type RefObject } from "react";

import { AppPageCenter } from "@/components/app-page-shell";
import { BookmarkCard } from "@/components/bookmark-card";
import { Button } from "@/components/ui/button";
import {
  bookmarkCollectionCardCellClassName,
  bookmarkCollectionRowSyncedClassName,
  bookmarkCollectionRowWithReorderClassName,
  bookmarkFeedMaxWidthClassName,
} from "@/lib/bookmark-feed-layout";
import type { CollectionItemRow } from "@/hooks/use-collection-detail-page";
import { cn } from "@/lib/utils";

type CollectionDetailBookmarkListProps = {
  scrollRef: RefObject<HTMLElement | null>;
  sortedItems: CollectionItemRow[];
  isSyncedFromX: boolean;
  canReorder: boolean;
  aboveFoldMediaBookmarkId: string | null;
  activeBookmarkId: string | null;
  reordering: boolean;
  onSelectBookmark: (id: string) => void;
  onRemoveItem: (bookmarkId: string) => void;
  onMoveItem: (fromIndex: number, direction: -1 | 1) => void;
  onGoToDashboard: () => void;
};

export function CollectionDetailBookmarkList({
  scrollRef,
  sortedItems,
  isSyncedFromX,
  canReorder,
  aboveFoldMediaBookmarkId,
  activeBookmarkId,
  reordering,
  onSelectBookmark,
  onRemoveItem,
  onMoveItem,
  onGoToDashboard,
}: CollectionDetailBookmarkListProps) {
  const virtualizer = useVirtualizer({
    count: sortedItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 168,
    overscan: 4,
  });

  if (sortedItems.length === 0) {
    return (
      <div className="py-20 text-center">
        <div className="mx-auto max-w-md surface-card px-6 py-8">
          {isSyncedFromX ? (
            <FolderOpen className="mx-auto mb-4 h-10 w-10 text-muted-foreground/50" />
          ) : (
            <Layers className="mx-auto mb-4 h-10 w-10 text-muted-foreground/50" />
          )}
          <p className="text-muted-foreground">
            No bookmarks in this collection yet.
            <br />
            Add bookmarks from the dashboard.
          </p>
          {!isSyncedFromX && (
            <div className="mt-4 flex justify-center">
              <Button variant="outline" size="sm" onClick={onGoToDashboard}>
                Go to dashboard
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const showReorderControls = canReorder && !isSyncedFromX;

  return (
    <div
      className="relative w-full"
      style={{ height: `${virtualizer.getTotalSize()}px` }}
    >
      {virtualizer.getVirtualItems().map((virtualRow) => {
        const item = sortedItems[virtualRow.index];
        const index = virtualRow.index;

        return (
          <div
            key={item.id}
            data-index={virtualRow.index}
            ref={virtualizer.measureElement}
            className={cn(
              "group absolute top-0 left-0 flex w-full gap-2 sm:gap-3",
              isSyncedFromX
                ? bookmarkCollectionRowSyncedClassName
                : bookmarkCollectionRowWithReorderClassName
            )}
            style={{ transform: `translateY(${virtualRow.start}px)` }}
          >
            {showReorderControls ? (
              <div className="flex shrink-0 flex-col items-center justify-center gap-1 px-0.5 opacity-100 transition-opacity sm:px-1.5 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="h-6 w-6 border border-transparent text-muted-foreground hover:border-hairline-soft hover:bg-accent-soft hover:text-foreground sm:h-7 sm:w-7"
                  disabled={reordering || index === 0}
                  onClick={() => onMoveItem(index, -1)}
                  aria-label="Move bookmark up"
                >
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="h-6 w-6 border border-transparent text-muted-foreground hover:border-hairline-soft hover:bg-accent-soft hover:text-foreground sm:h-7 sm:w-7"
                  disabled={reordering || index === sortedItems.length - 1}
                  onClick={() => onMoveItem(index, 1)}
                  aria-label="Move bookmark down"
                >
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            ) : null}
            <div
              className={
                isSyncedFromX ? "min-w-0 flex-1" : bookmarkCollectionCardCellClassName
              }
            >
              <BookmarkCard
                bookmark={item.bookmark}
                viewMode="feed"
                priorityMedia={item.bookmark.id === aboveFoldMediaBookmarkId}
                selected={activeBookmarkId === item.bookmark.id}
                onSelect={onSelectBookmark}
                onDelete={
                  isSyncedFromX ? undefined : () => onRemoveItem(item.bookmark.id)
                }
                deleteLabel={isSyncedFromX ? undefined : "Remove from collection"}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function CollectionDetailDescription({
  description,
}: {
  description: string;
}) {
  return (
    <div className="border-b border-hairline-soft py-4">
      <p
        className={cn(
          "mx-auto text-sm leading-6 text-muted-foreground",
          bookmarkFeedMaxWidthClassName
        )}
      >
        {description}
      </p>
    </div>
  );
}

export function CollectionDetailLoadingState() {
  return (
    <AppPageCenter>
      <div className="mx-auto w-full max-w-4xl space-y-4 px-6">
        <div className="h-8 w-48 rounded skeleton-shimmer" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="surface-solid px-4 py-4">
              <div className="flex gap-3">
                <div className="h-9 w-9 shrink-0 rounded-full skeleton-shimmer" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-24 rounded skeleton-shimmer" />
                  <div className="h-3 w-full rounded skeleton-shimmer" />
                  <div className="h-3 w-4/5 rounded skeleton-shimmer" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppPageCenter>
  );
}

export function CollectionDetailErrorState({
  isNotFound,
  onRetry,
  onBack,
}: {
  isNotFound: boolean;
  onRetry: () => void;
  onBack: () => void;
}) {
  return (
    <AppPageCenter className="flex-col gap-4 px-6">
      <div className="max-w-md surface-solid p-6 text-center">
        <p className="text-sm font-medium text-foreground">
          {isNotFound ? "Collection not found" : "Collection could not be loaded"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {isNotFound
            ? "This collection does not exist or has been deleted."
            : "It may have been deleted or you may not have access."}
        </p>
        <div className="mt-3 flex items-center justify-center gap-2">
          <Button size="sm" variant="outline" onClick={onRetry}>
            Retry
          </Button>
          <Button size="sm" variant="outline" onClick={onBack}>
            Back to collections
          </Button>
        </div>
      </div>
    </AppPageCenter>
  );
}
