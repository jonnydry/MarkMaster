"use client";

import { useState, useEffect, Suspense, useRef, useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Bookmark,
  FolderOpen,
  BarChart3,
  Filter,
  Search,
  CheckSquare,
  Tag,
  FolderPlus,
  Trash2,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sidebar } from "@/components/sidebar";
import { MobileSidebar } from "@/components/mobile-sidebar";
import { RightPanel } from "@/components/right-panel";
import { SortControls } from "@/components/sort-controls";
import { FilterPanel } from "@/components/filter-panel";
import { BookmarkCard } from "@/components/bookmark-card";
import { SyncButton } from "@/components/sync-button";
import { UserNav } from "@/components/user-nav";
import { useBookmarkFilters } from "@/hooks/use-bookmark-filters";
import { useBookmarkActions } from "@/hooks/use-bookmark-actions";
import { useCreateCollection } from "@/hooks/use-create-collection";
import { useCollectionsQuery, useTagsQuery } from "@/hooks/use-library-data";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { fetchJson } from "@/lib/fetch-json";
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

const NAV_ITEMS = [
  { href: "/dashboard", icon: Bookmark, label: "Bookmarks" },
  { href: "/collections", icon: FolderOpen, label: "Collections" },
  { href: "/analytics", icon: BarChart3, label: "Analytics" },
];

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

  const tagFromUrl = searchParams.get("tag");
  const tagsFromUrl = searchParams.get("tags");
  useEffect(() => {
    if (tagsFromUrl) {
      const next = tagsFromUrl.split(",").filter(Boolean);
      setSelectedTags(next);
      setPage(1);
    } else if (tagFromUrl) {
      setSelectedTags([tagFromUrl]);
      setPage(1);
    } else {
      setSelectedTags([]);
      setPage(1);
    }
  }, [tagFromUrl, tagsFromUrl, setPage, setSelectedTags]);

  const activeBookmark = bookmarks.find((b) => b.id === activeBookmarkId);
  const tagTargetBookmarks = bookmarks.filter((bookmark) =>
    tagTargetIds.includes(bookmark.id)
  );
  const collectionTargetBookmarks = bookmarks.filter((bookmark) =>
    collectionTargetIds.includes(bookmark.id)
  );

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
  const pathname = "/dashboard";

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

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <div className="hidden md:block">
        <Sidebar
          tags={tags}
          collections={collections}
          selectedTags={filters.selectedTags}
          onTagToggle={filters.toggleTag}
          onCreateCollection={() => setCreateCollectionOpen(true)}
        />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="border-b border-border px-6 py-4 shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-6">
              <div className="hidden md:flex items-center gap-1">
                {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
                  const isActive = pathname === href;
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {label}
                    </Link>
                  );
                })}
              </div>
              <div className="md:hidden">
                <MobileSidebar
                  tags={tags}
                  collections={collections}
                  selectedTags={filters.selectedTags}
                  onTagToggle={filters.toggleTag}
                  onCreateCollection={() => setCreateCollectionOpen(true)}
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative hidden sm:block">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  value={filters.search}
                  onChange={(e) => filters.setSearch(e.target.value)}
                  placeholder="Search..."
                  className="pl-9 pr-16 h-9 w-[240px] text-sm bg-muted/50 border-0 rounded-full focus:ring-1 focus:ring-primary"
                />
                {!filters.search && (
                  <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground bg-background px-1.5 py-0.5 rounded border">
                    ⌘K
                  </kbd>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (selectionMode) {
                    clearSelection();
                  } else {
                    setSelectionMode(true);
                  }
                }}
                className={`gap-2 h-9 px-3 text-sm ${selectionMode ? "bg-muted" : ""}`}
              >
                <CheckSquare className="w-4 h-4" />
                <span className="hidden sm:inline">
                  {selectionMode ? "Done" : "Select"}
                </span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className={`gap-2 h-9 px-3 text-sm ${
                  showFilters ? "bg-muted" : ""
                }`}
              >
                <Filter className="w-4 h-4" />
                <span className="hidden sm:inline">Filters</span>
                {filters.hasActiveFilters && (
                  <span className="w-2 h-2 rounded-full bg-primary" />
                )}
              </Button>
              <SyncButton
                lastSyncAt={
                  dbUser?.lastSyncAt ? new Date(dbUser.lastSyncAt) : null
                }
                onSyncComplete={actions.refreshAll}
              />
              {dbUser && <UserNav user={dbUser} />}
            </div>
          </div>

          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold tracking-tight">All Bookmarks</h1>
              <span className="text-sm text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                {total.toLocaleString()}
              </span>
              {filters.selectedTags.length > 0 && (
                <div className="flex items-center gap-1">
                  {filters.selectedTags.map((tagId) => {
                    const tag = tags.find((t) => t.id === tagId);
                    return tag ? (
                      <span
                        key={tagId}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary"
                      >
                        #{tag.name}
                        <button
                          onClick={() => filters.toggleTag(tagId)}
                          className="hover:bg-primary/20 rounded-full p-0.5"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ) : null;
                  })}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => filters.setSelectedTags([])}
                    className="h-5 text-xs text-muted-foreground"
                  >
                    Clear
                  </Button>
                </div>
              )}
            </div>
            <SortControls
              sortField={filters.sortField}
              sortDirection={filters.sortDirection}
              viewMode={viewMode}
              onSortFieldChange={filters.setSortField}
              onSortDirectionChange={filters.setSortDirection}
              onViewModeChange={setViewMode}
              total={total}
            />
          </div>
          {(isFetching || filters.isSearchPending) && !isLoading && (
            <p className="mt-3 text-xs text-muted-foreground">Updating results...</p>
          )}
          {selectionMode && (
            <div className="mt-3 flex flex-col gap-3 rounded-xl border border-border bg-muted/30 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
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
                  className="gap-2"
                  disabled={visibleSelectedBookmarkIds.length === 0}
                  onClick={openBulkTagDialog}
                >
                  <Tag className="w-4 h-4" />
                  Tag
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  disabled={visibleSelectedBookmarkIds.length === 0}
                  onClick={openBulkCollectionDialog}
                >
                  <FolderPlus className="w-4 h-4" />
                  Add to Collection
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 text-destructive hover:text-destructive"
                  disabled={visibleSelectedBookmarkIds.length === 0}
                  onClick={() => void handleBulkHide()}
                >
                  <Trash2 className="w-4 h-4" />
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

        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-muted-foreground">
                  Loading bookmarks...
                </p>
              </div>
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
              <div className="text-center">
                <p className="text-lg font-medium mb-2">No bookmarks found</p>
                <p className="text-sm text-muted-foreground">
                  {filters.search || filters.hasActiveFilters
                    ? "Try adjusting your filters or search query"
                    : "Click Sync to fetch your bookmarks from X"}
                </p>
              </div>
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
              {bookmarks.map((bookmark) => (
                <BookmarkCard
                  key={bookmark.id}
                  bookmark={bookmark}
                  viewMode={viewMode}
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
                />
              ))}
            </div>
          ) : (
            <div className="max-w-2xl mx-auto">
              {bookmarks.map((bookmark) => (
                <BookmarkCard
                  key={bookmark.id}
                  bookmark={bookmark}
                  viewMode={viewMode}
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
                />
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 py-4 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                disabled={filters.page <= 1}
                onClick={() => filters.setPage((p) => p - 1)}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {filters.page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={filters.page >= totalPages}
                onClick={() => filters.setPage((p) => p + 1)}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="hidden xl:block">
        <RightPanel
          tags={tags}
          collections={collections}
          selectedTags={filters.selectedTags}
          onTagToggle={filters.toggleTag}
          onCreateCollection={() => setCreateCollectionOpen(true)}
        />
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
        bookmarkTags={getSharedTagIds(tagTargetBookmarks)}
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
        bookmarkCollections={getSharedCollectionIds(collectionTargetBookmarks)}
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
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
