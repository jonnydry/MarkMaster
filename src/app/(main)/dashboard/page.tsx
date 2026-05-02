"use client";

import { useState, useEffect, Suspense, useRef, useMemo, useCallback } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
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
import { fetchJson } from "@/lib/fetch-json";
import { invalidateLibraryQueries } from "@/lib/query-invalidation";
import { cn } from "@/lib/utils";
import type {
  ViewMode,
  BookmarkWithRelations,
  MediaFilter,
} from "@/types";
import { bookmarkFeedColumnClassName } from "@/lib/bookmark-feed-layout";
import { BookmarkList } from "./bookmark-list";
import { DashboardSkeleton } from "./dashboard-skeleton";
import { DashboardEmptyState } from "./dashboard-empty-state";
import { DashboardErrorState } from "./dashboard-error-state";
import { PaginationBar } from "./pagination-bar";
import { SelectionToolbar } from "./selection-toolbar";

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
                {filters.hasActiveFilters && (
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
                  "relative z-10 overflow-hidden rounded-2xl border border-hairline-strong shadow-xl",
                  bookmarkFeedColumnClassName,
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
              />
            </div>
          ) : (
            <BookmarkList
              bookmarks={bookmarks}
              viewMode={viewMode}
              searchQuery={searchQuery}
              aboveFoldMediaBookmarkId={aboveFoldMediaBookmarkId}
              selectionMode={selectionMode}
              selectedBookmarkIdSet={selectedBookmarkIdSet}
              activeBookmarkId={activeBookmarkIdForView}
              onSelect={setActiveBookmarkId}
              onSelectionChange={toggleBookmarkSelection}
              onTagClick={filters.toggleTag}
              onAddTag={handleBookmarkAddTag}
              onAddToCollection={handleBookmarkAddToCollection}
              onAddNote={handleBookmarkAddNote}
              onDelete={actions.handleDeleteBookmark}
            />
          )}

          <div className={bookmarkFeedColumnClassName}>
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
        <div className="flex items-center justify-center h-screen">
          <div role="status" aria-label="Loading" className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
