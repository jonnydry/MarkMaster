"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import type { SortField, SortDirection, MediaFilter } from "@/types";

const PAGE_LIMIT = "20";
const DEBOUNCE_MS = 300;

/**
 * Mirrors the server's `tokenizeBookmarkSearch` minimum term length (see
 * `src/lib/bookmark-search.ts`, not imported here to keep Prisma out of the
 * client bundle). Searches with no usable term are dropped server-side, so
 * don't bother sending them.
 */
const MIN_SEARCH_TERM_LENGTH = 2;

function hasSearchableTerm(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .some(
      (term) => term.replace(/^[@#]+/, "").trim().length >= MIN_SEARCH_TERM_LENGTH
    );
}

type BookmarkFilterInitialState = {
  selectedTags?: string[];
  authorFilter?: string;
  collectionId?: string;
  bookmarkId?: string;
};

export function useBookmarkFilters(initial: BookmarkFilterInitialState = {}) {
  const [search, setSearchImmediate] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("tweetCreatedAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>("all");
  const [authorFilter, setAuthorFilter] = useState(initial.authorFilter ?? "");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>(
    initial.selectedTags ?? []
  );
  const [collectionId, setCollectionId] = useState(initial.collectionId ?? "");
  const [bookmarkId, setBookmarkId] = useState(initial.bookmarkId ?? "");
  const [page, setPage] = useState(1);
  const [pageCursors, setPageCursors] = useState<Record<number, string>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const resetPage = useCallback(() => {
    setPage(1);
    setPageCursors({});
  }, []);

  const preparePageCursor = useCallback((forPage: number, cursor: string) => {
    setPageCursors((current) =>
      current[forPage] === cursor ? current : { ...current, [forPage]: cursor }
    );
  }, []);

  useEffect(() => {
    return () => {
      clearTimeout(debounceRef.current);
    };
  }, []);

  const setSearch = useCallback((v: string) => {
    setSearchImmediate(v);
    clearTimeout(debounceRef.current);
    if (!hasSearchableTerm(v)) {
      // Covers "" and searches the server would drop entirely (all terms
      // below the minimum length) — skip the pointless refetch.
      setDebouncedSearch("");
    } else {
      debounceRef.current = setTimeout(() => {
        setDebouncedSearch(v);
      }, DEBOUNCE_MS);
    }
    resetPage();
  }, [resetPage]);

  const toggleTag = useCallback((tagId: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagId) ? prev.filter((t) => t !== tagId) : [...prev, tagId]
    );
    resetPage();
  }, [resetPage]);

  const hasActiveFilters = useMemo(
    () =>
      mediaFilter !== "all" ||
      authorFilter !== "" ||
      dateFrom !== "" ||
      dateTo !== "" ||
      selectedTags.length > 0 ||
      collectionId !== "" ||
      bookmarkId !== "",
    [
      mediaFilter,
      authorFilter,
      dateFrom,
      dateTo,
      selectedTags,
      collectionId,
      bookmarkId,
    ]
  );

  const clearFilters = useCallback(() => {
    setMediaFilter("all");
    setAuthorFilter("");
    setDateFrom("");
    setDateTo("");
    setSelectedTags([]);
    setCollectionId("");
    setBookmarkId("");
    resetPage();
  }, [resetPage]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: PAGE_LIMIT,
      search: debouncedSearch,
      sortField,
      sortDirection,
      mediaFilter,
      authorFilter,
      tagFilter: selectedTags.join(","),
      ...(dateFrom && { dateFrom }),
      ...(dateTo && { dateTo }),
      ...((dateFrom || dateTo) && {
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      }),
      ...(collectionId && { collectionId }),
      ...(bookmarkId && { bookmarkId }),
    });

    const cursor = page > 1 ? pageCursors[page] : undefined;
    if (cursor) {
      params.set("cursor", cursor);
    }

    return params.toString();
  }, [
    page,
    pageCursors,
    debouncedSearch,
    sortField,
    sortDirection,
    mediaFilter,
    authorFilter,
    selectedTags,
    dateFrom,
    dateTo,
    collectionId,
    bookmarkId,
  ]);

  const setSortFieldWrapped = useCallback(
    (v: SortField) => {
      setSortField(v);
      resetPage();
    },
    [resetPage]
  );

  const setSortDirectionWrapped = useCallback(
    (v: SortDirection) => {
      setSortDirection(v);
      resetPage();
    },
    [resetPage]
  );

  const setMediaFilterWrapped = useCallback(
    (v: MediaFilter) => {
      setMediaFilter(v);
      resetPage();
    },
    [resetPage]
  );

  const setAuthorFilterWrapped = useCallback(
    (v: string) => {
      setAuthorFilter(v);
      resetPage();
    },
    [resetPage]
  );

  const setDateFromWrapped = useCallback(
    (v: string) => {
      setDateFrom(v);
      resetPage();
    },
    [resetPage]
  );

  const setDateToWrapped = useCallback(
    (v: string) => {
      setDateTo(v);
      resetPage();
    },
    [resetPage]
  );

  const setSelectedTagsWrapped = useCallback(
    (v: string[]) => {
      setSelectedTags(v);
      resetPage();
    },
    [resetPage]
  );

  const setCollectionIdWrapped = useCallback(
    (v: string) => {
      setCollectionId(v);
      resetPage();
    },
    [resetPage]
  );

  const setBookmarkIdWrapped = useCallback(
    (v: string) => {
      setBookmarkId(v);
      resetPage();
    },
    [resetPage]
  );

  return useMemo(
    () => ({
      search,
      setSearch,
      sortField,
      setSortField: setSortFieldWrapped,
      sortDirection,
      setSortDirection: setSortDirectionWrapped,
      mediaFilter,
      setMediaFilter: setMediaFilterWrapped,
      authorFilter,
      setAuthorFilter: setAuthorFilterWrapped,
      dateFrom,
      setDateFrom: setDateFromWrapped,
      dateTo,
      setDateTo: setDateToWrapped,
      selectedTags,
      setSelectedTags: setSelectedTagsWrapped,
      collectionId,
      setCollectionId: setCollectionIdWrapped,
      bookmarkId,
      setBookmarkId: setBookmarkIdWrapped,
      page,
      setPage,
      pageCursors,
      preparePageCursor,
      toggleTag,
      hasActiveFilters,
      clearFilters,
      resetPage,
      queryString,
      isSearchPending: hasSearchableTerm(search) && search !== debouncedSearch,
    }),
    [
      search,
      setSearch,
      sortField,
      setSortFieldWrapped,
      sortDirection,
      setSortDirectionWrapped,
      mediaFilter,
      setMediaFilterWrapped,
      authorFilter,
      setAuthorFilterWrapped,
      dateFrom,
      setDateFromWrapped,
      dateTo,
      setDateToWrapped,
      selectedTags,
      setSelectedTagsWrapped,
      collectionId,
      setCollectionIdWrapped,
      bookmarkId,
      setBookmarkIdWrapped,
      page,
      pageCursors,
      preparePageCursor,
      toggleTag,
      hasActiveFilters,
      clearFilters,
      resetPage,
      queryString,
      debouncedSearch,
    ]
  );
}
