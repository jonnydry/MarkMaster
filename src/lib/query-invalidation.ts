import type { QueryClient } from "@tanstack/react-query";

export const ORBIT_GRAPH_QUERY_KEY = ["orbit", "graph"] as const;

type InvalidateOptions = {
  /** Refetch only queries mounted on screen (default). Use "all" after full sync. */
  refetchType?: "active" | "all";
};

export function invalidateLibraryQueries(
  queryClient: QueryClient,
  options?: InvalidateOptions
) {
  const refetchType = options?.refetchType ?? "active";
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["bookmarks"], refetchType }),
    queryClient.invalidateQueries({ queryKey: ["performance-highlights"], refetchType }),
    queryClient.invalidateQueries({ queryKey: ["tags"], refetchType }),
    queryClient.invalidateQueries({ queryKey: ["collections"], refetchType }),
    queryClient.invalidateQueries({ queryKey: ["library-stats"], refetchType }),
    queryClient.invalidateQueries({ queryKey: ["analytics"], refetchType }),
    invalidateOrbitGraphQuery(queryClient),
  ]);
}

export function invalidateCollectionsQuery(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["collections"] }),
    queryClient.invalidateQueries({ queryKey: ["library-stats"] }),
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
    queryClient.invalidateQueries({ queryKey: ["library-stats"] }),
    invalidateOrbitGraphQuery(queryClient),
  ]);
}
