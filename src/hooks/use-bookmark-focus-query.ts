"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { fetchJson } from "@/lib/fetch-json";
import { bookmarkFocusResponseSchema } from "@/lib/api-response-schemas";

export function useBookmarkFocusQuery(
  bookmarkId: string | null,
  queryKeyPrefix: string,
  options?: { keepPrevious?: boolean }
) {
  return useQuery({
    queryKey: ["bookmarks", queryKeyPrefix, bookmarkId],
    queryFn: () =>
      fetchJson(
        `/api/bookmarks?bookmarkId=${encodeURIComponent(bookmarkId!)}&limit=1`,
        undefined,
        bookmarkFocusResponseSchema
      ),
    enabled: Boolean(bookmarkId),
    placeholderData: options?.keepPrevious === false ? undefined : keepPreviousData,
  });
}
