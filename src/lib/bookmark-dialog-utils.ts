import type { BookmarkWithRelations } from "@/types";

export function resolveDialogBookmarks(
  bookmarkById: Map<string, BookmarkWithRelations>,
  targetIds: string[],
  externalBookmarks: BookmarkWithRelations[] = []
): BookmarkWithRelations[] {
  const byId = new Map(bookmarkById);
  for (const bookmark of externalBookmarks) {
    byId.set(bookmark.id, bookmark);
  }

  return targetIds.flatMap((id) => {
    const bookmark = byId.get(id);
    return bookmark ? [bookmark] : [];
  });
}

export function pickDialogTargetIds(
  storedTargetIds: string[],
  bulkSelectionIds?: string[]
): string[] {
  if (bulkSelectionIds && bulkSelectionIds.length > 0) {
    return bulkSelectionIds;
  }
  return storedTargetIds;
}
