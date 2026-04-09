import type { QueryClient } from "@tanstack/react-query";

export function invalidateLibraryQueries(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["bookmarks"] }),
    queryClient.invalidateQueries({ queryKey: ["tags"] }),
    queryClient.invalidateQueries({ queryKey: ["collections"] }),
  ]);
}

export function invalidateCollectionsQuery(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: ["collections"] });
}

export function invalidateTagsQuery(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: ["tags"] });
}

export function invalidateCollectionQueries(
  queryClient: QueryClient,
  collectionId: string
) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["collection", collectionId] }),
    queryClient.invalidateQueries({ queryKey: ["collections"] }),
  ]);
}
