"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "@/lib/toast";

import { useCreateCollection } from "@/hooks/use-create-collection";
import {
  useCollectionsQuery,
  useLibraryStatsQuery,
  useTagsQuery,
} from "@/hooks/use-library-data";
import {
  scrollDataElementIntoView,
  useSurfaceKeyboardShortcuts,
  type KeyboardShortcutGroup,
} from "@/hooks/use-keyboard-shortcuts";
import { copyCollectionAsUserCollection } from "@/lib/collection-copy";
import {
  buildCollectionsSummary,
  computeCollectionStats,
  filterCollections,
  splitCollections,
  type CollectionFilter,
} from "@/lib/collections-presentation";
import { sendJson } from "@/lib/fetch-json";
import { completeLibrarySync } from "@/lib/library-sync";
import { invalidateCollectionsQuery } from "@/lib/query-invalidation";

export const COLLECTION_SHORTCUT_GROUPS: KeyboardShortcutGroup[] = [
  {
    title: "Navigation",
    shortcuts: [
      { id: "next", keys: ["J"], label: "Next collection" },
      { id: "previous", keys: ["K"], label: "Previous collection" },
      { id: "open", keys: ["O"], label: "Open selected collection" },
      { id: "shortcuts", keys: ["?"], label: "Keyboard shortcuts" },
    ],
  },
  {
    title: "Collections",
    shortcuts: [
      { id: "search", keys: ["/"], label: "Search collections" },
      { id: "new", keys: ["N"], label: "New collection" },
      { id: "filter-all", keys: ["1"], label: "Filter: All" },
      { id: "filter-mine", keys: ["2"], label: "Filter: Mine" },
      { id: "filter-public", keys: ["3"], label: "Filter: Public" },
      { id: "filter-x", keys: ["4"], label: "Filter: X folders" },
    ],
  },
];

export function useCollectionsPage() {
  const router = useRouter();
  const { data: session, update: updateSession } = useSession();
  const queryClient = useQueryClient();
  const { createCollection } = useCreateCollection();

  const [createOpen, setCreateOpen] = useState(false);
  const [keyboardShortcutsOpen, setKeyboardShortcutsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<CollectionFilter>("all");
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const {
    data: collections = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useCollectionsQuery();

  const { data: tags = [] } = useTagsQuery();

  const {
    data: libraryStats,
    isLoading: isLibraryStatsLoading,
  } = useLibraryStatsQuery();

  const { userCollections, xFolders } = useMemo(
    () => splitCollections(collections),
    [collections]
  );

  const collectionStats = useMemo(
    () => computeCollectionStats(collections, userCollections),
    [collections, userCollections]
  );

  const normalizedSearch = searchQuery.trim().toLocaleLowerCase();

  const filteredCollections = useMemo(
    () => filterCollections(collections, activeFilter, normalizedSearch),
    [activeFilter, collections, normalizedSearch]
  );

  const {
    userCollections: visibleUserCollections,
    xFolders: visibleXFolders,
  } = useMemo(() => splitCollections(filteredCollections), [filteredCollections]);

  const visibleCollectionIds = useMemo(
    () => [
      ...visibleUserCollections.map((collection) => collection.id),
      ...visibleXFolders.map((collection) => collection.id),
    ],
    [visibleUserCollections, visibleXFolders]
  );

  const hasActiveFilters = activeFilter !== "all" || normalizedSearch.length > 0;

  const collectionsSummary = buildCollectionsSummary(
    isLoading,
    isError,
    userCollections,
    xFolders,
    collections.length
  );

  const rawLastSyncAt = session?.dbUser?.lastSyncAt ?? null;
  const lastSyncAt = useMemo(
    () => (rawLastSyncAt ? new Date(rawLastSyncAt) : null),
    [rawLastSyncAt]
  );

  const goToTagOnDashboard = useCallback(
    (tagId: string) => {
      router.push(`/dashboard?tag=${encodeURIComponent(tagId)}`);
    },
    [router]
  );

  const handleNavigate = useCallback(
    (collectionId: string) => router.push(`/collections/${collectionId}`),
    [router]
  );

  const handleOrganizeUnshelved = useCallback(() => {
    router.push("/orbit?view=all&intent=oldest");
  }, [router]);

  const selectCollectionByOffset = useCallback(
    (offset: -1 | 1) => {
      if (visibleCollectionIds.length === 0) return;
      const currentIndex = activeCollectionId
        ? visibleCollectionIds.indexOf(activeCollectionId)
        : -1;
      const nextIndex =
        currentIndex === -1
          ? 0
          : Math.max(
              0,
              Math.min(visibleCollectionIds.length - 1, currentIndex + offset)
            );
      const nextId = visibleCollectionIds[nextIndex];
      if (!nextId) return;
      setActiveCollectionId(nextId);
      requestAnimationFrame(() =>
        scrollDataElementIntoView("data-collection-id", nextId)
      );
    },
    [activeCollectionId, visibleCollectionIds]
  );

  const handleCopy = useCallback(
    async (id: string) => {
      try {
        await copyCollectionAsUserCollection(id, queryClient);
        toast.success("Copied as a new collection");
      } catch (copyError) {
        toast.error(
          copyError instanceof Error
            ? copyError.message
            : "Could not copy as collection"
        );
      }
    },
    [queryClient]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (!window.confirm("Delete this collection? This cannot be undone.")) return;
      try {
        await sendJson(`/api/collections/${id}`, { method: "DELETE" });
        await invalidateCollectionsQuery(queryClient);
        toast.success("Collection deleted");
      } catch (deleteError) {
        toast.error(
          deleteError instanceof Error
            ? deleteError.message
            : "Could not delete collection"
        );
      }
    },
    [queryClient]
  );

  const clearCollectionFilters = useCallback(() => {
    setSearchQuery("");
    setActiveFilter("all");
  }, []);

  const handleSyncComplete = useCallback(async () => {
    await completeLibrarySync(queryClient, {
      updateSession: () => updateSession({ refresh: "lastSyncAt" }),
    });
  }, [queryClient, updateSession]);

  const handleCreateCollectionOpen = useCallback(() => {
    setCreateOpen(true);
  }, []);

  useSurfaceKeyboardShortcuts({
    shortcutGroups: COLLECTION_SHORTCUT_GROUPS,
    actions: {
      next: () => selectCollectionByOffset(1),
      previous: () => selectCollectionByOffset(-1),
      open: () => {
        const targetId =
          activeCollectionId && visibleCollectionIds.includes(activeCollectionId)
            ? activeCollectionId
            : visibleCollectionIds[0];
        if (targetId) handleNavigate(targetId);
      },
      shortcuts: () => setKeyboardShortcutsOpen(true),
      search: () => searchInputRef.current?.focus(),
      new: () => setCreateOpen(true),
      "filter-all": () => setActiveFilter("all"),
      "filter-mine": () => setActiveFilter("mine"),
      "filter-public": () => setActiveFilter("public"),
      "filter-x": () => setActiveFilter("x_folders"),
    },
  });

  return useMemo(
    () => ({
      session,
      createCollection,
      createOpen,
      setCreateOpen,
      keyboardShortcutsOpen,
      setKeyboardShortcutsOpen,
      searchQuery,
      setSearchQuery,
      activeFilter,
      setActiveFilter,
      activeCollectionId,
      searchInputRef,
      collections,
      tags,
      isLoading,
      isError,
      error,
      refetch,
      userCollections,
      xFolders,
      collectionStats,
      libraryStats,
      isLibraryStatsLoading,
      filteredCollections,
      visibleUserCollections,
      visibleXFolders,
      hasActiveFilters,
      collectionsSummary,
      lastSyncAt,
      goToTagOnDashboard,
      handleNavigate,
      handleOrganizeUnshelved,
      handleCopy,
      handleDelete,
      clearCollectionFilters,
      handleSyncComplete,
      handleCreateCollectionOpen,
    }),
    [
      session,
      createCollection,
      createOpen,
      setCreateOpen,
      keyboardShortcutsOpen,
      setKeyboardShortcutsOpen,
      searchQuery,
      setSearchQuery,
      activeFilter,
      setActiveFilter,
      activeCollectionId,
      searchInputRef,
      collections,
      tags,
      isLoading,
      isError,
      error,
      refetch,
      userCollections,
      xFolders,
      collectionStats,
      libraryStats,
      isLibraryStatsLoading,
      filteredCollections,
      visibleUserCollections,
      visibleXFolders,
      hasActiveFilters,
      collectionsSummary,
      lastSyncAt,
      goToTagOnDashboard,
      handleNavigate,
      handleOrganizeUnshelved,
      handleCopy,
      handleDelete,
      clearCollectionFilters,
      handleSyncComplete,
      handleCreateCollectionOpen,
    ]
  );
}
