"use client";

import { useState, useEffect, Suspense, useRef, useMemo, useCallback } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { DashboardToolbar } from "@/components/dashboard-toolbar";
import { Sidebar } from "@/components/sidebar-dynamic";
import { MobileSidebar } from "@/components/mobile-sidebar";
import { FilterPanel } from "@/components/filter-panel";
import { PageHeader } from "@/components/page-header";
import { appChromeFrostedClassName } from "@/lib/app-chrome";
import { useBookmarkFilters } from "@/hooks/use-bookmark-filters";
import { useBookmarkActions } from "@/hooks/use-bookmark-actions";
import { useCreateCollection } from "@/hooks/use-create-collection";
import { useCollectionsQuery, useTagsQuery } from "@/hooks/use-library-data";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { fetchJson } from "@/lib/fetch-json";
import { invalidateLibraryQueries } from "@/lib/query-invalidation";
import { saveGemsAsCollection } from "@/lib/save-gems-as-collection";
import { cn } from "@/lib/utils";
import type {
  ViewMode,
  BookmarkWithRelations,
  MediaFilter,
} from "@/types";
import { DashboardDiscovery } from "@/components/dashboard-discovery";
import { usePerformanceHighlights as usePerformanceHighlightsHook } from "@/hooks/use-performance-highlights";
import { getDislikedHighlightIds, getLikedHighlightIds } from "@/lib/highlight-feedback";
import { toast } from "sonner";
import {
  bookmarkFeedColumnClassName,
  bookmarkFeedLeftInspectorClassName,
  bookmarkFeedRightInspectorWrapperClassName,
} from "@/lib/bookmark-feed-layout";
import { BookmarkList } from "./bookmark-list";
import { DashboardSkeleton } from "./dashboard-skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { RetryButton } from "@/components/ui/retry-button";
import { PaginationControls } from "@/components/pagination-controls";
import { Button } from "@/components/ui/button";
import { SyncButton } from "@/components/sync-button";
import { Bookmark } from "lucide-react";
import { SelectionToolbar } from "./selection-toolbar";

import { orbital } from "@/components/orbital";
import { LibraryBookmarkInspector } from "@/components/library-bookmark-inspector";
import { useOrbitalTheme } from "@/components/providers";

type BookmarkResponse = {
  bookmarks: BookmarkWithRelations[];
  total: number;
  totalPages: number;
};

const EMPTY_BOOKMARKS: BookmarkWithRelations[] = [];

const MEDIA_FILTER_LABELS: Record<string, string> = {
  images: "Images",
  video: "Video",
  links: "Links",
  "text-only": "Text",
};

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

function getSharedTagIds(bookmarks: BookmarkWithRelations[]) {
  if (bookmarks.length === 0) return [];

  const [first, ...rest] = bookmarks;
  const shared = new Set(first.tags.map(({ tag }) => tag.id));

  for (const bookmark of rest) {
    const bookmarkTagIds = new Set(bookmark.tags.map(({ tag }) => tag.id));
    for (const tagId of Array.from(shared)) {
      if (!bookmarkTagIds.has(tagId)) {
        shared.delete(tagId);
      }
    }
  }

  return Array.from(shared);
}

function getSharedCollectionIds(bookmarks: BookmarkWithRelations[]) {
  if (bookmarks.length === 0) return [];

  const [first, ...rest] = bookmarks;
  const shared = new Set(first.collectionItems.map(({ collection }) => collection.id));

  for (const bookmark of rest) {
    const bookmarkCollectionIds = new Set(
      bookmark.collectionItems.map(({ collection }) => collection.id)
    );
    for (const collectionId of Array.from(shared)) {
      if (!bookmarkCollectionIds.has(collectionId)) {
        shared.delete(collectionId);
      }
    }
  }

  return Array.from(shared);
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session } = useSession();

  const filters = useBookmarkFilters();
  const actions = useBookmarkActions();
  const { createCollectionQuick, createCollection } = useCreateCollection();

  const handleSaveGemsAsCollection = async (bookmarks: BookmarkWithRelations[], suggestedName: string) => {
    try {
      await saveGemsAsCollection(queryClient, createCollectionQuick, bookmarks, suggestedName);
      toast.success(`Created "${suggestedName}" with ${bookmarks.length} gems`);
    } catch {
      toast.error("Could not save the gems as a collection");
    }
  };

  const [viewMode, setViewMode] = useState<ViewMode>("feed");
  const [showFilters, setShowFilters] = useState(false);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [collectionDialogOpen, setCollectionDialogOpen] = useState(false);
  const [createCollectionOpen, setCreateCollectionOpen] = useState(false);
  const [activeBookmarkId, setActiveBookmarkId] = useState<string | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedBookmarkIds, setSelectedBookmarkIds] = useState<string[]>([]);
  const [tagTargetIds, setTagTargetIds] = useState<string[]>([]);
  const [collectionTargetIds, setCollectionTargetIds] = useState<string[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { isOrbital } = useOrbitalTheme();

  const {
    data: bookmarkData,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<BookmarkResponse>({
    queryKey: ["bookmarks", filters.queryString],
    queryFn: () => fetchJson(`/api/bookmarks?${filters.queryString}`),
    placeholderData: keepPreviousData,
  });

  const { data: tags = [] } = useTagsQuery();

  const { data: collections = [] } = useCollectionsQuery();

  // Shared performance highlights (raw / untouched only for the dashboard strip)
  const dislikedIds = getDislikedHighlightIds();
  const likedIds = getLikedHighlightIds();
  const {
    data: highlightData,
    isLoading: highlightsLoading,
    isError: highlightsError,
    refetch: refetchHighlights,
  } = usePerformanceHighlightsHook(true, {
    dislikedIds,
    likedIds,
  });

  const feedReady = !isLoading && !isError;
  const {
    data: libraryHighlightData,
    isLoading: libraryHighlightsLoading,
    isError: libraryHighlightsError,
    refetch: refetchLibraryHighlights,
  } = usePerformanceHighlightsHook(false, {
    dislikedIds,
    likedIds,
    enabled: feedReady,
  });

  const refetchDiscovery = useCallback(() => {
    void refetchHighlights();
    void refetchLibraryHighlights();
  }, [refetchHighlights, refetchLibraryHighlights]);

  const bookmarks: BookmarkWithRelations[] = bookmarkData?.bookmarks ?? EMPTY_BOOKMARKS;
  const total: number = bookmarkData?.total || 0;
  const totalPages: number = bookmarkData?.totalPages || 1;

  const performanceFocusedId = filters.bookmarkId ? filters.bookmarkId : null;
  const {
    setSelectedTags,
    setPage,
    setMediaFilter,
    setAuthorFilter,
    setCollectionId,
    setBookmarkId,
  } = filters;
  const visibleBookmarkIdSet = useMemo(
    () => new Set(bookmarks.map((bookmark) => bookmark.id)),
    [bookmarks]
  );
  const visibleSelectedBookmarkIds = useMemo(
    () => selectedBookmarkIds.filter((bookmarkId) => visibleBookmarkIdSet.has(bookmarkId)),
    [selectedBookmarkIds, visibleBookmarkIdSet]
  );
  const selectedBookmarkIdSet = useMemo(
    () => new Set(visibleSelectedBookmarkIds),
    [visibleSelectedBookmarkIds]
  );
  const bookmarkById = useMemo(
    () => new Map(bookmarks.map((bookmark) => [bookmark.id, bookmark])),
    [bookmarks]
  );
  const searchQuery = useMemo(
    () => (filters.search ? filters.search : undefined),
    [filters.search]
  );

  const aboveFoldMediaBookmarkId = useMemo(() => {
    const first = bookmarks.find((b) => {
      const m = b.media?.[0];
      return Boolean(m?.url || m?.preview_image_url);
    });
    return first?.id ?? null;
  }, [bookmarks]);
  const tagDialogBookmarks = useMemo(() => {
    const targetIds = selectedBookmarkIds.length > 0 ? visibleSelectedBookmarkIds : tagTargetIds;
    return targetIds.flatMap((id) => {
      const bookmark = bookmarkById.get(id);
      return bookmark ? [bookmark] : [];
    });
  }, [bookmarkById, selectedBookmarkIds.length, tagTargetIds, visibleSelectedBookmarkIds]);
  const collectionDialogBookmarks = useMemo(() => {
    const targetIds = selectedBookmarkIds.length > 0 ? visibleSelectedBookmarkIds : collectionTargetIds;
    return targetIds.flatMap((id) => {
      const bookmark = bookmarkById.get(id);
      return bookmark ? [bookmark] : [];
    });
  }, [bookmarkById, collectionTargetIds, selectedBookmarkIds.length, visibleSelectedBookmarkIds]);

  const tagFromUrl = searchParams.get("tag");
  const tagsFromUrl = searchParams.get("tags");
  const authorFromUrl = searchParams.get("author");
  const collectionFromUrl = searchParams.get("collection");
  const bookmarkFromUrl = searchParams.get("bookmark");
  const tagFromUrlRef = useRef<string | null>(null);
  const tagsFromUrlRef = useRef<string | null>(null);
  const authorFromUrlRef = useRef<string | null>(null);
  const collectionFromUrlRef = useRef<string | null>(null);
  const bookmarkFromUrlRef = useRef<string | null>(null);
  useEffect(() => {
    if (tagsFromUrl && tagsFromUrl !== tagsFromUrlRef.current) {
      const next = tagsFromUrl.split(",").filter(Boolean);
      setSelectedTags(next);
      setPage(1);
    } else if (tagFromUrl && tagFromUrl !== tagFromUrlRef.current) {
      setSelectedTags([tagFromUrl]);
      setPage(1);
    }
    if (authorFromUrl !== authorFromUrlRef.current) {
      setAuthorFilter(authorFromUrl ? authorFromUrl.replace(/^@/, "") : "");
    }
    if (collectionFromUrl !== collectionFromUrlRef.current) {
      setCollectionId(collectionFromUrl ?? "");
    }
    if (bookmarkFromUrl !== bookmarkFromUrlRef.current) {
      setBookmarkId(bookmarkFromUrl ?? "");
    }
    tagFromUrlRef.current = tagFromUrl;
    tagsFromUrlRef.current = tagsFromUrl;
    authorFromUrlRef.current = authorFromUrl;
    collectionFromUrlRef.current = collectionFromUrl;
    bookmarkFromUrlRef.current = bookmarkFromUrl;
  }, [
    tagFromUrl,
    tagsFromUrl,
    authorFromUrl,
    collectionFromUrl,
    bookmarkFromUrl,
    setPage,
    setSelectedTags,
    setAuthorFilter,
    setCollectionId,
    setBookmarkId,
  ]);

  const activeBookmarkIdForView = filters.bookmarkId || activeBookmarkId;
  const activeBookmark = useMemo(
    () => bookmarks.find((b) => b.id === activeBookmarkIdForView),
    [bookmarks, activeBookmarkIdForView]
  );

  // Gate inspector + two-col layout strictly behind orbital theme (P0 fix)
  // Ensures default light/dark experience is byte-for-byte unchanged (no flex, no inspector, no selected visuals from this feature).
  const inspectorActive = isOrbital && !!activeBookmark && viewMode !== "grid";

  const clearSelection = useCallback(() => {
    setSelectedBookmarkIds([]);
    setSelectionMode(false);
  }, []);

  const toggleBookmarkSelection = useCallback((bookmarkId: string, selected: boolean) => {
    setSelectedBookmarkIds((current) => {
      if (selected) {
        return current.includes(bookmarkId) ? current : [...current, bookmarkId];
      }
      return current.filter((id) => id !== bookmarkId);
    });
  }, []);

  const selectVisibleBookmarks = useCallback(() => {
    setSelectedBookmarkIds(bookmarks.map((bookmark) => bookmark.id));
  }, [bookmarks]);

  const openBulkTagDialog = useCallback(() => {
    if (visibleSelectedBookmarkIds.length === 0) return;
    setTagTargetIds(visibleSelectedBookmarkIds);
    setTagDialogOpen(true);
  }, [visibleSelectedBookmarkIds]);

  const openBulkCollectionDialog = useCallback(() => {
    if (visibleSelectedBookmarkIds.length === 0) return;
    setCollectionTargetIds(visibleSelectedBookmarkIds);
    setCollectionDialogOpen(true);
  }, [visibleSelectedBookmarkIds]);

  const handleBulkHide = useCallback(async () => {
    if (visibleSelectedBookmarkIds.length === 0) return;
    const confirmed = window.confirm(
      `Hide ${visibleSelectedBookmarkIds.length} bookmark${visibleSelectedBookmarkIds.length === 1 ? "" : "s"} from MarkMaster?`
    );
    if (!confirmed) return;

    await actions.handleDeleteBookmark(visibleSelectedBookmarkIds);
  }, [actions, visibleSelectedBookmarkIds]);

  const handleBookmarkAddTag = useCallback((id: string) => {
    setActiveBookmarkId(id);
    setTagTargetIds([id]);
    setTagDialogOpen(true);
  }, []);

  const handleBookmarkAddToCollection = useCallback((id: string) => {
    setActiveBookmarkId(id);
    setCollectionTargetIds([id]);
    setCollectionDialogOpen(true);
  }, []);

  const handleBookmarkAddNote = useCallback((id: string) => {
    setActiveBookmarkId(id);
    setNoteDialogOpen(true);
  }, []);

  // When a highlight is clicked, focus it as the sole item in the feed for immediate triage.
  // This "brings the post to the top" (the feed becomes a 1-item view) and gives strong visual + action affordances.
  const focusPerformanceHighlight = useCallback(
    (id: string) => {
      setBookmarkId(id);
      setActiveBookmarkId(id);
      setPage(1);
    },
    [setBookmarkId, setActiveBookmarkId, setPage]
  );

  const handleSyncComplete = useCallback(() => {
    void invalidateLibraryQueries(queryClient, { refetchType: "all" });
  }, [queryClient]);

  const handleCreateCollectionOpen = useCallback(() => {
    setCreateCollectionOpen(true);
  }, []);

  useKeyboardShortcuts({
    activeBookmarkId: selectionMode ? null : activeBookmarkIdForView,
    bookmarks: selectionMode ? [] : bookmarks,
    onNavigate: setActiveBookmarkId,
    onSearch: () => searchInputRef.current?.focus(),
    onTag: () => {
      if (!activeBookmarkIdForView) return;
      setTagTargetIds([activeBookmarkIdForView]);
      setTagDialogOpen(true);
    },
    onCollection: () => {
      if (!activeBookmarkIdForView) return;
      setCollectionTargetIds([activeBookmarkIdForView]);
      setCollectionDialogOpen(true);
    },
    onNote: () => setNoteDialogOpen(true),
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }

      if (e.metaKey || e.ctrlKey) {
        const quickMediaFilters: Record<string, MediaFilter> = {
          "1": "all",
          "2": "images",
          "3": "video",
          "4": "links",
          "5": "text-only",
        };

        const nextFilter = quickMediaFilters[e.key];
        if (nextFilter) {
          e.preventDefault();
          setMediaFilter(nextFilter);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setMediaFilter]);

  const dbUser = session?.dbUser;

  const handleCommandPaletteFilter = useCallback(
    (filter: { mediaFilter?: MediaFilter; selectedTag?: string }) => {
      if (filter.mediaFilter) {
        filters.setMediaFilter(filter.mediaFilter);
      }
      if (filter.selectedTag) {
        filters.setSelectedTags([filter.selectedTag]);
        filters.setPage(1);
      }
    },
    [filters]
  );

  const primaryFilterLabel =
    filters.mediaFilter === "all"
      ? "All Bookmarks"
      : MEDIA_FILTER_LABELS[filters.mediaFilter] || filters.mediaFilter;
  const primaryFilterCompactLabel =
    filters.mediaFilter === "all" ? "All" : primaryFilterLabel;

  const selectedTagEntries = useMemo(
    () =>
      filters.selectedTags.flatMap((tagId) => {
        const tag = tags.find((entry) => entry.id === tagId);
        return tag ? [tag] : [];
      }),
    [filters.selectedTags, tags]
  );

  return (
    <div className="app-shell-bg app-viewport flex overflow-hidden">
      <div className="hidden md:block h-full min-h-0 shrink-0 overflow-hidden">
        <Sidebar
          tags={tags}
          collections={collections}
          selectedTags={filters.selectedTags}
          onTagToggle={filters.toggleTag}
          onCreateCollection={handleCreateCollectionOpen}
          lastSyncAt={dbUser?.lastSyncAt ? new Date(dbUser.lastSyncAt) : null}
          totalBookmarks={total}
          onSyncComplete={handleSyncComplete}
        />
      </div>

      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="app-main-scroll h-full overflow-x-hidden scrollbar-thin">
          <PageHeader
            sticky
            chromeless
            className={cn(
              "isolate border-b border-hairline-strong",
              appChromeFrostedClassName
            )}
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
                      totalBookmarks={total}
                      onSyncComplete={handleSyncComplete}
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
                  sortField={filters.sortField}
                  viewMode={viewMode}
                  onSortFieldChange={filters.setSortField}
                  onViewModeChange={setViewMode}
                  user={dbUser ?? undefined}
                />

                {(isFetching || filters.isSearchPending) && !isLoading && (
                  <p className="px-4 pb-1.5 text-xs text-muted-foreground sm:px-5">
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

          <DashboardDiscovery
            feedReady={feedReady}
            parentData={{
              rawData: highlightData,
              libraryData: libraryHighlightData,
              rawLoading: highlightsLoading,
              libraryLoading: libraryHighlightsLoading,
              rawError: highlightsError || libraryHighlightsError,
              refetchRaw: refetchDiscovery,
            }}
            activeBookmarkId={inspectorActive ? activeBookmarkIdForView : null}
            onSelectBookmark={setActiveBookmarkId}
            onFocusForTriage={focusPerformanceHighlight}
            onSaveAsCollection={handleSaveGemsAsCollection}
            className={inspectorActive ? "lg:max-w-[640px] lg:mx-0" : undefined}
          />

          {isLoading ? (
            <DashboardSkeleton viewMode={viewMode} />
          ) : isError ? (
            <div className={cn(bookmarkFeedColumnClassName, "flex h-64 items-center justify-center px-6")}>
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
                    "pb-2",
                    inspectorActive
                      ? "lg:max-w-[640px] lg:mx-0"
                      : bookmarkFeedColumnClassName
                  )}
                >
                  <div
                    className={
                      inspectorActive
                        ? cn(orbital.glass, "flex flex-wrap items-center gap-2 rounded-sm border border-primary/20 px-3 py-1.5 text-sm")
                        : "flex flex-wrap items-center gap-2 rounded-sm border border-primary/30 bg-primary/5 px-3 py-1.5 text-sm"
                    }
                  >
                    <span
                      className={
                        inspectorActive
                          ? cn(orbital.label, "text-primary")
                          : "text-[10px] font-bold uppercase tracking-[0.1em] text-primary"
                      }
                    >
                      Performance Highlight
                    </span>
                    <span
                      className={
                        inspectorActive
                          ? cn(orbital.label, "text-primary/70 text-xs")
                          : "text-muted-foreground text-xs"
                      }
                    >
                      Focused for quick tagging &amp; categorization
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setBookmarkId("");
                        setActiveBookmarkId(null);
                      }}
                      className="ml-auto rounded-sm px-2 py-0.5 text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                    >
                      Exit focus
                    </button>
                  </div>
                </div>
              )}

              {/* Two-column mission-control layout for library feed (first slice).
                  Left: constrained bookmark queue. Right: sticky OrbitalCard inspector (lg+ only, when active item).
                  Strictly gated behind orbital theme via useOrbitalTheme() + inspectorActive (P0 fix).
                  Default experience byte-for-byte untouched. */}
              <div
                className={cn(
                  "flex flex-col gap-3",
                  inspectorActive && "lg:flex-row lg:items-start lg:gap-5 lg:pt-1"
                )}
              >
                {/* Left column — the main library feed (constrained on lg when inspector shown) */}
                <div
                  className={cn(
                    "min-w-0 flex-1",
                    inspectorActive && bookmarkFeedLeftInspectorClassName
                  )}
                >
                  <BookmarkList
                    bookmarks={bookmarks}
                    viewMode={viewMode}
                    searchQuery={searchQuery}
                    aboveFoldMediaBookmarkId={aboveFoldMediaBookmarkId}
                    selectionMode={selectionMode}
                    selectedBookmarkIdSet={selectedBookmarkIdSet}
                    activeBookmarkId={inspectorActive ? activeBookmarkIdForView : null}
                    onSelect={inspectorActive ? setActiveBookmarkId : () => {}}
                    onSelectionChange={toggleBookmarkSelection}
                    onTagClick={filters.toggleTag}
                    onAddTag={handleBookmarkAddTag}
                    onAddToCollection={handleBookmarkAddToCollection}
                    onAddNote={handleBookmarkAddNote}
                    onDelete={actions.handleDeleteBookmark}
                    performanceHighlightId={performanceFocusedId}
                  />
                </div>

                {/* Right column — persistent library inspector (lg+ , sticky) */}
                {inspectorActive && activeBookmark && (
                  <div className={bookmarkFeedRightInspectorWrapperClassName}>
                    <LibraryBookmarkInspector
                      bookmark={activeBookmark}
                      onClose={() => setActiveBookmarkId(null)}
                      onAddTag={handleBookmarkAddTag}
                      onAddToCollection={handleBookmarkAddToCollection}
                      onAddNote={handleBookmarkAddNote}
                      onReviewInOrbit={(id) =>
                        router.push(`/orbit?highlightId=${id}`)
                      }
                    />
                  </div>
                )}
              </div>
            </>
          )}

          {!isLoading && !isError && bookmarks.length > 0 && (
            <div className={inspectorActive ? "w-full lg:max-w-[640px]" : bookmarkFeedColumnClassName}>
              <PaginationControls
                page={filters.page}
                totalPages={totalPages}
                onPageChange={(next) => filters.setPage(next)}
              />
            </div>
          )}
        </div>
      </div>

      <AddTagDialog
        open={tagDialogOpen}
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
        bookmarkTags={getSharedTagIds(tagDialogBookmarks)}
      />

      <AddNoteDialog
        open={noteDialogOpen}
        onOpenChange={setNoteDialogOpen}
        bookmarkId={activeBookmarkIdForView}
        existingNote={activeBookmark ? activeBookmark.notes[0]?.content : undefined}
        onSave={actions.handleAddNote}
      />

      <AddToCollectionDialog
        open={collectionDialogOpen}
        onOpenChange={(open) => {
          setCollectionDialogOpen(open);
          if (!open) {
            setCollectionTargetIds([]);
          }
        }}
        bookmarkIds={collectionTargetIds}
        collections={collections}
        bookmarkCollections={getSharedCollectionIds(collectionDialogBookmarks)}
        onAddToCollection={actions.handleAddToCollection}
        onCreateCollection={createCollectionQuick}
      />

      <CreateCollectionDialog
        open={createCollectionOpen}
        onOpenChange={setCreateCollectionOpen}
        onCreateCollection={createCollection}
      />

      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        tags={tags}
        onFilterChange={handleCommandPaletteFilter}
      />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="app-min-viewport flex items-center justify-center">
          <div role="status" aria-label="Loading" className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
