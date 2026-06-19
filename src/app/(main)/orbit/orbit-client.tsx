"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef } from "react";
import {
  Folder,
  Loader2,
  Map as MapIcon,
  TagIcon,
  Trash2,
} from "lucide-react";

import { AppPageShell } from "@/components/app-page-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { RetryButton } from "@/components/ui/retry-button";
import { PaginationControls } from "@/components/pagination-controls";
import { GrokMark } from "@/components/brands/grok-mark";
import { OrbitLogoMark } from "@/components/brands/orbit-logo-mark";
import { Sidebar } from "@/components/sidebar-dynamic";
import { MobileSidebar } from "@/components/mobile-sidebar";
import { PageHeader } from "@/components/page-header";
const OrbitReviewOverlay = dynamic(
  () =>
    import("@/components/orbit/orbit-review-overlay").then(
      (m) => m.OrbitReviewOverlay
    ),
  { ssr: false }
);
import { OrbitScanOverviewStrip } from "@/components/orbit/orbit-scan-overview-strip";
import { OrbitCommandBar } from "@/components/orbit/orbit-command-bar";
import { PageWatermark } from "@/components/page-watermark";
import { OrbitTriageHint } from "@/components/orbit/orbit-triage-hint";
import { OrbitScanFailureNotice } from "@/components/orbit/orbit-scan-failure-notice";
import { OrbitList } from "@/components/orbit/orbit-list";
import { OrbitContextualMenu } from "@/components/orbit/orbit-quick-actions";
import { OrbitalRings } from "@/components/orbital";
import {
  ORBIT_SHORTCUT_GROUPS,
} from "@/lib/orbit-client-constants";
import {
  clampMenuPosition,
  orbitBannerClass,
  orbitControlRadius,
  orbitGhostButtonClass,
  orbitLabelClass,
  orbitSelectionBarClass,
} from "@/lib/orbit-route-chrome";
import {
  appContentGutterClassName,
  appFeedHeaderFrostedClassName,
} from "@/lib/app-chrome";
import { bookmarkFeedColumnClassName } from "@/lib/bookmark-feed-layout";
import { useOrbitPage } from "@/hooks/use-orbit-page";
import { cn } from "@/lib/utils";

const AddTagDialog = dynamic(
  () => import("@/components/add-tag-dialog").then((m) => m.AddTagDialog),
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

const OrbitBookmarkOverlay = dynamic(
  () =>
    import("@/components/orbit/orbit-bookmark-overlay").then(
      (m) => m.OrbitBookmarkOverlay
    ),
  { ssr: false }
);

export default function OrbitPage() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { queue, session, interactions, selection } = useOrbitPage();
  const scan = session.scan;
  const {
    router,
    actions,
    createCollection,
    createCollectionQuick,
    tags,
    collections,
    libraryStats,
    dbUser,
    bookmarks,
    total,
    totalPages,
    page,
    orbitView,
    queueSortDirection,
    search,
    searchInputRef,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
    isSearchPending,
    queueIsLoading,
    goToTagOnDashboard,
    handleSyncComplete,
    handleOrbitViewChange,
    handleQueueSortDirectionChange,
    handleSearchChange,
    handlePageChange,
  } = queue;
  const {
    reviewBookmarks,
    appliedBookmarkIds,
    reviewSession,
    feedbackById,
    scanButtonLabel,
    triagedCount,
    passTotal,
    activeScanPlanSuggestionCount,
    scanTargetIds,
    scanTargetCount,
    selectedScanTargetIds,
    resolvedScanBatchMode,
    scanBatchProfile,
    scanBatchLimit,
    deepUnlocked,
    deepLockedReason,
    canApplyStrongMatches,
    canRescanCurrentSelection,
    staleScanPlan,
    hasSelectionOverflow,
    lastScanRequest,
    setScanBatchMode,
    handleScan,
    handleRetryScan,
    handleRescanCurrentSelection,
    handleApplyStrongMatches,
    handleOpenReviewAll,
    handleClearScanPlan,
    handleOpenBookmarkReview,
    handleReviewOpenChange,
    handleApplyReviewedPlan,
    handleKeepInOrbit,
    handleAcceptSuggestion,
  } = session;
  const { mode: selectionMode, ids: selectedBookmarkIds } = selection;
  const {
    tagDialogOpen,
    setTagDialogOpen,
    tagTargetIds,
    setTagTargetIds,
    collectionDialogOpen,
    setCollectionDialogOpen,
    collectionTargetIds,
    setCollectionTargetIds,
    dialogTagIds,
    dialogCollectionIds,
    createCollectionOpen,
    setCreateCollectionOpen,
    keyboardShortcutsOpen,
    setKeyboardShortcutsOpen,
    menuForId,
    setMenuForId,
    menuPosition,
    setMenuPosition,
    setActiveBookmarkId,
    resolvedActiveBookmarkId,
    activeBookmark,
    activeDecision,
    orbitOverlayOpen,
    orbitMapHref,
    visibleStatusLabel,
    handleCreateCollectionOpen,
    handleOrbitOverlayDecision,
    handleMenuAction,
    handleBookmarkAddTag,
    handleBookmarkAddToCollection,
    toggleSelectionMode,
    handleSelectionChange,
    handleSelectAllOnPage,
    handleBulkAddTag,
    handleBulkAddToCollection,
    handleBulkDelete,
  } = interactions;

  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuForId) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuForId(null);
        setMenuPosition(null);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuForId(null);
        setMenuPosition(null);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuForId, setMenuForId, setMenuPosition]);

  return (
    <>
    <AppPageShell
      className="orbit-route-default"
      watermark={<PageWatermark variant="orbit" />}
      sidebar={
        <Sidebar
          tags={tags}
          collections={collections}
          selectedTags={[]}
          onTagToggle={goToTagOnDashboard}
          onCreateCollection={handleCreateCollectionOpen}
          lastSyncAt={dbUser?.lastSyncAt ? new Date(dbUser.lastSyncAt) : null}
          totalBookmarks={libraryStats?.libraryBookmarkCount}
          onSyncComplete={handleSyncComplete}
        />
      }
      scrollRef={scrollRef}
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
            <OrbitCommandBar
              ref={searchInputRef}
              mobileSidebar={
                <MobileSidebar
                  tags={tags}
                  collections={collections}
                  selectedTags={[]}
                  onTagToggle={goToTagOnDashboard}
                  onCreateCollection={handleCreateCollectionOpen}
                  lastSyncAt={
                    dbUser?.lastSyncAt ? new Date(dbUser.lastSyncAt) : null
                  }
                  totalBookmarks={libraryStats?.libraryBookmarkCount}
                  onSyncComplete={handleSyncComplete}
                />
              }
              user={dbUser ?? undefined}
              orbitView={orbitView}
              total={total}
              sortDirection={queueSortDirection}
              onChangeView={handleOrbitViewChange}
              onChangeSortDirection={handleQueueSortDirectionChange}
              canSelect={total > 0}
              selectionMode={selectionMode}
              onToggleSelectionMode={toggleSelectionMode}
              triagedCount={triagedCount}
              passTotal={passTotal}
              scanButtonLabel={scanButtonLabel}
              queueIsLoading={queueIsLoading}
              scanning={scan.scanning}
              scanTargetCount={scanTargetIds.length}
              hasScanPlan={activeScanPlanSuggestionCount > 0}
              scanPlanSuggestionCount={activeScanPlanSuggestionCount}
              batchMode={resolvedScanBatchMode}
              resolvedBatchProfile={scanBatchProfile}
              deepUnlocked={deepUnlocked}
              deepLockedReason={deepLockedReason}
              applyingBatch={scan.applyingBatch}
              canApplyStrongMatches={canApplyStrongMatches}
              mapHref={orbitMapHref}
              onBatchModeChange={setScanBatchMode}
              onScan={handleScan}
              onApplyStrongMatches={handleApplyStrongMatches}
              onReviewPass={handleOpenReviewAll}
              search={search}
              onSearchChange={handleSearchChange}
              visibleStatusLabel={visibleStatusLabel}
              isUpdating={(isFetching || isSearchPending) && !isLoading}
              keyboardShortcutsOpen={keyboardShortcutsOpen}
              onKeyboardShortcutsOpenChange={setKeyboardShortcutsOpen}
              shortcutGroups={ORBIT_SHORTCUT_GROUPS}
              scanError={
                scan.error ? (
                  <OrbitScanFailureNotice
                    error={scan.error}
                    retryTargetCount={
                      lastScanRequest?.targetIds.length ?? scanTargetCount
                    }
                    selectionTargetCount={selectedScanTargetIds.length}
                    canRescanCurrentSelection={canRescanCurrentSelection}
                    scanning={scan.scanning}
                    onRetry={handleRetryScan}
                    onRescanCurrentSelection={handleRescanCurrentSelection}
                  />
                ) : null
              }
            />
          </PageHeader>

          <div className={cn(appContentGutterClassName, "space-y-4 pb-6 pt-4")}>
            <section className={cn(bookmarkFeedColumnClassName, "space-y-3")}>
              <OrbitTriageHint />

              {scan.plan ? (
                <OrbitScanOverviewStrip payload={scan.plan} />
              ) : null}
            </section>

            <section className={cn(bookmarkFeedColumnClassName, "flex flex-col gap-3")}>
              {staleScanPlan ? (
                <div
                  role="status"
                  className={cn(
                    "flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
                    orbitBannerClass()
                  )}
                >
                  <p className="text-sm text-primary/95">
                    This Grok pass was run on a different search, page, or
                    selection. Review or dismiss it before trusting the
                    suggestions.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="highlight"
                    className="h-9 shrink-0 text-primary"
                    onClick={handleClearScanPlan}
                  >
                    Dismiss plan
                  </Button>
                </div>
              ) : null}

              {selectionMode && selectedBookmarkIds.size > 0 && (
                <div
                  className={cn(
                    "sticky top-[calc(var(--header-height)+8px)] z-[var(--z-sticky-subbar)] flex flex-wrap items-center gap-2 px-4 py-2.5 sm:px-5",
                    orbitSelectionBarClass()
                  )}
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span
                      className={cn(
                        orbitLabelClass(),
                        "text-foreground/80 dark:text-white/80"
                      )}
                    >
                      {selectedBookmarkIds.size} selected
                    </span>
                    {hasSelectionOverflow ? (
                      <span
                        className={cn(
                          "text-2xs",
                          "text-amber-700 dark:text-amber-200/90"
                        )}
                      >
                        Grok will process the first{" "}
                        {scanBatchLimit} selected.
                      </span>
                    ) : null}
                  </div>
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className={cn(
                        "h-8 text-xs",
                        "text-muted-foreground hover:text-foreground dark:text-white/60 dark:hover:text-white"
                      )}
                      onClick={handleSelectAllOnPage}
                      disabled={bookmarks.length === 0}
                    >
                      Select all on page
                    </Button>
                    <Button
                      size="sm"
                      variant="highlight"
                      className="h-8 gap-1.5 text-primary"
                      onClick={handleScan}
                      disabled={scan.scanning || scanTargetIds.length === 0}
                    >
                      {scan.scanning ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <GrokMark className="size-3.5" title="Grok" />
                      )}
                      Auto-categorize selection
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className={cn("h-8 gap-1.5", orbitGhostButtonClass())}
                      onClick={handleBulkAddTag}
                    >
                      <TagIcon className="size-3.5" />
                      Tag
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className={cn("h-8 gap-1.5", orbitGhostButtonClass())}
                      onClick={handleBulkAddToCollection}
                    >
                      <Folder className="size-3.5" />
                      Collect
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 gap-1.5 text-muted-foreground hover:text-destructive"
                      onClick={handleBulkDelete}
                    >
                      <Trash2 className="size-3.5" />
                      Delete
                    </Button>
                  </div>
                </div>
              )}

              {isError ? (
                <ErrorState
                  layout="panel"
                  title="Orbit could not be loaded"
                  description={
                    error instanceof Error ? error.message : "Please try again."
                  }
                  action={<RetryButton onClick={() => void refetch()} />}
                />
              ) : isLoading ? (
                <OrbitList
                  bookmarks={[]}
                  isLoading
                  selectionMode={selectionMode}
                  selectedIds={selectedBookmarkIds}
                  getDecision={scan.getDecision}
                  dismissedBookmarkIds={scan.dismissedBookmarkIds}
                  appliedBookmarkIds={appliedBookmarkIds}
                />
              ) : bookmarks.length === 0 ? (
                <EmptyState
                  layout="inline"
                  leading={
                    search.trim() ? (
                      <OrbitLogoMark className="mx-auto mb-4 size-8" />
                    ) : (
                      <div className="relative mx-auto mb-3 flex h-24 w-40 items-center justify-center">
                        <OrbitalRings
                          className="absolute inset-0 m-auto opacity-70"
                          size="sm"
                          tone="cyan"
                        />
                        <OrbitLogoMark className="relative size-8 text-primary drop-shadow-[0_0_18px_rgba(37,99,235,0.35)]" />
                      </div>
                    )
                  }
                  title={search.trim() ? "No matches in Orbit" : "Orbit is clear"}
                  description={
                    search.trim()
                      ? "Try a different term or clear the query."
                      : "Library organized. Highlights will surface the next standouts for Orbit review."
                  }
                  action={
                    search.trim() ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className={orbitControlRadius()}
                        onClick={() => handleSearchChange("")}
                      >
                        Clear search
                      </Button>
                    ) : (
                      <div className="flex flex-wrap justify-center gap-2">
                        <Link
                          href="/orbit/map"
                          className={cn(
                            buttonVariants({ size: "sm" }),
                            orbitControlRadius()
                          )}
                        >
                          <MapIcon className="size-3.5" aria-hidden />
                          Inspect graph
                        </Link>
                        <Button
                          size="sm"
                          variant="outline"
                          className={orbitControlRadius()}
                          onClick={() => router.push("/dashboard")}
                        >
                          Search bookmarks
                        </Button>
                        <Link
                          href="/collections"
                          className={cn(
                            buttonVariants({ size: "sm", variant: "outline" }),
                            orbitControlRadius()
                          )}
                        >
                          Open collections
                        </Link>
                      </div>
                    )
                  }
                />
              ) : (
                <>
                  <div className="flex flex-col gap-3">
                    <div className="min-w-0 flex-1">
                      <OrbitList
                        scrollRef={scrollRef}
                        bookmarks={bookmarks}
                        selectedId={resolvedActiveBookmarkId}
                        isLoading={isLoading}
                        selectionMode={selectionMode}
                        selectedIds={selectedBookmarkIds}
                        getDecision={scan.getDecision}
                        dismissedBookmarkIds={scan.dismissedBookmarkIds}
                        appliedBookmarkIds={appliedBookmarkIds}
                        onToggleSelect={(id) =>
                          handleSelectionChange(id, !selectedBookmarkIds.has(id))
                        }
                        onSelect={(id) => {
                          if (menuForId) {
                            setMenuForId(null);
                            setMenuPosition(null);
                          }
                          if (scan.getDecision(id)?.primary) {
                            handleOpenBookmarkReview(id);
                          } else {
                            setActiveBookmarkId(id);
                          }
                        }}
                        onQuickAction={(id, action, event) => {
                          if (action === "accept") {
                            void handleAcceptSuggestion(id);
                          } else if (action === "edit") {
                            handleOpenBookmarkReview(id);
                          } else if (action === "keep") {
                            const wasDismissed = scan.dismissedBookmarkIds.has(id);
                            handleKeepInOrbit(id);
                            if (!wasDismissed) setActiveBookmarkId(null);
                          } else if (action === "tag") {
                            handleBookmarkAddTag(id);
                          } else if (action === "menu" && event) {
                            const rect = (
                              event.currentTarget as HTMLElement
                            ).getBoundingClientRect();
                            const raw = { x: rect.right + 8, y: rect.top };
                            setMenuForId(id);
                            setMenuPosition(clampMenuPosition(raw.x, raw.y));
                          } else {
                            setActiveBookmarkId(id);
                          }
                        }}
                      />

                      {orbitView === "all" &&
                        totalPages > 1 &&
                        bookmarks.length > 0 && (
                          <PaginationControls
                            variant="orbit"
                            page={page}
                            totalPages={totalPages}
                            onPageChange={handlePageChange}
                          />
                        )}
                    </div>
                  </div>

                {menuForId && menuPosition && (
                  <div
                    ref={menuRef}
                    className="fixed z-50"
                    style={{
                      left: `${menuPosition.x}px`,
                      top: `${menuPosition.y}px`,
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <OrbitContextualMenu
                      bookmarkId={menuForId}
                      onAction={handleMenuAction}
                      onClose={() => {
                        setMenuForId(null);
                        setMenuPosition(null);
                      }}
                    />
                  </div>
                )}

                {orbitOverlayOpen && activeBookmark ? (
                  <OrbitBookmarkOverlay
                    bookmark={activeBookmark}
                    open
                    onOpenChange={(open) => {
                      if (!open) setActiveBookmarkId(null);
                    }}
                    decision={activeDecision}
                    suggestionDismissed={scan.dismissedBookmarkIds.has(activeBookmark.id)}
                    onFullReview={(id) => handleOpenBookmarkReview(id)}
                    onDecision={handleOrbitOverlayDecision}
                    onAddTag={handleBookmarkAddTag}
                    onAddToCollection={handleBookmarkAddToCollection}
                    showFullReview={!!scan.plan}
                  />
                ) : null}
                </>
              )}
            </section>
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

      {reviewSession.open ? (
        <OrbitReviewOverlay
          open
          onOpenChange={handleReviewOpenChange}
          plan={scan.plan}
          bookmarks={reviewBookmarks}
          dismissedBookmarkIds={scan.dismissedBookmarkIds}
          existingTags={tags}
          existingCollections={collections}
          applying={scan.applyingBatch}
          focusBookmarkId={reviewSession.focusBookmarkId}
          reviewSessionId={reviewSession.sessionId}
          onApply={handleApplyReviewedPlan}
          digestBookmarkIds={reviewSession.digestBookmarkIds}
          source={reviewSession.source}
          feedbackById={feedbackById}
        />
      ) : null}
    </>
  );
}
