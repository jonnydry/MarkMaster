"use client";

import { Suspense, useRef } from "react";
import dynamic from "next/dynamic";
import { AppPageCenter, AppPageShell } from "@/components/app-page-shell";
import { DashboardToolbar } from "@/components/dashboard-toolbar";
import { Sidebar } from "@/components/sidebar-dynamic";
import { MobileSidebar } from "@/components/mobile-sidebar";
import { FilterPanel } from "@/components/filter-panel";
import { PageHeader } from "@/components/page-header";
import { DASHBOARD_SHORTCUT_GROUPS } from "@/hooks/use-keyboard-shortcuts";
import { useDashboardDiscovery } from "@/hooks/use-dashboard-discovery";
import { useDashboardPage } from "@/hooks/use-dashboard-page";
import { bookmarkFeedColumnClassName } from "@/lib/bookmark-feed-layout";
import { highlightActiveClass } from "@/lib/highlight-chrome";
import { cn } from "@/lib/utils";
import { DashboardDiscovery } from "@/components/dashboard-discovery";
import { PageWatermark } from "@/components/page-watermark";
import { BookmarkList } from "./bookmark-list";
import { DashboardSkeleton } from "./dashboard-skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { RetryButton } from "@/components/ui/retry-button";
import { ScrollingProgressBar } from "@/components/ui/scrolling-progress-bar";
import { PaginationControls } from "@/components/pagination-controls";
import { Button } from "@/components/ui/button";
import { SyncButton } from "@/components/sync-button";
import { Bookmark } from "lucide-react";
import { SelectionToolbar } from "./selection-toolbar";

const CommandPalette = dynamic(
  () => import("@/components/command-palette").then((m) => m.CommandPalette),
  { ssr: false }
);

const AddTagDialog = dynamic(
  () => import("@/components/add-tag-dialog").then((m) => m.AddTagDialog),
  { ssr: false }
);

const AddNoteDialog = dynamic(
  () => import("@/components/add-note-dialog").then((m) => m.AddNoteDialog),
  { ssr: false }
);

const AddToCollectionDialog = dynamic(
  () =>
    import("@/components/add-to-collection-dialog").then(
      (m) => m.AddToCollectionDialog
    ),
  { ssr: false }
);

const CreateCollectionDialog = dynamic(
  () =>
    import("@/components/create-collection-dialog").then(
      (m) => m.CreateCollectionDialog
    ),
  { ssr: false }
);

const GridBookmarkOverlay = dynamic(
  () =>
    import("@/components/grid-bookmark-overlay").then(
      (m) => m.GridBookmarkOverlay
    ),
  { ssr: false }
);

const KeyboardShortcutsDialog = dynamic(
  () =>
    import("@/components/keyboard-shortcuts-dialog").then(
      (m) => m.KeyboardShortcutsDialog
    ),
  { ssr: false }
);

function DashboardContent() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const {
    filters,
    actions,
    createCollection,
    createCollectionQuick,
    tags,
    collections,
    libraryStats,
    dbUser,
    viewMode,
    setViewMode,
    showFilters,
    setShowFilters,
    tagDialogOpen,
    setTagDialogOpen,
    noteDialogOpen,
    setNoteDialogOpen,
    collectionDialogOpen,
    setCollectionDialogOpen,
    createCollectionOpen,
    setCreateCollectionOpen,
    setActiveBookmarkId,
    keyboardShortcutsOpen,
    setKeyboardShortcutsOpen,
    commandPaletteOpen,
    setCommandPaletteOpen,
    selectionMode,
    setSelectionMode,
    tagTargetIds,
    setTagTargetIds,
    collectionTargetIds,
    setCollectionTargetIds,
    searchInputRef,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
    feedReady,
    bookmarks,
    total,
    totalPages,
    prefetchBookmarkPage,
    handlePageChange,
    performanceFocusedId,
    setBookmarkId,
    visibleSelectedBookmarkIds,
    selectedBookmarkIdSet,
    searchQuery,
    aboveFoldMediaBookmarkId,
    dialogTagIds,
    dialogCollectionIds,
    activeBookmarkIdForView,
    activeBookmark,
    gridOverlayBookmark,
    clearSelection,
    toggleBookmarkSelection,
    selectVisibleBookmarks,
    openBulkTagDialog,
    openBulkCollectionDialog,
    handleBulkHide,
    handleBookmarkAddTag,
    handleBookmarkAddToCollection,
    handleBookmarkAddNote,
    handleExpandedBookmarkOpen,
    handleBookmarkSelect,
    handleGridOverlayOpenChange,
    handleGridOverlayReviewInOrbit,
    focusPerformanceHighlight,
    handleSaveGemsAsCollection,
    handleSyncComplete,
    handleSyncStateChange,
    handleCreateCollectionOpen,
    handleCommandPaletteFilter,
    primaryFilterLabel,
    primaryFilterCompactLabel,
    syncProgressVisible,
    selectedTagEntries,
  } = useDashboardPage();

  const {
    hasMixContent: discoveryAvailable,
    rawTotal: discoveryUntouchedCount,
    isLoading: discoveryLoading,
  } = useDashboardDiscovery({ feedReady });

  return (
    <>
    <AppPageShell
      watermark={<PageWatermark variant="markmaster" />}
      sidebar={
        <Sidebar
          tags={tags}
          collections={collections}
          selectedTags={filters.selectedTags}
          onTagToggle={filters.toggleTag}
          onCreateCollection={handleCreateCollectionOpen}
          lastSyncAt={dbUser?.lastSyncAt ? new Date(dbUser.lastSyncAt) : null}
          totalBookmarks={libraryStats?.libraryBookmarkCount ?? total}
          onSyncComplete={handleSyncComplete}
          onSyncStateChange={handleSyncStateChange}
        />
      }
      mainTop={
        syncProgressVisible ? (
          <ScrollingProgressBar className="relative z-50" />
        ) : null
      }
      scrollRef={scrollRef}
      mainProps={{ "aria-busy": syncProgressVisible }}
    >
          <PageHeader
            sticky
            feedChrome
            compactable
            bodyClassName="px-0 py-0"
          >
                <DashboardToolbar
                  mobileSidebar={
                    <MobileSidebar
                      tags={tags}
                      collections={collections}
                      selectedTags={filters.selectedTags}
                      onTagToggle={filters.toggleTag}
                      onCreateCollection={handleCreateCollectionOpen}
                      lastSyncAt={
                        dbUser?.lastSyncAt ? new Date(dbUser.lastSyncAt) : null
                      }
                      totalBookmarks={libraryStats?.libraryBookmarkCount ?? total}
                      onSyncComplete={handleSyncComplete}
                      onSyncStateChange={handleSyncStateChange}
                    />
                  }
                  search={filters.search}
                  onSearchChange={filters.setSearch}
                  searchInputRef={searchInputRef}
                  primaryFilterLabel={primaryFilterLabel}
                  primaryFilterCompactLabel={primaryFilterCompactLabel}
                  total={total}
                  onResetPrimaryFilter={() => {
                    filters.setSelectedTags([]);
                    filters.setMediaFilter("all");
                  }}
                  selectedTagEntries={selectedTagEntries}
                  onTagToggle={filters.toggleTag}
                  showFilters={showFilters}
                  onToggleFilters={() => setShowFilters((value) => !value)}
                  hasActiveFilters={filters.hasActiveFilters}
                  selectionMode={selectionMode}
                  onToggleSelectionMode={() => {
                    if (selectionMode) {
                      clearSelection();
                    } else {
                      setSelectionMode(true);
                    }
                  }}
                  onOpenKeyboardShortcuts={() => setKeyboardShortcutsOpen(true)}
                  sortField={filters.sortField}
                  viewMode={viewMode}
                  onSortFieldChange={filters.setSortField}
                  onViewModeChange={setViewMode}
                  user={dbUser ?? undefined}
                  discoveryAvailable={discoveryAvailable && !discoveryLoading}
                  discoveryUntouchedCount={discoveryUntouchedCount}
                />

                {(isFetching || filters.isSearchPending) && !isLoading && (
                  <p
                    role="status"
                    className="animate-slide-down-fade px-4 pb-1.5 text-xs text-muted-foreground sm:px-5"
                  >
                    Updating results...
                  </p>
                )}
                {selectionMode && (
                  <SelectionToolbar
                    selectedCount={visibleSelectedBookmarkIds.length}
                    onSelectPage={selectVisibleBookmarks}
                    onClear={clearSelection}
                    onTag={openBulkTagDialog}
                    onAddToCollection={openBulkCollectionDialog}
                    onHide={handleBulkHide}
                  />
                )}
                {showFilters && (
                  <div id="dashboard-filter-panel" className="animate-slide-down-fade">
                    <FilterPanel
                      mediaFilter={filters.mediaFilter}
                      onMediaFilterChange={filters.setMediaFilter}
                      authorFilter={filters.authorFilter}
                      onAuthorFilterChange={filters.setAuthorFilter}
                      dateFrom={filters.dateFrom}
                      dateTo={filters.dateTo}
                      onDateFromChange={filters.setDateFrom}
                      onDateToChange={filters.setDateTo}
                      selectedTags={filters.selectedTags}
                      onTagToggle={filters.toggleTag}
                      tags={tags}
                      onClearAll={filters.clearFilters}
                      hasActiveFilters={filters.hasActiveFilters}
                    />
                  </div>
                )}
              </PageHeader>

          {!isError && (
            <DashboardDiscovery
              feedReady={feedReady}
              activeBookmarkId={activeBookmarkIdForView}
              onSelectBookmark={setActiveBookmarkId}
              onFocusForTriage={focusPerformanceHighlight}
              onSaveAsCollection={handleSaveGemsAsCollection}
              viewMode={viewMode}
            />
          )}

          {isLoading ? (
            <DashboardSkeleton viewMode={viewMode} />
          ) : isError ? (
            <div className={cn(bookmarkFeedColumnClassName, "flex h-72 items-center justify-center px-6")}>
              <ErrorState
                title="Bookmarks could not be loaded"
                description={error instanceof Error ? error.message : "Please try again."}
                action={<RetryButton onClick={() => refetch()} className="mt-0" />}
              />
            </div>
          ) : bookmarks.length === 0 ? (
            <div className={cn(bookmarkFeedColumnClassName, "flex h-72 items-center justify-center px-4 sm:px-6")}>
              <EmptyState
                layout="panel"
                icon={Bookmark}
                title={
                  filters.search || filters.hasActiveFilters ? "No matches" : "Nothing in Orbit"
                }
                description={
                  filters.search || filters.hasActiveFilters
                    ? "Try a different search or adjust the filters."
                    : "Library ready. Highlights will surface the next standouts for Orbit review."
                }
                action={
                  filters.search || filters.hasActiveFilters ? (
                    <Button variant="outline" size="sm" onClick={filters.clearFilters}>
                      Clear filters
                    </Button>
                  ) : (
                    <div className="mx-auto max-w-sm">
                      <SyncButton
                        lastSyncAt={dbUser?.lastSyncAt ? new Date(dbUser.lastSyncAt) : null}
                        onSyncComplete={handleSyncComplete}
                        onSyncStateChange={handleSyncStateChange}
                        detail="full"
                      />
                    </div>
                  )
                }
              />
            </div>
          ) : (
            <>
              {performanceFocusedId && (
                <div className={cn("animate-slide-down-fade pb-2", bookmarkFeedColumnClassName)}>
                  <div className={cn("flex flex-wrap items-center gap-2 rounded-sm border px-3 py-1.5 text-sm", highlightActiveClass)}>
                    <span className="text-2xs font-bold uppercase tracking-[0.08em] text-primary">
                      Performance Highlight
                    </span>
                    <span className="text-muted-foreground text-xs">
                      Focused for quick tagging &amp; categorization
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setBookmarkId("");
                        setActiveBookmarkId(null);
                      }}
                      className="ml-auto rounded-sm border border-transparent px-2 py-0.5 text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45"
                    >
                      Exit focus
                    </button>
                  </div>
                </div>
              )}

              <BookmarkList
                scrollRef={scrollRef}
                bookmarks={bookmarks}
                viewMode={viewMode}
                searchQuery={searchQuery}
                aboveFoldMediaBookmarkId={aboveFoldMediaBookmarkId}
                selectionMode={selectionMode}
                selectedBookmarkIdSet={selectedBookmarkIdSet}
                activeBookmarkId={
                  selectionMode ? null : activeBookmarkIdForView
                }
                onSelect={handleBookmarkSelect}
                onSelectionChange={toggleBookmarkSelection}
                onTagClick={filters.toggleTag}
                onAddTag={handleBookmarkAddTag}
                onAddToCollection={handleBookmarkAddToCollection}
                onAddNote={handleBookmarkAddNote}
                onOpenExpanded={handleExpandedBookmarkOpen}
                onDelete={actions.handleDeleteBookmark}
                performanceHighlightId={performanceFocusedId}
              />
            </>
          )}

          {!isLoading && !isError && bookmarks.length > 0 && (
            <div className={bookmarkFeedColumnClassName}>
              <PaginationControls
                page={filters.page}
                totalPages={totalPages}
                onPageChange={handlePageChange}
                onPrefetchPage={prefetchBookmarkPage}
              />
            </div>
          )}
    </AppPageShell>

      {tagDialogOpen ? (
        <AddTagDialog
          open
          onOpenChange={(open) => {
            setTagDialogOpen(open);
            if (!open) {
              setTagTargetIds([]);
            }
          }}
          bookmarkIds={tagTargetIds}
          existingTags={tags}
          onAddTag={actions.handleAddTag}
          onRemoveTag={actions.handleRemoveTag}
          bookmarkTags={dialogTagIds}
        />
      ) : null}

      {keyboardShortcutsOpen ? (
        <KeyboardShortcutsDialog
          open
          onOpenChange={setKeyboardShortcutsOpen}
          groups={DASHBOARD_SHORTCUT_GROUPS}
          description="Dashboard navigation and quick actions."
        />
      ) : null}

      {gridOverlayBookmark ? (
        <GridBookmarkOverlay
          open
          onOpenChange={handleGridOverlayOpenChange}
          bookmark={gridOverlayBookmark}
          onAddTag={handleBookmarkAddTag}
          onAddToCollection={handleBookmarkAddToCollection}
          onAddNote={handleBookmarkAddNote}
          onReviewInOrbit={handleGridOverlayReviewInOrbit}
          onDelete={actions.handleDeleteBookmark}
        />
      ) : null}

      {noteDialogOpen ? (
        <AddNoteDialog
          open
          onOpenChange={setNoteDialogOpen}
          bookmarkId={activeBookmarkIdForView}
          existingNoteId={activeBookmark?.notes[0]?.id}
          existingNote={activeBookmark ? activeBookmark.notes[0]?.content : undefined}
          onSave={actions.handleAddNote}
          onDelete={actions.handleDeleteNote}
        />
      ) : null}

      {collectionDialogOpen ? (
        <AddToCollectionDialog
          open
          onOpenChange={(open) => {
            setCollectionDialogOpen(open);
            if (!open) {
              setCollectionTargetIds([]);
            }
          }}
          bookmarkIds={collectionTargetIds}
          collections={collections}
          bookmarkCollections={dialogCollectionIds}
          onAddToCollection={actions.handleAddToCollection}
          onCreateCollection={createCollectionQuick}
        />
      ) : null}

      {createCollectionOpen ? (
        <CreateCollectionDialog
          open
          onOpenChange={setCreateCollectionOpen}
          onCreateCollection={createCollection}
        />
      ) : null}

      {commandPaletteOpen ? (
        <CommandPalette
          open
          onOpenChange={setCommandPaletteOpen}
          tags={tags}
          onFilterChange={handleCommandPaletteFilter}
        />
      ) : null}
    </>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <AppPageCenter>
          <div role="status" aria-label="Loading" className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </AppPageCenter>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
