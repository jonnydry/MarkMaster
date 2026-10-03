"use client";

import type { QueryClient } from "@tanstack/react-query";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

import {
  analyticsDataSchema,
  bookmarkListResponseSchema,
} from "@/lib/api-response-schemas";
import { defaultBookmarkListQueryString } from "@/lib/bookmark-list-params";
import { fetchJson } from "@/lib/fetch-json";
import { prefetchOrbitGraph } from "@/hooks/use-orbit-graph";
import {
  defaultOrbitQueueListQueryString,
  defaultOrbitScanCandidatesQueryString,
  orbitScanCandidatesQuery,
  orbitScanQualityQuery,
  orbitXaiStatusQuery,
} from "@/lib/orbit-page-queries";

const LIST_STALE_TIME = 60_000;

type PrefetchKind = NonNullable<
  Parameters<AppRouterInstance["prefetch"]>[1]
>["kind"];

/**
 * Next skips `<Link>` prefetch in development, so a click waits on the dev
 * compiler and then the page chunk. `router.prefetch` still fills the
 * segment cache in both modes when asked for the full route.
 */
export function prefetchAppRouteDocument(
  router: AppRouterInstance,
  href: string
) {
  router.prefetch(href, { kind: "full" as PrefetchKind });
}

/**
 * Warm a destination's data so the page can paint from cache: on sidebar
 * hover, and when KeptRoutes pre-renders the page hidden (hidden pages run no
 * effects, so they can't fetch for themselves). Tags and collections are
 * already cached by the sidebar.
 */
export function prefetchAppRoute(queryClient: QueryClient, href: string) {
  if (href === "/dashboard") {
    const queryString = defaultBookmarkListQueryString();
    void queryClient.prefetchQuery({
      queryKey: ["bookmarks", queryString],
      queryFn: () =>
        fetchJson(
          `/api/bookmarks?${queryString}`,
          undefined,
          bookmarkListResponseSchema
        ),
      staleTime: LIST_STALE_TIME,
    });
    return;
  }

  if (href === "/orbit") {
    const queryString = defaultOrbitQueueListQueryString();
    void queryClient.prefetchQuery({
      queryKey: ["bookmarks", "orbit", queryString],
      queryFn: () =>
        fetchJson(
          `/api/bookmarks?${queryString}`,
          undefined,
          bookmarkListResponseSchema
        ),
      staleTime: LIST_STALE_TIME,
    });
    // The scan button is planned from these; without them it would relabel
    // a moment after the page shows.
    void queryClient.prefetchQuery(
      orbitScanCandidatesQuery(defaultOrbitScanCandidatesQueryString())
    );
    void queryClient.prefetchQuery(orbitScanQualityQuery);
    void queryClient.prefetchQuery(orbitXaiStatusQuery);
    return;
  }

  if (href === "/orbit/map") {
    prefetchOrbitGraph(queryClient);
    return;
  }

  if (href === "/analytics") {
    const range = "90d";
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    void queryClient.prefetchQuery({
      queryKey: ["analytics", range, timeZone],
      queryFn: () =>
        fetchJson(
          `/api/analytics?range=${range}&timeZone=${encodeURIComponent(timeZone)}`,
          undefined,
          analyticsDataSchema
        ),
      staleTime: LIST_STALE_TIME,
    });
  }
}
