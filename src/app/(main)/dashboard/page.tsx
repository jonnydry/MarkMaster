"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Filter, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sidebar } from "@/components/sidebar";
import { MobileSidebar } from "@/components/mobile-sidebar";
import { SearchBar } from "@/components/search-bar";
import { SortControls } from "@/components/sort-controls";
import { FilterPanel } from "@/components/filter-panel";
import { BookmarkCard } from "@/components/bookmark-card";
import { SyncButton } from "@/components/sync-button";
import { UserNav } from "@/components/user-nav";
import { AddTagDialog } from "@/components/add-tag-dialog";
import { AddNoteDialog } from "@/components/add-note-dialog";
import { AddToCollectionDialog } from "@/components/add-to-collection-dialog";
import { CreateCollectionDialog } from "@/components/create-collection-dialog";
import { toast } from "sonner";
import type {
  SortField,
  SortDirection,
  MediaFilter,
  ViewMode,
  BookmarkWithRelations,
  TagWithCount,
  CollectionWithCount,
} from "@/types";
import type { DbUser } from "@/lib/auth";

export default function DashboardPage() {
  const { data: session } = useSession() as {
    data: { dbUser?: DbUser } | null;
  };
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("bookmarkedAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>("all");
  const [authorFilter, setAuthorFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("feed");
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);

  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [collectionDialogOpen, setCollectionDialogOpen] = useState(false);
  const [createCollectionOpen, setCreateCollectionOpen] = useState(false);
  const [activeBookmarkId, setActiveBookmarkId] = useState<string | null>(null);

  const resetPage = () => setPage(1);
  const setSearchAndReset = (v: string) => { setSearch(v); resetPage(); };
  const setSortFieldAndReset = (v: SortField) => { setSortField(v); resetPage(); };
  const setSortDirectionAndReset = (v: SortDirection) => { setSortDirection(v); resetPage(); };
  const setMediaFilterAndReset = (v: MediaFilter) => { setMediaFilter(v); resetPage(); };
  const setAuthorFilterAndReset = (v: string) => { setAuthorFilter(v); resetPage(); };
  const setDateFromAndReset = (v: string) => { setDateFrom(v); resetPage(); };
  const setDateToAndReset = (v: string) => { setDateTo(v); resetPage(); };

  const params = new URLSearchParams({
    page: page.toString(),
    limit: "20",
    search,
    sortField,
    sortDirection,
    mediaFilter,
    authorFilter,
    tagFilter: selectedTags.join(","),
    ...(dateFrom && { dateFrom }),
    ...(dateTo && { dateTo }),
  });

  const { data: bookmarkData, isLoading } = useQuery({
    queryKey: ["bookmarks", params.toString()],
    queryFn: async () => {
      const res = await fetch(`/api/bookmarks?${params}`);
      return res.json();
    },
  });

  const { data: tags = [] } = useQuery<TagWithCount[]>({
    queryKey: ["tags"],
    queryFn: async () => {
      const res = await fetch("/api/tags");
      return res.json();
    },
  });

  const { data: collections = [] } = useQuery<CollectionWithCount[]>({
    queryKey: ["collections"],
    queryFn: async () => {
      const res = await fetch("/api/collections");
      return res.json();
    },
  });

  const bookmarks: BookmarkWithRelations[] = useMemo(
    () => bookmarkData?.bookmarks || [],
    [bookmarkData?.bookmarks]
  );
  const total: number = bookmarkData?.total || 0;
  const totalPages: number = bookmarkData?.totalPages || 1;

  const refreshAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
    queryClient.invalidateQueries({ queryKey: ["tags"] });
    queryClient.invalidateQueries({ queryKey: ["collections"] });
  }, [queryClient]);

  const toggleTag = (tagId: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagId) ? prev.filter((t) => t !== tagId) : [...prev, tagId]
    );
    resetPage();
  };

  const hasActiveFilters =
    mediaFilter !== "all" ||
    authorFilter !== "" ||
    dateFrom !== "" ||
    dateTo !== "" ||
    selectedTags.length > 0;

  const clearFilters = () => {
    setMediaFilter("all");
    setAuthorFilter("");
    setDateFrom("");
    setDateTo("");
    setSelectedTags([]);
    resetPage();
  };

  const handleAddTag = async (
    bookmarkId: string,
    name: string,
    color: string
  ) => {
    await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookmarkId, name, color }),
    });
    refreshAll();
  };

  const handleRemoveTag = async (bookmarkId: string, tagId: string) => {
    await fetch("/api/tags", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookmarkId, tagId }),
    });
    refreshAll();
  };

  const handleAddNote = async (bookmarkId: string, content: string) => {
    await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookmarkId, content }),
    });
    refreshAll();
    toast.success("Note saved");
  };

  const handleAddToCollection = async (
    bookmarkId: string,
    collectionId: string
  ) => {
    await fetch(`/api/collections/${collectionId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookmarkId }),
    });
    refreshAll();
    toast.success("Added to collection");
  };

  const handleCreateCollection = async (name: string): Promise<string> => {
    const res = await fetch("/api/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const col = await res.json();
    refreshAll();
    return col.id;
  };

  const handleCreateCollectionFull = async (
    name: string,
    description: string,
    isPublic: boolean
  ) => {
    await fetch("/api/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, isPublic }),
    });
    refreshAll();
    toast.success("Collection created");
  };

  const handleDeleteBookmark = async (bookmarkId: string) => {
    await fetch("/api/bookmarks", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookmarkId }),
    });
    refreshAll();
    toast.success("Bookmark removed");
  };

  const activeBookmark = bookmarks.find((b) => b.id === activeBookmarkId);

  const dbUser = session?.dbUser;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "j" || e.key === "k") {
        e.preventDefault();
        const currentIndex = bookmarks.findIndex((b) => b.id === activeBookmarkId);
        let nextIndex: number;
        if (e.key === "j") {
          nextIndex = currentIndex < bookmarks.length - 1 ? currentIndex + 1 : currentIndex;
        } else {
          nextIndex = currentIndex > 0 ? currentIndex - 1 : 0;
        }
        setActiveBookmarkId(bookmarks[nextIndex]?.id || null);
      }
      if (e.key === "t" && activeBookmarkId) {
        setTagDialogOpen(true);
      }
      if (e.key === "c" && activeBookmarkId) {
        setCollectionDialogOpen(true);
      }
      if (e.key === "n" && activeBookmarkId) {
        setNoteDialogOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeBookmarkId, bookmarks]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <div className="hidden md:block">
        <Sidebar
          tags={tags}
          collections={collections}
          selectedTags={selectedTags}
          onTagToggle={toggleTag}
          onCreateCollection={() => setCreateCollectionOpen(true)}
        />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="border-b border-border flex items-center justify-between gap-4 px-8 py-5 shrink-0">
          <div className="flex items-center gap-3">
            <MobileSidebar
              tags={tags}
              collections={collections}
              selectedTags={selectedTags}
              onTagToggle={toggleTag}
              onCreateCollection={() => setCreateCollectionOpen(true)}
            />
            <div className="flex items-baseline gap-2.5">
              <h1 className="text-2xl font-extrabold tracking-[-0.04em] text-foreground">
                Bookmarks
              </h1>
              <span className="text-[13px] text-[#3f3f46]">
                {total.toLocaleString()}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SearchBar value={search} onChange={setSearchAndReset} />
            <Button
              variant={showFilters ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="gap-2 shrink-0 h-8 text-[13px]"
            >
              <Filter className="w-3.5 h-3.5" />
              Filters
              {hasActiveFilters && (
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              )}
            </Button>
            <SyncButton
              lastSyncAt={dbUser?.lastSyncAt ? new Date(dbUser.lastSyncAt) : null}
              onSyncComplete={refreshAll}
            />
            {dbUser && <UserNav user={dbUser} />}
          </div>
        </header>

        {showFilters && (
          <FilterPanel
            mediaFilter={mediaFilter}
            onMediaFilterChange={setMediaFilterAndReset}
            authorFilter={authorFilter}
            onAuthorFilterChange={setAuthorFilterAndReset}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateFromChange={setDateFromAndReset}
            onDateToChange={setDateToAndReset}
            selectedTags={selectedTags}
            onTagToggle={toggleTag}
            tags={tags}
            onClearAll={clearFilters}
            hasActiveFilters={hasActiveFilters}
          />
        )}

        <SortControls
          sortField={sortField}
          sortDirection={sortDirection}
          viewMode={viewMode}
          onSortFieldChange={setSortFieldAndReset}
          onSortDirectionChange={setSortDirectionAndReset}
          onViewModeChange={setViewMode}
          total={total}
        />

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
          ) : bookmarks.length === 0 ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <p className="text-lg font-medium mb-2">No bookmarks found</p>
                <p className="text-sm text-muted-foreground">
                  {search || hasActiveFilters
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
                  selected={activeBookmarkId === bookmark.id}
                  onSelect={setActiveBookmarkId}
                  onTagClick={toggleTag}
                  onAddTag={(id) => {
                    setActiveBookmarkId(id);
                    setTagDialogOpen(true);
                  }}
                  onAddToCollection={(id) => {
                    setActiveBookmarkId(id);
                    setCollectionDialogOpen(true);
                  }}
                  onAddNote={(id) => {
                    setActiveBookmarkId(id);
                    setNoteDialogOpen(true);
                  }}
                  onDelete={handleDeleteBookmark}
                />
              ))}
            </div>
          ) : (
            <div>
              {bookmarks.map((bookmark) => (
                <BookmarkCard
                  key={bookmark.id}
                  bookmark={bookmark}
                  viewMode={viewMode}
                  selected={activeBookmarkId === bookmark.id}
                  onSelect={setActiveBookmarkId}
                  onTagClick={toggleTag}
                  onAddTag={(id) => {
                    setActiveBookmarkId(id);
                    setTagDialogOpen(true);
                  }}
                  onAddToCollection={(id) => {
                    setActiveBookmarkId(id);
                    setCollectionDialogOpen(true);
                  }}
                  onAddNote={(id) => {
                    setActiveBookmarkId(id);
                    setNoteDialogOpen(true);
                  }}
                  onDelete={handleDeleteBookmark}
                />
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 py-4 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      <AddTagDialog
        open={tagDialogOpen}
        onOpenChange={setTagDialogOpen}
        bookmarkId={activeBookmarkId}
        existingTags={tags}
        onAddTag={handleAddTag}
        onRemoveTag={handleRemoveTag}
        bookmarkTags={
          activeBookmark?.tags.map((t) => t.tag.id) || []
        }
      />

      <AddNoteDialog
        open={noteDialogOpen}
        onOpenChange={setNoteDialogOpen}
        bookmarkId={activeBookmarkId}
        existingNote={activeBookmark?.notes[0]?.content}
        onSave={handleAddNote}
      />

      <AddToCollectionDialog
        open={collectionDialogOpen}
        onOpenChange={setCollectionDialogOpen}
        bookmarkId={activeBookmarkId}
        collections={collections}
        bookmarkCollections={
          activeBookmark?.collectionItems.map(
            (ci) => ci.collection.id
          ) || []
        }
        onAddToCollection={handleAddToCollection}
        onCreateCollection={handleCreateCollection}
      />

      <CreateCollectionDialog
        open={createCollectionOpen}
        onOpenChange={setCreateCollectionOpen}
        onCreateCollection={handleCreateCollectionFull}
      />
    </div>
  );
}
