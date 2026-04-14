"use client";

import { useState, useCallback, useMemo, useDeferredValue } from "react";
import type { SortField, SortDirection, MediaFilter } from "@/types";

export function useBookmarkFilters() {
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("tweetCreatedAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>("all");
  const [authorFilter, setAuthorFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const deferredSearch = useDeferredValue(search);

  const resetPage = useCallback(() => setPage(1), []);

  const toggleTag = useCallback((tagId: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagId) ? prev.filter((t) => t !== tagId) : [...prev, tagId]
    );
    resetPage();
  }, [resetPage]);

  const hasActiveFilters =
    mediaFilter !== "all" ||
    authorFilter !== "" ||
    dateFrom !== "" ||
    dateTo !== "" ||
    selectedTags.length > 0;

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
      limit: "20",
      search: deferredSearch,
      sortField,
      sortDirection,
      mediaFilter,
      authorFilter,
      tagFilter: selectedTags.join(","),
      ...(dateFrom && { dateFrom }),
      ...(dateTo && { dateTo }),
    }).toString();
  }, [page, deferredSearch, sortField, sortDirection, mediaFilter, authorFilter, selectedTags, dateFrom, dateTo]);

  return {
    search,
    setSearch: useCallback((v: string) => { setSearch(v); resetPage(); }, [resetPage]),
    sortField,
    setSortField: useCallback((v: SortField) => { setSortField(v); resetPage(); }, [resetPage]),
    sortDirection,
    setSortDirection: useCallback((v: SortDirection) => { setSortDirection(v); resetPage(); }, [resetPage]),
    mediaFilter,
    setMediaFilter: useCallback((v: MediaFilter) => { setMediaFilter(v); resetPage(); }, [resetPage]),
    authorFilter,
    setAuthorFilter: useCallback((v: string) => { setAuthorFilter(v); resetPage(); }, [resetPage]),
    dateFrom,
    setDateFrom: useCallback((v: string) => { setDateFrom(v); resetPage(); }, [resetPage]),
    dateTo,
    setDateTo: useCallback((v: string) => { setDateTo(v); resetPage(); }, [resetPage]),
    selectedTags,
    setSelectedTags,
    page,
    setPage,
    toggleTag,
    hasActiveFilters,
    clearFilters,
    queryString,
    isSearchPending: search !== deferredSearch,
  };
}
