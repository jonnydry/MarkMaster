import type { QueryClient } from "@tanstack/react-query";

import { sendJson } from "@/lib/fetch-json";
import { invalidateCollectionsQuery } from "@/lib/query-invalidation";
import type { CollectionWithCount } from "@/types";

export async function copyCollectionAsUserCollection(
  collectionId: string,
  queryClient: QueryClient
): Promise<CollectionWithCount> {
  const collection = await sendJson<CollectionWithCount>(
    `/api/collections/${collectionId}/copy`,
    { method: "POST" }
  );

  await invalidateCollectionsQuery(queryClient);
  return collection;
}
