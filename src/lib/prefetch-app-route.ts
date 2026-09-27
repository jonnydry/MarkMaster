"use client";

import type { QueryClient } from "@tanstack/react-query";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

import {
  analyticsDataSchema,
  bookmarkListResponseSchema,
} from "@/lib/api-response-schemas";
import { defaultBookmarkListQueryString } from "@/lib/bookmark-list-params";
import { fetchJson } from "@/lib/fetch-json";
import { ORBIT_RECENT_PAGE_SIZE } from "@/lib/orbit-navigation";
import { buildOrbitQueueListQueryString } from "@/lib/orbit-queue-params";
import { prefetchOrbitGraph } from "@/hooks/use-orbit-graph";

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
 * Warm a destination list so the page can paint from cache.
 * Tags and collections are already cached by the sidebar.
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
    const queryString = buildOrbitQueueListQueryString({
      orbitView: "recent",
      page: 1,
      pageSize: ORBIT_RECENT_PAGE_SIZE,
      sortDirection: "desc",
      search: "",
    });
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
