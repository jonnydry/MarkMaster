import { fetchJson, sendJson } from "@/lib/fetch-json";
import { collectionsResponseSchema } from "@/lib/api-response-schemas";
import { invalidateCollectionsQuery } from "@/lib/query-invalidation";
import type { QueryClient } from "@tanstack/react-query";
import type { BookmarkWithRelations } from "@/types";

export type SaveGemsResult = {
  collectionId: string;
  /** false when gems were added to an existing collection with the same name. */
  created: boolean;
};

/** Normalize curly/straight apostrophes and case so "This Week’s Gems" matches "This Week's Gems". */
function normalizeCollectionName(name: string): string {
  return name.replace(/[’‘]/g, "'").trim().toLowerCase();
}

/**
 * Save gems into a collection with the given name. Reuses an existing user
 * collection with the same name instead of spawning a duplicate each time,
 * then adds all gems in one request (batch bookmarkIds).
 */
export async function saveGemsAsCollection(
  queryClient: QueryClient,
  createCollectionQuick: (name: string) => Promise<string>,
  bookmarks: BookmarkWithRelations[],
  suggestedName: string
): Promise<SaveGemsResult> {
  const target = normalizeCollectionName(suggestedName);
  const existing = await fetchJson(
    "/api/collections",
    undefined,
    collectionsResponseSchema
  );
  const match = existing.find(
    (collection) =>
      collection.type === "user_collection" &&
      normalizeCollectionName(collection.name) === target
  );

  const collectionId = match?.id ?? (await createCollectionQuick(suggestedName));
  const bookmarkIds = bookmarks.map((b) => b.id);

  if (bookmarkIds.length > 0) {
    await sendJson(`/api/collections/${collectionId}/items`, {
      method: "POST",
      body: { bookmarkIds },
    });
  }

  await invalidateCollectionsQuery(queryClient);
  return { collectionId, created: !match };
}
