"use client";

import { useState, useEffect, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
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
import { useBookmarkFilters } from "@/hooks/use-bookmark-filters";
import { useBookmarkActions } from "@/hooks/use-bookmark-actions";
import { useCreateCollection } from "@/hooks/use-create-collection";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import type {
  ViewMode,
  BookmarkWithRelations,
  TagWithCount,
  CollectionWithCount,
} from "@/types";
import type { DbUser } from "@/lib/auth";

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

  const { data: bookmarkData, isLoading } = useQuery({
    queryKey: ["bookmarks", filters.queryString],
    queryFn: async () => {
      const res = await fetch(`/api/bookmarks?${filters.queryString}`);
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

  const bookmarks: BookmarkWithRelations[] = bookmarkData?.bookmarks || [];
  const total: number = bookmarkData?.total || 0;
  const totalPages: number = bookmarkData?.totalPages || 1;

  const tagFromUrl = searchParams.get("tag");
  const tagsFromUrl = searchParams.get("tags");
  useEffect(() => {
    if (tagsFromUrl) {
      const next = tagsFromUrl.split(",").filter(Boolean);
      filters.setSelectedTags(next);
      filters.setPage(1);
    } else if (tagFromUrl) {
      filters.setSelectedTags([tagFromUrl]);
      filters.setPage(1);
    } else {
      filters.setSelectedTags([]);
      filters.setPage(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagFromUrl, tagsFromUrl]);

  const activeBookmark = bookmarks.find((b) => b.id === activeBookmarkId);

  useKeyboardShortcuts({
    activeBookmarkId,
    bookmarks,
    onNavigate: setActiveBookmarkId,
    onTag: () => setTagDialogOpen(true),
    onCollection: () => setCollectionDialogOpen(true),
    onNote: () => setNoteDialogOpen(true),
  });

  const dbUser = session?.dbUser;

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
        <header className="border-b border-border flex items-center justify-between gap-4 px-8 py-5 shrink-0">
          <div className="flex items-center gap-3">
            <MobileSidebar
              tags={tags}
              collections={collections}
              selectedTags={filters.selectedTags}
              onTagToggle={filters.toggleTag}
              onCreateCollection={() => setCreateCollectionOpen(true)}
            />
            <div className="flex items-baseline gap-2.5">
              <h1 className="text-2xl font-extrabold tracking-[-0.04em] text-foreground">
                Bookmarks
              </h1>
              <span className="text-[13px] text-muted-foreground">
                {total.toLocaleString()}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SearchBar value={filters.search} onChange={filters.setSearch} />
            <Button
              variant={showFilters ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="gap-2 shrink-0 h-8 text-[13px]"
            >
              <Filter className="w-3.5 h-3.5" />
              Filters
              {filters.hasActiveFilters && (
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              )}
            </Button>
            <SyncButton
              lastSyncAt={dbUser?.lastSyncAt ? new Date(dbUser.lastSyncAt) : null}
              onSyncComplete={actions.refreshAll}
            />
            {dbUser && <UserNav user={dbUser} />}
          </div>
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

        <SortControls
          sortField={filters.sortField}
          sortDirection={filters.sortDirection}
          viewMode={viewMode}
          onSortFieldChange={filters.setSortField}
          onSortDirectionChange={filters.setSortDirection}
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
                  selected={activeBookmarkId === bookmark.id}
                  onSelect={setActiveBookmarkId}
                  onTagClick={filters.toggleTag}
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
                  onDelete={actions.handleDeleteBookmark}
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
                  onTagClick={filters.toggleTag}
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

      <AddTagDialog
        open={tagDialogOpen}
        onOpenChange={setTagDialogOpen}
        bookmarkId={activeBookmarkId}
        existingTags={tags}
        onAddTag={actions.handleAddTag}
        onRemoveTag={actions.handleRemoveTag}
        bookmarkTags={
          activeBookmark?.tags.map((t) => t.tag.id) || []
        }
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
        onOpenChange={setCollectionDialogOpen}
        bookmarkId={activeBookmarkId}
        collections={collections}
        bookmarkCollections={
          activeBookmark?.collectionItems.map(
            (ci) => ci.collection.id
          ) || []
        }
        onAddToCollection={actions.handleAddToCollection}
        onCreateCollection={createCollectionQuick}
      />

      <CreateCollectionDialog
        open={createCollectionOpen}
        onOpenChange={setCreateCollectionOpen}
        onCreateCollection={createCollection}
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
