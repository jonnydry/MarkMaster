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
import { useOrbitMapLayout } from "@/hooks/use-orbit-map-layout";
import { useOrbitMapSearch } from "@/hooks/use-orbit-map-search";
import { useOrbitMapUrl } from "@/hooks/use-orbit-map-url";
import { useSyncStatus } from "@/hooks/use-sync-status";
import {
  buildOrbitMapFocus,
  buildOrbitMapGraphIndexes,
  resolveOrbitMapSelectionNode,
} from "@/lib/orbit-map-graph-indexes";
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
 * query, layout/hover, search (use-orbit-map-search), and assignment flows
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
    selection,
    handleSelectionChange,
    handleScopeChange: applyScopeChange,
  } = url;

  const layout = useOrbitMapLayout();
  const {
    stageRef,
    stageSize,
    hoverCard,
    handleHoverChange: applyHoverChange,
    resetHover,
  } = layout;

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

  const dialogs = useBookmarkDialogs({
    externalBookmarks: externalDialogBookmarks,
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
      void refetch();
    },
    [actions, refetch]
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
      applyScopeChange(next, () => {
        resetHover();
      });
    },
    [applyScopeChange, resetHover]
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
    handleSyncStateChange,
    syncProgressVisible,
    handleSelectionChange,
    handleCanvasSelectionChange,
    handleScopeChange,
    handleHoverChange,
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
  };
}
