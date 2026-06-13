import type { BookmarkWithRelations } from "@/types";

export function buildBookmarkByIdMap(
  bookmarks: BookmarkWithRelations[]
): Map<string, BookmarkWithRelations> {
  return new Map(bookmarks.map((bookmark) => [bookmark.id, bookmark]));
}
