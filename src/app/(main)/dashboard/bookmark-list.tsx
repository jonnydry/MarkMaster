import { BookmarkCard } from "@/components/bookmark-card";
import { getStaggerClass } from "@/lib/stagger";
import type { ViewMode, BookmarkWithRelations } from "@/types";

interface BookmarkListProps {
  bookmarks: BookmarkWithRelations[];
  viewMode: ViewMode;
  searchQuery?: string;
  aboveFoldMediaBookmarkId: string | null;
  selectionMode: boolean;
  selectedBookmarkIdSet: Set<string>;
  activeBookmarkId: string | null;
  onSelect: (id: string) => void;
  onSelectionChange: (id: string, selected: boolean) => void;
  onTagClick: (tagId: string) => void;
  onAddTag: (id: string) => void;
  onAddToCollection: (id: string) => void;
  onAddNote: (id: string) => void;
  onDelete: (ids: string[]) => void;
}

export function BookmarkList({
  bookmarks,
  viewMode,
  searchQuery,
  aboveFoldMediaBookmarkId,
  selectionMode,
  selectedBookmarkIdSet,
  activeBookmarkId,
  onSelect,
  onSelectionChange,
  onTagClick,
  onAddTag,
  onAddToCollection,
  onAddNote,
  onDelete,
}: BookmarkListProps) {
  if (viewMode === "grid") {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 p-3">
        {bookmarks.map((bookmark, i) => (
          <BookmarkCard
            key={bookmark.id}
            bookmark={bookmark}
            viewMode={viewMode}
            searchQuery={searchQuery}
            priorityMedia={bookmark.id === aboveFoldMediaBookmarkId}
            selected={
              selectionMode
                ? selectedBookmarkIdSet.has(bookmark.id)
                : activeBookmarkId === bookmark.id
            }
            onSelect={onSelect}
            selectionMode={selectionMode}
            onSelectionChange={onSelectionChange}
            onTagClick={onTagClick}
            onAddTag={onAddTag}
            onAddToCollection={onAddToCollection}
            onAddNote={onAddNote}
            onDelete={onDelete}
            className={getStaggerClass(i, "animate-fade-in-up")}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {bookmarks.map((bookmark, i) => (
        <BookmarkCard
          key={bookmark.id}
          bookmark={bookmark}
          viewMode={viewMode}
          searchQuery={searchQuery}
          priorityMedia={bookmark.id === aboveFoldMediaBookmarkId}
          selected={
            selectionMode
              ? selectedBookmarkIdSet.has(bookmark.id)
              : activeBookmarkId === bookmark.id
          }
          onSelect={onSelect}
          selectionMode={selectionMode}
          onSelectionChange={onSelectionChange}
          onTagClick={onTagClick}
          onAddTag={onAddTag}
          onAddToCollection={onAddToCollection}
          onAddNote={onAddNote}
          onDelete={onDelete}
          className={getStaggerClass(i, "animate-fade-in")}
        />
      ))}
    </div>
  );
}
