"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";

import type {
  OrbitMapCanvasHandle,
  OrbitMapSelection,
} from "@/components/orbit/orbit-map-canvas-host";
import { useBookmarkActions } from "@/hooks/use-bookmark-actions";
import { useBookmarkDialogs } from "@/hooks/use-bookmark-dialogs";
import { useCreateCollection } from "@/hooks/use-create-collection";
import {
  useCollectionsQuery,
  useLibraryStatsQuery,
  useTagsQuery,
} from "@/hooks/use-library-data";
import {
  useSurfaceKeyboardShortcuts,
  type KeyboardShortcutGroup,
} from "@/hooks/use-keyboard-shortcuts";
import { useOrbitGraphQuery } from "@/hooks/use-orbit-graph";
import { useOrbitMapLayout } from "@/hooks/use-orbit-map-layout";
import { useOrbitMapUrl } from "@/hooks/use-orbit-map-url";
import { copyCollectionAsUserCollection } from "@/lib/collection-copy";
import { fetchJson, sendJson } from "@/lib/fetch-json";
import { invalidateCollectionsQuery } from "@/lib/query-invalidation";
import {
  buildOrbitMapFocus,
  buildOrbitMapGraphIndexes,
  resolveOrbitMapSelectionNode,
} from "@/lib/orbit-map-graph-indexes";
import { rankOrbitMapSearchResults } from "@/lib/orbit-map-search";
import { completeLibrarySync } from "@/lib/library-sync";
import type { BookmarkWithRelations, OrbitGraphScope } from "@/types";

export const ORBIT_MAP_SHORTCUT_GROUPS: KeyboardShortcutGroup[] = [
  {
    title: "Graph Navigation",
    shortcuts: [
      { id: "search", keys: ["/"], label: "Search graph" },
      { id: "scope-library", keys: ["L"], label: "Full library scope" },
      { id: "scope-orbit", keys: ["Q"], label: "Orbit queue scope" },
      { id: "back", keys: ["B"], label: "Back to Orbit queue" },
      { id: "shortcuts", keys: ["?"], label: "Keyboard shortcuts" },
    ],
  },
  {
    title: "Selected Bookmark",
    shortcuts: [
      { id: "assign", keys: ["A"], label: "Assign selected tag or collection" },
      { id: "tag", keys: ["T"], label: "Add tag" },
      { id: "collection", keys: ["C"], label: "Add to collection" },
      { id: "clear", keys: ["X"], label: "Clear graph selection" },
    ],
  },
];

export function useOrbitMapPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session, update: updateSession } = useSession();
  const actions = useBookmarkActions();
  const { createCollection, createCollectionQuick } = useCreateCollection();

  const url = useOrbitMapUrl();
  const {
    focusBookmarkIdParam,
    focusAnchorIdParam,
    assignmentBookmarkIdParam,
    graphScope,
    selection,
    handleSelectionChange,
    handleScopeChange: applyScopeChange,
  } = url;

  const layout = useOrbitMapLayout(graphScope);
  const {
    stageRef,
    stageSize,
    hoverCard,
    handleLayoutUpdated,
    handleHoverChange: applyHoverChange,
    flushPendingLayoutSave,
    resetHover,
  } = layout;

  const { data: tags = [] } = useTagsQuery();
  const { data: collections = [] } = useCollectionsQuery();
  const { data: libraryStats } = useLibraryStatsQuery();

  const [copyingCollectionId, setCopyingCollectionId] = useState<string | null>(
    null
  );
  const [search, setSearch] = useState("");
  const [keyboardShortcutsOpen, setKeyboardShortcutsOpen] = useState(false);
  const [expandedAnchors, setExpandedAnchors] = useState<string[]>([]);
  const searchDeferred = useDeferredValue(search.trim().toLowerCase());
  const canvasRef = useRef<OrbitMapCanvasHandle | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const {
    data: graph,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useOrbitGraphQuery(graphScope, expandedAnchors);

  const graphIndexes = useMemo(
    () => buildOrbitMapGraphIndexes(graph),
    [graph]
  );

  const activeSelectionNode = useMemo(
    () => resolveOrbitMapSelectionNode(selection, graphIndexes),
    [graphIndexes, selection]
  );

  const selectedBookmarkId = useMemo(() => {
    if (selection?.kind === "bookmark") return selection.id;
    return assignmentBookmarkIdParam ?? focusBookmarkIdParam;
  }, [assignmentBookmarkIdParam, focusBookmarkIdParam, selection]);

  const { data: focusedBookmarkData, isLoading: focusedBookmarkLoading } =
    useQuery({
      queryKey: ["bookmarks", "orbit-map-focus", selectedBookmarkId],
      queryFn: () =>
        fetchJson<{ bookmarks: BookmarkWithRelations[] }>(
          `/api/bookmarks?bookmarkId=${encodeURIComponent(selectedBookmarkId!)}&limit=1`
        ),
      enabled: Boolean(selectedBookmarkId),
      placeholderData: keepPreviousData,
    });
  const focusedBookmark = focusedBookmarkData?.bookmarks?.[0] ?? null;

  const dialogs = useBookmarkDialogs({
    externalBookmarks: focusedBookmark ? [focusedBookmark] : [],
    onDialogClose: () => {
      void refetch();
    },
  });

  const focus = useMemo(
    () =>
      buildOrbitMapFocus(
        focusBookmarkIdParam,
        focusAnchorIdParam,
        graphIndexes
      ),
    [focusAnchorIdParam, focusBookmarkIdParam, graphIndexes]
  );

  const searchResults = useMemo(() => {
    return graph ? rankOrbitMapSearchResults(graph.nodes, searchDeferred) : [];
  }, [graph, searchDeferred]);

  // Live canvas highlight for search matches (capped to keep messages small).
  const highlightedNodeIds = useMemo(() => {
    if (!searchDeferred) return null;
    return searchResults.slice(0, 400).map((node) => node.id);
  }, [searchDeferred, searchResults]);

  useEffect(() => {
    if (!focusBookmarkIdParam || !graphIndexes) return;
    if (!graphIndexes.bookmarksById.has(focusBookmarkIdParam)) return;
    const handle = window.setTimeout(() => {
      canvasRef.current?.focusOn({
        kind: "bookmark",
        id: focusBookmarkIdParam,
      });
    }, 60);
    return () => window.clearTimeout(handle);
  }, [focusBookmarkIdParam, graphIndexes]);

  const dbUser = session?.dbUser;
  const lastSyncAtValue = dbUser?.lastSyncAt;
  const lastSyncAt = useMemo(
    () => (lastSyncAtValue ? new Date(lastSyncAtValue) : null),
    [lastSyncAtValue]
  );

  const goToTagOnDashboard = useCallback(
    (tagId: string) => {
      router.push(`/dashboard?tag=${encodeURIComponent(tagId)}`);
    },
    [router]
  );

  const handleCreateCollectionOpen = dialogs.handleCreateCollectionOpen;

  const handleOpenBookmark = useCallback(
    (bookmarkId: string) => {
      router.push(`/dashboard?bookmark=${encodeURIComponent(bookmarkId)}`);
    },
    [router]
  );

  const handleAssign = useCallback(async () => {
    if (!activeSelectionNode || !selectedBookmarkId) return;
    if (
      activeSelectionNode.kind !== "tag" &&
      activeSelectionNode.kind !== "collection"
    ) {
      return;
    }

    if (activeSelectionNode.kind === "tag") {
      await canvasRef.current?.animateAssign(
        selectedBookmarkId,
        activeSelectionNode.id
      );
      await actions.handleAddTag(
        selectedBookmarkId,
        activeSelectionNode.name,
        activeSelectionNode.color
      );
      await refetch();
      return;
    }

    if (activeSelectionNode.variant === "x_folder") return;

    await canvasRef.current?.animateAssign(
      selectedBookmarkId,
      activeSelectionNode.id
    );
    await actions.handleAddToCollection(
      selectedBookmarkId,
      activeSelectionNode.id
    );
    await refetch();
  }, [actions, activeSelectionNode, refetch, selectedBookmarkId]);

  const handleNodeDropped = useCallback(
    async (
      bookmarkId: string,
      anchorId: string,
      anchorKind: "tag" | "collection"
    ) => {
      const anchor = resolveOrbitMapSelectionNode(
        { kind: anchorKind, id: anchorId },
        graphIndexes
      );
      if (!anchor) return;

      try {
        if (anchor.kind === "tag") {
          await actions.handleAddTag(bookmarkId, anchor.name, anchor.color);
          toast.success(`Tagged #${anchor.name}`, {
            action: {
              label: "Undo",
              onClick: () => {
                void actions
                  .handleRemoveTag(bookmarkId, anchorId)
                  .then(() => refetch());
              },
            },
          });
        } else if (anchor.kind === "collection") {
          if (anchor.variant === "x_folder") {
            toast.info(
              "X folders are synced from X and can't be edited. Copy it as a collection first."
            );
            return;
          }
          await actions.handleAddToCollection(bookmarkId, anchor.id);
          toast.success(`Added to ${anchor.name}`, {
            action: {
              label: "Undo",
              onClick: () => {
                void sendJson(`/api/collections/${anchor.id}/items`, {
                  method: "DELETE",
                  body: { bookmarkIds: [bookmarkId] },
                }).then(() => {
                  invalidateCollectionsQuery(queryClient);
                  void queryClient.invalidateQueries({
                    queryKey: ["bookmarks"],
                  });
                  void refetch();
                });
              },
            },
          });
        }
        await refetch();
      } catch {
        // Failure toasts come from the underlying mutations in useBookmarkActions.
      }
    },
    [actions, graphIndexes, queryClient, refetch]
  );

  const openTagDialog = useCallback(() => {
    if (selectedBookmarkId) {
      dialogs.openTagForBookmark(selectedBookmarkId);
    }
  }, [dialogs, selectedBookmarkId]);

  const openCollectionDialog = useCallback(() => {
    if (selectedBookmarkId) {
      dialogs.openCollectionForBookmark(selectedBookmarkId);
    }
  }, [dialogs, selectedBookmarkId]);

  const handleCopyAsCollection = useCallback(
    async (collectionId: string) => {
      setCopyingCollectionId(collectionId);
      try {
        const copied = await copyCollectionAsUserCollection(
          collectionId,
          queryClient
        );
        await refetch();

        const nextSelection: OrbitMapSelection = {
          kind: "collection",
          id: copied.id,
        };
        handleSelectionChange(nextSelection);
        window.setTimeout(() => {
          canvasRef.current?.focusOn(nextSelection);
        }, 60);
        toast.success("Copied as a new collection");
      } catch (copyError) {
        toast.error(
          copyError instanceof Error
            ? copyError.message
            : "Could not copy as collection"
        );
      } finally {
        setCopyingCollectionId(null);
      }
    },
    [handleSelectionChange, queryClient, refetch]
  );

  const stats = graph?.stats;
  const truncatedCount = stats?.truncatedBookmarks ?? 0;
  const renderedBookmarkCount = graphIndexes?.bookmarkCount ?? 0;
  const graphIsEmpty =
    Boolean(graph && graphIndexes) &&
    (graphScope === "orbit"
      ? stats?.looseBookmarks === 0
      : stats?.totalBookmarks === 0 || renderedBookmarkCount === 0);

  const handleSyncComplete = useCallback(() => {
    completeLibrarySync(queryClient, {
      updateSession: () => updateSession({ refresh: "lastSyncAt" }),
    });
    void refetch();
  }, [queryClient, refetch, updateSession]);

  const handleScopeChange = useCallback(
    (next: OrbitGraphScope) => {
      setExpandedAnchors([]);
      applyScopeChange(next, () => {
        flushPendingLayoutSave();
        resetHover();
      });
    },
    [applyScopeChange, flushPendingLayoutSave, resetHover]
  );

  // Clicking a "+N more" overflow node expands its anchor's cluster in place
  // (and selects the anchor); everything else flows through as-is.
  const handleCanvasSelectionChange = useCallback(
    (next: OrbitMapSelection | null) => {
      if (next?.kind === "overflow" && graphIndexes) {
        const node = graphIndexes.nodesById.get(next.id);
        if (
          node?.kind === "overflow" &&
          (node.anchorKind === "tag" || node.anchorKind === "collection")
        ) {
          setExpandedAnchors((prev) =>
            prev.includes(node.anchorId) || prev.length >= 10
              ? prev
              : [...prev, node.anchorId]
          );
          handleSelectionChange({ kind: node.anchorKind, id: node.anchorId });
          return;
        }
      }
      handleSelectionChange(next);
    },
    [graphIndexes, handleSelectionChange]
  );

  const handleClearSelection = useCallback(() => {
    handleSelectionChange(null);
  }, [handleSelectionChange]);

  const handleSearchResultSelect = useCallback(
    (identity: OrbitMapSelection) => {
      handleSelectionChange(identity);
      canvasRef.current?.focusOn(identity);
    },
    [handleSelectionChange]
  );

  const handleHoverChange = useCallback(
    (
      next: OrbitMapSelection | null,
      position?: { x: number; y: number }
    ) => {
      applyHoverChange(next, position, graphIndexes);
    },
    [applyHoverChange, graphIndexes]
  );

  const headerDescription = useMemo(() => {
    if (!stats) return "Visualise how tags, collections, and bookmarks connect.";
    const scopeLabel =
      graphScope === "orbit" ? "Orbit queue map" : "Full library map";
    const bookmarkCount =
      graphScope === "orbit"
        ? stats.looseBookmarks.toLocaleString()
        : stats.totalBookmarks.toLocaleString();
    const bookmarkLabel = graphScope === "orbit" ? "in queue" : "bookmarks";
    return `${scopeLabel} · ${bookmarkCount} ${bookmarkLabel} · ${stats.tagCount} tags · ${
      stats.userCollectionCount + stats.xFolderCount
    } collections${
      truncatedCount > 0 ? ` · ${truncatedCount.toLocaleString()} hidden` : ""
    }`;
  }, [graphScope, stats, truncatedCount]);

  useSurfaceKeyboardShortcuts({
    shortcutGroups: ORBIT_MAP_SHORTCUT_GROUPS,
    actions: {
      search: () => searchInputRef.current?.focus(),
      "scope-library": () => handleScopeChange("library"),
      "scope-orbit": () => handleScopeChange("orbit"),
      back: () => router.push("/orbit"),
      assign: () => {
        if (activeSelectionNode && selectedBookmarkId) {
          void handleAssign();
        }
      },
      tag: () => openTagDialog(),
      collection: () => openCollectionDialog(),
      clear: () => handleClearSelection(),
      shortcuts: () => setKeyboardShortcutsOpen(true),
    },
  });

  return {
    session,
    dbUser,
    tags,
    collections,
    libraryStats,
    graph,
    graphScope,
    selection,
    focus,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
    graphIsEmpty,
    stats,
    truncatedCount,
    search,
    setSearch,
    searchDeferred,
    searchResults,
    highlightedNodeIds,
    searchInputRef,
    keyboardShortcutsOpen,
    setKeyboardShortcutsOpen,
    headerDescription,
    lastSyncAt,
    stageRef,
    stageSize,
    hoverCard,
    canvasRef,
    copyingCollectionId,
    selectedBookmarkId,
    focusedBookmark,
    focusedBookmarkLoading,
    actions,
    createCollection,
    createCollectionQuick,
    dialogs,
    goToTagOnDashboard,
    handleCreateCollectionOpen,
    handleSyncComplete,
    handleSelectionChange,
    handleCanvasSelectionChange,
    handleScopeChange,
    handleLayoutUpdated,
    handleHoverChange,
    handleOpenBookmark,
    handleAssign,
    handleNodeDropped,
    openTagDialog,
    openCollectionDialog,
    handleCopyAsCollection,
    handleClearSelection,
    handleSearchResultSelect,
  };
}
