"use client";

import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
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
  Folder,
  Grid3x3,
  LayoutList,
  ListChecks,
  Loader2,
  Map as MapIcon,
  Orbit as OrbitIcon,
  Sparkles,
  TagIcon,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { SearchBar } from "@/components/search-bar";
import { Sidebar } from "@/components/sidebar-dynamic";
import { MobileSidebar } from "@/components/mobile-sidebar";
import { PageHeader } from "@/components/page-header";
import { UserNavDynamic } from "@/components/user-nav-dynamic";
import { OrbitTriageCard } from "@/components/orbit/orbit-triage-card";
import { OrbitReviewDialog } from "@/components/orbit/orbit-review-dialog";
import { useBookmarkActions } from "@/hooks/use-bookmark-actions";
import { useCreateCollection } from "@/hooks/use-create-collection";
import { useCollectionsQuery, useTagsQuery } from "@/hooks/use-library-data";
import { useOrbitScan } from "@/hooks/use-orbit-scan";
import { bookmarkFeedColumnClassName } from "@/lib/bookmark-feed-layout";
import { fetchJson } from "@/lib/fetch-json";
import { ORBIT_GROK_MAX_BOOKMARKS_PER_SCAN } from "@/lib/orbit-config";
import { invalidateLibraryQueries } from "@/lib/query-invalidation";
import { getStaggerClass } from "@/lib/stagger";
import { cn } from "@/lib/utils";
import type { DbUser } from "@/lib/auth";
import type {
  BookmarkWithRelations,
  OrbitApplyResult,
  OrbitScanPlan,
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
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedBookmarkIds, setSelectedBookmarkIds] = useState<Set<string>>(
    () => new Set()
  );
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewBookmarkId, setReviewBookmarkId] = useState<string | null>(null);
  const [reviewSessionId, setReviewSessionId] = useState(0);

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
  const defaultScanTargetIds = useMemo(
    () => visibleBookmarkIds.slice(0, ORBIT_GROK_MAX_BOOKMARKS_PER_SCAN),
    [visibleBookmarkIds]
  );
  const selectedScanTargetIds = useMemo(
    () =>
      Array.from(selectedBookmarkIds)
        .filter((bookmarkId) => bookmarkById.has(bookmarkId))
        .slice(0, ORBIT_GROK_MAX_BOOKMARKS_PER_SCAN),
    [bookmarkById, selectedBookmarkIds]
  );
  const scanningSelection = selectionMode && selectedScanTargetIds.length > 0;
  const scanTargetIds = scanningSelection
    ? selectedScanTargetIds
    : defaultScanTargetIds;
  const scanTargetCount = scanTargetIds.length;
  const queueBatchCount = defaultScanTargetIds.length;
  const queueIsLoading = isLoading && !orbitData;
  const hasSearchQuery = search.trim().length > 0;
  const hasSelectionOverflow =
    selectedBookmarkIds.size > ORBIT_GROK_MAX_BOOKMARKS_PER_SCAN;
  const scanHelperText = queueIsLoading
    ? "Loading the current Orbit queue."
    : scanningSelection
      ? hasSelectionOverflow
        ? `Grok will suggest tags and destinations for the first ${scanTargetCount} selected bookmarks. Review before you apply.`
        : `Grok will suggest tags and destinations for ${scanTargetCount} selected bookmark${scanTargetCount === 1 ? "" : "s"}. Review before you apply.`
      : queueBatchCount > 0
        ? `Grok suggests tags and destinations for ${queueBatchCount} un-triaged bookmark${queueBatchCount === 1 ? "" : "s"}. Review each suggestion or apply the whole pass at once.`
        : hasSearchQuery
          ? "No bookmarks match the current Orbit filter."
          : "Orbit is clear.";
  const scanButtonLabel =
    queueIsLoading
      ? "Loading queue…"
      : scanTargetCount === 0 && !scan.scanning
      ? hasSearchQuery
        ? "No matches"
        : "Orbit is clear"
      : scan.plan
        ? scan.scanning
          ? "Refreshing…"
          : scanningSelection
            ? "Refresh selection"
            : "Refresh queue"
        : scan.scanning
          ? scanningSelection
            ? "Categorizing selection…"
            : "Categorizing queue…"
          : scanningSelection
            ? "Auto-categorize selection"
            : "Auto-categorize queue";
  const scanScopeLabel =
    queueIsLoading
      ? "Loading queue"
      : scanTargetCount === 0
      ? hasSearchQuery
        ? "No matches in current filter"
        : "No pending bookmarks"
      : `${scanTargetCount} ${scanningSelection ? "selected" : "visible"} bookmark${
          scanTargetCount === 1 ? "" : "s"
        }`;
  const showQueueTools =
    isLoading || isError || total > 0 || hasSearchQuery;

  const resolvedActiveBookmarkId =
    activeBookmarkId && bookmarkById.has(activeBookmarkId)
      ? activeBookmarkId
      : bookmarks[0]?.id ?? null;

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
        const scopeLabel = scanningSelection ? "selected" : "Orbit";
        toast.success(
          `Grok categorized ${result.plan.suggestions.length} ${scopeLabel} bookmark${
            result.plan.suggestions.length === 1 ? "" : "s"
          }`
        );
      }
    } catch {
      // Error state is surfaced via scan.error effect.
    }
  }, [scan, scanTargetIds, scanningSelection]);

  const handleReviewOpenChange = useCallback((open: boolean) => {
    setReviewOpen(open);
    if (!open) {
      setReviewBookmarkId(null);
    }
  }, []);

  const handleOpenReviewAll = useCallback(() => {
    if (!scan.plan) return;
    setReviewBookmarkId(null);
    setReviewSessionId((current) => current + 1);
    setReviewOpen(true);
  }, [scan.plan]);

  const handleOpenBookmarkReview = useCallback((bookmarkId: string) => {
    setActiveBookmarkId(bookmarkId);
    setReviewBookmarkId(bookmarkId);
    setReviewSessionId((current) => current + 1);
    setReviewOpen(true);
  }, []);

  const handleApplyReviewedPlan = useCallback(
    async (
      reviewedPlan: OrbitScanPlan,
      opts: { createCollections: boolean }
    ) => {
      try {
        const applied = await scan.applyReviewedPlan(reviewedPlan, opts);
        if (applied) {
          toast.success(`Applied review · ${formatAppliedToast(applied)}`);
        }
        return applied;
      } catch {
        // handled by scan.error effect
        return null;
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

  const toggleSelectionMode = useCallback(() => {
    setSelectionMode((prev) => {
      if (prev) {
        setSelectedBookmarkIds(new Set());
      }
      return !prev;
    });
  }, []);

  const handleSelectionChange = useCallback(
    (bookmarkId: string, selected: boolean) => {
      setSelectedBookmarkIds((prev) => {
        const next = new Set(prev);
        if (selected) {
          next.add(bookmarkId);
        } else {
          next.delete(bookmarkId);
        }
        return next;
      });
    },
    []
  );

  const handleBulkAddTag = useCallback(() => {
    if (selectedBookmarkIds.size === 0) return;
    setTagTargetIds(Array.from(selectedBookmarkIds));
    setTagDialogOpen(true);
  }, [selectedBookmarkIds]);

  const handleBulkAddToCollection = useCallback(() => {
    if (selectedBookmarkIds.size === 0) return;
    setCollectionTargetIds(Array.from(selectedBookmarkIds));
    setCollectionDialogOpen(true);
  }, [selectedBookmarkIds]);

  const handleBulkDelete = useCallback(() => {
    const ids = Array.from(selectedBookmarkIds);
    if (ids.length === 0) return;
    // Fire deletes in parallel; each shows its own toast via useBookmarkActions.
    void Promise.all(ids.map((id) => actions.handleDeleteBookmark(id)));
    setSelectedBookmarkIds(new Set());
    setSelectionMode(false);
  }, [actions, selectedBookmarkIds]);

  const visibleStatusLabel = (() => {
    const visible = bookmarks.length;
    if (hasSearchQuery) {
      return `${visible} match${visible === 1 ? "" : "es"}`;
    }
    if (orbitView === "recent") {
      return `${visible} of ${allQueueCountLabel} most recent`;
    }
    return `${visible} on page ${page} · ${allQueueCountLabel} total`;
  })();

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
          onSyncComplete={handleSyncComplete}
        />
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-thin">
          <div className="sticky top-0 z-10">
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

          <div className="space-y-4 px-4 pb-6 pt-0 sm:px-5">
            <section
              className="relative -mx-4 min-h-[390px] overflow-hidden px-4 pb-8 pt-12 sm:-mx-5 sm:px-5 sm:pt-16 lg:min-h-[448px] lg:pt-20"
              style={{
                backgroundImage:
                  "linear-gradient(180deg, rgba(15,16,18,0) 0%, rgba(15,16,18,0.1) 60%, var(--background) 100%), url('/orbit-page-field.svg')",
                backgroundPosition: "center top",
                backgroundRepeat: "no-repeat",
                backgroundSize: "cover",
              }}
            >
              <div
                className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/10"
                aria-hidden
              />
              <div
                className="pointer-events-none absolute left-0 top-1/3 h-px w-full bg-white/[0.055]"
                aria-hidden
              />
              <div
                className="pointer-events-none absolute left-[6%] top-24 hidden h-40 w-px bg-white/[0.07] lg:block"
                aria-hidden
              />
              <div
                className="pointer-events-none absolute right-[9%] top-20 hidden h-px w-64 bg-primary/20 lg:block"
                aria-hidden
              />
              <div className="relative mx-auto flex w-full max-w-[1120px] flex-col gap-8">
                <div className="flex min-h-[324px] max-w-[760px] flex-col justify-center">
                  <p
                    className="text-[11px] font-medium uppercase tracking-[0.32em] text-sky-200/90"
                    style={MONO_STYLE}
                  >
                    Orbit / Default mode
                  </p>
                  <h1 className="heading-font mt-7 max-w-[760px] text-5xl font-semibold leading-[0.95] tracking-tight text-foreground sm:text-6xl lg:text-[5.25rem]">
                    Make the next move obvious.
                  </h1>
                  <p className="mt-6 max-w-[620px] text-base leading-7 text-foreground/70 sm:text-lg">
                    Grok scans the visible queue or your selected bookmarks,
                    then you review every proposed tag and collection move
                    before apply.
                  </p>
                  <p className="mt-3 max-w-[620px] text-sm leading-6 text-muted-foreground">
                    {scanHelperText}
                  </p>

                  <div className="mt-8 flex flex-wrap items-center gap-3">
                    <Button
                      size="lg"
                      className="h-12 rounded-none border-white/80 bg-foreground px-5 text-background shadow-[0_18px_45px_-24px_rgba(59,130,246,0.75)] hover:bg-foreground/90"
                      disabled={
                        queueIsLoading ||
                        scan.scanning ||
                        scanTargetIds.length === 0
                      }
                      onClick={handleScan}
                    >
                      {queueIsLoading || scan.scanning ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Sparkles className="size-4" />
                      )}
                      {scanButtonLabel}
                    </Button>

                    {scan.plan ? (
                      <Button
                        type="button"
                        size="lg"
                        variant="outline"
                        className="h-12 rounded-none border-primary/30 bg-primary/10 px-5 text-sky-100 backdrop-blur-md hover:border-primary/50 hover:bg-primary/15 hover:text-foreground"
                        disabled={scan.applyingBatch}
                        onClick={handleOpenReviewAll}
                      >
                        {scan.applyingBatch ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <ListChecks className="size-4" />
                        )}
                        Review pass
                      </Button>
                    ) : null}

                    <Link
                      href={
                        resolvedActiveBookmarkId
                          ? `/orbit/map?focus=${resolvedActiveBookmarkId}`
                          : "/orbit/map"
                      }
                      className="inline-flex h-12 items-center gap-2 border border-white/15 bg-white/[0.045] px-5 text-sm font-medium text-foreground/85 backdrop-blur-md transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-foreground"
                    >
                      <MapIcon className="size-4 text-sky-200" aria-hidden />
                      Open graph
                    </Link>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-flex size-1.5 rounded-full bg-primary shadow-[0_0_0_4px_rgba(59,130,246,0.16)]" />
                      {scanningSelection ? "Selection pass" : "Queue pass"}
                    </span>
                    <span aria-hidden className="text-white/20">
                      /
                    </span>
                    <span>{scanScopeLabel}</span>
                  </div>
                </div>
              </div>
            </section>

            <section className={cn(bookmarkFeedColumnClassName, "flex flex-col gap-3")}>
              <QueueHeader
                orbitView={orbitView}
                total={total}
                onChangeView={handleOrbitViewChange}
                viewMode={viewMode}
                onChangeViewMode={setViewMode}
                selectionMode={selectionMode}
                canSelect={total > 0}
                onToggleSelectionMode={toggleSelectionMode}
              />

              {selectionMode && selectedBookmarkIds.size > 0 && (
                <div className="sticky top-[calc(var(--header-height)+8px)] z-[8] flex flex-wrap items-center gap-2 rounded-[18px] border border-white/10 bg-[linear-gradient(180deg,rgba(10,15,29,0.95),rgba(15,23,42,0.92))] px-4 py-2.5 shadow-xl backdrop-blur-md sm:px-5">
                  <span className="text-xs font-medium text-white/80">
                    {selectedBookmarkIds.size} selected
                  </span>
                  <div className="ml-auto flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 border-sky-400/20 bg-sky-400/10 text-sky-100 hover:bg-sky-400/15"
                      onClick={handleScan}
                      disabled={scan.scanning || scanTargetIds.length === 0}
                    >
                      {scan.scanning ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="size-3.5" />
                      )}
                      Auto-categorize selection
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 border-white/15 bg-white/5 text-white hover:bg-white/10"
                      onClick={handleBulkAddTag}
                    >
                      <TagIcon className="size-3.5" />
                      Tag
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 border-white/15 bg-white/5 text-white hover:bg-white/10"
                      onClick={handleBulkAddToCollection}
                    >
                      <Folder className="size-3.5" />
                      Collect
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 gap-1.5 text-white/70 hover:text-red-300"
                      onClick={handleBulkDelete}
                    >
                      <Trash2 className="size-3.5" />
                      Delete
                    </Button>
                  </div>
                </div>
              )}

              {showQueueTools && (
                <>
                  <div className="relative w-full overflow-hidden border-b border-hairline-soft">
                    <SearchBar
                      glass
                      value={search}
                      onChange={handleSearchChange}
                      placeholder="Search Orbit by author, text, or notes…"
                      inputClassName="h-11 rounded-none"
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
                </>
              )}

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
                      selected={
                        selectionMode
                          ? selectedBookmarkIds.has(bookmark.id)
                          : resolvedActiveBookmarkId === bookmark.id
                      }
                      selectionMode={selectionMode}
                      onSelectionChange={handleSelectionChange}
                      applying={scan.applyingBookmarkId === bookmark.id || scan.applyingBatch}
                      searchQuery={search || undefined}
                      priorityMedia={bookmark.id === aboveFoldMediaBookmarkId}
                      onSelect={setActiveBookmarkId}
                      onTagClick={goToTagOnDashboard}
                      onAddTag={handleBookmarkAddTag}
                      onAddToCollection={handleBookmarkAddToCollection}
                      onDelete={actions.handleDeleteBookmark}
                      onReviewSuggestion={handleOpenBookmarkReview}
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

      <OrbitReviewDialog
        open={reviewOpen}
        onOpenChange={handleReviewOpenChange}
        plan={scan.plan}
        bookmarks={bookmarks}
        dismissedBookmarkIds={scan.dismissedBookmarkIds}
        existingTags={tags}
        existingCollections={collections}
        applying={scan.applyingBatch}
        focusBookmarkId={reviewBookmarkId}
        reviewSessionId={reviewSessionId}
        onApply={handleApplyReviewedPlan}
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
  selectionMode: boolean;
  canSelect: boolean;
  onToggleSelectionMode: () => void;
}

function QueueHeader({
  orbitView,
  total,
  viewMode,
  onChangeView,
  onChangeViewMode,
  selectionMode,
  canSelect,
  onToggleSelectionMode,
}: QueueHeaderProps) {
  return (
    <section className="pt-1">
      <div className="flex flex-col gap-4 border-b border-hairline-soft pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p
              className="text-[10px] font-medium uppercase tracking-[0.22em] text-white/55"
              style={MONO_STYLE}
            >
              Orbit queue
            </p>
            <p className="mt-1 text-sm font-semibold text-white">
              {orbitView === "recent"
                ? "Freshest bookmarks still in orbit"
                : "All unaffiliated bookmarks"}
            </p>
          </div>

          {canSelect ? (
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1 rounded-xl border border-hairline-soft bg-surface-2/70 p-1 shadow-sm">
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

              <button
                type="button"
                aria-pressed={selectionMode}
                onClick={onToggleSelectionMode}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors",
                  selectionMode
                    ? "bg-amber-500/15 text-amber-200 hover:bg-amber-500/25"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                )}
              >
                {selectionMode ? "Done" : "Select"}
              </button>
            </div>
          ) : null}
        </div>

        {canSelect ? (
          <div className="flex items-center justify-end">
            <div className="inline-flex items-center gap-0.5 rounded-xl border border-hairline-soft bg-surface-2/70 p-1 shadow-sm">
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
        ) : null}
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
    <div className="border-y border-hairline-soft py-10 text-center">
      <OrbitIcon className="mx-auto mb-4 size-8 text-primary/70" />
      <p className="text-base font-semibold text-foreground">
        {searching ? "Nothing in Orbit matches this search" : "Orbit is clear"}
      </p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        {searching
          ? "Try a different search term or clear the query."
          : "Every bookmark already belongs to a tag, collection, or folder. New unsorted saves will appear here when they need a decision."}
      </p>
      <div className="mt-5 flex justify-center">
        <Button
          size="sm"
          variant="outline"
          className="rounded-none"
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
