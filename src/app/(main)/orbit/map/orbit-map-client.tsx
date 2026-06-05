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
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
} from "lucide-react";

import { OrbitLogoMark } from "@/components/brands/orbit-logo-mark";
import { buttonVariants } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { RetryButton } from "@/components/ui/retry-button";
import { useOrbitalTheme } from "@/components/providers";
import { orbitShellClass } from "@/lib/orbit-route-chrome";
import { appContentInsetClassName } from "@/lib/app-chrome";
import { cn } from "@/lib/utils";
import { copyCollectionAsUserCollection } from "@/lib/collection-copy";
import { fetchJson } from "@/lib/fetch-json";
import { invalidateLibraryQueries } from "@/lib/query-invalidation";
import type { BookmarkWithRelations } from "@/types";
import { Sidebar } from "@/components/sidebar-dynamic";
import { MobileSidebar } from "@/components/mobile-sidebar";
import { PageHeader } from "@/components/page-header";
import { UserNavDynamic } from "@/components/user-nav-dynamic";
import { KeyboardShortcutsHelpButton } from "@/components/keyboard-shortcuts-help-button";
import { useBookmarkActions } from "@/hooks/use-bookmark-actions";
import { useCreateCollection } from "@/hooks/use-create-collection";
import { useCollectionsQuery, useTagsQuery } from "@/hooks/use-library-data";
import {
  useSurfaceKeyboardShortcuts,
  type KeyboardShortcutGroup,
} from "@/hooks/use-keyboard-shortcuts";
import { useOrbitGraphQuery } from "@/hooks/use-orbit-graph";
import { rankOrbitMapSearchResults } from "@/lib/orbit-map-search";
import { OrbitMapCommandSurface } from "@/components/orbit/orbit-map-command-surface";
import { OrbitMapHoverCard } from "@/components/orbit/orbit-map-hover-card";
import { OrbitMapLegendButton } from "@/components/orbit/orbit-map-legend-button";
import { OrbitMapRail } from "@/components/orbit/orbit-map-rail";
import { OrbitMapScopeMenu } from "@/components/orbit/orbit-map-scope-menu";
import { OrbitMapStatsStrip } from "@/components/orbit/orbit-map-stats-strip";
import { saveOrbitMapPositions } from "@/lib/orbit-map-layout-storage";
import type { OrbitGraphNode, OrbitGraphScope } from "@/types";

type BookmarkGraphNode = Extract<OrbitGraphNode, { kind: "bookmark" }>;
import type {
  OrbitMapCanvasHandle,
  OrbitMapFocus,
  OrbitMapSelection,
} from "@/components/orbit/orbit-map-canvas-host";

const OrbitMapCanvas = dynamic(
  () =>
    import("@/components/orbit/orbit-map-canvas-host").then((m) => m.default),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center rounded-[28px] border border-white/10 bg-background">
        <div className="flex items-center gap-2 text-sm text-white/60">
          <Loader2 className="size-4 animate-spin" />
          Charting graph…
        </div>
      </div>
    ),
  }
);

const AddTagDialog = dynamic(
  () => import("@/components/add-tag-dialog").then((m) => m.AddTagDialog),
  { ssr: false }
);

const AddToCollectionDialog = dynamic(
  () =>
    import("@/components/add-to-collection-dialog").then(
      (m) => m.AddToCollectionDialog
    ),
  { ssr: false }
);

const CreateCollectionDialog = dynamic(
  () =>
    import("@/components/create-collection-dialog").then(
      (m) => m.CreateCollectionDialog
    ),
  { ssr: false }
);

const MAP_SELECTION_KINDS: ReadonlySet<OrbitMapSelection["kind"]> = new Set([
  "tag",
  "collection",
  "bookmark",
  "core",
  "overflow",
]);

const ORBIT_MAP_SHORTCUT_GROUPS: KeyboardShortcutGroup[] = [
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

export default function OrbitMapPage() {
  const { isOrbital } = useOrbitalTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const focusBookmarkIdParam = searchParams?.get("focus") ?? null;
  const focusAnchorIdParam = searchParams?.get("anchor") ?? null;
  const assignmentBookmarkIdParam = searchParams?.get("bookmark") ?? null;
  const scopeParam = searchParams?.get("scope");
  const { data: session } = useSession();
  const actions = useBookmarkActions();
  const { createCollection, createCollectionQuick } = useCreateCollection();

  const { data: tags = [] } = useTagsQuery();
  const { data: collections = [] } = useCollectionsQuery();

  const selectIdParam = searchParams?.get("select") ?? null;
  const selectKindParam = searchParams?.get("kind") ?? null;

  const selection = useMemo<OrbitMapSelection | null>(() => {
    if (
      selectIdParam &&
      selectKindParam &&
      MAP_SELECTION_KINDS.has(selectKindParam as OrbitMapSelection["kind"])
    ) {
      return { kind: selectKindParam as OrbitMapSelection["kind"], id: selectIdParam };
    }
    if (focusBookmarkIdParam) {
      return { kind: "bookmark", id: focusBookmarkIdParam };
    }
    return null;
  }, [focusBookmarkIdParam, selectIdParam, selectKindParam]);
  const graphScope: OrbitGraphScope =
    scopeParam === "orbit" ? "orbit" : "library";
  const [hoverCard, setHoverCard] = useState<{
    node: BookmarkGraphNode;
    x: number;
    y: number;
  } | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageSize, setStageSize] = useState({ width: 960, height: 640 });
  const hoverIntentTimerRef = useRef<number | null>(null);
  const hoverClearTimerRef = useRef<number | null>(null);
  const layoutSaveTimerRef = useRef<number | null>(null);
  const pendingLayoutPositionsRef = useRef<Record<
    string,
    { x: number; y: number }
  > | null>(null);

  const handleSelectionChange = useCallback(
    (next: OrbitMapSelection | null) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      if (next) {
        params.set("select", next.id);
        params.set("kind", next.kind);
        if (next.kind === "bookmark") {
          params.set("bookmark", next.id);
        }
      } else {
        params.delete("select");
        params.delete("kind");
        params.delete("bookmark");
        params.delete("focus");
        params.delete("anchor");
      }
      const query = params.toString();
      router.replace(query ? `/orbit/map?${query}` : "/orbit/map", {
        scroll: false,
      });
    },
    [router, searchParams]
  );
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [collectionDialogOpen, setCollectionDialogOpen] = useState(false);
  const [createCollectionOpen, setCreateCollectionOpen] = useState(false);
  const [pendingBookmarkIds, setPendingBookmarkIds] = useState<string[]>([]);
  const [copyingCollectionId, setCopyingCollectionId] = useState<string | null>(
    null
  );
  const [search, setSearch] = useState("");
  const [keyboardShortcutsOpen, setKeyboardShortcutsOpen] = useState(false);
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
  } = useOrbitGraphQuery(graphScope);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setStageSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const clearHoverTimers = useCallback(() => {
    if (hoverIntentTimerRef.current !== null) {
      window.clearTimeout(hoverIntentTimerRef.current);
      hoverIntentTimerRef.current = null;
    }
    if (hoverClearTimerRef.current !== null) {
      window.clearTimeout(hoverClearTimerRef.current);
      hoverClearTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => clearHoverTimers();
  }, [clearHoverTimers]);

  useEffect(() => {
    return () => {
      if (layoutSaveTimerRef.current !== null) {
        window.clearTimeout(layoutSaveTimerRef.current);
      }
    };
  }, []);

  const handleHoverChange = useCallback(
    (
      next: OrbitMapSelection | null,
      position?: { x: number; y: number }
    ) => {
      clearHoverTimers();

      if (next?.kind === "bookmark" && position && graph) {
        const node = graph.nodes.find(
          (n) => n.kind === "bookmark" && n.id === next.id
        );
        if (node?.kind === "bookmark") {
          hoverIntentTimerRef.current = window.setTimeout(() => {
            setHoverCard({ node, x: position.x, y: position.y });
            hoverIntentTimerRef.current = null;
          }, 140);
          return;
        }
      }

      hoverClearTimerRef.current = window.setTimeout(() => {
        setHoverCard(null);
        hoverClearTimerRef.current = null;
      }, 140);
    },
    [clearHoverTimers, graph]
  );

  const dbUser = session?.dbUser;

  const activeSelection = selection;
  const activeSelectionNode = useMemo(() => {
    if (!graph || !activeSelection) return null;
    return graph.nodes.find((node) => node.id === activeSelection.id) ?? null;
  }, [activeSelection, graph]);

  const selectedBookmarkId = useMemo(() => {
    if (selection?.kind === "bookmark") return selection.id;
    return assignmentBookmarkIdParam ?? focusBookmarkIdParam;
  }, [assignmentBookmarkIdParam, focusBookmarkIdParam, selection]);

  const { data: focusedBookmarkData, isLoading: focusedBookmarkLoading } = useQuery({
    queryKey: ["bookmarks", "orbit-map-focus", selectedBookmarkId],
    queryFn: () =>
      fetchJson<{ bookmarks: BookmarkWithRelations[] }>(
        `/api/bookmarks?bookmarkId=${encodeURIComponent(selectedBookmarkId!)}&limit=1`
      ),
    enabled: Boolean(selectedBookmarkId),
    placeholderData: keepPreviousData,
  });
  const focusedBookmark = focusedBookmarkData?.bookmarks?.[0] ?? null;

  const dialogBookmarkTags = useMemo(() => {
    if (
      pendingBookmarkIds.length !== 1 ||
      !focusedBookmark ||
      focusedBookmark.id !== pendingBookmarkIds[0]
    ) {
      return [];
    }
    return focusedBookmark.tags.map((entry) => entry.tag.id);
  }, [focusedBookmark, pendingBookmarkIds]);

  const dialogBookmarkCollections = useMemo(() => {
    if (
      pendingBookmarkIds.length !== 1 ||
      !focusedBookmark ||
      focusedBookmark.id !== pendingBookmarkIds[0]
    ) {
      return [];
    }
    return focusedBookmark.collectionItems.map((entry) => entry.collection.id);
  }, [focusedBookmark, pendingBookmarkIds]);

  const focus: OrbitMapFocus | null = useMemo(() => {
    if (!focusBookmarkIdParam || !focusAnchorIdParam) return null;
    if (!graph) return null;
    const bookmarkExists = graph.nodes.some(
      (node) => node.kind === "bookmark" && node.id === focusBookmarkIdParam
    );
    const anchorExists = graph.nodes.some(
      (node) =>
        (node.kind === "tag" ||
          node.kind === "collection" ||
          node.kind === "core") &&
        node.id === focusAnchorIdParam
    );
    if (!bookmarkExists || !anchorExists) return null;
    return {
      bookmarkId: focusBookmarkIdParam,
      predictedAnchorId: focusAnchorIdParam,
    };
  }, [focusAnchorIdParam, focusBookmarkIdParam, graph]);

  const searchResults = useMemo(() => {
    return graph ? rankOrbitMapSearchResults(graph.nodes, searchDeferred) : [];
  }, [graph, searchDeferred]);

  useEffect(() => {
    if (!focusBookmarkIdParam || !graph) return;
    const bookmarkExists = graph.nodes.some(
      (node) => node.kind === "bookmark" && node.id === focusBookmarkIdParam
    );
    if (!bookmarkExists) return;
    const handle = window.setTimeout(() => {
      canvasRef.current?.focusOn({
        kind: "bookmark",
        id: focusBookmarkIdParam,
      });
    }, 60);
    return () => window.clearTimeout(handle);
  }, [focusBookmarkIdParam, graph]);

  const goToTagOnDashboard = useCallback(
    (tagId: string) => {
      router.push(`/dashboard?tag=${encodeURIComponent(tagId)}`);
    },
    [router]
  );

  const handleCreateCollectionOpen = useCallback(() => {
    setCreateCollectionOpen(true);
  }, []);

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

  const openTagDialog = useCallback(() => {
    if (selectedBookmarkId) {
      setPendingBookmarkIds([selectedBookmarkId]);
      setTagDialogOpen(true);
    }
  }, [selectedBookmarkId]);

  const openCollectionDialog = useCallback(() => {
    if (selectedBookmarkId) {
      setPendingBookmarkIds([selectedBookmarkId]);
      setCollectionDialogOpen(true);
    }
  }, [selectedBookmarkId]);

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
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not copy as collection"
        );
      } finally {
        setCopyingCollectionId(null);
      }
    },
    [handleSelectionChange, queryClient, refetch]
  );

  const stats = graph?.stats;
  const truncatedCount = stats?.truncatedBookmarks ?? 0;
  const graphIsEmpty =
    Boolean(graph) &&
    (graphScope === "orbit"
      ? stats?.looseBookmarks === 0
      : stats?.totalBookmarks === 0 ||
        graph!.nodes.filter((node) => node.kind === "bookmark").length === 0);

  const handleSyncComplete = useCallback(() => {
    void invalidateLibraryQueries(queryClient);
    void refetch();
  }, [queryClient, refetch]);

  const handleLayoutUpdated = useCallback(
    (positions: Record<string, { x: number; y: number }>) => {
      pendingLayoutPositionsRef.current = positions;
      if (layoutSaveTimerRef.current !== null) return;

      layoutSaveTimerRef.current = window.setTimeout(() => {
        layoutSaveTimerRef.current = null;
        if (pendingLayoutPositionsRef.current) {
          saveOrbitMapPositions(pendingLayoutPositionsRef.current, graphScope);
          pendingLayoutPositionsRef.current = null;
        }
      }, 500);
    },
    [graphScope]
  );

  const handleScopeChange = useCallback(
    (next: OrbitGraphScope) => {
      clearHoverTimers();
      setHoverCard(null);

      const params = new URLSearchParams(searchParams?.toString() ?? "");
      if (next === "orbit") {
        params.set("scope", "orbit");
      } else {
        params.delete("scope");
      }
      params.delete("select");
      params.delete("kind");
      params.delete("bookmark");
      params.delete("focus");
      params.delete("anchor");

      const query = params.toString();
      router.replace(query ? `/orbit/map?${query}` : "/orbit/map", {
        scroll: false,
      });
    },
    [clearHoverTimers, router, searchParams]
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
      clear: () => handleSelectionChange(null),
      shortcuts: () => setKeyboardShortcutsOpen(true),
    },
  });

  return (
    <div className={orbitShellClass(isOrbital)}>
      <div className="hidden h-full min-h-0 shrink-0 overflow-hidden md:block">
        <Sidebar
          tags={tags}
          collections={collections}
          selectedTags={[]}
          onTagToggle={goToTagOnDashboard}
          onCreateCollection={handleCreateCollectionOpen}
          lastSyncAt={dbUser?.lastSyncAt ? new Date(dbUser.lastSyncAt) : null}
          onSyncComplete={handleSyncComplete}
        />
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <PageHeader
          title={
            <span className="flex items-center gap-2">
              <OrbitLogoMark className="size-5" />
              Graph
            </span>
          }
          description={headerDescription}
          leading={
            <div className="md:hidden">
              <MobileSidebar
                tags={tags}
                collections={collections}
                selectedTags={[]}
                onTagToggle={goToTagOnDashboard}
                onCreateCollection={handleCreateCollectionOpen}
                lastSyncAt={
                  dbUser?.lastSyncAt ? new Date(dbUser.lastSyncAt) : null
                }
                onSyncComplete={handleSyncComplete}
              />
            </div>
          }
          actions={
            <div className="flex items-center gap-2">
              <KeyboardShortcutsHelpButton
                open={keyboardShortcutsOpen}
                onOpenChange={setKeyboardShortcutsOpen}
                groups={ORBIT_MAP_SHORTCUT_GROUPS}
                description="Orbit graph search, view, and assignment shortcuts."
              />
              <OrbitMapLegendButton />
              <OrbitMapScopeMenu
                graphScope={graphScope}
                isLoading={isLoading}
                onScopeChange={handleScopeChange}
              />
              <Link
                href="/orbit"
                aria-label="Back to Orbit queue"
                className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-transparent px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
              >
                <ArrowLeft className="size-4" />
                <span className="hidden sm:inline">Orbit queue</span>
              </Link>
              {dbUser ? <UserNavDynamic user={dbUser} /> : null}
            </div>
          }
        />

        <div
          className={cn(
            "flex min-h-0 min-w-0 flex-1 gap-3",
            appContentInsetClassName
          )}
        >
          <div
            ref={stageRef}
            className={cn(
              "orbit-map-stage relative flex min-w-0 flex-1 overflow-hidden",
              isOrbital
                ? "rounded-sm border border-hairline-soft bg-background dark:bg-black"
                : "rounded-sm border border-white/[0.055] bg-background dark:bg-black"
            )}
          >
            {isLoading ? (
              <div
                className={cn(
                  "flex h-full w-full items-center justify-center",
                  isOrbital ? "bg-background dark:bg-black" : "bg-background dark:bg-black"
                )}
              >
                <div className="flex items-center gap-2 text-sm text-white/60">
                  <Loader2 className="size-4 animate-spin" />
                  Charting graph…
                </div>
              </div>
            ) : isError ? (
              <div
                className={cn(
                  "flex h-full w-full items-center justify-center p-6",
                  isOrbital ? "bg-background dark:bg-black" : "bg-background dark:bg-black"
                )}
              >
                <ErrorState
                  layout="stage"
                  title="Graph could not be loaded"
                  description={
                    error instanceof Error ? error.message : "Please try again."
                  }
                  action={
                    <RetryButton context="stage" onClick={() => refetch()} className="mt-0" />
                  }
                />
              </div>
            ) : graphIsEmpty ? (
              <div
                className={cn(
                  "flex h-full w-full flex-col items-center justify-center p-8",
                  isOrbital ? "bg-background dark:bg-black" : "bg-background dark:bg-black"
                )}
              >
                <EmptyState
                  layout="stage"
                  title="Nothing to chart yet"
                  description={
                    graphScope === "orbit"
                      ? "Your Orbit queue is clear. Sync new bookmarks or switch to the full library map."
                      : "Sync bookmarks from X, then return here to explore how tags and collections connect."
                  }
                  action={
                    <Link
                      href="/orbit"
                      className={cn(
                        buttonVariants({ size: "sm", variant: "outline" })
                      )}
                    >
                      Open Orbit queue
                    </Link>
                  }
                />
              </div>
            ) : graph ? (
              <OrbitMapCanvas
                ref={canvasRef}
                data={graph}
                selection={selection}
                onSelectionChange={handleSelectionChange}
                onHoverChange={handleHoverChange}
                onOpenBookmark={handleOpenBookmark}
                onLayoutUpdated={handleLayoutUpdated}
                layoutScope={graphScope}
                focus={focus}
                className="h-full w-full"
                filterControlsClassName="left-4 top-[4.5rem]"
                zoomControlsClassName="bottom-[calc(30dvh+1.25rem)] right-4 lg:bottom-4"
              />
            ) : null}

            {hoverCard ? (
              <OrbitMapHoverCard
                node={hoverCard.node}
                x={hoverCard.x}
                y={hoverCard.y}
                containerWidth={stageSize.width}
                containerHeight={stageSize.height}
              />
            ) : null}

            <OrbitMapCommandSurface
              isFetching={isFetching}
              hasGraph={Boolean(graph)}
              search={search}
              searchQuery={searchDeferred}
              searchResults={searchResults}
              searchInputRef={searchInputRef}
              onSearchChange={setSearch}
              onResultSelect={(identity) => {
                handleSelectionChange(identity);
                canvasRef.current?.focusOn(identity);
              }}
            />

            {stats && (
              <OrbitMapStatsStrip
                stats={stats}
                truncatedCount={truncatedCount}
              />
            )}

            {graph && (
              <>
                <div className="pointer-events-none absolute inset-x-3 bottom-3 z-30 lg:hidden">
                  <OrbitMapRail
                    data={graph}
                    selection={selection}
                    selectedBookmarkId={selectedBookmarkId}
                    focusedBookmark={focusedBookmark}
                    focusedBookmarkLoading={focusedBookmarkLoading}
                    onAssign={handleAssign}
                    onAddTag={openTagDialog}
                    onAddToCollection={openCollectionDialog}
                    onCopyAsCollection={handleCopyAsCollection}
                    onOpenBookmark={handleOpenBookmark}
                    onClearSelection={() => handleSelectionChange(null)}
                    copyingCollectionId={copyingCollectionId}
                    variant="overlay"
                    className="max-h-[30dvh] w-full"
                  />
                </div>
              </>
            )}
          </div>

          {graph && (
            <OrbitMapRail
              data={graph}
              selection={selection}
              selectedBookmarkId={selectedBookmarkId}
              focusedBookmark={focusedBookmark}
              focusedBookmarkLoading={focusedBookmarkLoading}
              onAssign={handleAssign}
              onAddTag={openTagDialog}
              onAddToCollection={openCollectionDialog}
              onCopyAsCollection={handleCopyAsCollection}
              onOpenBookmark={handleOpenBookmark}
              onClearSelection={() => handleSelectionChange(null)}
              copyingCollectionId={copyingCollectionId}
              variant="rail"
              className="hidden h-full overflow-y-auto lg:flex lg:w-[300px] xl:w-[320px]"
            />
          )}
        </div>
      </div>

      <AddTagDialog
        open={tagDialogOpen}
        onOpenChange={(open) => {
          setTagDialogOpen(open);
          if (!open) {
            setPendingBookmarkIds([]);
            void refetch();
          }
        }}
        bookmarkIds={pendingBookmarkIds}
        existingTags={tags}
        onAddTag={actions.handleAddTag}
        onRemoveTag={actions.handleRemoveTag}
        bookmarkTags={dialogBookmarkTags}
      />

      <AddToCollectionDialog
        open={collectionDialogOpen}
        onOpenChange={(open) => {
          setCollectionDialogOpen(open);
          if (!open) {
            setPendingBookmarkIds([]);
            void refetch();
          }
        }}
        bookmarkIds={pendingBookmarkIds}
        collections={collections}
        bookmarkCollections={dialogBookmarkCollections}
        onAddToCollection={actions.handleAddToCollection}
        onCreateCollection={createCollectionQuick}
      />

      <CreateCollectionDialog
        open={createCollectionOpen}
        onOpenChange={setCreateCollectionOpen}
        onCreateCollection={createCollection}
      />
    </div>
  );
}
