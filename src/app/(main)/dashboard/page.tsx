"use client";

import { useState, useEffect, Suspense, useRef, useMemo, useCallback } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { CheckSquare, SlidersHorizontal } from "lucide-react";
import { SearchBar } from "@/components/search-bar";
import { Sidebar } from "@/components/sidebar-dynamic";
import { MobileSidebar } from "@/components/mobile-sidebar";
import { SortControls } from "@/components/sort-controls";
import { FilterPanel } from "@/components/filter-panel";
import { PageHeader } from "@/components/page-header";
import { appChromeFrostedClassName } from "@/lib/app-chrome";
import { UserNavDynamic } from "@/components/user-nav-dynamic";
import { useBookmarkFilters } from "@/hooks/use-bookmark-filters";
import { useBookmarkActions } from "@/hooks/use-bookmark-actions";
import { useCreateCollection } from "@/hooks/use-create-collection";
import { useCollectionsQuery, useTagsQuery } from "@/hooks/use-library-data";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { fetchJson, sendJson } from "@/lib/fetch-json";
import { invalidateLibraryQueries, invalidateCollectionsQuery } from "@/lib/query-invalidation";
import { cn } from "@/lib/utils";
import type {
  ViewMode,
  BookmarkWithRelations,
  MediaFilter,
} from "@/types";
import { PerformanceHighlights } from "@/components/performance-highlights";
import { usePerformanceHighlights as usePerformanceHighlightsHook } from "@/hooks/use-performance-highlights";
import { getDislikedHighlightIds, getLikedHighlightIds } from "@/lib/highlight-feedback";
import { trackFlywheelEvent } from "@/lib/flywheel";
import { HighlightsDigest } from "@/components/highlights-digest";
import { toast } from "sonner";
import {
  bookmarkFeedColumnClassName,
  bookmarkFeedLeftInspectorClassName,
  bookmarkFeedRightInspectorWrapperClassName,
} from "@/lib/bookmark-feed-layout";
import { BookmarkList } from "./bookmark-list";
import { DashboardSkeleton } from "./dashboard-skeleton";
import { DashboardEmptyState } from "./dashboard-empty-state";
import { DashboardErrorState } from "./dashboard-error-state";
import { PaginationBar } from "./pagination-bar";
import { SelectionToolbar } from "./selection-toolbar";

// Canonical orbital components for two-column mission-control inspector (dashboard slice)
import {
  orbital,
  OrbitalCard,
  MissionControlHeader,
  TelemetryStat,
  OrbitalBadge,
} from "@/components/orbital";
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
      const newCollectionId = await createCollectionQuick(suggestedName);

      // Add all the gems to the newly created collection
      for (const b of bookmarks) {
        await sendJson(`/api/collections/${newCollectionId}/items`, {
          method: "POST",
          body: { bookmarkIds: [b.id] },
        });
      }

      await invalidateCollectionsQuery(queryClient);
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

  const bookmarks: BookmarkWithRelations[] = bookmarkData?.bookmarks ?? EMPTY_BOOKMARKS;
  const total: number = bookmarkData?.total || 0;
  const totalPages: number = bookmarkData?.totalPages || 1;

  const highlightBookmarks: BookmarkWithRelations[] = highlightData?.bookmarks ?? EMPTY_BOOKMARKS;
  const unsortedTotal: number = highlightData?.total || 0;

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
    void invalidateLibraryQueries(queryClient);
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

  // Compute temporal freshness for Highlights using last sync (Phase 1, still powers 8 signals)
  const lastSyncAtForHighlights = dbUser?.lastSyncAt ? new Date(dbUser.lastSyncAt) : null;
  const newSinceLastSync = lastSyncAtForHighlights
    ? highlightBookmarks.filter((b) => new Date(b.bookmarkedAt) > lastSyncAtForHighlights).length
    : 0;

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
          <div className="sticky top-0 z-20 isolate">
            <div
              className={cn(
                "border-b border-hairline-strong",
                appChromeFrostedClassName
              )}
            >
              <PageHeader chromeless bodyClassName="px-0 py-0">
                <div className="dashboard-toolbar px-4 py-2.5 sm:px-5">
                  <div className="dashboard-toolbar-row flex flex-wrap items-center gap-2">
                    <div className="dashboard-mobile-menu md:hidden">
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
                    </div>

                    <div className="dashboard-filter-strip order-3 flex min-w-0 w-full flex-wrap items-center gap-2 sm:order-none sm:flex-1 sm:w-auto">
                      <button
                        onClick={() => {
                          filters.setSelectedTags([]);
                          filters.setMediaFilter("all");
                        }}
                        aria-label={`${primaryFilterLabel} (${total.toLocaleString()})`}
                        className="dashboard-filter-summary inline-flex h-9 max-w-full items-center gap-2 whitespace-nowrap rounded-sm border border-hairline-strong border-l-primary bg-background/35 px-3 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                      >
                        <span className="dashboard-filter-summary-full truncate">
                          {primaryFilterLabel}
                        </span>
                        <span className="dashboard-filter-summary-compact truncate">
                          {primaryFilterCompactLabel}
                        </span>
                        <span className="text-xs opacity-70" aria-hidden>
                          {total.toLocaleString()}
                        </span>
                      </button>
                      {filters.selectedTags.map((tagId) => {
                        const tag = tags.find((t) => t.id === tagId);
                        return tag ? (
                          <button
                            key={tagId}
                            onClick={() => filters.toggleTag(tagId)}
                            className="inline-flex items-center gap-1 border-b-2 border-primary px-0.5 py-1 text-xs font-semibold text-foreground transition-colors hover:text-primary"
                          >
                            #{tag.name}
                            <span
                              className="ml-0.5 text-primary/60 hover:text-primary"
                              aria-hidden
                            >
                              ×
                            </span>
                          </button>
                        ) : null;
                      })}
                      <button
                        type="button"
                        onClick={() => setShowFilters((v) => !v)}
                        aria-expanded={showFilters}
                        aria-controls="dashboard-filter-panel"
                        aria-label={showFilters ? "Hide filters" : "Show filters"}
                        className={`dashboard-action-button inline-flex h-9 items-center gap-1.5 rounded-sm border px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                          showFilters
                            ? "border-primary/35 bg-primary/10 text-foreground"
                            : "border-hairline-strong bg-background/35 text-muted-foreground hover:border-primary/30 hover:bg-accent-soft hover:text-foreground"
                        }`}
                      >
                        <SlidersHorizontal className="size-4" aria-hidden />
                        <span className="dashboard-action-label">Filters</span>
                        {filters.hasActiveFilters && (
                          <span
                            className="w-2 h-2 rounded-full bg-primary"
                            aria-hidden
                          />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (selectionMode) {
                            clearSelection();
                          } else {
                            setSelectionMode(true);
                          }
                        }}
                        aria-pressed={selectionMode}
                        aria-label={
                          selectionMode ? "Exit selection mode" : "Enter selection mode"
                        }
                        className={`dashboard-action-button inline-flex h-9 items-center gap-1.5 rounded-sm border px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                          selectionMode
                            ? "border-primary/35 bg-primary/10 text-foreground"
                            : "border-hairline-strong bg-background/35 text-muted-foreground hover:border-primary/30 hover:bg-accent-soft hover:text-foreground"
                        }`}
                      >
                        <CheckSquare className="size-4" aria-hidden />
                        <span className="dashboard-action-label">
                          {selectionMode ? "Done" : "Select"}
                        </span>
                      </button>
                    </div>

                    <div className="dashboard-toolbar-controls order-2 ml-auto flex w-full shrink-0 items-center gap-2 sm:order-none sm:ml-0 sm:w-auto">
                      <SortControls
                        sortField={filters.sortField}
                        viewMode={viewMode}
                        onSortFieldChange={filters.setSortField}
                        onViewModeChange={setViewMode}
                      />
                      {dbUser && (
                        <div className="dashboard-user-nav shrink-0">
                          <UserNavDynamic user={dbUser} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

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
              </PageHeader>

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
            </div>

            <div className="relative mt-3 px-4 pb-3 pt-0 sm:mt-3.5 sm:px-5">
              <div
                className={cn(
                  "relative z-10 overflow-hidden rounded-sm border border-hairline-strong shadow-[0_18px_44px_-34px_color-mix(in_srgb,var(--foreground)_80%,transparent)]",
                  inspectorActive ? "w-full lg:max-w-[640px]" : bookmarkFeedColumnClassName,
                  appChromeFrostedClassName
                )}
              >
                <SearchBar
                  ref={searchInputRef}
                  glass
                  value={filters.search}
                  onChange={filters.setSearch}
                  placeholder="Search bookmarks, authors, notes..."
                />
              </div>
            </div>
          </div>

          {!highlightsLoading && highlightsError && (
            <div
              className={cn(
                "mx-auto mb-3 flex max-w-[960px] flex-wrap items-center justify-between gap-2 rounded-sm border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive",
                inspectorActive ? "lg:mx-0 lg:max-w-[640px]" : "px-4 sm:px-5"
              )}
            >
              <span>Could not load Highlights.</span>
              <button
                type="button"
                onClick={() => refetchHighlights()}
                className="text-xs font-medium underline underline-offset-2"
              >
                Retry
              </button>
            </div>
          )}

          {!highlightsLoading && !highlightsError && highlightBookmarks.length > 0 && (
            <PerformanceHighlights
              title="Highlights"
              subtitle={
                typeof unsortedTotal === "number"
                  ? `${unsortedTotal.toLocaleString()} untouched high-performers${newSinceLastSync > 0 ? ` • ${newSinceLastSync} new since last sync` : ''}`
                  : undefined
              }
              bookmarks={highlightBookmarks}
              total={unsortedTotal}
              activeBookmarkId={inspectorActive ? activeBookmarkIdForView : null}
              onSelect={setActiveBookmarkId}
              onFocusForTriage={focusPerformanceHighlight}
              onOrbitReview={(id) => {
                trackFlywheelEvent("cta.review_in_orbit", { source: "highlights", bookmarkId: id });
                router.push(`/orbit?highlightId=${id}`);
              }}
              isRawMode={true}
              className={inspectorActive ? "lg:max-w-[640px] lg:mx-0" : undefined}
            />
          )}

          {/* Weekly Gems digest — own queries; show whenever the main library is ready */}
          {!isLoading && !isError && (
            <HighlightsDigest
              onSaveAsCollection={handleSaveGemsAsCollection}
              className={inspectorActive ? "lg:max-w-[640px] lg:mx-0 pb-4 lg:pb-6" : undefined}
            />
          )}

          {isLoading ? (
            <DashboardSkeleton viewMode={viewMode} />
          ) : isError ? (
            <div className={bookmarkFeedColumnClassName}>
              <DashboardErrorState
                message={error instanceof Error ? error.message : undefined}
                onRetry={() => refetch()}
              />
            </div>
          ) : bookmarks.length === 0 ? (
            <div className={bookmarkFeedColumnClassName}>
              <DashboardEmptyState
                search={filters.search}
                hasActiveFilters={filters.hasActiveFilters}
                onClearFilters={filters.clearFilters}
                lastSyncAt={dbUser?.lastSyncAt ? new Date(dbUser.lastSyncAt) : null}
                onSyncComplete={handleSyncComplete}
              />
            </div>
          ) : (
            <>
              {performanceFocusedId && (
                <div
                  className={cn(
                    "px-4 pb-2",
                    inspectorActive
                      ? "lg:max-w-[640px] lg:mx-0"
                      : "mx-auto w-full max-w-[960px]"
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
                          : "font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-primary"
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
                {inspectorActive && (
                  <div className={bookmarkFeedRightInspectorWrapperClassName}>
                    <OrbitalCard className="sticky top-4 p-4 space-y-4 border-primary/20">
                      <MissionControlHeader
                        title="Library Inspector"
                        right={
                          <button
                            onClick={() => setActiveBookmarkId(null)}
                            className={cn(orbital.label, "text-primary/80 hover:text-primary")}
                          >
                            Close
                          </button>
                        }
                      />

                      {/* Core content: tweetText + author (fixed real BookmarkWithRelations fields; was title/text/authorName) */}
                      <div className="space-y-1">
                        <div className="text-sm font-medium text-foreground/90 line-clamp-2">
                          {activeBookmark.tweetText?.slice(0, 120) || "Bookmark"}
                        </div>
                        {activeBookmark.authorUsername && (
                          <div className="text-xs text-primary/60">@{activeBookmark.authorUsername}</div>
                        )}
                      </div>

                      {/* Telemetry stats row using canonical component */}
                      {activeBookmark.publicMetrics && (
                        <div className="flex items-center gap-4 pt-1">
                          <TelemetryStat
                            value={activeBookmark.publicMetrics.like_count?.toLocaleString() ?? "—"}
                            label="Likes"
                            tone="cyan"
                          />
                          <TelemetryStat
                            value={activeBookmark.publicMetrics.reply_count?.toLocaleString() ?? "—"}
                            label="Replies"
                            tone="cyan"
                          />
                          <TelemetryStat
                            value={activeBookmark.publicMetrics.retweet_count?.toLocaleString() ?? "—"}
                            label="Reposts"
                            tone="cyan"
                          />
                        </div>
                      )}

                      {/* Tags as OrbitalBadges (cyan under orbital) */}
                      {activeBookmark.tags.length > 0 && (
                        <div>
                          <div className={cn(orbital.label, "text-primary/70 mb-1.5")}>Tags</div>
                          <div className="flex flex-wrap gap-1.5">
                            {activeBookmark.tags.slice(0, 6).map((t) => (
                              <OrbitalBadge key={t.tag.id} tone="cyan">
                                {t.tag.name}
                              </OrbitalBadge>
                            ))}
                            {activeBookmark.tags.length > 6 && (
                              <OrbitalBadge tone="emerald">+{activeBookmark.tags.length - 6}</OrbitalBadge>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Collections as badges (bronze) */}
                      {activeBookmark.collectionItems.length > 0 && (
                        <div>
                          <div className={cn(orbital.label, "text-primary/70 mb-1.5")}>Collections</div>
                          <div className="flex flex-wrap gap-1.5">
                            {activeBookmark.collectionItems.slice(0, 3).map((c, idx) => (
                              <OrbitalBadge key={idx} tone="bronze">
                                {c.collection.name}
                              </OrbitalBadge>
                            ))}
                            {activeBookmark.collectionItems.length > 3 && (
                              <OrbitalBadge tone="emerald">+{activeBookmark.collectionItems.length - 3}</OrbitalBadge>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Quick actions (library-native) */}
                      <div className="pt-2 space-y-2">
                        <button
                          onClick={() => handleBookmarkAddTag(activeBookmark.id)}
                          className="w-full rounded-sm border border-primary/30 bg-primary/10 py-1.5 text-xs text-primary hover:bg-primary/15 transition-colors"
                        >
                          Add tag
                        </button>
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          <button
                            onClick={() => handleBookmarkAddToCollection(activeBookmark.id)}
                            className="rounded-sm border border-primary/30 py-1 text-primary/80 hover:bg-primary/10 hover:text-primary transition-colors"
                          >
                            Add to collection
                          </button>
                          <button
                            onClick={() => router.push(`/orbit?highlightId=${activeBookmark.id}`)}
                            className="rounded-sm border border-primary/30 py-1 text-primary/80 hover:bg-primary/10 hover:text-primary transition-colors"
                          >
                            Review in Orbit
                          </button>
                        </div>
                        <button
                          onClick={() => handleBookmarkAddNote(activeBookmark.id)}
                          className="w-full rounded-sm border border-primary/30 py-1 text-xs text-primary/80 hover:bg-primary/10 hover:text-primary transition-colors"
                        >
                          Add note
                        </button>
                      </div>

                      <div className={cn(orbital.label, "pt-1 text-primary/50")}>
                        Click cards to inspect. Inspector updates live.
                      </div>
                    </OrbitalCard>
                  </div>
                )}
              </div>
            </>
          )}

          <div className={inspectorActive ? "w-full lg:max-w-[640px]" : bookmarkFeedColumnClassName}>
            <PaginationBar
              page={filters.page}
              totalPages={totalPages}
              onPageChange={filters.setPage}
            />
          </div>
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
