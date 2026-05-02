import type { QueryClient } from "@tanstack/react-query";

export const ORBIT_GRAPH_QUERY_KEY = ["orbit", "graph"] as const;

export function invalidateLibraryQueries(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["bookmarks"] }),
    queryClient.invalidateQueries({ queryKey: ["tags"] }),
    queryClient.invalidateQueries({ queryKey: ["collections"] }),
    invalidateOrbitGraphQuery(queryClient),
  ]);
}

export function invalidateCollectionsQuery(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["collections"] }),
    invalidateOrbitGraphQuery(queryClient),
  ]);
}

export function invalidateTagsQuery(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["tags"] }),
    invalidateOrbitGraphQuery(queryClient),
  ]);
}

export function invalidateOrbitGraphQuery(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: ORBIT_GRAPH_QUERY_KEY });
}

export function invalidateCollectionQueries(
  queryClient: QueryClient,
  collectionId: string
) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["collection", collectionId] }),
    queryClient.invalidateQueries({ queryKey: ["collections"] }),
    invalidateOrbitGraphQuery(queryClient),
  ]);
}
