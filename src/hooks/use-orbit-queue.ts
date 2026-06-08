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
import { useRouter, useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { useBookmarkActions } from "@/hooks/use-bookmark-actions";
import { useCreateCollection } from "@/hooks/use-create-collection";
import { useCollectionsQuery, useTagsQuery } from "@/hooks/use-library-data";
import { EMPTY_BOOKMARKS } from "@/lib/orbit-client-constants";
import { fetchJson } from "@/lib/fetch-json";
import type { BookmarkResponse } from "@/lib/orbit-page-types";
import {
  ORBIT_ALL_PAGE_SIZE,
  ORBIT_RECENT_PAGE_SIZE,
  parseOrbitUrlState,
  type OrbitSortDirection,
  type OrbitView,
} from "@/lib/orbit-navigation";
import { invalidateLibraryQueries } from "@/lib/query-invalidation";
import type { DbUser } from "@/lib/auth";

type UseOrbitQueueOptions = {
  onUrlStateApplied?: () => void;
};

export function useOrbitQueue(options: UseOrbitQueueOptions = {}) {
  const { onUrlStateApplied } = options;
  const router = useRouter();
  const searchParams = useSearchParams();

  const highlightIdFromUrl = searchParams.get("highlightId");
  const digestIdsFromUrl = searchParams.get("digestIds");
  const sourceFromUrl = searchParams.get("source");
  const queryClient = useQueryClient();
  const orbitSearch = searchParams?.toString() ?? "";
  const orbitUrlState = useMemo(
    () => parseOrbitUrlState(orbitSearch),
    [orbitSearch]
  );
  const { data: session } = useSession() as {
    data: { dbUser?: DbUser } | null;
  };
  const actions = useBookmarkActions();
  const { createCollection, createCollectionQuick } = useCreateCollection();

  const [orbitView, setOrbitView] = useState<OrbitView>(orbitUrlState.view);
  const [queueSortDirection, setQueueSortDirection] =
    useState<OrbitSortDirection>(orbitUrlState.sortDirection);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [page, setPage] = useState(orbitUrlState.page);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const appliedOrbitUrlStateKeyRef = useRef(orbitUrlState.stateKey);

  const { data: tags = [] } = useTagsQuery();
  const { data: collections = [] } = useCollectionsQuery();

  const pageSize =
    orbitView === "recent" ? ORBIT_RECENT_PAGE_SIZE : ORBIT_ALL_PAGE_SIZE;
  const queryString = useMemo(() => {
    const params = new URLSearchParams({
      page: orbitView === "recent" ? "1" : page.toString(),
      limit: pageSize.toString(),
      sortField: "bookmarkedAt",
      sortDirection: queueSortDirection,
      unaffiliated: "true",
    });

    if (deferredSearch) {
      params.set("search", deferredSearch);
    }

    return params.toString();
  }, [deferredSearch, orbitView, page, pageSize, queueSortDirection]);

  const {
    data: orbitData,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<BookmarkResponse>({
    queryKey: ["bookmarks", "orbit", queryString],
    queryFn: () => fetchJson(`/api/bookmarks?${queryString}`),
    placeholderData: keepPreviousData,
  });

  const bookmarks = orbitData?.bookmarks ?? EMPTY_BOOKMARKS;
  const total = orbitData?.total ?? 0;
  const totalPages =
    orbitView === "all" ? Math.max(orbitData?.totalPages ?? 1, 1) : 1;
  const bookmarkById = useMemo(
    () => new Map(bookmarks.map((bookmark) => [bookmark.id, bookmark])),
    [bookmarks]
  );

  const queueIsLoading = isLoading && !orbitData;
  const hasSearchQuery = search.trim().length > 0;
  const isSearchPending = search.trim() !== deferredSearch;
  const allQueueCountLabel = total.toLocaleString();
  const dbUser = session?.dbUser;

  useEffect(() => {
    if (orbitUrlState.stateKey === appliedOrbitUrlStateKeyRef.current) return;

    appliedOrbitUrlStateKeyRef.current = orbitUrlState.stateKey;
    startTransition(() => {
      setOrbitView(orbitUrlState.view);
      setQueueSortDirection(orbitUrlState.sortDirection);
      setPage(orbitUrlState.page);
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
    });
  }, []);

  const handleOrbitViewChange = useCallback(
    (value: OrbitView) => {
      if (value === orbitView) return;

      startTransition(() => {
        setOrbitView(value);
        setPage(1);
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
      });
    },
    [queueSortDirection]
  );

  const handlePageChange = useCallback((nextPage: number) => {
    startTransition(() => {
      setPage(nextPage);
    });
  }, []);

  const handleSyncComplete = useCallback(() => {
    void invalidateLibraryQueries(queryClient, { refetchType: "all" });
  }, [queryClient]);

  const goToTagOnDashboard = useCallback(
    (tagId: string) => {
      router.push(`/dashboard?tag=${encodeURIComponent(tagId)}`);
    },
    [router]
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
