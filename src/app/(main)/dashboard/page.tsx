"use client";

import { useState, useEffect, Suspense, useRef, useMemo, useCallback } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { CheckSquare, Tag, FolderPlus, Trash2, ChevronLeft, ChevronRight, SlidersHorizontal, Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchBar } from "@/components/search-bar";
import { Sidebar } from "@/components/sidebar-dynamic";
import { MobileSidebar } from "@/components/mobile-sidebar";
import { SortControls } from "@/components/sort-controls";
import { FilterPanel } from "@/components/filter-panel";
import { BookmarkCard } from "@/components/bookmark-card";
import { PageHeader } from "@/components/page-header";
import { appChromeFrostedClassName } from "@/lib/app-chrome";
import { UserNavDynamic } from "@/components/user-nav-dynamic";
import { useBookmarkFilters } from "@/hooks/use-bookmark-filters";
import { useBookmarkActions } from "@/hooks/use-bookmark-actions";
import { useCreateCollection } from "@/hooks/use-create-collection";
import { useCollectionsQuery, useTagsQuery } from "@/hooks/use-library-data";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { fetchJson } from "@/lib/fetch-json";
import { invalidateLibraryQueries } from "@/lib/query-invalidation";
import { getStaggerClass } from "@/lib/stagger";
import { cn } from "@/lib/utils";
import type {
  ViewMode,
  BookmarkWithRelations,
  MediaFilter,
} from "@/types";

type BookmarkResponse = {
  bookmarks: BookmarkWithRelations[];
  total: number;
  totalPages: number;
};

const EMPTY_BOOKMARKS: BookmarkWithRelations[] = [];

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
  const queryClient = useQueryClient();
  const { data: session } = useSession();

  const filters = useBookmarkFilters();
  const actions = useBookmarkActions();
  const { createCollectionQuick, createCollection } = useCreateCollection();

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

  const bookmarks: BookmarkWithRelations[] = bookmarkData?.bookmarks ?? EMPTY_BOOKMARKS;
  const total: number = bookmarkData?.total || 0;
  const totalPages: number = bookmarkData?.totalPages || 1;
  const { setSelectedTags, setPage, setMediaFilter, setAuthorFilter } = filters;
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
  const tagFromUrlRef = useRef<string | null>(null);
  const tagsFromUrlRef = useRef<string | null>(null);
  const authorFromUrlRef = useRef<string | null>(null);
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
    tagFromUrlRef.current = tagFromUrl;
    tagsFromUrlRef.current = tagsFromUrl;
    authorFromUrlRef.current = authorFromUrl;
  }, [tagFromUrl, tagsFromUrl, authorFromUrl, setPage, setSelectedTags, setAuthorFilter]);

  const activeBookmark = bookmarks.find((b) => b.id === activeBookmarkId);

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

  const handleSyncComplete = useCallback(() => {
    void invalidateLibraryQueries(queryClient);
  }, [queryClient]);

  const handleCreateCollectionOpen = useCallback(() => {
    setCreateCollectionOpen(true);
  }, []);

  useKeyboardShortcuts({
    activeBookmarkId: selectionMode ? null : activeBookmarkId,
    bookmarks: selectionMode ? [] : bookmarks,
    onNavigate: setActiveBookmarkId,
    onSearch: () => searchInputRef.current?.focus(),
    onTag: () => {
      if (!activeBookmarkId) return;
      setTagTargetIds([activeBookmarkId]);
      setTagDialogOpen(true);
    },
    onCollection: () => {
      if (!activeBookmarkId) return;
      setCollectionTargetIds([activeBookmarkId]);
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

  const handleCommandPaletteFilter = (filter: {
    mediaFilter?: MediaFilter;
    selectedTag?: string;
  }) => {
    if (filter.mediaFilter) {
      filters.setMediaFilter(filter.mediaFilter);
    }
    if (filter.selectedTag) {
      filters.setSelectedTags([filter.selectedTag]);
      filters.setPage(1);
    }
  };

  const mediaFilterLabels: Record<string, string> = {
    images: "Images",
    video: "Video",
    links: "Links",
    "text-only": "Text",
  };
  const primaryFilterLabel =
    filters.mediaFilter === "all"
      ? "All Bookmarks"
      : mediaFilterLabels[filters.mediaFilter] || filters.mediaFilter;
  const hasSupplementalFilters =
    filters.selectedTags.length > 0 ||
    filters.authorFilter !== "" ||
    filters.dateFrom !== "" ||
    filters.dateTo !== "";

  return (
    <div className="app-shell-bg flex h-screen overflow-x-hidden">
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

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-thin">
          <div className="sticky top-0 z-20 isolate">
            <div
              className={cn(
                "border-b border-hairline-strong",
                appChromeFrostedClassName
              )}
            >
            <PageHeader chromeless bodyClassName="px-0 py-0">
          <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 sm:px-5">
            <div className="md:hidden">
              <MobileSidebar
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

            <div className="order-3 flex min-w-0 w-full flex-wrap items-center gap-1.5 sm:order-none sm:flex-1 sm:w-auto">
              <button
                onClick={() => {
                  filters.setSelectedTags([]);
                  filters.setMediaFilter("all");
                }}
                aria-label={`${primaryFilterLabel} (${total.toLocaleString()})`}
                className="inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium bg-primary text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                {primaryFilterLabel}
                <span className="hidden text-xs opacity-70 sm:inline" aria-hidden>{total.toLocaleString()}</span>
              </button>
              {filters.selectedTags.map((tagId) => {
                const tag = tags.find((t) => t.id === tagId);
                return tag ? (
                  <button
                    key={tagId}
                    onClick={() => filters.toggleTag(tagId)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 transition-colors border border-primary/20"
                  >
                    #{tag.name}
                    <span className="text-primary/60 hover:text-primary ml-0.5" aria-hidden>×</span>
                  </button>
                ) : null;
              })}
              <button
                type="button"
                onClick={() => setShowFilters((v) => !v)}
                aria-expanded={showFilters}
                aria-controls="dashboard-filter-panel"
                aria-label={showFilters ? "Hide filters" : "Show filters"}
                className={`inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                  showFilters
                    ? "bg-secondary text-foreground border-border"
                    : "text-muted-foreground bg-secondary hover:text-foreground border-border"
                }`}
              >
                <SlidersHorizontal className="size-4" aria-hidden />
                <span className="hidden sm:inline">Filters</span>
                {hasSupplementalFilters && (
                  <span className="w-2 h-2 rounded-full bg-primary" aria-hidden />
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
                aria-label={selectionMode ? "Exit selection mode" : "Enter selection mode"}
                className={`inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                  selectionMode
                    ? "bg-secondary text-foreground border-border"
                    : "text-muted-foreground bg-secondary hover:text-foreground border-border"
                }`}
              >
                <CheckSquare className="size-4" aria-hidden />
                <span className="hidden sm:inline">
                  {selectionMode ? "Done" : "Select"}
                </span>
              </button>
            </div>

            <div className="order-2 ml-auto flex w-full items-center gap-2 sm:order-none sm:ml-0 sm:w-auto shrink-0">
              <SortControls
                sortField={filters.sortField}
                viewMode={viewMode}
                onSortFieldChange={filters.setSortField}
                onViewModeChange={setViewMode}
              />
              {dbUser && <UserNavDynamic user={dbUser} />}
            </div>
          </div>

          {(isFetching || filters.isSearchPending) && !isLoading && (
            <p className="px-4 pb-1.5 text-xs text-muted-foreground sm:px-5">Updating results...</p>
          )}
          {selectionMode && (
            <div className="animate-slide-down-fade flex flex-wrap items-center justify-between gap-2 bg-secondary/50 px-4 py-2.5 sm:px-5">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium text-foreground">
                  {visibleSelectedBookmarkIds.length > 0
                    ? `${visibleSelectedBookmarkIds.length} selected`
                    : "Select bookmarks to apply bulk actions"}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 px-3 text-sm"
                  onClick={selectVisibleBookmarks}
                >
                  Select page
                </Button>
                {visibleSelectedBookmarkIds.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-10 px-3 text-sm"
                    onClick={clearSelection}
                  >
                    Clear
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 gap-1.5 px-3 text-sm"
                  disabled={visibleSelectedBookmarkIds.length === 0}
                  onClick={openBulkTagDialog}
                >
                  <Tag className="size-4" />
                  Tag
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 gap-1.5 px-3 text-sm"
                  disabled={visibleSelectedBookmarkIds.length === 0}
                  onClick={openBulkCollectionDialog}
                >
                  <FolderPlus className="size-4" />
                  Add to Collection
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 gap-1.5 px-3 text-sm text-destructive hover:text-destructive"
                  disabled={visibleSelectedBookmarkIds.length === 0}
                  onClick={() => void handleBulkHide()}
                >
                  <Trash2 className="size-4" />
                  Hide
                </Button>
              </div>
            </div>
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
                  "relative z-10 mx-auto max-w-2xl overflow-hidden rounded-2xl border border-hairline-strong shadow-xl",
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

          {isLoading ? (
            <div
              className="max-w-2xl mx-auto space-y-0"
              role="status"
              aria-live="polite"
              aria-label="Loading bookmarks"
            >
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className={`border-b border-border px-4 py-3 sm:px-5 ${getStaggerClass(i, "animate-fade-in") ?? ""}`}>
                  <div className="flex gap-4">
                    <div className="w-10 h-10 rounded-full skeleton-shimmer shrink-0" />
                    <div className="flex-1 space-y-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-3.5 w-20 rounded skeleton-shimmer" />
                        <div className="h-3 w-14 rounded skeleton-shimmer" />
                      </div>
                      <div className="space-y-1.5">
                        <div className="h-3 w-full rounded skeleton-shimmer" />
                        <div className="h-3 w-4/5 rounded skeleton-shimmer" />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              <span className="sr-only">Loading bookmarks</span>
            </div>
          ) : isError ? (
            <div className="flex items-center justify-center h-64 px-6">
              <div className="text-center space-y-3 max-w-md">
                <p className="text-lg font-medium">Bookmarks could not be loaded</p>
                <p className="text-sm text-muted-foreground">
                  {error instanceof Error ? error.message : "Please try again."}
                </p>
                <Button onClick={() => refetch()} size="sm">
                  Retry
                </Button>
              </div>
            </div>
          ) : bookmarks.length === 0 ? (
            <div className="flex h-72 items-center justify-center px-4 sm:px-6">
              <div className="animate-fade-in rounded-2xl border border-hairline-soft bg-surface-1 px-6 py-8 text-center shadow-sm sm:px-8">
                <Bookmark className="mx-auto mb-4 h-12 w-12 text-muted-foreground/40" />
                <p className="mb-2 text-lg font-medium heading-font">No bookmarks found</p>
                <p className="mx-auto max-w-md text-sm text-muted-foreground">
                  {filters.search || filters.hasActiveFilters
                    ? "Try adjusting your filters or search query"
                    : "Use Sync in the sidebar (menu on mobile) to fetch your bookmarks from X"}
                </p>
                {(filters.search || filters.hasActiveFilters) && (
                  <div className="mt-4 flex justify-center">
                    <Button variant="outline" size="sm" onClick={filters.clearFilters}>
                      Clear filters
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 p-3">
              {bookmarks.map((bookmark, i) => (
                <BookmarkCard
                  key={bookmark.id}
                  bookmark={bookmark}
                  viewMode={viewMode}
                  searchQuery={filters.search || undefined}
                  priorityMedia={bookmark.id === aboveFoldMediaBookmarkId}
                  selected={
                    selectionMode
                      ? selectedBookmarkIdSet.has(bookmark.id)
                      : activeBookmarkId === bookmark.id
                  }
                  onSelect={setActiveBookmarkId}
                  selectionMode={selectionMode}
                  onSelectionChange={toggleBookmarkSelection}
                  onTagClick={filters.toggleTag}
                  onAddTag={handleBookmarkAddTag}
                  onAddToCollection={handleBookmarkAddToCollection}
                  onAddNote={handleBookmarkAddNote}
                  onDelete={actions.handleDeleteBookmark}
                  className={getStaggerClass(i, "animate-fade-in-up")}
                />
              ))}
            </div>
          ) : (
            <div className="max-w-2xl mx-auto">
              {bookmarks.map((bookmark, i) => (
                <BookmarkCard
                  key={bookmark.id}
                  bookmark={bookmark}
                  viewMode={viewMode}
                  searchQuery={filters.search || undefined}
                  priorityMedia={bookmark.id === aboveFoldMediaBookmarkId}
                  selected={
                    selectionMode
                      ? selectedBookmarkIdSet.has(bookmark.id)
                      : activeBookmarkId === bookmark.id
                  }
                  onSelect={setActiveBookmarkId}
                  selectionMode={selectionMode}
                  onSelectionChange={toggleBookmarkSelection}
                  onTagClick={filters.toggleTag}
                  onAddTag={handleBookmarkAddTag}
                  onAddToCollection={handleBookmarkAddToCollection}
                  onAddNote={handleBookmarkAddNote}
                  onDelete={actions.handleDeleteBookmark}
                  className={getStaggerClass(i, "animate-fade-in")}
                />
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex flex-col items-center gap-3 py-4 border-t border-border">
              <div className="flex items-center gap-2 text-sm" role="navigation" aria-label="Pagination">
                <button
                  type="button"
                  onClick={() => filters.setPage((p) => p - 1)}
                  disabled={filters.page <= 1}
                  aria-label="Previous page"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-hairline-soft bg-surface-1 text-foreground shadow-sm transition-colors hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <ChevronLeft className="size-4" aria-hidden />
                </button>
                <span className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
                  <span className="sr-only">Page </span>
                  {filters.page} <span className="text-muted-foreground/50" aria-hidden>of</span> <span className="sr-only">of</span> {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => filters.setPage((p) => p + 1)}
                  disabled={filters.page >= totalPages}
                  aria-label="Next page"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-hairline-soft bg-surface-1 text-foreground shadow-sm transition-colors hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <ChevronRight className="size-4" aria-hidden />
                </button>
              </div>
              <div className="w-24 h-1 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary/40 rounded-full transition-all duration-300"
                  style={{ width: `${((filters.page - 1) / Math.max(totalPages - 1, 1)) * 100}%` }}
                />
              </div>
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
        bookmarkId={activeBookmarkId}
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
        <div className="flex items-center justify-center h-screen">
          <div role="status" aria-label="Loading" className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
