import { queryOptions } from "@tanstack/react-query";

import {
  orbitScanCandidatesResponseSchema,
  orbitScanQualityPayloadSchema,
  orbitXaiStatusPayloadSchema,
} from "@/lib/api-response-schemas";
import { fetchJson } from "@/lib/fetch-json";
import { ORBIT_SCAN_CANDIDATE_POOL_SIZE } from "@/lib/orbit-config";
import { ORBIT_RECENT_PAGE_SIZE } from "@/lib/orbit-navigation";
import {
  buildOrbitQueueListQueryString,
  buildOrbitScanCandidatesQueryString,
} from "@/lib/orbit-queue-params";
import { ORBIT_SCAN_CANDIDATES_QUERY_KEY } from "@/lib/query-invalidation";
import type { OrbitScanFailureCode } from "@/types";

/*
 * Orbit's scan-side queries, shared by the page and the route prefetch so a
 * prefetched entry is exactly the one the page reads.
 */

export function orbitScanCandidatesQuery(queryString: string) {
  return queryOptions({
    queryKey: [...ORBIT_SCAN_CANDIDATES_QUERY_KEY, queryString] as const,
    queryFn: () =>
      fetchJson(
        `/api/orbit/scan-candidates?${queryString}`,
        undefined,
        orbitScanCandidatesResponseSchema
      ),
    staleTime: 30_000,
  });
}

const DEFAULT_ORBIT_QUEUE = {
  orbitView: "recent",
  page: 1,
  pageSize: ORBIT_RECENT_PAGE_SIZE,
  sortDirection: "desc",
  search: "",
} as const;

/** The queue list Orbit opens with: recent view, newest first, no search. */
export function defaultOrbitQueueListQueryString() {
  return buildOrbitQueueListQueryString(DEFAULT_ORBIT_QUEUE);
}

/** The candidate pool Orbit opens with: recent view, newest first, no search. */
export function defaultOrbitScanCandidatesQueryString() {
  return buildOrbitScanCandidatesQueryString({
    ...DEFAULT_ORBIT_QUEUE,
    candidateLimit: ORBIT_SCAN_CANDIDATE_POOL_SIZE,
  });
}

export const orbitScanQualityQuery = queryOptions({
  queryKey: ["orbit", "scan-quality"] as const,
  queryFn: () =>
    fetchJson("/api/orbit/scan-quality", undefined, orbitScanQualityPayloadSchema),
  staleTime: 60_000,
});

export function buildOrbitStatusUrl(issue: OrbitScanFailureCode | null) {
  if (!issue) return "/api/orbit/status";
  const params = new URLSearchParams({ lastFailure: issue });
  return `/api/orbit/status?${params.toString()}`;
}

export function orbitStatusQuery(issue: OrbitScanFailureCode | null) {
  return queryOptions({
    queryKey: ["orbit", "xai-status", issue] as const,
    queryFn: () =>
      fetchJson(
        buildOrbitStatusUrl(issue),
        undefined,
        orbitXaiStatusPayloadSchema
      ),
    staleTime: 30_000,
  });
}

export const orbitXaiStatusQuery = orbitStatusQuery(null);
