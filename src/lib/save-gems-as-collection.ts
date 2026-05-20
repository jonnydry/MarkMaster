import { sendJson } from "@/lib/fetch-json";
import { invalidateCollectionsQuery } from "@/lib/query-invalidation";
import type { QueryClient } from "@tanstack/react-query";
import type { BookmarkWithRelations } from "@/types";

/**
 * Create a user collection and add all gems in one request (batch bookmarkIds).
 */
export async function saveGemsAsCollection(
  queryClient: QueryClient,
  createCollectionQuick: (name: string) => Promise<string>,
  bookmarks: BookmarkWithRelations[],
  suggestedName: string
): Promise<string> {
  const newCollectionId = await createCollectionQuick(suggestedName);
  const bookmarkIds = bookmarks.map((b) => b.id);

  if (bookmarkIds.length > 0) {
    await sendJson(`/api/collections/${newCollectionId}/items`, {
      method: "POST",
      body: { bookmarkIds },
    });
  }

  await invalidateCollectionsQuery(queryClient);
  return newCollectionId;
}
