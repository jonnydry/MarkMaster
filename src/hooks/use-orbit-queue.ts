"use client";

import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { useOrbitLibraryBootstrap } from "@/hooks/use-orbit-library-bootstrap";
import { EMPTY_BOOKMARKS } from "@/lib/orbit-client-constants";
import { fetchJson } from "@/lib/fetch-json";
import { bookmarkListResponseSchema } from "@/lib/api-response-schemas";
import { buildBookmarkByIdMap } from "@/lib/bookmark-by-id-map";
import { buildOrbitQueueListQueryString } from "@/lib/orbit-queue-params";
import type { BookmarkResponse } from "@/lib/orbit-page-types";
import {
  ORBIT_ALL_PAGE_SIZE,
  ORBIT_RECENT_PAGE_SIZE,
  parseOrbitUrlState,
  type OrbitSortDirection,
  type OrbitView,
} from "@/lib/orbit-navigation";

type UseOrbitQueueOptions = {
  onUrlStateApplied?: () => void;
};

export function useOrbitQueue(options: UseOrbitQueueOptions = {}) {
  const { onUrlStateApplied } = options;
  const {
    router,
    searchParams,
    queryClient,
    actions,
    createCollection,
    createCollectionQuick,
    tags,
    collections,
    libraryStats,
    dbUser,
    handleSyncComplete,
    goToTagOnDashboard,
  } = useOrbitLibraryBootstrap();

  const highlightIdFromUrl = searchParams.get("highlightId");
  const digestIdsFromUrl = searchParams.get("digestIds");
  const sourceFromUrl = searchParams.get("source");
  const orbitSearch = searchParams?.toString() ?? "";
  const orbitUrlState = useMemo(
    () => parseOrbitUrlState(orbitSearch),
    [orbitSearch]
  );

  const [orbitView, setOrbitView] = useState<OrbitView>(orbitUrlState.view);
  const [queueSortDirection, setQueueSortDirection] =
    useState<OrbitSortDirection>(orbitUrlState.sortDirection);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [page, setPage] = useState(orbitUrlState.page);
  const [pageCursors, setPageCursors] = useState<Record<number, string>>({});

  const searchInputRef = useRef<HTMLInputElement>(null);
  const appliedOrbitUrlStateKeyRef = useRef(orbitUrlState.stateKey);

  const pageSize =
    orbitView === "recent" ? ORBIT_RECENT_PAGE_SIZE : ORBIT_ALL_PAGE_SIZE;
  const queryString = useMemo(
    () =>
      buildOrbitQueueListQueryString({
        orbitView,
        page,
        pageSize,
        sortDirection: queueSortDirection,
        search: deferredSearch,
        pageCursors,
      }),
    [deferredSearch, orbitView, page, pageCursors, pageSize, queueSortDirection]
  );

  const {
    data: orbitData,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<BookmarkResponse>({
    queryKey: ["bookmarks", "orbit", queryString],
    queryFn: () =>
      fetchJson(`/api/bookmarks?${queryString}`, undefined, bookmarkListResponseSchema),
    placeholderData: keepPreviousData,
  });

  const bookmarks = orbitData?.bookmarks ?? EMPTY_BOOKMARKS;
  const total = orbitData?.total ?? 0;
  const totalPages =
    orbitView === "all" ? Math.max(orbitData?.totalPages ?? 1, 1) : 1;
  const bookmarkById = useMemo(() => buildBookmarkByIdMap(bookmarks), [bookmarks]);

  const queueIsLoading = isLoading && !orbitData;
  const hasSearchQuery = search.trim().length > 0;
  const isSearchPending = search.trim() !== deferredSearch;
  const allQueueCountLabel = total.toLocaleString();

  useEffect(() => {
    if (orbitUrlState.stateKey === appliedOrbitUrlStateKeyRef.current) return;

    appliedOrbitUrlStateKeyRef.current = orbitUrlState.stateKey;
    startTransition(() => {
      setOrbitView(orbitUrlState.view);
      setQueueSortDirection(orbitUrlState.sortDirection);
      setPage(orbitUrlState.page);
      setPageCursors({});
      setSearch("");
      onUrlStateApplied?.();
    });
  }, [orbitUrlState, onUrlStateApplied]);

  useEffect(() => {
    if (orbitView !== "all") return;
    if (page <= totalPages) return;

    startTransition(() => {
      setPage(totalPages);
    });
  }, [orbitView, page, totalPages]);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    startTransition(() => {
      setPage(1);
      setPageCursors({});
    });
  }, []);

  const handleOrbitViewChange = useCallback(
    (value: OrbitView) => {
      if (value === orbitView) return;

      startTransition(() => {
        setOrbitView(value);
        setPage(1);
        setPageCursors({});
      });
    },
    [orbitView]
  );

  const handleQueueSortDirectionChange = useCallback(
    (value: OrbitSortDirection) => {
      if (value === queueSortDirection) return;

      startTransition(() => {
        setQueueSortDirection(value);
        setPage(1);
        setPageCursors({});
      });
    },
    [queueSortDirection]
  );

  const handlePageChange = useCallback(
    (nextPage: number) => {
      if (nextPage > page && orbitData?.nextCursor) {
        setPageCursors((current) => ({
          ...current,
          [nextPage]: orbitData.nextCursor!,
        }));
      }

      startTransition(() => {
        setPage(nextPage);
      });
    },
    [orbitData, page]
  );

  return {
    router,
    searchParams,
    queryClient,
    actions,
    createCollection,
    createCollectionQuick,
    tags,
    collections,
    libraryStats,
    dbUser,
    orbitView,
    queueSortDirection,
    search,
    page,
    deferredSearch,
    pageSize,
    queryString,
    bookmarks,
    total,
    totalPages,
    bookmarkById,
    queueIsLoading,
    isSearchPending,
    hasSearchQuery,
    allQueueCountLabel,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
    highlightIdFromUrl,
    digestIdsFromUrl,
    sourceFromUrl,
    searchInputRef,
    handleSearchChange,
    handleOrbitViewChange,
    handleQueueSortDirectionChange,
    handlePageChange,
    handleSyncComplete,
    goToTagOnDashboard,
  };
}
