"use client";

import { useEffect, useRef } from "react";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";

import { readOrbitGraphPayload } from "@/lib/orbit-graph-payload";
import { ORBIT_GRAPH_QUERY_KEY } from "@/lib/query-invalidation";
import type { OrbitGraphPayload, OrbitGraphScope } from "@/types";

export function orbitGraphQueryKey(scope: OrbitGraphScope = "library") {
  return [...ORBIT_GRAPH_QUERY_KEY, scope] as const;
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
  const queryClient = useQueryClient();
  const anchorsRef = useRef(expandedAnchors);
  anchorsRef.current = expandedAnchors;
  const expandKey = expandedAnchors.join(",");
  const previousRef = useRef({ scope, expandKey });

  const query = useQuery<OrbitGraphPayload>({
    queryKey: orbitGraphQueryKey(scope),
    queryFn: ({ client, queryKey }) =>
      fetchOrbitGraph(scope, anchorsRef.current, {
        previous: client.getQueryData<OrbitGraphPayload>(queryKey),
        requestKey: orbitGraphRequestKey(scope, anchorsRef.current),
      }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  useEffect(() => {
    const scopeChanged = previousRef.current.scope !== scope;
    const expandChanged = previousRef.current.expandKey !== expandKey;
    previousRef.current = { scope, expandKey };
    if (scopeChanged || !expandChanged) return;

    void queryClient.fetchQuery({
      queryKey: orbitGraphQueryKey(scope),
      queryFn: ({ client, queryKey }) =>
        fetchOrbitGraph(scope, anchorsRef.current, {
          previous: client.getQueryData<OrbitGraphPayload>(queryKey),
          requestKey: orbitGraphRequestKey(scope, anchorsRef.current),
        }),
    });
  }, [expandKey, queryClient, scope]);

  return query;
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
  const ifNoneMatch = orbitGraphEtags.get(requestKey);
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
