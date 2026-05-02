"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { fetchJson } from "@/lib/fetch-json";
import { ORBIT_GRAPH_QUERY_KEY } from "@/lib/query-invalidation";
import type { OrbitGraphPayload } from "@/types";

export function useOrbitGraphQuery() {
  return useQuery<OrbitGraphPayload>({
    queryKey: ORBIT_GRAPH_QUERY_KEY,
    queryFn: () => fetchJson("/api/orbit/graph"),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}
