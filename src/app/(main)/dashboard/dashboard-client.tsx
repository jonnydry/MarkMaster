"use client";

import { Suspense, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useAppChrome } from "@/components/app-frame";
import { AppPageCenter, AppPageShell } from "@/components/app-page-shell";
import { DashboardToolbar } from "@/components/dashboard-toolbar";
import { MobileSidebar } from "@/components/mobile-sidebar";
import { FilterPanel } from "@/components/filter-panel";
import { PageHeader } from "@/components/page-header";
import { DASHBOARD_SHORTCUT_GROUPS } from "@/hooks/use-keyboard-shortcuts";
import { useDashboardDiscovery } from "@/hooks/use-dashboard-discovery";
import { useDashboardPage } from "@/hooks/use-dashboard-page";
import { useDashboardRail } from "@/hooks/use-dashboard-rail";
import { useMediaQuery } from "@/hooks/use-media-query";
import { DashboardRail } from "@/components/dashboard-rail";
import { DashboardBookmarkInspector } from "@/components/dashboard-bookmark-inspector";
import { DashboardBookmarkWorkspace } from "@/components/dashboard-bookmark-workspace";
import {
  appDashboardInspectorClassName,
  appDashboardRailClassName,
  appDashboardRailMediaQuery,
} from "@/lib/app-layout";
import { bookmarkFeedColumnClassName } from "@/lib/bookmark-feed-layout";
import { cn } from "@/lib/utils";
import { DashboardDiscovery } from "@/components/dashboard-discovery";
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
  const searchParams = useSearchParams();
  const {
    filters,
    actions,
    createCollection,
    createCollectionQuick,
    tags,
    collections,
    libraryStats,
    libraryDataUnavailable,
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
    aboveFoldMediaBookmarkIds,
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
    handleCreateCollectionOpen,
    handleCommandPaletteFilter,
    primaryFilterLabel,
    primaryFilterCompactLabel,
    selectedTagEntries,
  } = useDashboardPage();

  const { registerDashboardTags, setSyncing } = useAppChrome();
  useEffect(() => {
    registerDashboardTags({
      selectedTags: filters.selectedTags,
      onTagToggle: filters.toggleTag,
    });
  }, [filters.selectedTags, filters.toggleTag, registerDashboardTags]);
  useEffect(() => () => registerDashboardTags(null), [registerDashboardTags]);

  const discoveryRequested = searchParams.get("discovery") === "1";
  useEffect(() => {
    if (discoveryRequested && viewMode === "grid") {
      setViewMode("feed");
    }
  }, [discoveryRequested, setViewMode, viewMode]);

  const {
    hasMixContent: discoveryAvailable,
    rawTotal: discoveryUntouchedCount,
    isLoading: discoveryLoading,
  } = useDashboardDiscovery({ feedReady });

  const { collapsed: railCollapsed, setCollapsed: setRailCollapsed } =
    useDashboardRail();
  const isWideViewport = useMediaQuery(appDashboardRailMediaQuery);
  const railOpen = !railCollapsed;
  // Rail is only mounted (and its authors query only fires) when actually visible.
  const railVisible = railOpen && isWideViewport;
  const resultsUpdating =
    (isFetching || filters.isSearchPending) && !isLoading;
  const workspaceBookmark = activeBookmark ?? bookmarks[0] ?? null;
  const workspaceBookmarkId = workspaceBookmark?.id ?? null;

  return (
    <>
    <AppPageShell embedded scrollRef={scrollRef}>
          <PageHeader
            sticky
            feedChrome
            compactable={viewMode !== "grid"}
            bodyClassName="px-0 py-0"
          >
                <h1 className="sr-only">Bookmarks</h1>
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
                      onSyncStateChange={setSyncing}
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
                  discoveryAvailable={
                    viewMode !== "grid" &&
                    discoveryAvailable &&
                    !discoveryLoading
                  }
                  discoveryUntouchedCount={discoveryUntouchedCount}
                  railOpen={railOpen}
                  onToggleRail={() => setRailCollapsed(!railCollapsed)}
                />

                {/* Refresh indicator paints over the header's bottom edge (absolute,
                    no layout) so --app-header-height never churns mid-scroll. */}
                <p role="status" aria-live="polite" className="sr-only">
                  {resultsUpdating ? "Updating results…" : ""}
                </p>
                {resultsUpdating ? (
                  <ScrollingProgressBar className="top-auto bottom-0 z-10 h-0.5 bg-transparent" />
                ) : null}
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

          <div
            className={cn(
              "flex min-w-0 items-start",
              viewMode === "grid"
                ? "gap-0"
                : "gap-4 min-[1152px]:pr-4"
            )}
          >
            <div className="min-w-0 flex-1">
          {libraryDataUnavailable && !isError ? (
            <p
              role="status"
              className={cn(
                "border-b border-hairline-soft px-4 py-2 text-xs text-muted-foreground sm:px-5",
                bookmarkFeedColumnClassName
              )}
            >
              Some library details are temporarily unavailable.
            </p>
          ) : null}
          {!isError && viewMode !== "grid" && (
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
                  filters.search || filters.hasActiveFilters ? "No matches" : "No bookmarks yet"
                }
                description={
                  filters.search || filters.hasActiveFilters
                    ? "Try a different search or adjust the filters."
                    : "Sync your X bookmarks to start building your library."
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
                        onSyncStateChange={setSyncing}
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
                <div
                  className={cn(
                    "flex items-center gap-2 border-b border-hairline-soft px-4 py-2 text-sm sm:px-5",
                    bookmarkFeedColumnClassName
                  )}
                >
                  <span className="text-xs font-semibold text-foreground">
                    Performance highlight
                  </span>
                  <span className="min-w-0 truncate text-xs text-muted-foreground">
                    Focused for quick tagging
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setBookmarkId("");
                      setActiveBookmarkId(null);
                    }}
                    className="ml-auto shrink-0 rounded-sm border border-transparent px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-hover hover:text-foreground focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45"
                  >
                    Exit focus
                  </button>
                </div>
              )}

              {viewMode === "grid" ? (
                <DashboardBookmarkWorkspace
                  bookmarks={bookmarks}
                  activeBookmarkId={
                    selectionMode ? null : workspaceBookmarkId
                  }
                  selectionMode={selectionMode}
                  selectedBookmarkIdSet={selectedBookmarkIdSet}
                  onSelect={
                    isWideViewport
                      ? handleBookmarkSelect
                      : handleExpandedBookmarkOpen
                  }
                  onSelectionChange={toggleBookmarkSelection}
                  onTagClick={filters.toggleTag}
                />
              ) : (
                <BookmarkList
                  scrollRef={scrollRef}
                  bookmarks={bookmarks}
                  viewMode={viewMode}
                  searchQuery={searchQuery}
                  aboveFoldMediaBookmarkIds={aboveFoldMediaBookmarkIds}
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
              )}
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
            </div>
            {viewMode === "grid" && workspaceBookmark ? (
              <DashboardBookmarkInspector
                bookmark={workspaceBookmark}
                bookmarks={bookmarks}
                onSelect={handleBookmarkSelect}
                onAddTag={handleBookmarkAddTag}
                onAddToCollection={handleBookmarkAddToCollection}
                onAddNote={handleBookmarkAddNote}
                onReviewInOrbit={handleGridOverlayReviewInOrbit}
                onDelete={actions.handleDeleteBookmark}
                className={appDashboardInspectorClassName}
              />
            ) : railOpen && viewMode !== "grid" ? (
              <div className={appDashboardRailClassName}>
                <DashboardRail
                  id="dashboard-rail"
                  active={railVisible}
                  filters={filters}
                  tags={tags}
                  libraryStats={libraryStats}
                  total={total}
                  untouchedCount={discoveryUntouchedCount}
                  collectionCount={collections.length}
                  lastSyncAt={dbUser?.lastSyncAt ? new Date(dbUser.lastSyncAt) : null}
                  dataUnavailable={libraryDataUnavailable || isError}
                />
              </div>
            ) : null}
          </div>
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
          description="Bookmark navigation and quick actions."
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
        // Match the data-loading skeleton (default view mode is "feed") so the
        // first paint doesn't pop from a bare spinner to skeleton rows.
        <AppPageCenter className="items-stretch justify-start overflow-hidden">
          <DashboardSkeleton viewMode="feed" />
        </AppPageCenter>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
