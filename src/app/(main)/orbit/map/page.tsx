"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  ArrowLeft,
  Folder,
  Loader2,
  Orbit as OrbitIcon,
  Search,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
      }
      // Preserve focus/anchor params; remove select when clearing.
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
    if (!focus || !graph) return;
    const handle = window.setTimeout(() => {
      canvasRef.current?.focusOn({
        kind: "bookmark",
        id: focus.bookmarkId,
      });
    }, 60);
    return () => window.clearTimeout(handle);
  }, [focus, graph]);

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

  const stats = graph?.stats;
  const truncatedCount = stats?.truncatedBookmarks ?? 0;

  return (
    <div className="app-shell-bg flex h-screen overflow-x-hidden">
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

        <div className="px-4 pt-2 sm:px-5">
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
              <Search className="size-4 text-white/40" />
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find tags, collections, or bookmarks…"
              className="h-10 w-full rounded-xl border border-white/10 bg-white/5 pl-9 pr-3 text-sm text-white placeholder:text-white/40 outline-none transition-colors focus:border-white/20 focus:bg-white/[0.07]"
            />
            {searchDeferred && searchResults.length > 0 && (
              <div className="absolute z-20 mt-1.5 max-h-64 w-full overflow-auto rounded-xl border border-white/10 bg-[#0b0f1a] shadow-xl">
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
                                    : "bg-amber-300"
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
              <div className="absolute z-20 mt-1.5 w-full rounded-xl border border-white/10 bg-[#0b0f1a] p-3 text-sm text-white/50 shadow-xl">
                No results for “{searchDeferred}”
              </div>
            )}
          </div>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 px-4 pb-4 pt-2 sm:px-5 lg:flex-row">
          <div className="relative flex min-h-[480px] min-w-0 flex-1 overflow-hidden rounded-[28px] lg:min-h-0">
            {isLoading ? (
              <div className="flex h-full w-full items-center justify-center rounded-[28px] border border-white/10 bg-[#0b0f1a]">
                <div className="flex items-center gap-2 text-sm text-white/60">
                  <Loader2 className="size-4 animate-spin" />
                  Charting graph…
                </div>
              </div>
            ) : isError ? (
              <div className="flex h-full w-full items-center justify-center rounded-[28px] border border-white/10 bg-[#0b0f1a] p-6 text-center">
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
              />
            ) : null}

            {isFetching && !isLoading && (
              <div className="pointer-events-none absolute right-4 top-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/50 px-3 py-1 text-xs text-white/70 backdrop-blur-sm">
                <Loader2 className="size-3.5 animate-spin" />
                Refreshing
              </div>
            )}
          </div>

          {graph && (
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
              onOpenBookmark={handleOpenBookmark}
              onClearSelection={() => handleSelectionChange(null)}
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
