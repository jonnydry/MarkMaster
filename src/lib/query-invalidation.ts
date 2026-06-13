import type { QueryClient } from "@tanstack/react-query";

export const ORBIT_GRAPH_QUERY_KEY = ["orbit", "graph"] as const;

type InvalidateOptions = {
  /** Refetch only queries mounted on screen (default). Use "all" after full sync. */
  refetchType?: "active" | "all";
};

export function invalidateOrbitGraphQuery(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: ORBIT_GRAPH_QUERY_KEY });
}

export function invalidateBookmarkListQueries(
  queryClient: QueryClient,
  options?: InvalidateOptions
) {
  const refetchType = options?.refetchType ?? "active";
  return queryClient.invalidateQueries({ queryKey: ["bookmarks"], refetchType });
}

export function invalidateTagsQuery(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["tags"] }),
    invalidateOrbitGraphQuery(queryClient),
  ]);
}

/** Tag sidebar + orbit graph after bookmark tag attach/detach (list rows are optimistic). */
export function invalidateBookmarkTagSideEffects(queryClient: QueryClient) {
  return invalidateTagsQuery(queryClient);
}

export function invalidateCollectionsQuery(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["collections"] }),
    queryClient.invalidateQueries({ queryKey: ["library-stats"] }),
    invalidateOrbitGraphQuery(queryClient),
  ]);
}

export function invalidateBookmarkCollectionSideEffects(
  queryClient: QueryClient,
  collectionId: string
) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["collection", collectionId] }),
    invalidateCollectionsQuery(queryClient),
  ]);
}

/** After bookmark delete (list rows are optimistic). */
export function invalidateBookmarkDeletionSideEffects(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["library-stats"] }),
    queryClient.invalidateQueries({ queryKey: ["performance-highlights"] }),
    invalidateOrbitGraphQuery(queryClient),
  ]);
}

/** Orbit scan apply: tags/collections on bookmarks change; skip analytics/highlights. */
export function invalidateOrbitApplyQueries(
  queryClient: QueryClient,
  options?: InvalidateOptions
) {
  const refetchType = options?.refetchType ?? "active";
  return Promise.all([
    invalidateBookmarkListQueries(queryClient, { refetchType }),
    queryClient.invalidateQueries({ queryKey: ["tags"], refetchType }),
    queryClient.invalidateQueries({ queryKey: ["collections"], refetchType }),
    queryClient.invalidateQueries({ queryKey: ["library-stats"], refetchType }),
    invalidateOrbitGraphQuery(queryClient),
  ]);
}

export function invalidateLibraryQueries(
  queryClient: QueryClient,
  options?: InvalidateOptions
) {
  const refetchType = options?.refetchType ?? "active";
  return Promise.all([
    invalidateBookmarkListQueries(queryClient, { refetchType }),
    queryClient.invalidateQueries({ queryKey: ["performance-highlights"], refetchType }),
    queryClient.invalidateQueries({ queryKey: ["tags"], refetchType }),
    queryClient.invalidateQueries({ queryKey: ["collections"], refetchType }),
    queryClient.invalidateQueries({ queryKey: ["library-stats"], refetchType }),
    queryClient.invalidateQueries({ queryKey: ["analytics"], refetchType }),
    invalidateOrbitGraphQuery(queryClient),
  ]);
}

export function invalidateCollectionMetadataQueries(
  queryClient: QueryClient,
  collectionId: string
) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["collection", collectionId] }),
    queryClient.invalidateQueries({ queryKey: ["collections"] }),
  ]);
}

export function invalidateCollectionMembershipQueries(
  queryClient: QueryClient,
  collectionId: string
) {
  return Promise.all([
    invalidateCollectionMetadataQueries(queryClient, collectionId),
    queryClient.invalidateQueries({ queryKey: ["library-stats"] }),
    invalidateOrbitGraphQuery(queryClient),
  ]);
}

/** @deprecated Prefer invalidateCollectionMembershipQueries or invalidateCollectionMetadataQueries. */
export function invalidateCollectionQueries(
  queryClient: QueryClient,
  collectionId: string
) {
  return invalidateCollectionMembershipQueries(queryClient, collectionId);
}
