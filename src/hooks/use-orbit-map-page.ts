"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  OrbitMapCanvasHandle,
  OrbitMapSelection,
} from "@/components/orbit/orbit-map-canvas-host";
import { useBookmarkFocusQuery } from "@/hooks/use-bookmark-focus-query";
import { useBookmarkDialogs } from "@/hooks/use-bookmark-dialogs";
import {
  useSurfaceKeyboardShortcuts,
  type KeyboardShortcutGroup,
} from "@/hooks/use-keyboard-shortcuts";
import { useOrbitLibraryBootstrap } from "@/hooks/use-orbit-library-bootstrap";
import { useOrbitGraphQuery } from "@/hooks/use-orbit-graph";
import { useOrbitMapAssignments } from "@/hooks/use-orbit-map-assignments";
import { useOrbitMapSearch } from "@/hooks/use-orbit-map-search";
import { useOrbitMapUrl } from "@/hooks/use-orbit-map-url";
import { useSyncStatus } from "@/hooks/use-sync-status";
import { buildOrbitMapConnectionIndex } from "@/lib/orbit-map-connections";
import {
  buildOrbitMapFocus,
  buildOrbitMapGraphIndexes,
  resolveOrbitMapOverflowSelection,
  resolveOrbitMapSelectionNode,
} from "@/lib/orbit-map-graph-indexes";
import {
  getOrbitMapLivingEnabled,
  setOrbitMapLivingEnabled,
} from "@/lib/orbit-map-living";
import { toast } from "@/lib/toast";
import type { BookmarkWithRelations, OrbitGraphNode, OrbitGraphScope } from "@/types";

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
    title: "Canvas (focus the map first)",
    shortcuts: [
      { id: "pan", keys: ["←", "→", "↑", "↓"], label: "Pan the graph" },
      { id: "zoom-in", keys: ["+"], label: "Zoom in" },
      { id: "zoom-out", keys: ["-"], label: "Zoom out" },
      { id: "reset-view", keys: ["0"], label: "Reset view" },
      { id: "clear-sel", keys: ["Esc"], label: "Clear selection" },
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

/**
 * Facade for the Orbit graph page. Composes URL/scope state, the graph
 * query, search (use-orbit-map-search), and assignment flows
 * (use-orbit-map-assignments) into the single API the page consumes.
 */
export function useOrbitMapPage() {
  const {
    router,
    queryClient,
    dbUser,
    actions,
    createCollection,
    createCollectionQuick,
    tags,
    collections,
    libraryStats,
    handleSyncComplete: completeLibrarySyncFromBootstrap,
    goToTagOnDashboard,
  } = useOrbitLibraryBootstrap();

  const url = useOrbitMapUrl();
  const {
    focusBookmarkIdParam,
    focusAnchorIdParam,
    assignmentBookmarkIdParam,
    graphScope,
    graphFilter,
    selection,
    handleSelectionChange,
    handleScopeChange: applyScopeChange,
    handleFilterChange,
  } = url;

  const [keyboardShortcutsOpen, setKeyboardShortcutsOpen] = useState(false);
  const [expandedAnchors, setExpandedAnchors] = useState<string[]>([]);
  // Bookmark shown in the expanded overlay (same modal as the dashboard grid).
  const [expandedBookmarkId, setExpandedBookmarkId] = useState<string | null>(
    null
  );
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [noteTarget, setNoteTarget] = useState<BookmarkWithRelations | null>(
    null
  );
  const canvasRef = useRef<OrbitMapCanvasHandle | null>(null);
  const { data: syncStatus } = useSyncStatus();
  const [syncRequestLoading, setSyncRequestLoading] = useState(false);

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

  const connectionIndex = useMemo(
    () => (graph ? buildOrbitMapConnectionIndex(graph.edges) : null),
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
    useBookmarkFocusQuery(selectedBookmarkId, "orbit-map-focus");

  const focusedBookmark = focusedBookmarkData?.bookmarks?.[0] ?? null;

  const { data: expandedBookmarkData } = useBookmarkFocusQuery(
    expandedBookmarkId,
    "orbit-map-expanded",
    { keepPrevious: false }
  );

  const expandedBookmark = useMemo(() => {
    if (!expandedBookmarkId) return null;
    const fetched = expandedBookmarkData?.bookmarks?.[0];
    if (fetched && fetched.id === expandedBookmarkId) return fetched;
    // Usually the opened bookmark is already selected — reuse the focus
    // query's data so the overlay appears instantly.
    if (focusedBookmark?.id === expandedBookmarkId) return focusedBookmark;
    return null;
  }, [expandedBookmarkId, expandedBookmarkData, focusedBookmark]);

  const externalDialogBookmarks = useMemo(() => {
    const bookmarks: BookmarkWithRelations[] = [];
    if (focusedBookmark) bookmarks.push(focusedBookmark);
    if (expandedBookmark && expandedBookmark.id !== focusedBookmark?.id) {
      bookmarks.push(expandedBookmark);
    }
    return bookmarks;
  }, [expandedBookmark, focusedBookmark]);

  const [livingEnabled, setLivingEnabled] = useState(true);

  useEffect(() => {
    setLivingEnabled(getOrbitMapLivingEnabled());
  }, []);

  const handleLivingEnabledChange = useCallback((enabled: boolean) => {
    setOrbitMapLivingEnabled(enabled);
    setLivingEnabled(enabled);
    canvasRef.current?.setLivingMap(enabled);
  }, []);

  const dialogs = useBookmarkDialogs({
    externalBookmarks: externalDialogBookmarks,
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

  const resolveSearchNodes = useCallback((ids: string[]) => {
    if (!graphIndexes) return [];
    const nodes: OrbitGraphNode[] = [];
    for (const id of ids) {
      const node = graphIndexes.nodesById.get(id);
      if (node) nodes.push(node);
    }
    return nodes;
  }, [graphIndexes]);

  const {
    search,
    setSearch,
    searchDeferred,
    searchResults,
    searchInputRef,
    handleSearchResults,
    handleSearchResultSelect,
  } = useOrbitMapSearch({
    canvasRef,
    onSelect: handleSelectionChange,
    resolveNodes: resolveSearchNodes,
  });

  const {
    copyingCollectionId,
    handleAssign,
    handleNodeDropped,
    openTagDialog,
    openCollectionDialog,
    handleCopyAsCollection,
  } = useOrbitMapAssignments({
    actions,
    dialogs,
    queryClient,
    canvasRef,
    graphIndexes,
    activeSelectionNode,
    selectedBookmarkId,
    refetch,
    onSelectionChange: handleSelectionChange,
  });

  const lastSyncAtValue = dbUser?.lastSyncAt;
  const lastSyncAt = useMemo(
    () => (lastSyncAtValue ? new Date(lastSyncAtValue) : null),
    [lastSyncAtValue]
  );

  const handleCreateCollectionOpen = dialogs.handleCreateCollectionOpen;

  // Opens the expanded bookmark overlay in place (the same modal the
  // dashboard uses) instead of navigating away from the graph.
  const handleOpenBookmark = useCallback((bookmarkId: string) => {
    setExpandedBookmarkId(bookmarkId);
  }, []);

  const handleExpandedBookmarkOpenChange = useCallback((open: boolean) => {
    if (!open) setExpandedBookmarkId(null);
  }, []);

  const handleExpandedAddNote = useCallback(
    (bookmarkId: string) => {
      const bookmark =
        expandedBookmark?.id === bookmarkId
          ? expandedBookmark
          : focusedBookmark?.id === bookmarkId
            ? focusedBookmark
            : null;
      if (!bookmark) return;
      setNoteTarget(bookmark);
      setNoteDialogOpen(true);
    },
    [expandedBookmark, focusedBookmark]
  );

  const handleNoteDialogOpenChange = useCallback((open: boolean) => {
    setNoteDialogOpen(open);
    if (!open) setNoteTarget(null);
  }, []);

  const handleReviewInOrbit = useCallback(
    (bookmarkId: string) => {
      router.push(`/orbit?highlightId=${encodeURIComponent(bookmarkId)}`);
    },
    [router]
  );

  const handleExpandedDelete = useCallback(
    async (bookmarkId: string) => {
      setExpandedBookmarkId(null);
      await actions.handleDeleteBookmark(bookmarkId);
    },
    [actions]
  );

  const stats = graph?.stats;
  const truncatedCount = stats?.truncatedBookmarks ?? 0;
  const renderedBookmarkCount = graphIndexes?.bookmarkCount ?? 0;
  const graphIsEmpty =
    Boolean(graph && graphIndexes) &&
    (graphScope === "orbit"
      ? stats?.looseBookmarks === 0
      : stats?.totalBookmarks === 0 || renderedBookmarkCount === 0);

  const handleSyncComplete = useCallback(async () => {
    await completeLibrarySyncFromBootstrap({ refetch: () => void refetch() });
  }, [completeLibrarySyncFromBootstrap, refetch]);

  const handleSyncStateChange = useCallback((syncing: boolean) => {
    setSyncRequestLoading(syncing);
  }, []);

  const syncProgressVisible =
    syncRequestLoading || Boolean(syncStatus?.currentRun);

  const handleScopeChange = useCallback(
    (next: OrbitGraphScope) => {
      setExpandedAnchors([]);
      applyScopeChange(next);
    },
    [applyScopeChange]
  );

  // Clicking a "+N more" overflow node selects its hub. Tag/collection
  // overflow also expands that cluster in place (silent 10-anchor cap).
  // Core overflow has no expand API — open the core inspector instead.
  const handleCanvasSelectionChange = useCallback(
    (next: OrbitMapSelection | null) => {
      if (next?.kind === "overflow" && graphIndexes) {
        const resolved = resolveOrbitMapOverflowSelection(
          graphIndexes.nodesById.get(next.id)
        );
        if (resolved) {
          if (resolved.expand) {
            const alreadyExpanded = expandedAnchors.includes(
              resolved.selection.id
            );
            if (!alreadyExpanded && expandedAnchors.length >= 10) {
              toast.info("At most 10 clusters can be expanded at once.");
            } else if (!alreadyExpanded) {
              setExpandedAnchors((prev) =>
                prev.includes(resolved.selection.id)
                  ? prev
                  : [...prev, resolved.selection.id]
              );
            }
          }
          handleSelectionChange(resolved.selection);
          return;
        }
      }
      handleSelectionChange(next);
    },
    [expandedAnchors, graphIndexes, handleSelectionChange]
  );

  const handleClearSelection = useCallback(() => {
    handleSelectionChange(null);
  }, [handleSelectionChange]);

  const handleSelectConnectedNode = useCallback(
    (bookmarkId: string) => {
      handleSelectionChange({ kind: "bookmark", id: bookmarkId });
      canvasRef.current?.focusOn({ kind: "bookmark", id: bookmarkId });
    },
    [handleSelectionChange]
  );

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
    searchInputRef,
    handleSearchResults,
    keyboardShortcutsOpen,
    setKeyboardShortcutsOpen,
    lastSyncAt,
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
    handleSyncStateChange,
    syncProgressVisible,
    handleSelectionChange,
    handleCanvasSelectionChange,
    handleScopeChange,
    handleOpenBookmark,
    expandedBookmark,
    handleExpandedBookmarkOpenChange,
    handleExpandedAddNote,
    handleReviewInOrbit,
    handleExpandedDelete,
    noteDialogOpen,
    noteTarget,
    handleNoteDialogOpenChange,
    handleAssign,
    handleNodeDropped,
    openTagDialog,
    openCollectionDialog,
    handleCopyAsCollection,
    handleClearSelection,
    handleSearchResultSelect,
    handleSelectConnectedNode,
    graphIndexes,
    connectionIndex,
    livingEnabled,
    handleLivingEnabledChange,
    graphFilter,
    handleFilterChange,
  };
}
