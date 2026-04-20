"use client";

import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ElementType,
} from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import {
  AlignJustify,
  ChevronLeft,
  ChevronRight,
  Grid3x3,
  LayoutList,
  Loader2,
  Map as MapIcon,
  Orbit as OrbitIcon,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { SearchBar } from "@/components/search-bar";
import { Sidebar } from "@/components/sidebar-dynamic";
import { MobileSidebar } from "@/components/mobile-sidebar";
import { PageHeader } from "@/components/page-header";
import { UserNavDynamic } from "@/components/user-nav-dynamic";
import { OrbitTriageCard } from "@/components/orbit/orbit-triage-card";
import { OrbitFocusStrip } from "@/components/orbit/orbit-focus-strip";
import { OrbitMapDrawer } from "@/components/orbit/orbit-map-drawer";
import { useBookmarkActions } from "@/hooks/use-bookmark-actions";
import { useCreateCollection } from "@/hooks/use-create-collection";
import { useCollectionsQuery, useTagsQuery } from "@/hooks/use-library-data";
import { useOrbitGraphQuery } from "@/hooks/use-orbit-graph";
import { useOrbitScan } from "@/hooks/use-orbit-scan";
import { appChromeFrostedClassName } from "@/lib/app-chrome";
import { fetchJson } from "@/lib/fetch-json";
import { ORBIT_GROK_MAX_BOOKMARKS_PER_SCAN } from "@/lib/orbit-grok";
import { invalidateLibraryQueries } from "@/lib/query-invalidation";
import { getStaggerClass } from "@/lib/stagger";
import { cn } from "@/lib/utils";
import type { DbUser } from "@/lib/auth";
import type {
  BookmarkWithRelations,
  OrbitApplyResult,
  ViewMode,
} from "@/types";

type OrbitView = "recent" | "all";

type BookmarkResponse = {
  bookmarks: BookmarkWithRelations[];
  total: number;
  totalPages: number;
};

const RECENT_PAGE_SIZE = 12;
const ALL_PAGE_SIZE = 20;
const EMPTY_BOOKMARKS: BookmarkWithRelations[] = [];
const VIEW_MODE_OPTIONS: Array<{
  value: ViewMode;
  label: string;
  icon: ElementType;
}> = [
  { value: "feed", label: "Feed", icon: LayoutList },
  { value: "compact", label: "Compact", icon: AlignJustify },
  { value: "grid", label: "Grid", icon: Grid3x3 },
];

const MONO_STYLE: React.CSSProperties = {
  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
};

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

function getSharedTagIds(bookmarks: BookmarkWithRelations[]) {
  if (bookmarks.length === 0) return [];

  const [first, ...rest] = bookmarks;
  const shared = new Set(first.tags.map(({ tag }) => tag.id));

  for (const bookmark of rest) {
    const bookmarkTagIds = new Set(bookmark.tags.map(({ tag }) => tag.id));
    for (const tagId of Array.from(shared)) {
      if (!bookmarkTagIds.has(tagId)) {
        shared.delete(tagId);
      }
    }
  }

  return Array.from(shared);
}

function getSharedCollectionIds(bookmarks: BookmarkWithRelations[]) {
  if (bookmarks.length === 0) return [];

  const [first, ...rest] = bookmarks;
  const shared = new Set(
    first.collectionItems.map(({ collection }) => collection.id)
  );

  for (const bookmark of rest) {
    const bookmarkCollectionIds = new Set(
      bookmark.collectionItems.map(({ collection }) => collection.id)
    );
    for (const collectionId of Array.from(shared)) {
      if (!bookmarkCollectionIds.has(collectionId)) {
        shared.delete(collectionId);
      }
    }
  }

  return Array.from(shared);
}

function formatAppliedToast(applied: OrbitApplyResult): string {
  const parts: string[] = [];
  if (applied.tagAssignments > 0) {
    parts.push(
      `${applied.tagAssignments} tag assignment${
        applied.tagAssignments === 1 ? "" : "s"
      }`
    );
  }
  if (applied.collectionAssignments > 0) {
    parts.push(
      `${applied.collectionAssignments} collection placement${
        applied.collectionAssignments === 1 ? "" : "s"
      }`
    );
  }
  if (applied.createdCollections > 0) {
    parts.push(
      `${applied.createdCollections} new collection${
        applied.createdCollections === 1 ? "" : "s"
      }`
    );
  }
  if (parts.length === 0) parts.push("no changes needed");
  return parts.join(" • ");
}

export default function OrbitPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session } = useSession() as {
    data: { dbUser?: DbUser } | null;
  };
  const actions = useBookmarkActions();
  const { createCollection, createCollectionQuick } = useCreateCollection();
  const scan = useOrbitScan();

  const [orbitView, setOrbitView] = useState<OrbitView>("recent");
  const [viewMode, setViewMode] = useState<ViewMode>("feed");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [page, setPage] = useState(1);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [collectionDialogOpen, setCollectionDialogOpen] = useState(false);
  const [createCollectionOpen, setCreateCollectionOpen] = useState(false);
  const [tagTargetIds, setTagTargetIds] = useState<string[]>([]);
  const [collectionTargetIds, setCollectionTargetIds] = useState<string[]>([]);
  const [activeBookmarkId, setActiveBookmarkId] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const pageHeaderWrapperRef = useRef<HTMLDivElement>(null);
  const [pageHeaderHeight, setPageHeaderHeight] = useState(0);

  useEffect(() => {
    const node = pageHeaderWrapperRef.current;
    if (!node) return;
    const measure = () => {
      setPageHeaderHeight(node.getBoundingClientRect().height);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const { data: tags = [] } = useTagsQuery();
  const { data: collections = [] } = useCollectionsQuery();

  const pageSize = orbitView === "recent" ? RECENT_PAGE_SIZE : ALL_PAGE_SIZE;
  const queryString = useMemo(() => {
    const params = new URLSearchParams({
      page: orbitView === "recent" ? "1" : page.toString(),
      limit: pageSize.toString(),
      sortField: "bookmarkedAt",
      sortDirection: "desc",
      unaffiliated: "true",
    });

    if (deferredSearch) {
      params.set("search", deferredSearch);
    }

    return params.toString();
  }, [deferredSearch, orbitView, page, pageSize]);

  const {
    data: orbitData,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<BookmarkResponse>({
    queryKey: ["bookmarks", "orbit", queryString],
    queryFn: () => fetchJson(`/api/bookmarks?${queryString}`),
    placeholderData: keepPreviousData,
  });

  const graphQuery = useOrbitGraphQuery();

  const bookmarks = orbitData?.bookmarks ?? EMPTY_BOOKMARKS;
  const total = orbitData?.total ?? 0;
  const totalPages =
    orbitView === "all" ? Math.max(orbitData?.totalPages ?? 1, 1) : 1;
  const bookmarkById = useMemo(
    () => new Map(bookmarks.map((bookmark) => [bookmark.id, bookmark])),
    [bookmarks]
  );
  const aboveFoldMediaBookmarkId = useMemo(() => {
    const first = bookmarks.find((bookmark) => {
      const media = bookmark.media?.[0];
      return Boolean(media?.url || media?.preview_image_url);
    });
    return first?.id ?? null;
  }, [bookmarks]);

  const visibleBookmarkIds = useMemo(
    () => bookmarks.map((b) => b.id),
    [bookmarks]
  );
  const scanTargetCount = Math.min(
    visibleBookmarkIds.length,
    ORBIT_GROK_MAX_BOOKMARKS_PER_SCAN
  );
  const scanTargetIds = useMemo(
    () => visibleBookmarkIds.slice(0, ORBIT_GROK_MAX_BOOKMARKS_PER_SCAN),
    [visibleBookmarkIds]
  );

  const resolvedActiveBookmarkId =
    activeBookmarkId && bookmarkById.has(activeBookmarkId)
      ? activeBookmarkId
      : bookmarks[0]?.id ?? null;
  const focusedBookmark = resolvedActiveBookmarkId
    ? bookmarkById.get(resolvedActiveBookmarkId) ?? null
    : null;
  const focusedDecision = resolvedActiveBookmarkId
    ? scan.getDecision(resolvedActiveBookmarkId)
    : null;

  const tagDialogBookmarks = useMemo(
    () =>
      tagTargetIds.flatMap((id) => {
        const bookmark = bookmarkById.get(id);
        return bookmark ? [bookmark] : [];
      }),
    [bookmarkById, tagTargetIds]
  );
  const collectionDialogBookmarks = useMemo(
    () =>
      collectionTargetIds.flatMap((id) => {
        const bookmark = bookmarkById.get(id);
        return bookmark ? [bookmark] : [];
      }),
    [bookmarkById, collectionTargetIds]
  );

  const dbUser = session?.dbUser;
  const isSearchPending = search.trim() !== deferredSearch;
  const allQueueCountLabel = total.toLocaleString();

  useEffect(() => {
    if (orbitView !== "all") return;
    if (page <= totalPages) return;

    startTransition(() => {
      setPage(totalPages);
    });
  }, [orbitView, page, totalPages]);

  useEffect(() => {
    if (!scan.error) return;
    toast.error(scan.error);
  }, [scan.error]);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    startTransition(() => {
      setPage(1);
    });
  }, []);

  const handleOrbitViewChange = useCallback(
    (value: OrbitView) => {
      if (value === orbitView) return;

      startTransition(() => {
        setOrbitView(value);
        setPage(1);
      });
    },
    [orbitView]
  );

  const handlePageChange = useCallback((nextPage: number) => {
    startTransition(() => {
      setPage(nextPage);
    });
  }, []);

  const handleCreateCollectionOpen = useCallback(() => {
    setCreateCollectionOpen(true);
  }, []);

  const handleSyncComplete = useCallback(() => {
    void invalidateLibraryQueries(queryClient);
  }, [queryClient]);

  const goToTagOnDashboard = useCallback(
    (tagId: string) => {
      router.push(`/dashboard?tag=${encodeURIComponent(tagId)}`);
    },
    [router]
  );

  const handleBookmarkAddTag = useCallback((bookmarkId: string) => {
    setActiveBookmarkId(bookmarkId);
    setTagTargetIds([bookmarkId]);
    setTagDialogOpen(true);
  }, []);

  const handleBookmarkAddToCollection = useCallback((bookmarkId: string) => {
    setActiveBookmarkId(bookmarkId);
    setCollectionTargetIds([bookmarkId]);
    setCollectionDialogOpen(true);
  }, []);

  const handleScan = useCallback(async () => {
    if (scanTargetIds.length === 0) return;
    try {
      const result = await scan.scanNow(scanTargetIds);
      if (result) {
        toast.success(
          `Grok scanned ${result.plan.suggestions.length} bookmark${
            result.plan.suggestions.length === 1 ? "" : "s"
          }`
        );
      }
    } catch {
      // Error state is surfaced via scan.error effect.
    }
  }, [scan, scanTargetIds]);

  const handleApplyPrimary = useCallback(
    async (bookmarkId: string) => {
      try {
        const applied = await scan.applySuggestion(bookmarkId, "primary");
        if (applied) {
          toast.success(`Applied primary · ${formatAppliedToast(applied)}`);
        }
      } catch {
        // handled by scan.error effect
      }
    },
    [scan]
  );

  const handleApplyAlternative = useCallback(
    async (bookmarkId: string) => {
      try {
        const applied = await scan.applySuggestion(bookmarkId, "alt");
        if (applied) {
          toast.success(`Applied alternative · ${formatAppliedToast(applied)}`);
        }
      } catch {
        // handled by scan.error effect
      }
    },
    [scan]
  );

  const handleKeepInOrbit = useCallback(
    (bookmarkId: string) => {
      scan.dismiss(bookmarkId);
      toast("Keeping this bookmark in Orbit for now.");
    },
    [scan]
  );

  const handleApplyAll = useCallback(async () => {
    try {
      const applied = await scan.applyEntirePlan();
      if (applied) {
        toast.success(`Applied plan · ${formatAppliedToast(applied)}`);
      }
    } catch {
      // handled by scan.error effect
    }
  }, [scan]);

  const focusScanState: "idle" | "scanning" | "ready" | "applying" = scan.scanning
    ? "scanning"
    : scan.applyingBookmarkId || scan.applyingBatch
      ? "applying"
      : scan.plan
        ? "ready"
        : "idle";

  const planSummary = useMemo(() => {
    if (!scan.plan) return null;
    const scanned = scan.plan.plan.suggestions.length;
    const remaining = scan.plan.plan.suggestions.filter(
      (suggestion) => !scan.dismissedBookmarkIds.has(suggestion.bookmarkId)
    ).length;
    return { scanned, remaining };
  }, [scan.dismissedBookmarkIds, scan.plan]);

  const predictedAnchorAvailable = useMemo(() => {
    const graph = graphQuery.data;
    const primary = focusedDecision?.primary;
    if (!graph || !primary) return false;
    const normalized = primary.label.trim().toLowerCase();
    return graph.nodes.some((node) => {
      if (primary.kind === "collection" && node.kind === "collection") {
        return node.name.toLowerCase() === normalized;
      }
      if (primary.kind === "tag" && node.kind === "tag") {
        return node.name.toLowerCase() === normalized;
      }
      return false;
    });
  }, [focusedDecision, graphQuery.data]);

  const focusStripFocus = useMemo(() => {
    if (!focusedBookmark || !focusedDecision) return null;
    return {
      bookmark: focusedBookmark,
      decision: focusedDecision,
      predictedAnchorAvailable,
    };
  }, [focusedBookmark, focusedDecision, predictedAnchorAvailable]);

  const handleOpenMap = useCallback(() => {
    setMapOpen(true);
  }, []);

  const visibleStatusLabel = (() => {
    const visible = bookmarks.length;
    if (orbitView === "recent") {
      return `${visible} of ${allQueueCountLabel} most recent`;
    }
    return `${visible} on page ${page} · ${allQueueCountLabel} total`;
  })();

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
          onSyncComplete={handleSyncComplete}
        />
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-thin">
          <div ref={pageHeaderWrapperRef} className="sticky top-0 z-10">
            <PageHeader
              title={
                <span className="flex items-center gap-2">
                  <OrbitIcon className="size-5 text-primary" />
                  Orbit
                </span>
              }
              description="Triage the bookmarks still circling your library."
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
              actions={dbUser ? <UserNavDynamic user={dbUser} /> : null}
            />
          </div>

          <div className="space-y-4 px-4 pb-6 pt-4 sm:px-5">
            {/* Editorial header */}
            <section className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(120%_120%_at_0%_0%,rgba(59,130,246,0.18),transparent_58%),radial-gradient(110%_110%_at_100%_0%,rgba(14,165,233,0.12),transparent_54%),linear-gradient(180deg,rgba(10,15,29,0.98),rgba(15,23,42,0.9))] px-5 py-6 shadow-xl sm:px-7 sm:py-8">
              <div
                className="absolute inset-y-0 right-0 w-72 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.1),transparent_65%)]"
                aria-hidden
              />
              <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div className="min-w-0 max-w-3xl">
                  <p
                    className="text-[11px] font-medium uppercase tracking-[0.28em] text-sky-200/80"
                    style={MONO_STYLE}
                  >
                    Orbit · Default mode
                  </p>
                  <h1 className="mt-3 text-3xl font-semibold leading-[1.08] tracking-tight text-white sm:text-4xl lg:text-[2.75rem]">
                    Orbit makes the next move obvious.
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm text-white/70 sm:text-base">
                    Scan the queue and Grok surfaces a primary landing path plus
                    a single alternative for every bookmark — you stay in charge
                    of every tap.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="lg"
                    className="h-11 gap-2 bg-white text-slate-950 shadow-sm hover:bg-white/90"
                    disabled={scan.scanning || scanTargetIds.length === 0}
                    onClick={handleScan}
                  >
                    {scan.scanning ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Sparkles className="size-4" />
                    )}
                    {scan.plan
                      ? scan.scanning
                        ? "Rescanning…"
                        : "Rescan with Grok"
                      : scan.scanning
                        ? "Scanning Orbit…"
                        : `Scan ${scanTargetCount} with Grok`}
                  </Button>

                  <Link
                    href={
                      resolvedActiveBookmarkId
                        ? `/orbit/map?focus=${resolvedActiveBookmarkId}`
                        : "/orbit/map"
                    }
                    className="inline-flex h-11 items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 text-sm font-medium text-white/85 transition-colors hover:bg-white/10"
                  >
                    <MapIcon className="size-4" aria-hidden />
                    Open graph mode
                  </Link>
                </div>
              </div>
            </section>

            <OrbitFocusStrip
              scanState={focusScanState}
              planSummary={planSummary}
              focus={focusStripFocus}
              scanTargetCount={scanTargetCount}
              stickyTopOffset={pageHeaderHeight}
              onScan={handleScan}
              onRescan={handleScan}
              onApplyAll={handleApplyAll}
              onOpenMap={handleOpenMap}
            />

            <section className="mx-auto flex w-full max-w-2xl flex-col gap-3">
              <QueueHeader
                orbitView={orbitView}
                total={total}
                onChangeView={handleOrbitViewChange}
                viewMode={viewMode}
                onChangeViewMode={setViewMode}
              />

              <div
                className={cn(
                  "relative overflow-hidden rounded-2xl border border-hairline-strong shadow-xl",
                  appChromeFrostedClassName
                )}
              >
                <SearchBar
                  glass
                  value={search}
                  onChange={handleSearchChange}
                  placeholder="Search Orbit by author, text, or notes…"
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-white/55">
                <span style={MONO_STYLE}>{visibleStatusLabel}</span>
                {(isFetching || isSearchPending) && !isLoading && (
                  <span className="flex items-center gap-1">
                    <Loader2 className="size-3 animate-spin" /> Updating…
                  </span>
                )}
              </div>

              {isLoading ? (
                <QueueSkeleton />
              ) : isError ? (
                <QueueError
                  message={
                    error instanceof Error
                      ? error.message
                      : "Please try again."
                  }
                  onRetry={() => refetch()}
                />
              ) : bookmarks.length === 0 ? (
                <QueueEmptyState
                  searching={Boolean(search.trim())}
                  onClearSearch={() => handleSearchChange("")}
                  onOpenBookmarks={() => router.push("/dashboard")}
                />
              ) : (
                <div className="flex flex-col gap-2">
                  {bookmarks.map((bookmark, index) => (
                    <OrbitTriageCard
                      key={bookmark.id}
                      bookmark={bookmark}
                      viewMode={viewMode}
                      decision={scan.getDecision(bookmark.id)}
                      selected={resolvedActiveBookmarkId === bookmark.id}
                      selectionMode={false}
                      applying={scan.applyingBookmarkId === bookmark.id}
                      searchQuery={search || undefined}
                      priorityMedia={bookmark.id === aboveFoldMediaBookmarkId}
                      onSelect={setActiveBookmarkId}
                      onTagClick={goToTagOnDashboard}
                      onAddTag={handleBookmarkAddTag}
                      onAddToCollection={handleBookmarkAddToCollection}
                      onDelete={actions.handleDeleteBookmark}
                      onApplyPrimary={handleApplyPrimary}
                      onApplyAlternative={handleApplyAlternative}
                      onKeepInOrbit={handleKeepInOrbit}
                      className={getStaggerClass(index, "animate-fade-in-up")}
                    />
                  ))}
                </div>
              )}

              {orbitView === "all" &&
                totalPages > 1 &&
                bookmarks.length > 0 && (
                  <Pagination
                    page={page}
                    totalPages={totalPages}
                    onChange={handlePageChange}
                  />
                )}
            </section>

            <OrbitMapDrawer
              open={mapOpen}
              onOpenChange={setMapOpen}
              graph={graphQuery.data}
              loading={graphQuery.isLoading}
              focusedBookmarkId={resolvedActiveBookmarkId}
              primaryDecision={focusedDecision?.primary ?? null}
              onSelectBookmark={setActiveBookmarkId}
            />
          </div>
        </div>
      </div>

      <AddTagDialog
        open={tagDialogOpen}
        onOpenChange={(open) => {
          setTagDialogOpen(open);
          if (!open) {
            setTagTargetIds([]);
          }
        }}
        bookmarkIds={tagTargetIds}
        existingTags={tags}
        onAddTag={actions.handleAddTag}
        onRemoveTag={actions.handleRemoveTag}
        bookmarkTags={getSharedTagIds(tagDialogBookmarks)}
      />

      <AddToCollectionDialog
        open={collectionDialogOpen}
        onOpenChange={(open) => {
          setCollectionDialogOpen(open);
          if (!open) {
            setCollectionTargetIds([]);
          }
        }}
        bookmarkIds={collectionTargetIds}
        collections={collections}
        bookmarkCollections={getSharedCollectionIds(collectionDialogBookmarks)}
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

interface QueueHeaderProps {
  orbitView: OrbitView;
  total: number;
  viewMode: ViewMode;
  onChangeView: (view: OrbitView) => void;
  onChangeViewMode: (mode: ViewMode) => void;
}

function QueueHeader({
  orbitView,
  total,
  viewMode,
  onChangeView,
  onChangeViewMode,
}: QueueHeaderProps) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-hairline-strong p-3 shadow-sm",
        appChromeFrostedClassName
      )}
    >
      <div className="flex flex-col gap-3">
        <div>
          <p
            className="text-[10px] font-medium uppercase tracking-[0.22em] text-white/55"
            style={MONO_STYLE}
          >
            Recent pass
          </p>
          <p className="mt-1 text-sm font-semibold text-white">
            {orbitView === "recent"
              ? "Freshest bookmarks still in orbit"
              : "All unaffiliated bookmarks"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-xl border border-hairline-soft bg-surface-2 p-1 shadow-sm">
            <button
              type="button"
              aria-pressed={orbitView === "recent"}
              onClick={() => onChangeView("recent")}
              className={cn(
                "inline-flex h-8 items-center gap-2 rounded-lg px-3 text-xs font-medium transition-colors",
                orbitView === "recent"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Recent
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px]",
                  orbitView === "recent"
                    ? "bg-primary-foreground/15 text-primary-foreground/80"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {Math.min(total, RECENT_PAGE_SIZE).toLocaleString()}
              </span>
            </button>
            <button
              type="button"
              aria-pressed={orbitView === "all"}
              onClick={() => onChangeView("all")}
              className={cn(
                "inline-flex h-8 items-center gap-2 rounded-lg px-3 text-xs font-medium transition-colors",
                orbitView === "all"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              All
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px]",
                  orbitView === "all"
                    ? "bg-primary-foreground/15 text-primary-foreground/80"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {total.toLocaleString()}
              </span>
            </button>
          </div>

          <div className="ml-auto flex items-center gap-0.5 rounded-xl border border-hairline-soft bg-surface-2 p-1 shadow-sm">
            {VIEW_MODE_OPTIONS.map(({ value, label, icon: Icon }) => (
              <Button
                key={value}
                variant={viewMode === value ? "default" : "ghost"}
                size="sm"
                className={cn(
                  "h-8 px-2 text-xs",
                  viewMode === value
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
                title={`${label} view`}
                onClick={() => onChangeViewMode(value)}
              >
                <Icon className="size-3.5" />
                <span className="sr-only">{label}</span>
              </Button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function QueueSkeleton() {
  return (
    <div className="space-y-2" role="status" aria-label="Loading Orbit">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="rounded-2xl border border-hairline-soft bg-surface-1 px-4 py-4"
        >
          <div className="flex gap-3">
            <div className="h-9 w-9 shrink-0 rounded-full skeleton-shimmer" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-24 rounded skeleton-shimmer" />
              <div className="h-3 w-full rounded skeleton-shimmer" />
              <div className="h-3 w-4/5 rounded skeleton-shimmer" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function QueueError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-2xl border border-hairline-soft bg-surface-1 p-6 text-center">
      <p className="text-sm font-medium text-foreground">
        Orbit could not be loaded
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{message}</p>
      <Button size="sm" variant="outline" className="mt-3" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

function QueueEmptyState({
  searching,
  onClearSearch,
  onOpenBookmarks,
}: {
  searching: boolean;
  onClearSearch: () => void;
  onOpenBookmarks: () => void;
}) {
  return (
    <div className="rounded-2xl border border-hairline-soft bg-surface-1 p-6 text-center">
      <OrbitIcon className="mx-auto mb-3 size-8 text-muted-foreground/50" />
      <p className="text-sm font-medium text-foreground">
        {searching ? "Nothing in Orbit matches this search" : "Orbit is clear"}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {searching
          ? "Try a different search term or clear the query."
          : "Every bookmark already belongs to a tag, collection, or folder."}
      </p>
      <div className="mt-3 flex justify-center">
        <Button
          size="sm"
          variant="outline"
          onClick={searching ? onClearSearch : onOpenBookmarks}
        >
          {searching ? "Clear search" : "Open bookmarks"}
        </Button>
      </div>
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-2 pt-2">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-hairline-soft bg-surface-1 text-foreground shadow-sm transition-colors hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-30"
      >
        <ChevronLeft className="size-4" aria-hidden />
      </button>
      <span
        className="tabular-nums text-xs text-muted-foreground"
        aria-live="polite"
      >
        {page} of {totalPages}
      </span>
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="Next page"
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-hairline-soft bg-surface-1 text-foreground shadow-sm transition-colors hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-30"
      >
        <ChevronRight className="size-4" aria-hidden />
      </button>
    </div>
  );
}
