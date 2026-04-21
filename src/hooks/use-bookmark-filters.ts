"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import type { SortField, SortDirection, MediaFilter } from "@/types";

const PAGE_LIMIT = "20";
const DEBOUNCE_MS = 300;

export function useBookmarkFilters() {
  const [search, setSearchImmediate] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("tweetCreatedAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>("all");
  const [authorFilter, setAuthorFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const resetPage = useCallback(() => setPage(1), []);

  useEffect(() => {
    return () => {
      clearTimeout(debounceRef.current);
    };
  }, []);

  const setSearch = useCallback((v: string) => {
    setSearchImmediate(v);
    clearTimeout(debounceRef.current);
    if (v === "") {
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
      selectedTags.length > 0,
    [mediaFilter, authorFilter, dateFrom, dateTo, selectedTags]
  );

  const clearFilters = useCallback(() => {
    setMediaFilter("all");
    setAuthorFilter("");
    setDateFrom("");
    setDateTo("");
    setSelectedTags([]);
    resetPage();
  }, [resetPage]);

  const queryString = useMemo(() => {
    return new URLSearchParams({
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
    }).toString();
  }, [page, debouncedSearch, sortField, sortDirection, mediaFilter, authorFilter, selectedTags, dateFrom, dateTo]);

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
      page,
      setPage,
      toggleTag,
      hasActiveFilters,
      clearFilters,
      queryString,
      isSearchPending: search !== debouncedSearch,
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
      page,
      toggleTag,
      hasActiveFilters,
      clearFilters,
      queryString,
      debouncedSearch,
    ]
  );
}
