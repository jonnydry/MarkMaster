"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";

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
import { EMPTY_BOOKMARKS } from "@/lib/orbit-client-constants";
import { completeLibrarySync } from "@/lib/library-sync";
import { saveGemsAsCollection } from "@/lib/save-gems-as-collection";
import type { ViewMode, BookmarkWithRelations, MediaFilter } from "@/types";

export type BookmarkResponse = {
  bookmarks: BookmarkWithRelations[];
  total: number;
  totalPages: number;
};

const MEDIA_FILTER_LABELS: Record<string, string> = {
  images: "Images",
  video: "Video",
  links: "Links",
  "text-only": "Text",
};

export function useDashboardPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session, update: updateSession } = useSession();

  const filters = useBookmarkFilters();
  const actions = useBookmarkActions();
  const { createCollectionQuick, createCollection } = useCreateCollection();

  const handleSaveGemsAsCollection = async (
    bookmarks: BookmarkWithRelations[],
    suggestedName: string
  ) => {
    try {
      await saveGemsAsCollection(queryClient, createCollectionQuick, bookmarks, suggestedName);
      toast.success(`Created "${suggestedName}" with ${bookmarks.length} gems`);
    } catch {
      toast.error("Could not save the gems as a collection");
    }
  };

  const [viewMode, setViewMode] = useState<ViewMode>("feed");
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
    queryFn: () => fetchJson(`/api/bookmarks?${filters.queryString}`),
    placeholderData: keepPreviousData,
  });

  const { data: tags = [] } = useTagsQuery();

  const { data: collections = [] } = useCollectionsQuery();
  const { data: libraryStats } = useLibraryStatsQuery();
  const { data: syncStatus } = useSyncStatus();

  const feedReady = !isLoading && !isError;

  const bookmarks: BookmarkWithRelations[] = bookmarkData?.bookmarks ?? EMPTY_BOOKMARKS;
  const total: number = bookmarkData?.total || 0;
  const totalPages: number = bookmarkData?.totalPages || 1;

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

  const aboveFoldMediaBookmarkId = useMemo(() => {
    const first = bookmarks.find((b) => {
      const m = b.media?.[0];
      return Boolean(m?.url || m?.preview_image_url);
    });
    return first?.id ?? null;
  }, [bookmarks]);
  const dialogs = useBookmarkDialogs({
    bookmarkById,
    bulkSelectionIds:
      selectedBookmarkIds.length > 0 ? visibleSelectedBookmarkIds : undefined,
    onOpenTag: setActiveBookmarkId,
    onOpenCollection: setActiveBookmarkId,
  });

  const tagFromUrl = searchParams.get("tag");
  const tagsFromUrl = searchParams.get("tags");
  const authorFromUrl = searchParams.get("author");
  const collectionFromUrl = searchParams.get("collection");
  const bookmarkFromUrl = searchParams.get("bookmark");
  const tagFromUrlRef = useRef<string | null>(null);
  const tagsFromUrlRef = useRef<string | null>(null);
  const authorFromUrlRef = useRef<string | null>(null);
  const collectionFromUrlRef = useRef<string | null>(null);
  const bookmarkFromUrlRef = useRef<string | null>(null);
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

  const handleBookmarkSelect = useCallback(
    (id: string) => {
      handleExpandedBookmarkOpen(id);
    },
    [handleExpandedBookmarkOpen]
  );

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

  const handleSyncComplete = useCallback(() => {
    completeLibrarySync(queryClient, {
      updateSession: () => updateSession({ refresh: "lastSyncAt" }),
    });
  }, [queryClient, updateSession]);

  const handleSyncStateChange = useCallback((syncing: boolean) => {
    setSyncRequestLoading(syncing);
  }, []);

  const handleCreateCollectionOpen = dialogs.handleCreateCollectionOpen;

  useKeyboardShortcuts({
    activeBookmarkId: selectionMode ? null : activeBookmarkIdForView,
    bookmarks: selectionMode ? [] : bookmarks,
    onNavigate: setActiveBookmarkId,
    onOpen: handleExpandedBookmarkOpen,
    onSearch: () => searchInputRef.current?.focus(),
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

  return {
    filters,
    actions,
    createCollection,
    createCollectionQuick,
    tags,
    collections,
    libraryStats,
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
    performanceFocusedId,
    setBookmarkId,
    visibleSelectedBookmarkIds,
    selectedBookmarkIdSet,
    searchQuery,
    aboveFoldMediaBookmarkId,
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
  };
}
