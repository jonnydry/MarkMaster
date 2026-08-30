"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { AppPageShell } from "@/components/app-page-shell";
import { PageHeader } from "@/components/page-header";
import { ViewModeControls } from "@/components/view-mode-controls";
import { KeyboardShortcutsHelpButton } from "@/components/keyboard-shortcuts-help-button";
import { PaginationControls } from "@/components/pagination-controls";
import { useBookmarkViewMode } from "@/hooks/use-bookmark-view-mode";
import { bookmarkFeedColumnClassName } from "@/lib/bookmark-feed-layout";
import {
  COLLECTION_DETAIL_SHORTCUT_GROUPS,
  useCollectionDetailPage,
} from "@/hooks/use-collection-detail-page";
import {
  CollectionDetailBookmarkList,
  CollectionDetailDescription,
  CollectionDetailErrorState,
  CollectionDetailLoadingState,
} from "./collection-detail-bookmark-list";
import {
  CollectionDetailBackButton,
  CollectionDetailHeaderActions,
  CollectionDetailTitle,
} from "./collection-detail-header";
import { CollectionDetailControlBar } from "./collection-detail-control-bar";

const ShareDialog = dynamic(
  () => import("@/components/share-dialog").then((m) => m.ShareDialog),
  { ssr: false }
);

const GridBookmarkOverlay = dynamic(
  () =>
    import("@/components/grid-bookmark-overlay").then((m) => m.GridBookmarkOverlay),
  { ssr: false }
);

export default function CollectionDetailClient({
  collectionId,
}: {
  collectionId: string;
}) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const { viewMode, setViewMode } = useBookmarkViewMode();
  const [gridOverlayBookmarkId, setGridOverlayBookmarkId] = useState<string | null>(
    null
  );
  const page = useCollectionDetailPage(collectionId, viewMode);
  const {
    collection,
    isPending,
    isFetching,
    isError,
    refetch,
    isNotFound,
    sortedItems,
    totalItems,
    totalPages,
    page: currentPage,
    handlePageChange,
    canReorder,
    prefetchCollectionPage,
    aboveFoldMediaBookmarkIds,
    isSyncedFromX,
    isUserCollection,
    itemCountLabel,
    editingName,
    name,
    setName,
    reordering,
    shareOpen,
    setShareOpen,
    shareContent,
    activeBookmarkId,
    setActiveBookmarkId,
    keyboardShortcutsOpen,
    setKeyboardShortcutsOpen,
    searchQuery,
    handleSearchChange,
    sortMode,
    handleSortModeChange,
    cancelEditingName,
    startEditingName,
    handleCopyAsCollection,
    handleTogglePublic,
    handleShareExpiryChange,
    handleCopyShareLink,
    handleRemoveItem,
    handleShareOnX,
    handleUpdateName,
    moveItem,
    goToCollections,
    goToDashboard,
  } = page;

  const bookmarkById = useMemo(
    () => new Map(sortedItems.map((item) => [item.bookmark.id, item.bookmark])),
    [sortedItems]
  );

  const gridOverlayBookmark = gridOverlayBookmarkId
    ? (bookmarkById.get(gridOverlayBookmarkId) ?? null)
    : null;

  const handleBookmarkSelect = useCallback(
    (id: string) => {
      setActiveBookmarkId(id);
      if (viewMode === "grid") {
        setGridOverlayBookmarkId(id);
      }
    },
    [setActiveBookmarkId, viewMode]
  );

  const handleExpandedBookmarkOpen = useCallback(
    (id: string) => {
      setActiveBookmarkId(id);
      setGridOverlayBookmarkId(id);
    },
    [setActiveBookmarkId]
  );

  const handleGridOverlayOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setGridOverlayBookmarkId(null);
    }
  }, []);

  const openBookmarkOnDashboard = useCallback(
    (id: string) => {
      router.push(`/dashboard?bookmark=${encodeURIComponent(id)}`);
    },
    [router]
  );

  if (isPending) {
    return <CollectionDetailLoadingState />;
  }

  if (isError || !collection) {
    return (
      <CollectionDetailErrorState
        isNotFound={isNotFound}
        onRetry={() => refetch()}
        onBack={goToCollections}
      />
    );
  }

  return (
    <>
    <AppPageShell scrollRef={scrollRef}>
        <PageHeader
          sticky
          titleClassName="text-2xl sm:text-3xl"
          title={
            <CollectionDetailTitle
              collection={collection}
              editingName={editingName}
              name={name}
              isSyncedFromX={isSyncedFromX}
              isUserCollection={isUserCollection}
              onNameChange={setName}
              onUpdateName={handleUpdateName}
              onCancelEditingName={cancelEditingName}
              onStartEditingName={startEditingName}
            />
          }
          description={itemCountLabel}
          leading={<CollectionDetailBackButton onBack={goToCollections} />}
          actions={
            <>
              <ViewModeControls
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                compact
              />
              <CollectionDetailHeaderActions
                collection={collection}
                sortedItemCount={totalItems}
                isSyncedFromX={isSyncedFromX}
                isUserCollection={isUserCollection}
                onCopyAsCollection={handleCopyAsCollection}
                onTogglePublic={handleTogglePublic}
                onShareExpiryChange={handleShareExpiryChange}
                onCopyShareLink={handleCopyShareLink}
                onShareOnX={handleShareOnX}
              />
              <KeyboardShortcutsHelpButton
                open={keyboardShortcutsOpen}
                onOpenChange={setKeyboardShortcutsOpen}
                groups={COLLECTION_DETAIL_SHORTCUT_GROUPS}
                description="Collection bookmark navigation and collection actions."
              />
            </>
          }
        />

        <main className="pb-10">
          {collection.description ? (
            <div className={bookmarkFeedColumnClassName}>
              <CollectionDetailDescription description={collection.description} />
            </div>
          ) : null}

          <div className={bookmarkFeedColumnClassName}>
            <CollectionDetailControlBar
              search={searchQuery}
              sort={sortMode}
              isUpdating={isFetching && !isPending}
              onSearchChange={handleSearchChange}
              onSortChange={handleSortModeChange}
            />
          </div>

          <CollectionDetailBookmarkList
            scrollRef={scrollRef}
            sortedItems={sortedItems}
            page={currentPage}
            totalPages={totalPages}
            viewMode={viewMode}
            isSyncedFromX={isSyncedFromX}
            canReorder={canReorder}
            aboveFoldMediaBookmarkIds={aboveFoldMediaBookmarkIds}
            activeBookmarkId={activeBookmarkId}
            reordering={reordering}
            onSelectBookmark={handleBookmarkSelect}
            onOpenExpanded={handleExpandedBookmarkOpen}
            onRemoveItem={handleRemoveItem}
            onMoveItem={moveItem}
            onGoToDashboard={goToDashboard}
            searchQuery={searchQuery}
            onClearSearch={() => handleSearchChange("")}
          />

          {sortedItems.length > 0 ? (
            <div className={bookmarkFeedColumnClassName}>
              <PaginationControls
                page={currentPage}
                totalPages={totalPages}
                onPageChange={handlePageChange}
                onPrefetchPage={prefetchCollectionPage}
              />
            </div>
          ) : null}
        </main>
    </AppPageShell>

      <ShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        shareContent={shareContent}
      />

      {gridOverlayBookmark ? (
        <GridBookmarkOverlay
          open
          onOpenChange={handleGridOverlayOpenChange}
          bookmark={gridOverlayBookmark}
          onAddTag={openBookmarkOnDashboard}
          onAddToCollection={openBookmarkOnDashboard}
          onAddNote={openBookmarkOnDashboard}
          onReviewInOrbit={(id) => router.push(`/orbit?highlightId=${id}`)}
          onDelete={
            isSyncedFromX
              ? () => {}
              : (id) => {
                  void handleRemoveItem(id);
                }
          }
        />
      ) : null}
    </>
  );
}
