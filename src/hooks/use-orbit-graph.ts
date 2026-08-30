"use client";

import {
  keepPreviousData,
  useQuery,
  type QueryClient,
} from "@tanstack/react-query";

import { readOrbitGraphPayload } from "@/lib/orbit-graph-payload";
import { ORBIT_GRAPH_QUERY_KEY } from "@/lib/query-invalidation";
import type { OrbitGraphPayload, OrbitGraphScope } from "@/types";

/**
 * The cached payload varies by BOTH scope and expanded anchors, so both must
 * be part of the query key. Keying by scope alone let a 304 revalidation
 * restore a payload from a different expand state (e.g. the collapsed graph
 * served while the UI believed it loaded an expanded one).
 */
export function orbitGraphQueryKey(
  scope: OrbitGraphScope = "library",
  expandedAnchors: string[] = []
) {
  return [...ORBIT_GRAPH_QUERY_KEY, scope, expandedAnchors.join(",")] as const;
}

const orbitGraphEtags = new Map<string, string>();

function orbitGraphRequestKey(
  scope: OrbitGraphScope,
  expandedAnchors: string[]
) {
  return `${scope}:${expandedAnchors.join(",")}`;
}

export function useOrbitGraphQuery(
  scope: OrbitGraphScope = "library",
  expandedAnchors: string[] = []
) {
  return useQuery<OrbitGraphPayload>({
    queryKey: orbitGraphQueryKey(scope, expandedAnchors),
    queryFn: ({ client, queryKey }) =>
      fetchOrbitGraph(scope, expandedAnchors, {
        previous: client.getQueryData<OrbitGraphPayload>(queryKey),
        requestKey: orbitGraphRequestKey(scope, expandedAnchors),
      }),
    // Expand/collapse changes the key; keep showing the previous graph while
    // the new state loads instead of flashing empty.
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

async function fetchOrbitGraph(
  scope: OrbitGraphScope = "library",
  expandedAnchors: string[] = [],
  options?: {
    previous?: OrbitGraphPayload;
    requestKey?: string;
  }
): Promise<OrbitGraphPayload> {
  const expandParam = expandedAnchors.length
    ? `&expand=${encodeURIComponent(expandedAnchors.join(","))}`
    : "";
  const requestKey =
    options?.requestKey ?? orbitGraphRequestKey(scope, expandedAnchors);
  // Only revalidate with an ETag when we still hold the payload it describes;
  // otherwise a 304 would leave us with nothing to render.
  const ifNoneMatch = options?.previous
    ? orbitGraphEtags.get(requestKey)
    : undefined;
  const res = await fetch(
    `/api/orbit/graph?scope=${scope}${expandParam}`,
    {
      headers: ifNoneMatch ? { "If-None-Match": ifNoneMatch } : undefined,
    }
  );

  const etag = res.headers.get("etag");
  if (etag) {
    orbitGraphEtags.set(requestKey, etag);
  }

  if (res.status === 304) {
    if (options?.previous) return options.previous;
    // Defensive: shouldn't happen since we only send If-None-Match alongside
    // a cached payload, but never leave a stale ETag that would 304 forever.
    orbitGraphEtags.delete(requestKey);
    throw new Error("Orbit graph not modified but no cached payload is available");
  }

  const contentType = res.headers.get("content-type") || "";
  const body = contentType.includes("application/json")
    ? await res.json()
    : null;

  if (!res.ok) {
    const message =
      typeof body === "object" && body && "error" in body
        ? String(body.error)
        : `Request failed with status ${res.status}`;
    throw new Error(message);
  }

  return readOrbitGraphPayload(body);
}

export function prefetchOrbitGraph(
  queryClient: QueryClient,
  scope: OrbitGraphScope = "library",
  expandedAnchors: string[] = []
) {
  void queryClient.prefetchQuery({
    queryKey: orbitGraphQueryKey(scope),
    queryFn: ({ client, queryKey }) =>
      fetchOrbitGraph(scope, expandedAnchors, {
        previous: client.getQueryData<OrbitGraphPayload>(queryKey),
        requestKey: orbitGraphRequestKey(scope, expandedAnchors),
      }),
    staleTime: 30_000,
  });
}
