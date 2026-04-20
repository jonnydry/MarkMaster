"use client";

import {
  useCallback,
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
  Loader2,
  Orbit as OrbitIcon,
  Rocket,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sidebar } from "@/components/sidebar-dynamic";
import { MobileSidebar } from "@/components/mobile-sidebar";
import { PageHeader } from "@/components/page-header";
import { UserNavDynamic } from "@/components/user-nav-dynamic";
import { useBookmarkActions } from "@/hooks/use-bookmark-actions";
import { useCreateCollection } from "@/hooks/use-create-collection";
import { useCollectionsQuery, useTagsQuery } from "@/hooks/use-library-data";
import { useOrbitGraphQuery } from "@/hooks/use-orbit-graph";
import { cn } from "@/lib/utils";
import { OrbitMapRail } from "@/components/orbit/orbit-map-rail";
import {
  OrbitMapToolbar,
  type OrbitMapModifier,
} from "@/components/orbit/orbit-map-toolbar";
import type {
  OrbitMapCanvasHandle,
  OrbitMapFocus,
  OrbitMapPreset,
  OrbitMapSelection,
} from "@/components/orbit/orbit-map-canvas";
import type { DbUser } from "@/lib/auth";

const OrbitMapCanvas = dynamic(
  () =>
    import("@/components/orbit/orbit-map-canvas").then((m) => m.OrbitMapCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center rounded-[28px] border border-white/10 bg-[#070b1a]">
        <div className="flex items-center gap-2 text-sm text-white/60">
          <Loader2 className="size-4 animate-spin" />
          Charting orbit…
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

export default function OrbitMapPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusBookmarkIdParam = searchParams?.get("focus") ?? null;
  const focusAnchorIdParam = searchParams?.get("anchor") ?? null;
  const { data: session } = useSession() as {
    data: { dbUser?: DbUser } | null;
  };
  const actions = useBookmarkActions();
  const { createCollection, createCollectionQuick } = useCreateCollection();

  const { data: tags = [] } = useTagsQuery();
  const { data: collections = [] } = useCollectionsQuery();

  const [preset, setPreset] = useState<OrbitMapPreset>("orbit");
  const [modifiers, setModifiers] = useState<OrbitMapModifier[]>(["pulse"]);
  const [selection, setSelection] = useState<OrbitMapSelection | null>(
    focusBookmarkIdParam
      ? { kind: "bookmark", id: focusBookmarkIdParam }
      : null
  );
  const [hoverSelection, setHoverSelection] =
    useState<OrbitMapSelection | null>(null);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [collectionDialogOpen, setCollectionDialogOpen] = useState(false);
  const [createCollectionOpen, setCreateCollectionOpen] = useState(false);
  const [pendingBookmarkIds, setPendingBookmarkIds] = useState<string[]>([]);
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
    if (!selection || selection.kind !== "bookmark") return null;
    return selection.id;
  }, [selection]);

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

  useEffect(() => {
    if (!focus || !graph) return;
    // Give the canvas a tick to receive fresh graph data before centering.
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

  const truncatedCount = graph?.stats.truncatedBookmarks ?? 0;
  const totalBookmarks = graph?.stats.totalBookmarks ?? 0;
  const nodeCap = graph?.nodeCap ?? 0;

  return (
    <div className="app-shell-bg flex h-screen max-w-[100vw] overflow-x-hidden">
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
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-thin">
          <PageHeader
            sticky
            title={
              <span className="flex items-center gap-2">
                <OrbitIcon className="size-5 text-primary" />
                Orbit Map
              </span>
            }
            description="A living constellation of your tags, collections, X folders, and every bookmark still looking for a home."
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

          <div className="flex flex-col gap-4 px-4 pb-4 pt-4 sm:px-5">
            <section
              className={cn(
                "relative overflow-hidden rounded-[28px] border border-primary/15 px-5 py-5 shadow-xl sm:px-6 sm:py-6",
                "bg-[radial-gradient(120%_120%_at_0%_0%,rgba(59,130,246,0.22),transparent_58%),radial-gradient(110%_110%_at_100%_0%,rgba(6,182,212,0.16),transparent_54%),linear-gradient(180deg,rgba(10,15,29,0.98),rgba(15,23,42,0.92))]"
              )}
            >
              <div
                className="absolute inset-y-0 right-0 w-48 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.12),transparent_65%)]"
                aria-hidden
              />
              <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-2xl">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/6 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-white/70">
                    <Rocket className="size-3.5" />
                    Orbit Map
                  </div>
                  <h2 className="mt-4 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                    See the library as a living constellation.
                  </h2>
                  <p className="mt-2 text-sm text-white/72 sm:text-base">
                    Tags, collections, and X folders are stable bodies. Loose
                    bookmarks drift on the outer rings until you pull them
                    inward with a single gesture.
                  </p>
                </div>

                {graph && (
                  <div className="grid grid-cols-3 gap-2 text-center text-white/80 sm:gap-3">
                    <HeroMetric
                      label="Bookmarks"
                      value={graph.stats.totalBookmarks}
                    />
                    <HeroMetric label="Loose" value={graph.stats.looseBookmarks} />
                    <HeroMetric
                      label="Clusters"
                      value={
                        graph.stats.tagCount +
                        graph.stats.userCollectionCount +
                        graph.stats.xFolderCount
                      }
                    />
                  </div>
                )}
              </div>
            </section>

            <div className="flex flex-col gap-4 lg:flex-row">
              <div className="flex min-h-[540px] flex-1 flex-col gap-3 lg:min-h-[640px]">
                {graph && (
                  <OrbitMapToolbar
                    preset={preset}
                    onPresetChange={setPreset}
                    modifiers={modifiers}
                    onModifiersChange={setModifiers}
                    truncatedCount={truncatedCount}
                    totalBookmarks={totalBookmarks}
                    nodeCap={nodeCap}
                  />
                )}

                <div className="relative flex-1 overflow-hidden rounded-[28px]">
                  {isLoading ? (
                    <div className="flex h-full min-h-[520px] items-center justify-center rounded-[28px] border border-white/10 bg-[#070b1a]">
                      <div className="flex items-center gap-2 text-sm text-white/60">
                        <Loader2 className="size-4 animate-spin" />
                        Charting orbit…
                      </div>
                    </div>
                  ) : isError ? (
                    <div className="flex h-full min-h-[520px] items-center justify-center rounded-[28px] border border-white/10 bg-[#070b1a] p-6 text-center">
                      <div className="max-w-md space-y-3">
                        <p className="text-lg font-medium text-white">
                          Orbit map could not be loaded
                        </p>
                        <p className="text-sm text-white/65">
                          {error instanceof Error
                            ? error.message
                            : "Please try again."}
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
                      preset={preset}
                      selection={selection}
                      onSelectionChange={setSelection}
                      onHoverChange={setHoverSelection}
                      onOpenBookmark={handleOpenBookmark}
                      focus={focus}
                      className="h-full min-h-[520px]"
                    />
                  ) : null}

                  {isFetching && !isLoading && (
                    <div className="pointer-events-none absolute right-4 top-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/50 px-3 py-1 text-xs text-white/70 backdrop-blur-sm">
                      <Loader2 className="size-3.5 animate-spin" />
                      Refreshing
                    </div>
                  )}
                </div>
              </div>

              {graph && (
                <OrbitMapRail
                  data={graph}
                  selection={selection}
                  hoverSelection={hoverSelection}
                  focusedBookmark={null}
                  focusedBookmarkLoading={false}
                  onAssign={handleAssign}
                  onAddTag={openTagDialog}
                  onAddToCollection={openCollectionDialog}
                  onOpenBookmark={handleOpenBookmark}
                  onClearSelection={() => setSelection(null)}
                />
              )}
            </div>
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

function HeroMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/12 bg-white/6 px-3 py-2 backdrop-blur-sm">
      <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-white/55">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tracking-tight text-white">
        {value.toLocaleString()}
      </p>
    </div>
  );
}
