"use client";

import dynamic from "next/dynamic";
import { AppPageShell } from "@/components/app-page-shell";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { RetryButton } from "@/components/ui/retry-button";
import { ScrollingProgressBar } from "@/components/ui/scrolling-progress-bar";
import {
  appContentInsetClassName,
  appFeedHeaderFrostedClassName,
} from "@/lib/app-chrome";
import { orbitMapStageClass } from "@/lib/orbit-map-chrome";
import { cn } from "@/lib/utils";
import { PageWatermark } from "@/components/page-watermark";
import { Sidebar } from "@/components/sidebar-dynamic";
import { MobileSidebar } from "@/components/mobile-sidebar";
import { PageHeader } from "@/components/page-header";
import {
  ORBIT_MAP_SHORTCUT_GROUPS,
  useOrbitMapPage,
} from "@/hooks/orbit";
import { OrbitMapCommandBar } from "@/components/orbit/orbit-map-command-bar";
import { OrbitMapHoverCard } from "@/components/orbit/orbit-map-hover-card";
import { OrbitMapRail } from "@/components/orbit/orbit-map-rail";
import { OrbitMapStatsStrip } from "@/components/orbit/orbit-map-stats-strip";

const OrbitMapCanvas = dynamic(
  () =>
    import("@/components/orbit/orbit-map-canvas-host").then((m) => m.default),
  {
    ssr: false,
    loading: () => (
      <div
        className={cn(
          "flex h-full items-center justify-center",
          orbitMapStageClass()
        )}
      >
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Charting graph…
        </div>
      </div>
    ),
  }
);

const AddTagDialog = dynamic(
  () => import("@/components/add-tag-dialog").then((m) => m.AddTagDialog),
  { ssr: false }
);

const AddNoteDialog = dynamic(
  () => import("@/components/add-note-dialog").then((m) => m.AddNoteDialog),
  { ssr: false }
);

const GridBookmarkOverlay = dynamic(
  () =>
    import("@/components/grid-bookmark-overlay").then(
      (m) => m.GridBookmarkOverlay
    ),
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

export default function OrbitMapPage() {
  const page = useOrbitMapPage();
  const {
    dbUser,
    tags,
    collections,
    libraryStats,
    graph,
    graphScope,
    selection,
    focus,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
    graphIsEmpty,
    stats,
    truncatedCount,
    search,
    setSearch,
    searchDeferred,
    searchResults,
    searchInputRef,
    handleSearchResults,
    keyboardShortcutsOpen,
    setKeyboardShortcutsOpen,
    headerDescription,
    lastSyncAt,
    stageRef,
    stageSize,
    hoverCard,
    canvasRef,
    copyingCollectionId,
    selectedBookmarkId,
    focusedBookmark,
    focusedBookmarkLoading,
    actions,
    createCollection,
    createCollectionQuick,
    dialogs,
    goToTagOnDashboard,
    handleCreateCollectionOpen,
    handleSyncComplete,
    handleSyncStateChange,
    syncProgressVisible,
    handleCanvasSelectionChange,
    handleScopeChange,
    handleHoverChange,
    handleOpenBookmark,
    expandedBookmark,
    handleExpandedBookmarkOpenChange,
    handleExpandedAddNote,
    handleReviewInOrbit,
    handleExpandedDelete,
    noteDialogOpen,
    noteTarget,
    handleNoteDialogOpenChange,
    handleAssign,
    handleNodeDropped,
    openTagDialog,
    openCollectionDialog,
    handleCopyAsCollection,
    handleClearSelection,
    handleSearchResultSelect,
  } = page;

  const railProps = {
    data: graph!,
    selection,
    selectedBookmarkId,
    focusedBookmark,
    focusedBookmarkLoading,
    onAssign: handleAssign,
    onAddTag: openTagDialog,
    onAddToCollection: openCollectionDialog,
    onCopyAsCollection: handleCopyAsCollection,
    onOpenBookmark: handleOpenBookmark,
    onClearSelection: handleClearSelection,
    copyingCollectionId,
  };

  return (
    <>
    <AppPageShell
      className="orbit-route-default"
      layout="column"
      watermark={<PageWatermark variant="orbit" />}
      mainTop={
        syncProgressVisible ? (
          <ScrollingProgressBar className="relative z-50" />
        ) : null
      }
      mainProps={{ "aria-busy": syncProgressVisible }}
      sidebar={
        <Sidebar
          tags={tags}
          collections={collections}
          selectedTags={[]}
          onTagToggle={goToTagOnDashboard}
          onCreateCollection={handleCreateCollectionOpen}
          lastSyncAt={lastSyncAt}
          totalBookmarks={libraryStats?.libraryBookmarkCount}
          onSyncComplete={handleSyncComplete}
          onSyncStateChange={handleSyncStateChange}
        />
      }
    >
        <PageHeader
          sticky
          chromeless
          compactable
          className={cn(
            "border-b border-hairline-strong",
            appFeedHeaderFrostedClassName
          )}
          bodyClassName="px-0 py-0"
        >
          <OrbitMapCommandBar
            ref={searchInputRef}
            mobileSidebar={
              <MobileSidebar
                tags={tags}
                collections={collections}
                selectedTags={[]}
                onTagToggle={goToTagOnDashboard}
                onCreateCollection={handleCreateCollectionOpen}
                lastSyncAt={lastSyncAt}
                totalBookmarks={libraryStats?.libraryBookmarkCount}
                onSyncComplete={handleSyncComplete}
                onSyncStateChange={handleSyncStateChange}
              />
            }
            user={dbUser ?? undefined}
            description={headerDescription}
            graphScope={graphScope}
            isLoading={isLoading}
            onScopeChange={handleScopeChange}
            isFetching={isFetching}
            hasGraph={Boolean(graph)}
            search={search}
            onSearchChange={setSearch}
            searchQuery={searchDeferred}
            searchResults={searchResults}
            onResultSelect={handleSearchResultSelect}
            keyboardShortcutsOpen={keyboardShortcutsOpen}
            onKeyboardShortcutsOpenChange={setKeyboardShortcutsOpen}
            shortcutGroups={ORBIT_MAP_SHORTCUT_GROUPS}
          />
        </PageHeader>

        <div
          className={cn(
            "flex min-h-0 min-w-0 flex-1 gap-3",
            appContentInsetClassName
          )}
        >
          <div
            ref={stageRef}
            className={cn(
              "orbit-map-stage relative flex min-w-0 flex-1 overflow-hidden",
              orbitMapStageClass()
            )}
          >
            {isLoading ? (
              <div className="flex h-full w-full items-center justify-center bg-background">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Charting graph…
                </div>
              </div>
            ) : isError ? (
              <div className="flex h-full w-full items-center justify-center bg-background p-6">
                <ErrorState
                  layout="stage"
                  title="Graph could not be loaded"
                  description={
                    error instanceof Error ? error.message : "Please try again."
                  }
                  action={
                    <RetryButton context="stage" onClick={() => refetch()} className="mt-0" />
                  }
                />
              </div>
            ) : graphIsEmpty ? (
              <div className="flex h-full w-full flex-col items-center justify-center bg-background p-8">
                <EmptyState
                  layout="stage"
                  title="Nothing to chart yet"
                  description={
                    graphScope === "orbit"
                      ? "Your Orbit queue is clear. Sync new bookmarks or switch to the full library map."
                      : "Sync bookmarks from X, then return here to explore how tags and collections connect."
                  }
                  action={
                    <Link
                      href="/orbit"
                      className={cn(
                        buttonVariants({ size: "sm", variant: "outline" })
                      )}
                    >
                      Open Orbit queue
                    </Link>
                  }
                />
              </div>
            ) : graph ? (
              <OrbitMapCanvas
                ref={canvasRef}
                data={graph}
                selection={selection}
                searchQuery={searchDeferred}
                onSearchResults={handleSearchResults}
                onSelectionChange={handleCanvasSelectionChange}
                onHoverChange={handleHoverChange}
                onOpenBookmark={handleOpenBookmark}
                onNodeDropped={handleNodeDropped}
                focus={focus}
                className="h-full w-full"
                filterControlsClassName="left-4 top-4"
                zoomControlsClassName="bottom-[calc(30dvh+1.25rem)] right-4 lg:bottom-4"
              />
            ) : null}

            {hoverCard ? (
              <OrbitMapHoverCard
                node={hoverCard.node}
                x={hoverCard.x}
                y={hoverCard.y}
                containerWidth={stageSize.width}
                containerHeight={stageSize.height}
              />
            ) : null}

            {stats && (
              <OrbitMapStatsStrip
                stats={stats}
                truncatedCount={truncatedCount}
              />
            )}

            {graph && (
              <div className="pointer-events-none absolute inset-x-3 bottom-3 z-30 lg:hidden">
                <OrbitMapRail
                  {...railProps}
                  variant="overlay"
                  className="max-h-[30dvh] w-full"
                />
              </div>
            )}
          </div>

          {graph && (
            <OrbitMapRail
              {...railProps}
              variant="rail"
              className="hidden h-full min-h-0 overflow-y-auto lg:flex lg:w-[300px] xl:w-[320px]"
            />
          )}
        </div>
    </AppPageShell>

      <AddTagDialog
        open={dialogs.tagDialogOpen}
        onOpenChange={dialogs.setTagDialogOpen}
        bookmarkIds={dialogs.tagTargetIds}
        existingTags={tags}
        onAddTag={actions.handleAddTag}
        onRemoveTag={actions.handleRemoveTag}
        bookmarkTags={dialogs.dialogTagIds}
      />

      <AddToCollectionDialog
        open={dialogs.collectionDialogOpen}
        onOpenChange={dialogs.setCollectionDialogOpen}
        bookmarkIds={dialogs.collectionTargetIds}
        collections={collections}
        bookmarkCollections={dialogs.dialogCollectionIds}
        onAddToCollection={actions.handleAddToCollection}
        onCreateCollection={createCollectionQuick}
      />

      <CreateCollectionDialog
        open={dialogs.createCollectionOpen}
        onOpenChange={dialogs.setCreateCollectionOpen}
        onCreateCollection={createCollection}
      />

      {expandedBookmark ? (
        <GridBookmarkOverlay
          open
          onOpenChange={handleExpandedBookmarkOpenChange}
          bookmark={expandedBookmark}
          onAddTag={dialogs.openTagForBookmark}
          onAddToCollection={dialogs.openCollectionForBookmark}
          onAddNote={handleExpandedAddNote}
          onReviewInOrbit={handleReviewInOrbit}
          onDelete={handleExpandedDelete}
        />
      ) : null}

      {noteDialogOpen && noteTarget ? (
        <AddNoteDialog
          open
          onOpenChange={handleNoteDialogOpenChange}
          bookmarkId={noteTarget.id}
          existingNoteId={noteTarget.notes[0]?.id}
          existingNote={noteTarget.notes[0]?.content}
          onSave={actions.handleAddNote}
          onDelete={actions.handleDeleteNote}
        />
      ) : null}
    </>
  );
}
