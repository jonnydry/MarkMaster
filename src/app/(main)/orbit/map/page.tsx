"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Folder,
  Loader2,
  Orbit as OrbitIcon,
  Search,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { copyCollectionAsUserCollection } from "@/lib/collection-copy";
import { Sidebar } from "@/components/sidebar-dynamic";
import { MobileSidebar } from "@/components/mobile-sidebar";
import { PageHeader } from "@/components/page-header";
import { UserNavDynamic } from "@/components/user-nav-dynamic";
import { useBookmarkActions } from "@/hooks/use-bookmark-actions";
import { useCreateCollection } from "@/hooks/use-create-collection";
import { useCollectionsQuery, useTagsQuery } from "@/hooks/use-library-data";
import { useOrbitGraphQuery } from "@/hooks/use-orbit-graph";
import { OrbitMapRail } from "@/components/orbit/orbit-map-rail";
import type {
  OrbitMapCanvasHandle,
  OrbitMapFocus,
  OrbitMapSelection,
} from "@/components/orbit/orbit-map-canvas";

const OrbitMapCanvas = dynamic(
  () =>
    import("@/components/orbit/orbit-map-canvas").then((m) => m.OrbitMapCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center rounded-[28px] border border-white/10 bg-[#0b0f1a]">
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

export default function OrbitMapPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const focusBookmarkIdParam = searchParams?.get("focus") ?? null;
  const focusAnchorIdParam = searchParams?.get("anchor") ?? null;
  const assignmentBookmarkIdParam = searchParams?.get("bookmark") ?? null;
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
  const [hoverSelection, setHoverSelection] =
    useState<OrbitMapSelection | null>(null);

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
  const searchDeferred = useDeferredValue(search.trim().toLowerCase());
  const canvasRef = useRef<OrbitMapCanvasHandle | null>(null);

  const {
    data: graph,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useOrbitGraphQuery();

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

  return (
    <div className="app-shell-bg app-viewport flex overflow-hidden">
      <div className="hidden h-full min-h-0 shrink-0 overflow-hidden md:block">
        <Sidebar
          tags={tags}
          collections={collections}
          selectedTags={[]}
          onTagToggle={goToTagOnDashboard}
          onCreateCollection={handleCreateCollectionOpen}
          lastSyncAt={dbUser?.lastSyncAt ? new Date(dbUser.lastSyncAt) : null}
          onSyncComplete={() => refetch()}
        />
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <PageHeader
          title={
            <span className="flex items-center gap-2">
              <OrbitIcon className="size-5 text-primary" />
              Graph
            </span>
          }
          description={
            stats
              ? `${stats.totalBookmarks.toLocaleString()} bookmarks · ${stats.tagCount} tags · ${
                  stats.userCollectionCount + stats.xFolderCount
                } collections${
                  truncatedCount > 0
                    ? ` · ${truncatedCount.toLocaleString()} hidden`
                    : ""
                }`
              : "Visualise how your library connects."
          }
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
                onSyncComplete={() => refetch()}
              />
            </div>
          }
          actions={
            <div className="flex items-center gap-2">
              <Link
                href="/orbit"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-transparent px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
              >
                <ArrowLeft className="size-4" />
                Orbit queue
              </Link>
              {dbUser ? <UserNavDynamic user={dbUser} /> : null}
            </div>
          }
        />

        <div className="flex min-h-0 min-w-0 flex-1 px-3 pb-3 pt-3 sm:px-5 sm:pb-5">
          <div className="orbit-map-stage relative flex min-w-0 flex-1 overflow-hidden rounded-[26px] border border-white/[0.055] bg-[#070b13]">
            {isLoading ? (
              <div className="flex h-full w-full items-center justify-center bg-[#0b0f1a]">
                <div className="flex items-center gap-2 text-sm text-white/60">
                  <Loader2 className="size-4 animate-spin" />
                  Charting graph…
                </div>
              </div>
            ) : isError ? (
              <div className="flex h-full w-full items-center justify-center bg-[#0b0f1a] p-6 text-center">
                <div className="max-w-md space-y-3">
                  <p className="text-lg font-medium text-white">
                    Graph could not be loaded
                  </p>
                  <p className="text-sm text-white/65">
                    {error instanceof Error ? error.message : "Please try again."}
                  </p>
                  <Button onClick={() => refetch()} size="sm">
                    Retry
                  </Button>
                </div>
              </div>
            ) : graph ? (
              <OrbitMapCanvas
                ref={canvasRef}
                data={graph}
                selection={selection}
                onSelectionChange={handleSelectionChange}
                onHoverChange={setHoverSelection}
                onOpenBookmark={handleOpenBookmark}
                focus={focus}
                className="h-full w-full"
                filterControlsClassName="top-[4.65rem] lg:top-[4.65rem]"
                zoomControlsClassName="bottom-[12.5rem] right-3 sm:bottom-[11rem] lg:bottom-4 lg:right-4"
              />
            ) : null}

            <div className="pointer-events-none absolute inset-x-3 top-3 z-30 lg:inset-x-auto lg:left-4 lg:w-[min(520px,calc(100%-404px))] xl:w-[min(560px,calc(100%-420px))]">
              <div className="pointer-events-auto relative rounded-full border border-white/[0.055] bg-white/[0.035] px-3 py-2 shadow-none backdrop-blur-xl">
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                    <Search className="size-4 text-white/40" />
                  </div>
                  <input
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
                  <div className="absolute left-0 right-0 top-[calc(100%+0.375rem)] z-40 max-h-64 overflow-auto rounded-2xl border border-white/[0.08] bg-[#07111d]/72 shadow-none backdrop-blur-xl">
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
                  <div className="absolute left-0 right-0 top-[calc(100%+0.375rem)] z-40 rounded-2xl border border-white/[0.08] bg-[#07111d]/72 p-3 text-sm text-white/50 shadow-none backdrop-blur-xl">
                    No results for “{searchDeferred}”
                  </div>
                )}
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
                    focusedBookmark={null}
                    focusedBookmarkLoading={false}
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
                    focusedBookmark={null}
                    focusedBookmarkLoading={false}
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
        bookmarkTags={[]}
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
        bookmarkCollections={[]}
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
