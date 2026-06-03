"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchJson } from "@/lib/fetch-json";
import type { SyncStatusResponse } from "@/types";

export const syncStatusQueryKey = ["sync-status"] as const;

export function useSyncStatus() {
  return useQuery<SyncStatusResponse>({
    queryKey: syncStatusQueryKey,
    queryFn: () => fetchJson("/api/bookmarks/sync"),
    refetchInterval: (query) => (query.state.data?.currentRun ? 5000 : false),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}
