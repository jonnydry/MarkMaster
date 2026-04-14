"use client";

import { useState, useEffect, Suspense, useRef, useMemo } from "react";
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
import { UserNav } from "@/components/user-nav";
import { useBookmarkFilters } from "@/hooks/use-bookmark-filters";
import { useBookmarkActions } from "@/hooks/use-bookmark-actions";
import { useCreateCollection } from "@/hooks/use-create-collection";
import { useCollectionsQuery, useTagsQuery } from "@/hooks/use-library-data";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { fetchJson } from "@/lib/fetch-json";
import { invalidateLibraryQueries } from "@/lib/query-invalidation";
import type {
  ViewMode,
  BookmarkWithRelations,
  MediaFilter,
} from "@/types";
import type { DbUser } from "@/lib/auth";

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
  const { data: session } = useSession() as {
    data: { dbUser?: DbUser } | null;
  };

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
  const { setSelectedTags, setPage, setMediaFilter } = filters;
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
  const tagFromUrlRef = useRef<string | null>(null);
  const tagsFromUrlRef = useRef<string | null>(null);
  useEffect(() => {
    if (tagsFromUrl && tagsFromUrl !== tagsFromUrlRef.current) {
      const next = tagsFromUrl.split(",").filter(Boolean);
      setSelectedTags(next);
      setPage(1);
    } else if (tagFromUrl && tagFromUrl !== tagFromUrlRef.current) {
      setSelectedTags([tagFromUrl]);
      setPage(1);
    }
    tagFromUrlRef.current = tagFromUrl;
    tagsFromUrlRef.current = tagsFromUrl;
  }, [tagFromUrl, tagsFromUrl, setPage, setSelectedTags]);

  const activeBookmark = bookmarks.find((b) => b.id === activeBookmarkId);

  const clearSelection = () => {
    setSelectedBookmarkIds([]);
    setSelectionMode(false);
  };

  const toggleBookmarkSelection = (bookmarkId: string, selected: boolean) => {
    setSelectedBookmarkIds((current) => {
      if (selected) {
        return current.includes(bookmarkId) ? current : [...current, bookmarkId];
      }
      return current.filter((id) => id !== bookmarkId);
    });
  };

  const selectVisibleBookmarks = () => {
    setSelectedBookmarkIds(bookmarks.map((bookmark) => bookmark.id));
  };

  const openBulkTagDialog = () => {
    if (visibleSelectedBookmarkIds.length === 0) return;
    setTagTargetIds(visibleSelectedBookmarkIds);
    setTagDialogOpen(true);
  };

  const openBulkCollectionDialog = () => {
    if (visibleSelectedBookmarkIds.length === 0) return;
    setCollectionTargetIds(visibleSelectedBookmarkIds);
    setCollectionDialogOpen(true);
  };

  const handleBulkHide = async () => {
    if (visibleSelectedBookmarkIds.length === 0) return;
    const confirmed = window.confirm(
      `Hide ${visibleSelectedBookmarkIds.length} bookmark${visibleSelectedBookmarkIds.length === 1 ? "" : "s"} from MarkMaster?`
    );
    if (!confirmed) return;

    await actions.handleDeleteBookmark(visibleSelectedBookmarkIds);
  };

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
    "text-only": "Text only",
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background max-w-[100vw]">
      <div className="hidden md:block h-full min-h-0 shrink-0 overflow-hidden">
        <Sidebar
          tags={tags}
          collections={collections}
          selectedTags={filters.selectedTags}
          onTagToggle={filters.toggleTag}
          onCreateCollection={() => setCreateCollectionOpen(true)}
          lastSyncAt={dbUser?.lastSyncAt ? new Date(dbUser.lastSyncAt) : null}
          totalBookmarks={total}
          onSyncComplete={() => void invalidateLibraryQueries(queryClient)}
        />
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="border-b border-border/70 bg-gradient-to-b from-card to-background shrink-0">
          <div className="flex items-center gap-2 px-5 py-2">
            <div className="md:hidden">
              <MobileSidebar
                tags={tags}
                collections={collections}
                selectedTags={filters.selectedTags}
                onTagToggle={filters.toggleTag}
                onCreateCollection={() => setCreateCollectionOpen(true)}
                lastSyncAt={dbUser?.lastSyncAt ? new Date(dbUser.lastSyncAt) : null}
                totalBookmarks={total}
                onSyncComplete={() => void invalidateLibraryQueries(queryClient)}
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
              <button
                onClick={() => {
                  filters.setSelectedTags([]);
                  filters.setMediaFilter("all");
                }}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground"
              >
                All Bookmarks
                <span className="text-xs opacity-70">{total.toLocaleString()}</span>
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
              {filters.mediaFilter !== "all" && (
                <button
                  onClick={() => filters.setMediaFilter("all")}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 transition-colors border border-primary/20"
                >
                  {mediaFilterLabels[filters.mediaFilter] || filters.mediaFilter}
                  <span className="text-primary/60 hover:text-primary ml-0.5" aria-hidden>×</span>
                </button>
              )}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                  showFilters
                    ? "bg-secondary text-foreground border-border"
                    : "text-muted-foreground bg-secondary hover:text-foreground border-border"
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Filters</span>
                {filters.hasActiveFilters && (
                  <span className="w-2 h-2 rounded-full bg-primary" />
                )}
              </button>
              <button
                onClick={() => {
                  if (selectionMode) {
                    clearSelection();
                  } else {
                    setSelectionMode(true);
                  }
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                  selectionMode
                    ? "bg-secondary text-foreground border-border"
                    : "text-muted-foreground bg-secondary hover:text-foreground border-border"
                }`}
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">
                  {selectionMode ? "Done" : "Select"}
                </span>
              </button>
            </div>

            <div className="flex items-center gap-2 shrink-0 ml-auto">
              <SortControls
                sortField={filters.sortField}
                viewMode={viewMode}
                onSortFieldChange={filters.setSortField}
                onViewModeChange={setViewMode}
              />
              {dbUser && <UserNav user={dbUser} />}
            </div>
          </div>

          {(isFetching || filters.isSearchPending) && !isLoading && (
            <p className="px-5 pb-1.5 text-xs text-muted-foreground">Updating results...</p>
          )}
          {selectionMode && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-2 bg-secondary/50">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium text-foreground">
                  {visibleSelectedBookmarkIds.length > 0
                    ? `${visibleSelectedBookmarkIds.length} selected`
                    : "Select bookmarks to apply bulk actions"}
                </span>
                <Button variant="outline" size="sm" onClick={selectVisibleBookmarks}>
                  Select page
                </Button>
                {visibleSelectedBookmarkIds.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearSelection}>
                    Clear
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={visibleSelectedBookmarkIds.length === 0}
                  onClick={openBulkTagDialog}
                >
                  <Tag className="w-3.5 h-3.5" />
                  Tag
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={visibleSelectedBookmarkIds.length === 0}
                  onClick={openBulkCollectionDialog}
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  Add to Collection
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-destructive hover:text-destructive"
                  disabled={visibleSelectedBookmarkIds.length === 0}
                  onClick={() => void handleBulkHide()}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Hide
                </Button>
              </div>
            </div>
          )}
        </header>

        {showFilters && (
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
        )}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-thin">
          <div className="sticky top-0 z-10 px-5 pt-3 pb-2">
            <div className="max-w-2xl mx-auto">
              <SearchBar
                ref={searchInputRef}
                value={filters.search}
                onChange={filters.setSearch}
                placeholder="Search bookmarks, authors, notes..."
              />
            </div>
          </div>

          {isLoading ? (
            <div className="max-w-2xl mx-auto space-y-0">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="px-5 py-3 border-b border-border animate-fade-in" style={{ animationDelay: `${i * 60}ms` }}>
                  <div className="flex gap-4">
                    <div className="w-10 h-10 rounded-full bg-muted shrink-0" />
                    <div className="flex-1 space-y-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-3.5 w-20 bg-muted rounded" />
                        <div className="h-3 w-14 bg-muted rounded" />
                      </div>
                      <div className="space-y-1.5">
                        <div className="h-3 w-full bg-muted rounded" />
                        <div className="h-3 w-4/5 bg-muted rounded" />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
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
            <div className="flex items-center justify-center h-64">
              <div className="text-center animate-fade-in">
                <Bookmark className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
                <p className="text-lg font-medium heading-font mb-2">No bookmarks found</p>
                <p className="text-sm text-muted-foreground">
                  {filters.search || filters.hasActiveFilters
                    ? "Try adjusting your filters or search query"
                    : "Use Sync in the sidebar (menu on mobile) to fetch your bookmarks from X"}
                </p>
              </div>
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 p-3">
              {bookmarks.map((bookmark, i) => (
                <BookmarkCard
                  key={bookmark.id}
                  bookmark={bookmark}
                  viewMode={viewMode}
                  searchQuery={filters.search || undefined}
                  selected={
                    selectionMode
                      ? selectedBookmarkIdSet.has(bookmark.id)
                      : activeBookmarkId === bookmark.id
                  }
                  onSelect={setActiveBookmarkId}
                  selectionMode={selectionMode}
                  onSelectionChange={toggleBookmarkSelection}
                  onTagClick={filters.toggleTag}
                  onAddTag={(id) => {
                    setActiveBookmarkId(id);
                    setTagTargetIds([id]);
                    setTagDialogOpen(true);
                  }}
                  onAddToCollection={(id) => {
                    setActiveBookmarkId(id);
                    setCollectionTargetIds([id]);
                    setCollectionDialogOpen(true);
                  }}
                  onAddNote={(id) => {
                    setActiveBookmarkId(id);
                    setNoteDialogOpen(true);
                  }}
                  onDelete={actions.handleDeleteBookmark}
                  className={i < 8 ? `animate-fade-in-up stagger-${Math.min(i + 1, 5)}` : undefined}
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
                  selected={
                    selectionMode
                      ? selectedBookmarkIdSet.has(bookmark.id)
                      : activeBookmarkId === bookmark.id
                  }
                  onSelect={setActiveBookmarkId}
                  selectionMode={selectionMode}
                  onSelectionChange={toggleBookmarkSelection}
                  onTagClick={filters.toggleTag}
                  onAddTag={(id) => {
                    setActiveBookmarkId(id);
                    setTagTargetIds([id]);
                    setTagDialogOpen(true);
                  }}
                  onAddToCollection={(id) => {
                    setActiveBookmarkId(id);
                    setCollectionTargetIds([id]);
                    setCollectionDialogOpen(true);
                  }}
                  onAddNote={(id) => {
                    setActiveBookmarkId(id);
                    setNoteDialogOpen(true);
                  }}
                  onDelete={actions.handleDeleteBookmark}
                  className={i < 8 ? `animate-fade-in stagger-${Math.min(i + 1, 5)}` : undefined}
                />
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex flex-col items-center gap-3 py-4 border-t border-border">
              <div className="flex items-center gap-2 text-sm">
                <button
                  onClick={() => filters.setPage((p) => p - 1)}
                  disabled={filters.page <= 1}
                  className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-border bg-card text-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:pointer-events-none"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {filters.page} <span className="text-muted-foreground/50">of</span> {totalPages}
                </span>
                <button
                  onClick={() => filters.setPage((p) => p + 1)}
                  disabled={filters.page >= totalPages}
                  className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-border bg-card text-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:pointer-events-none"
                >
                  <ChevronRight className="w-4 h-4" />
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
        existingNote={activeBookmark?.notes[0]?.content}
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
