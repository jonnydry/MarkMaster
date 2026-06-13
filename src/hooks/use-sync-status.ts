"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchJson } from "@/lib/fetch-json";
import { syncStatusResponseSchema } from "@/lib/api-response-schemas";
import type { SyncStatusResponse } from "@/types";

export const syncStatusQueryKey = ["sync-status"] as const;

export function useSyncStatus() {
  return useQuery<SyncStatusResponse>({
    queryKey: syncStatusQueryKey,
    queryFn: () =>
      fetchJson("/api/bookmarks/sync", undefined, syncStatusResponseSchema),
    staleTime: 30_000,
    refetchInterval: (query) => (query.state.data?.currentRun ? 5000 : false),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}
