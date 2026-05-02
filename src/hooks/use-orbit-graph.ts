"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { fetchJson } from "@/lib/fetch-json";
import type { OrbitGraphPayload } from "@/types";

export const ORBIT_GRAPH_QUERY_KEY = ["orbit", "graph"] as const;

export function useOrbitGraphQuery() {
  return useQuery<OrbitGraphPayload>({
    queryKey: ORBIT_GRAPH_QUERY_KEY,
    queryFn: () => fetchJson("/api/orbit/graph"),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}
