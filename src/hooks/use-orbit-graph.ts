"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { fetchJson } from "@/lib/fetch-json";
import { ORBIT_GRAPH_QUERY_KEY } from "@/lib/query-invalidation";
import type { OrbitGraphPayload, OrbitGraphScope } from "@/types";

export function orbitGraphQueryKey(scope: OrbitGraphScope = "library") {
  return [...ORBIT_GRAPH_QUERY_KEY, scope] as const;
}

export function useOrbitGraphQuery(scope: OrbitGraphScope = "library") {
  return useQuery<OrbitGraphPayload>({
    queryKey: orbitGraphQueryKey(scope),
    queryFn: () => fetchJson(`/api/orbit/graph?scope=${scope}`),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}
