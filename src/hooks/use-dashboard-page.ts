"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "@/lib/toast";

import { useBookmarkViewMode } from "@/hooks/use-bookmark-view-mode";
import { useBookmarkFilters } from "@/hooks/use-bookmark-filters";
import { useBookmarkActions } from "@/hooks/use-bookmark-actions";
import { useBookmarkDialogs } from "@/hooks/use-bookmark-dialogs";
import { useCreateCollection } from "@/hooks/use-create-collection";
import {
  useCollectionsQuery,
  useLibraryStatsQuery,
  useTagsQuery,
} from "@/hooks/use-library-data";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useSyncStatus } from "@/hooks/use-sync-status";
import { fetchJson } from "@/lib/fetch-json";
import { bookmarkListResponseSchema } from "@/lib/api-response-schemas";
import { EMPTY_BOOKMARKS } from "@/lib/orbit-client-constants";
import { requestCompactSearchFocus } from "@/lib/compact-floating-search";
import { getAboveFoldMediaBookmarkIds } from "@/lib/bookmark-feed-layout";
import { completeLibrarySync } from "@/lib/library-sync";
import { saveGemsAsCollection } from "@/lib/save-gems-as-collection";
import type {
  BookmarkWithRelations,
  CollectionWithCount,
  MediaFilter,
  TagWithCount,
} from "@/types";

export type BookmarkResponse = {
  bookmarks: BookmarkWithRelations[];
  total: number;
  totalPages: number;
  nextCursor?: string;
  page?: number;
  personalBoostAuthors?: string[];
  personalBoostTags?: string[];
};

const MEDIA_FILTER_LABELS: Record<string, string> = {
  images: "Images",
  video: "Video",
  links: "Links",
  "text-only": "Text",
};
const EMPTY_TAGS: TagWithCount[] = [];
const EMPTY_COLLECTIONS: CollectionWithCount[] = [];

export function useDashboardPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session, update: updateSession } = useSession();

  const tagFromUrl = searchParams.get("tag");
  const tagsFromUrl = searchParams.get("tags");
  const authorFromUrl = searchParams.get("author");
  const collectionFromUrl = searchParams.get("collection");
  const bookmarkFromUrl = searchParams.get("bookmark");
  const initialTags = (tagsFromUrl ?? tagFromUrl ?? "").split(",").filter(Boolean);

  const filters = useBookmarkFilters({
    selectedTags: initialTags,
    authorFilter: authorFromUrl?.replace(/^@/, "") ?? "",
    collectionId: collectionFromUrl ?? "",
    bookmarkId: bookmarkFromUrl ?? "",
  });
  const { resetPage } = filters;
  const actions = useBookmarkActions();
  const { createCollectionQuick, createCollection } = useCreateCollection();

  const handleSaveGemsAsCollection = useCallback(
    async (bookmarks: BookmarkWithRelations[], suggestedName: string) => {
      try {
        const { created } = await saveGemsAsCollection(
          queryClient,
          createCollectionQuick,
          bookmarks,
          suggestedName
        );
        toast.success(
          created
            ? `Created "${suggestedName}" with ${bookmarks.length} gems`
            : `Added ${bookmarks.length} gems to "${suggestedName}"`
        );
      } catch {
        toast.error("Could not save the gems as a collection");
      }
    },
    [queryClient, createCollectionQuick]
  );

  const { viewMode, setViewMode } = useBookmarkViewMode("grid");
  const [showFilters, setShowFilters] = useState(false);
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [activeBookmarkId, setActiveBookmarkId] = useState<string | null>(null);
  const [gridOverlayBookmarkId, setGridOverlayBookmarkId] = useState<string | null>(null);
  const [keyboardShortcutsOpen, setKeyboardShortcutsOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedBookmarkIds, setSelectedBookmarkIds] = useState<string[]>([]);
  const [syncRequestLoading, setSyncRequestLoading] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const {
    data: bookmarkData,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<BookmarkResponse>({
    queryKey: ["bookmarks", filters.queryString],
    queryFn: () =>
      fetchJson(`/api/bookmarks?${filters.queryString}`, undefined, bookmarkListResponseSchema),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const tagsQuery = useTagsQuery();
  const collectionsQuery = useCollectionsQuery();
  const libraryStatsQuery = useLibraryStatsQuery();
  const syncStatusQuery = useSyncStatus();
  const tags = tagsQuery.data ?? EMPTY_TAGS;
  const collections = collectionsQuery.data ?? EMPTY_COLLECTIONS;
  const libraryStats = libraryStatsQuery.data;
  const syncStatus = syncStatusQuery.data;
  const libraryDataUnavailable =
    tagsQuery.isError ||
    collectionsQuery.isError ||
    libraryStatsQuery.isError ||
    syncStatusQuery.isError;

  const feedReady = !isLoading && !isError;

  const bookmarks: BookmarkWithRelations[] = bookmarkData?.bookmarks ?? EMPTY_BOOKMARKS;
  const total: number = bookmarkData?.total || 0;
  const totalPages: number = bookmarkData?.totalPages || 1;

  const prefetchBookmarkPage = useCallback(
    (targetPage: number) => {
      if (targetPage < 1 || targetPage > totalPages) return;
      if (targetPage === filters.page + 1 && bookmarkData?.nextCursor) {
        filters.preparePageCursor(targetPage, bookmarkData.nextCursor);
      }
      const params = new URLSearchParams(filters.queryString);
      params.set("page", targetPage.toString());
      if (targetPage > 1) {
        const cursor =
          targetPage === filters.page + 1
            ? bookmarkData?.nextCursor
            : filters.pageCursors?.[targetPage];
        if (!cursor) return;
        params.set("cursor", cursor);
      } else {
        params.delete("cursor");
      }
      const qs = params.toString();
      void queryClient.prefetchQuery({
        queryKey: ["bookmarks", qs],
        queryFn: () =>
          fetchJson(`/api/bookmarks?${qs}`, undefined, bookmarkListResponseSchema),
        staleTime: 30_000,
      });
    },
    // Individual filters.* properties are listed; the parent object is not
    // stable across renders, so including `filters` would cause unnecessary
    // re-creations of this callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      bookmarkData,
      filters.page,
      filters.pageCursors,
      filters.preparePageCursor,
      filters.queryString,
      queryClient,
      totalPages,
    ]
  );

  const handlePageChange = useCallback(
    (nextPage: number) => {
      if (nextPage > filters.page && bookmarkData?.nextCursor) {
        filters.preparePageCursor(nextPage, bookmarkData.nextCursor);
      }
      filters.setPage(nextPage);
    },
    [bookmarkData, filters]
  );

  const performanceFocusedId = filters.bookmarkId ? filters.bookmarkId : null;
  const {
    setSelectedTags,
    setPage,
    setMediaFilter,
    setAuthorFilter,
    setCollectionId,
    setBookmarkId,
  } = filters;
  const visibleBookmarkIdSet = useMemo(
    () => new Set(bookmarks.map((bookmark) => bookmark.id)),
    [bookmarks]
  );
  const visibleSelectedBookmarkIds = useMemo(
    () => selectedBookmarkIds.filter((bookmarkId) => visibleBookmarkIdSet.has(bookmarkId)),
    [selectedBookmarkIds, visibleBookmarkIdSet]
  );
  const selectedBookmarkIdSet = useMemo(
    () => new Set(visibleSelectedBookmarkIds),
    [visibleSelectedBookmarkIds]
  );
  const bookmarkById = useMemo(
    () => new Map(bookmarks.map((bookmark) => [bookmark.id, bookmark])),
    [bookmarks]
  );
  const searchQuery = useMemo(
    () => (filters.search ? filters.search : undefined),
    [filters.search]
  );

  const aboveFoldMediaBookmarkIds = useMemo(
    () => getAboveFoldMediaBookmarkIds(bookmarks),
    [bookmarks]
  );
  const dialogs = useBookmarkDialogs({
    bookmarkById,
    bulkSelectionIds:
      selectedBookmarkIds.length > 0 ? visibleSelectedBookmarkIds : undefined,
    onOpenTag: setActiveBookmarkId,
    onOpenCollection: setActiveBookmarkId,
  });

  const tagFromUrlRef = useRef<string | null>(tagFromUrl);
  const tagsFromUrlRef = useRef<string | null>(tagsFromUrl);
  const authorFromUrlRef = useRef<string | null>(authorFromUrl);
  const collectionFromUrlRef = useRef<string | null>(collectionFromUrl);
  const bookmarkFromUrlRef = useRef<string | null>(bookmarkFromUrl);
  useEffect(() => {
    if (tagsFromUrl && tagsFromUrl !== tagsFromUrlRef.current) {
      const next = tagsFromUrl.split(",").filter(Boolean);
      setSelectedTags(next);
      setPage(1);
    } else if (tagFromUrl && tagFromUrl !== tagFromUrlRef.current) {
      setSelectedTags([tagFromUrl]);
      setPage(1);
    }
    if (authorFromUrl !== authorFromUrlRef.current) {
      setAuthorFilter(authorFromUrl ? authorFromUrl.replace(/^@/, "") : "");
    }
    if (collectionFromUrl !== collectionFromUrlRef.current) {
      setCollectionId(collectionFromUrl ?? "");
    }
    if (bookmarkFromUrl !== bookmarkFromUrlRef.current) {
      setBookmarkId(bookmarkFromUrl ?? "");
    }
    tagFromUrlRef.current = tagFromUrl;
    tagsFromUrlRef.current = tagsFromUrl;
    authorFromUrlRef.current = authorFromUrl;
    collectionFromUrlRef.current = collectionFromUrl;
    bookmarkFromUrlRef.current = bookmarkFromUrl;
  }, [
    tagFromUrl,
    tagsFromUrl,
    authorFromUrl,
    collectionFromUrl,
    bookmarkFromUrl,
    setPage,
    setSelectedTags,
    setAuthorFilter,
    setCollectionId,
    setBookmarkId,
  ]);

  const activeBookmarkIdForView = filters.bookmarkId || activeBookmarkId;
  const activeBookmark = useMemo(
    () => bookmarks.find((b) => b.id === activeBookmarkIdForView),
    [bookmarks, activeBookmarkIdForView]
  );
  const gridOverlayBookmark = gridOverlayBookmarkId
    ? (bookmarkById.get(gridOverlayBookmarkId) ?? null)
    : null;

  const clearSelection = useCallback(() => {
    setSelectedBookmarkIds([]);
    setSelectionMode(false);
  }, []);

  const toggleBookmarkSelection = useCallback((bookmarkId: string, selected: boolean) => {
    setSelectedBookmarkIds((current) => {
      if (selected) {
        return current.includes(bookmarkId) ? current : [...current, bookmarkId];
      }
      return current.filter((id) => id !== bookmarkId);
    });
  }, []);

  const selectVisibleBookmarks = useCallback(() => {
    setSelectedBookmarkIds(bookmarks.map((bookmark) => bookmark.id));
  }, [bookmarks]);

  const openBulkTagDialog = useCallback(() => {
    dialogs.openTagDialog(visibleSelectedBookmarkIds);
  }, [dialogs, visibleSelectedBookmarkIds]);

  const openBulkCollectionDialog = useCallback(() => {
    dialogs.openCollectionDialog(visibleSelectedBookmarkIds);
  }, [dialogs, visibleSelectedBookmarkIds]);

  const handleBulkHide = useCallback(async () => {
    if (visibleSelectedBookmarkIds.length === 0) return;
    const confirmed = window.confirm(
      `Hide ${visibleSelectedBookmarkIds.length} bookmark${visibleSelectedBookmarkIds.length === 1 ? "" : "s"} from MarkMaster?`
    );
    if (!confirmed) return;

    await actions.handleDeleteBookmark(visibleSelectedBookmarkIds);
  }, [actions, visibleSelectedBookmarkIds]);

  const handleBookmarkAddTag = dialogs.openTagForBookmark;
  const handleBookmarkAddToCollection = dialogs.openCollectionForBookmark;

  const handleBookmarkAddNote = useCallback((id: string) => {
    setActiveBookmarkId(id);
    setNoteDialogOpen(true);
  }, []);

  const handleExpandedBookmarkOpen = useCallback((id: string) => {
    setActiveBookmarkId(id);
    setGridOverlayBookmarkId(id);
  }, []);

  const handleBookmarkSelect = useCallback((id: string) => {
    setActiveBookmarkId(id);
  }, []);

  const handleGridOverlayOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setGridOverlayBookmarkId(null);
    }
  }, []);

  const handleGridOverlayReviewInOrbit = useCallback(
    (id: string) => {
      router.push(`/orbit?highlightId=${id}`);
    },
    [router]
  );

  const focusPerformanceHighlight = useCallback(
    (id: string) => {
      setBookmarkId(id);
      setActiveBookmarkId(id);
      setPage(1);
    },
    [setBookmarkId, setActiveBookmarkId, setPage]
  );

  const handleSyncComplete = useCallback(async () => {
    resetPage();
    await completeLibrarySync(queryClient, {
      updateSession: () => updateSession({ refresh: "lastSyncAt" }),
    });
  }, [queryClient, updateSession, resetPage]);

  const handleSyncStateChange = useCallback((syncing: boolean) => {
    setSyncRequestLoading(syncing);
  }, []);

  const handleCreateCollectionOpen = dialogs.handleCreateCollectionOpen;

  useKeyboardShortcuts({
    activeBookmarkId: selectionMode ? null : activeBookmarkIdForView,
    bookmarks: selectionMode ? [] : bookmarks,
    navigationLayout: "list",
    onNavigate: setActiveBookmarkId,
    onOpen: handleExpandedBookmarkOpen,
    onSearch: () => requestCompactSearchFocus(searchInputRef),
    onTag: () => {
      if (!activeBookmarkIdForView) return;
      dialogs.openTagForBookmark(activeBookmarkIdForView);
    },
    onCollection: () => {
      if (!activeBookmarkIdForView) return;
      dialogs.openCollectionForBookmark(activeBookmarkIdForView);
    },
    onNote: () => setNoteDialogOpen(true),
    onShowShortcuts: () => setKeyboardShortcutsOpen(true),
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }

      if (e.metaKey || e.ctrlKey) {
        const quickMediaFilters: Record<string, MediaFilter> = {
          "1": "all",
          "2": "images",
          "3": "video",
          "4": "links",
          "5": "text-only",
        };

        const nextFilter = quickMediaFilters[e.key];
        if (nextFilter) {
          e.preventDefault();
          setMediaFilter(nextFilter);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setMediaFilter]);

  const dbUser = session?.dbUser;

  const handleCommandPaletteFilter = useCallback(
    (filter: { mediaFilter?: MediaFilter; selectedTag?: string }) => {
      if (filter.mediaFilter) {
        filters.setMediaFilter(filter.mediaFilter);
      }
      if (filter.selectedTag) {
        filters.setSelectedTags([filter.selectedTag]);
        filters.setPage(1);
      }
    },
    [filters]
  );

  const primaryFilterLabel =
    filters.mediaFilter === "all"
      ? "All Bookmarks"
      : MEDIA_FILTER_LABELS[filters.mediaFilter] || filters.mediaFilter;
  const primaryFilterCompactLabel =
    filters.mediaFilter === "all" ? "All" : primaryFilterLabel;
  const syncProgressVisible = syncRequestLoading || Boolean(syncStatus?.currentRun);

  const selectedTagEntries = useMemo(
    () =>
      filters.selectedTags.flatMap((tagId) => {
        const tag = tags.find((entry) => entry.id === tagId);
        return tag ? [tag] : [];
      }),
    [filters.selectedTags, tags]
  );

  return useMemo(
    () => ({
      filters,
      actions,
      createCollection,
      createCollectionQuick,
      tags,
      collections,
      libraryStats,
      libraryDataUnavailable,
      dbUser,
      viewMode,
      setViewMode,
      showFilters,
      setShowFilters,
      tagDialogOpen: dialogs.tagDialogOpen,
      setTagDialogOpen: dialogs.setTagDialogOpen,
      noteDialogOpen,
      setNoteDialogOpen,
      collectionDialogOpen: dialogs.collectionDialogOpen,
      setCollectionDialogOpen: dialogs.setCollectionDialogOpen,
      createCollectionOpen: dialogs.createCollectionOpen,
      setCreateCollectionOpen: dialogs.setCreateCollectionOpen,
      activeBookmarkId,
      setActiveBookmarkId,
      gridOverlayBookmarkId,
      keyboardShortcutsOpen,
      setKeyboardShortcutsOpen,
      commandPaletteOpen,
      setCommandPaletteOpen,
      selectionMode,
      setSelectionMode,
      selectedBookmarkIds,
      tagTargetIds: dialogs.tagTargetIds,
      setTagTargetIds: dialogs.setTagTargetIds,
      collectionTargetIds: dialogs.collectionTargetIds,
      setCollectionTargetIds: dialogs.setCollectionTargetIds,
      searchInputRef,
      isLoading,
      isError,
      error,
      refetch,
      isFetching,
      feedReady,
      bookmarks,
      total,
      totalPages,
      prefetchBookmarkPage,
      handlePageChange,
      performanceFocusedId,
      setBookmarkId,
      visibleSelectedBookmarkIds,
      selectedBookmarkIdSet,
      searchQuery,
      aboveFoldMediaBookmarkIds,
      tagDialogBookmarks: dialogs.tagDialogBookmarks,
      collectionDialogBookmarks: dialogs.collectionDialogBookmarks,
      dialogTagIds: dialogs.dialogTagIds,
      dialogCollectionIds: dialogs.dialogCollectionIds,
      activeBookmarkIdForView,
      activeBookmark,
      gridOverlayBookmark,
      clearSelection,
      toggleBookmarkSelection,
      selectVisibleBookmarks,
      openBulkTagDialog,
      openBulkCollectionDialog,
      handleBulkHide,
      handleBookmarkAddTag,
      handleBookmarkAddToCollection,
      handleBookmarkAddNote,
      handleExpandedBookmarkOpen,
      handleBookmarkSelect,
      handleGridOverlayOpenChange,
      handleGridOverlayReviewInOrbit,
      focusPerformanceHighlight,
      handleSaveGemsAsCollection,
      handleSyncComplete,
      handleSyncStateChange,
      handleCreateCollectionOpen,
      handleCommandPaletteFilter,
      primaryFilterLabel,
      primaryFilterCompactLabel,
      syncProgressVisible,
      selectedTagEntries,
    }),
    [
      filters,
      actions,
      createCollection,
      createCollectionQuick,
      tags,
      collections,
      libraryStats,
      libraryDataUnavailable,
      dbUser,
      viewMode,
      setViewMode,
      showFilters,
      setShowFilters,
      dialogs,
      noteDialogOpen,
      setNoteDialogOpen,
      activeBookmarkId,
      setActiveBookmarkId,
      gridOverlayBookmarkId,
      keyboardShortcutsOpen,
      setKeyboardShortcutsOpen,
      commandPaletteOpen,
      setCommandPaletteOpen,
      selectionMode,
      setSelectionMode,
      selectedBookmarkIds,
      searchInputRef,
      isLoading,
      isError,
      error,
      refetch,
      isFetching,
      feedReady,
      bookmarks,
      total,
      totalPages,
      prefetchBookmarkPage,
      handlePageChange,
      performanceFocusedId,
      setBookmarkId,
      visibleSelectedBookmarkIds,
      selectedBookmarkIdSet,
      searchQuery,
      aboveFoldMediaBookmarkIds,
      activeBookmarkIdForView,
      activeBookmark,
      gridOverlayBookmark,
      clearSelection,
      toggleBookmarkSelection,
      selectVisibleBookmarks,
      openBulkTagDialog,
      openBulkCollectionDialog,
      handleBulkHide,
      handleBookmarkAddTag,
      handleBookmarkAddToCollection,
      handleBookmarkAddNote,
      handleExpandedBookmarkOpen,
      handleBookmarkSelect,
      handleGridOverlayOpenChange,
      handleGridOverlayReviewInOrbit,
      focusPerformanceHighlight,
      handleSaveGemsAsCollection,
      handleSyncComplete,
      handleSyncStateChange,
      handleCreateCollectionOpen,
      handleCommandPaletteFilter,
      primaryFilterLabel,
      primaryFilterCompactLabel,
      syncProgressVisible,
      selectedTagEntries,
    ]
  );
}
