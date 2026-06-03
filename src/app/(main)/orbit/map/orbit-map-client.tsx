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
  Folder,
  Loader2,
  Search,
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
import { OrbitMapHoverCard } from "@/components/orbit/orbit-map-hover-card";
import { OrbitMapRail } from "@/components/orbit/orbit-map-rail";
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
  const [hoverSelection, setHoverSelection] =
    useState<OrbitMapSelection | null>(null);
  const [hoverCard, setHoverCard] = useState<{
    node: BookmarkGraphNode;
    x: number;
    y: number;
  } | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageSize, setStageSize] = useState({ width: 960, height: 640 });

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

  const handleHoverChange = useCallback(
    (
      next: OrbitMapSelection | null,
      position?: { x: number; y: number }
    ) => {
      setHoverSelection(next);
      if (next?.kind === "bookmark" && position && graph) {
        const node = graph.nodes.find(
          (n) => n.kind === "bookmark" && n.id === next.id
        );
        if (node?.kind === "bookmark") {
          setHoverCard({ node, x: position.x, y: position.y });
          return;
        }
      }
      setHoverCard(null);
    },
    [graph]
  );

  const dbUser = session?.dbUser;

  const activeSelection = selection ?? hoverSelection;
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
    if (!graph || !searchDeferred) return [];
    return graph.nodes.filter((node) => {
      switch (node.kind) {
        case "tag":
          return node.name.toLowerCase().includes(searchDeferred);
        case "collection":
          return node.name.toLowerCase().includes(searchDeferred);
        case "bookmark":
          return (
            node.authorUsername.toLowerCase().includes(searchDeferred) ||
            node.title.toLowerCase().includes(searchDeferred)
          );
        default:
          return false;
      }
    });
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
      saveOrbitMapPositions(positions, graphScope);
    },
    [graphScope]
  );

  const handleScopeChange = useCallback(
    (next: OrbitGraphScope) => {
      setHoverCard(null);
      setHoverSelection(null);

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
    [router, searchParams]
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
                description="Orbit graph search, scope, and assignment shortcuts."
              />
              <Link
                href="/orbit"
                className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-transparent px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
              >
                <ArrowLeft className="size-4" />
                Orbit queue
              </Link>
              {dbUser ? <UserNavDynamic user={dbUser} /> : null}
            </div>
          }
        />

        <div className={cn("flex min-h-0 min-w-0 flex-1", appContentInsetClassName)}>
          <div
            ref={stageRef}
            className={cn(
              "orbit-map-stage relative flex min-w-0 flex-1 overflow-hidden",
              isOrbital
                ? "rounded-sm border border-hairline-soft bg-background"
                : "rounded-sm border border-white/[0.055] bg-[#070b13]"
            )}
          >
            {isLoading ? (
              <div
                className={cn(
                  "flex h-full w-full items-center justify-center",
                  isOrbital ? "bg-background" : "bg-[#0b0f1a]"
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
                  isOrbital ? "bg-background" : "bg-[#0b0f1a]"
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
                  isOrbital ? "bg-background" : "bg-[#0b0f1a]"
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
                filterControlsClassName="top-[7.25rem] lg:top-[7.25rem]"
                zoomControlsClassName="bottom-[12.5rem] right-3 sm:bottom-[11rem] lg:bottom-4 lg:right-4"
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

            <div className="pointer-events-none absolute inset-x-3 top-3 z-30 lg:inset-x-auto lg:left-4 lg:w-[min(520px,calc(100%-404px))] xl:w-[min(560px,calc(100%-420px))]">
              <div className="pointer-events-auto space-y-2 rounded-2xl border border-white/[0.055] bg-white/[0.035] p-2 shadow-none backdrop-blur-xl">
                <div
                  className="flex gap-1 rounded-full bg-white/[0.04] p-0.5"
                  role="group"
                  aria-label="Graph data scope"
                >
                  {(
                    [
                      { key: "library" as const, label: "Full library" },
                      { key: "orbit" as const, label: "Orbit queue" },
                    ] as const
                  ).map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={graphScope === key}
                      onClick={() => handleScopeChange(key)}
                      disabled={isLoading}
                      className={cn(
                        "flex-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50",
                        graphScope === key
                          ? "bg-white/[0.14] text-white"
                          : "text-white/50 hover:text-white/80"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="relative rounded-full px-1">
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                    <Search className="size-4 text-white/40" />
                  </div>
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Find tags, collections, or bookmarks…"
                    disabled={!graph}
                    className="h-9 w-full rounded-full border-0 bg-transparent pl-9 pr-10 text-sm text-white outline-none placeholder:text-white/35 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  {isFetching && !isLoading && (
                    <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                      <Loader2 className="size-3.5 animate-spin text-white/55" />
                    </div>
                  )}
                </div>

                {searchDeferred && searchResults.length > 0 && (
                  <div
                    className={cn(
                      "absolute left-0 right-0 top-[calc(100%+0.375rem)] z-40 max-h-64 overflow-auto shadow-none backdrop-blur-xl",
                      isOrbital
                        ? "rounded-sm border border-hairline-soft bg-surface-1/90"
                        : "rounded-2xl border border-white/[0.08] bg-[#07111d]/72"
                    )}
                  >
                    <ul className="py-1">
                      {searchResults.slice(0, 20).map((node) => {
                        const identity: OrbitMapSelection =
                          node.kind === "core"
                            ? { kind: "core", id: node.id }
                            : node.kind === "tag"
                              ? { kind: "tag", id: node.id }
                              : node.kind === "collection"
                                ? { kind: "collection", id: node.id }
                                : { kind: "bookmark", id: node.id };
                        return (
                          <li key={node.id}>
                            <button
                              type="button"
                              onClick={() => {
                                handleSelectionChange(identity);
                                canvasRef.current?.focusOn(identity);
                                setSearch("");
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-white/80 transition-colors hover:bg-white/5 hover:text-white"
                            >
                              {node.kind === "tag" && (
                                <>
                                  <span
                                    className="inline-block size-2 rounded-full"
                                    style={{ backgroundColor: node.color }}
                                  />
                                  <span className="truncate">{node.name}</span>
                                  <span className="ml-auto text-[10px] uppercase tracking-wider text-white/40">
                                    Tag
                                  </span>
                                </>
                              )}
                              {node.kind === "collection" && (
                                <>
                                  <Folder className="size-3.5 text-sky-300" />
                                  <span className="truncate">{node.name}</span>
                                  <span className="ml-auto text-[10px] uppercase tracking-wider text-white/40">
                                    {node.variant === "x_folder"
                                      ? "X folder"
                                      : "Collection"}
                                  </span>
                                </>
                              )}
                              {node.kind === "bookmark" && (
                                <>
                                  <span
                                    className={cn(
                                      "inline-block size-1.5 rounded-full",
                                      node.affiliated
                                        ? "bg-slate-200"
                                        : "bg-sky-300"
                                    )}
                                  />
                                  <span className="truncate">
                                    @{node.authorUsername}
                                  </span>
                                  <span className="ml-auto text-[10px] uppercase tracking-wider text-white/40">
                                    Bookmark
                                  </span>
                                </>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
                {searchDeferred && searchResults.length === 0 && (
                  <div
                    className={cn(
                      "absolute left-0 right-0 top-[calc(100%+0.375rem)] z-40 p-3 text-sm text-white/50 shadow-none backdrop-blur-xl",
                      isOrbital
                        ? "rounded-sm border border-hairline-soft bg-surface-1/90"
                        : "rounded-2xl border border-white/[0.08] bg-[#07111d]/72"
                    )}
                  >
                    No results for “{searchDeferred}”
                  </div>
                )}
                </div>
              </div>
            </div>

            {stats && (
              <div className="pointer-events-none absolute bottom-5 left-5 z-20 hidden max-w-[calc(100%-6rem)] items-center gap-3 text-white/60 lg:flex">
                <MapMetric label="Loose" value={stats.looseBookmarks} />
                <span className="h-6 w-px bg-white/[0.08]" />
                <MapMetric label="Tags" value={stats.tagCount} />
                <span className="h-6 w-px bg-white/[0.08]" />
                <MapMetric
                  label="Collections"
                  value={stats.userCollectionCount + stats.xFolderCount}
                />
                {truncatedCount > 0 && (
                  <>
                    <span className="h-6 w-px bg-white/[0.08]" />
                    <MapMetric label="Hidden" value={truncatedCount} />
                  </>
                )}
              </div>
            )}

            {graph && (
              <>
                <div className="pointer-events-none absolute right-3 top-3 z-30 hidden lg:block">
                  <OrbitMapRail
                    data={graph}
                    selection={selection}
                    hoverSelection={hoverSelection}
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
                  />
                </div>

                <div className="pointer-events-none absolute inset-x-3 bottom-3 z-30 lg:hidden">
                  <OrbitMapRail
                    data={graph}
                    selection={selection}
                    hoverSelection={hoverSelection}
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
                    showLegend={false}
                  />
                </div>
              </>
            )}
          </div>
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

function MapMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-white/35">
        {label}
      </p>
      <p className="text-sm font-semibold tabular-nums text-white/75">
        {value.toLocaleString()}
      </p>
    </div>
  );
}
