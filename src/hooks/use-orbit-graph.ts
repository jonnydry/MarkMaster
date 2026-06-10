"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { fetchJson } from "@/lib/fetch-json";
import { ORBIT_GRAPH_QUERY_KEY } from "@/lib/query-invalidation";
import type { OrbitGraphPayload, OrbitGraphScope } from "@/types";

export function orbitGraphQueryKey(
  scope: OrbitGraphScope = "library",
  expandedAnchors: string[] = []
) {
  return [...ORBIT_GRAPH_QUERY_KEY, scope, expandedAnchors.join(",")] as const;
}

export function useOrbitGraphQuery(
  scope: OrbitGraphScope = "library",
  expandedAnchors: string[] = []
) {
  const expandParam = expandedAnchors.length
    ? `&expand=${encodeURIComponent(expandedAnchors.join(","))}`
    : "";
  return useQuery<OrbitGraphPayload>({
    queryKey: orbitGraphQueryKey(scope, expandedAnchors),
    queryFn: () => fetchJson(`/api/orbit/graph?scope=${scope}${expandParam}`),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}
