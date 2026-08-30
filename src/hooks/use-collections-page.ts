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
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { copyCollectionAsUserCollection } from "@/lib/collection-copy";
import {
  buildCollectionsSummary,
  computeCollectionStats,
  filterCollections,
  splitCollections,
  type CollectionFilter,
} from "@/lib/collections-presentation";
import { fetchJson, sendJson } from "@/lib/fetch-json";
import { completeLibrarySync } from "@/lib/library-sync";
import { invalidateCollectionsQuery } from "@/lib/query-invalidation";
import { MAX_BOOKMARK_TARGETS } from "@/lib/validations";
import type { CollectionWithCount } from "@/types";

const UNDO_TOAST_DURATION_MS = 10_000;

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

  const restoreDeletedCollection = useCallback(
    async (snapshot: CollectionWithCount, bookmarkIds: string[]) => {
      try {
        const restored = await sendJson<{ id: string }>("/api/collections", {
          method: "POST",
          body: {
            name: snapshot.name,
            description: snapshot.description ?? "",
            isPublic: snapshot.isPublic,
          },
        });
        for (let i = 0; i < bookmarkIds.length; i += MAX_BOOKMARK_TARGETS) {
          await sendJson(`/api/collections/${restored.id}/items`, {
            method: "POST",
            body: { bookmarkIds: bookmarkIds.slice(i, i + MAX_BOOKMARK_TARGETS) },
          });
        }
        await invalidateCollectionsQuery(queryClient);
        toast.success(`Restored "${snapshot.name}"`);
      } catch (restoreError) {
        toast.error(
          restoreError instanceof Error
            ? restoreError.message
            : "Could not restore collection"
        );
      }
    },
    [queryClient]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      const confirmed = await confirmDialog({
        title: "Delete this collection?",
        description: "Bookmarks inside it stay in your library.",
        confirmLabel: "Delete collection",
        destructive: true,
      });
      if (!confirmed) return;

      // The API hard-deletes the collection and its item rows, so capture the
      // metadata and full item list up front to power the undo toast.
      const snapshot = collections.find((collection) => collection.id === id);
      let undoState: {
        snapshot: CollectionWithCount;
        bookmarkIds: string[];
      } | null = null;
      if (snapshot) {
        try {
          const bookmarkIds: string[] = [];
          let page = 1;
          let totalPages = 1;
          do {
            const detail = await fetchJson<{
              items: { bookmark: { id: string } }[];
              totalPages: number;
            }>(`/api/collections/${id}?page=${page}&limit=100`);
            bookmarkIds.push(...detail.items.map((item) => item.bookmark.id));
            totalPages = detail.totalPages;
            page += 1;
          } while (page <= totalPages);
          undoState = { snapshot, bookmarkIds };
        } catch {
          // Snapshot fetch failed — still delete, just without offering undo.
        }
      }

      try {
        await sendJson(`/api/collections/${id}`, { method: "DELETE" });
        await invalidateCollectionsQuery(queryClient);
        if (undoState) {
          const { snapshot: deleted, bookmarkIds } = undoState;
          toast.success("Collection deleted", {
            duration: UNDO_TOAST_DURATION_MS,
            action: {
              label: "Undo",
              onClick: () => {
                void restoreDeletedCollection(deleted, bookmarkIds);
              },
            },
          });
        } else {
          toast.success("Collection deleted");
        }
      } catch (deleteError) {
        toast.error(
          deleteError instanceof Error
            ? deleteError.message
            : "Could not delete collection"
        );
      }
    },
    [collections, queryClient, restoreDeletedCollection]
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
