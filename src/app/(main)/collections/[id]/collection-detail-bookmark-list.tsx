"use client";

import { useMemo, type RefObject } from "react";
import { ChevronDown, ChevronUp, FolderOpen, Layers } from "lucide-react";

import { BookmarkList } from "@/app/(main)/dashboard/bookmark-list";
import { AppPageCenter } from "@/components/app-page-shell";
import { BookmarkCard } from "@/components/bookmark-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import {
  bookmarkCollectionCardCellClassName,
  bookmarkCollectionRowWithReorderClassName,
  bookmarkFeedMaxWidthClassName,
} from "@/lib/bookmark-feed-layout";
import type { CollectionItemRow } from "@/hooks/use-collection-detail-page";
import type { ViewMode } from "@/types";
import { cn } from "@/lib/utils";

type CollectionDetailBookmarkListProps = {
  scrollRef: RefObject<HTMLElement | null>;
  sortedItems: CollectionItemRow[];
  viewMode: ViewMode;
  isSyncedFromX: boolean;
  canReorder: boolean;
  aboveFoldMediaBookmarkIds: ReadonlySet<string>;
  activeBookmarkId: string | null;
  reordering: boolean;
  onSelectBookmark: (id: string) => void;
  onOpenExpanded: (id: string) => void;
  onRemoveItem: (bookmarkId: string) => void;
  onMoveItem: (fromIndex: number, direction: -1 | 1) => void;
  onGoToDashboard: () => void;
};

export function CollectionDetailBookmarkList({
  scrollRef,
  sortedItems,
  viewMode,
  isSyncedFromX,
  canReorder,
  aboveFoldMediaBookmarkIds,
  activeBookmarkId,
  reordering,
  onSelectBookmark,
  onOpenExpanded,
  onRemoveItem,
  onMoveItem,
  onGoToDashboard,
}: CollectionDetailBookmarkListProps) {
  const bookmarks = useMemo(
    () => sortedItems.map((item) => item.bookmark),
    [sortedItems]
  );
  const showReorderControls = canReorder && !isSyncedFromX && viewMode === "feed";

  if (sortedItems.length === 0) {
    return (
      <div className="py-20">
        <EmptyState
          layout="panel"
          icon={isSyncedFromX ? FolderOpen : Layers}
          title="No bookmarks in this collection yet"
          description="Add bookmarks from the dashboard."
          action={
            !isSyncedFromX ? (
              <Button variant="outline" size="sm" onClick={onGoToDashboard}>
                Go to dashboard
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  if (showReorderControls) {
    return (
      <div className="relative w-full">
        {sortedItems.map((item, index) => (
          <div
            key={item.id}
            className={cn(
              "group flex w-full gap-2 sm:gap-3",
              bookmarkCollectionRowWithReorderClassName
            )}
          >
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
            <div className={bookmarkCollectionCardCellClassName}>
              <BookmarkCard
                bookmark={item.bookmark}
                viewMode="feed"
                priorityMedia={aboveFoldMediaBookmarkIds.has(item.bookmark.id)}
                selected={activeBookmarkId === item.bookmark.id}
                onSelect={onSelectBookmark}
                onOpenExpanded={onOpenExpanded}
                onDelete={() => onRemoveItem(item.bookmark.id)}
                deleteLabel="Remove from collection"
              />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={bookmarkCollectionRowWithReorderClassName}>
      <BookmarkList
        scrollRef={scrollRef}
        bookmarks={bookmarks}
        viewMode={viewMode}
        aboveFoldMediaBookmarkIds={aboveFoldMediaBookmarkIds}
        selectionMode={false}
        selectedBookmarkIdSet={new Set()}
        activeBookmarkId={activeBookmarkId}
      onSelect={onSelectBookmark}
      onSelectionChange={() => {}}
      onTagClick={() => {}}
      onAddTag={() => {}}
      onAddToCollection={() => {}}
      onAddNote={() => {}}
      onOpenExpanded={onOpenExpanded}
      onDelete={isSyncedFromX ? undefined : (id) => onRemoveItem(id as string)}
      deleteLabel={isSyncedFromX ? undefined : "Remove from collection"}
      disableVirtualization
    />
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
    <AppPageCenter className="px-6">
      <ErrorState
        layout="page"
        title={isNotFound ? "Collection not found" : "Collection could not be loaded"}
        description={
          isNotFound
            ? "This collection does not exist or has been deleted."
            : "It may have been deleted or you may not have access."
        }
        action={
          <div className="flex items-center justify-center gap-2">
            <Button size="sm" variant="outline" onClick={onRetry}>
              Retry
            </Button>
            <Button size="sm" variant="outline" onClick={onBack}>
              Back to collections
            </Button>
          </div>
        }
      />
    </AppPageCenter>
  );
}
