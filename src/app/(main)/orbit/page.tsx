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
import { useRouter } from "next/navigation";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import {
  AlignJustify,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  FolderPlus,
  Grid3x3,
  LayoutList,
  Loader2,
  Orbit as OrbitIcon,
  Rocket,
  Sparkles,
  Tag,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { SearchBar } from "@/components/search-bar";
import { Sidebar } from "@/components/sidebar-dynamic";
import { MobileSidebar } from "@/components/mobile-sidebar";
import { BookmarkCard } from "@/components/bookmark-card";
import { PageHeader } from "@/components/page-header";
import { UserNavDynamic } from "@/components/user-nav-dynamic";
import { useBookmarkActions } from "@/hooks/use-bookmark-actions";
import { useCreateCollection } from "@/hooks/use-create-collection";
import { useCollectionsQuery, useTagsQuery } from "@/hooks/use-library-data";
import { appChromeFrostedClassName } from "@/lib/app-chrome";
import { fetchJson, sendJson, type JsonValue } from "@/lib/fetch-json";
import { invalidateLibraryQueries } from "@/lib/query-invalidation";
import { getStaggerClass } from "@/lib/stagger";
import { cn } from "@/lib/utils";
import type { DbUser } from "@/lib/auth";
import type {
  BookmarkWithRelations,
  OrbitApplyResult,
  OrbitScanResponsePayload,
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
  const shared = new Set(first.collectionItems.map(({ collection }) => collection.id));

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

function OrbitMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-white/12 bg-white/6 p-4 shadow-sm backdrop-blur-sm">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/55">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-white">{value}</p>
      <p className="mt-1 text-xs text-white/65">{detail}</p>
    </div>
  );
}

function formatBookmarkNoun(count: number) {
  return `bookmark${count === 1 ? "" : "s"}`;
}

function truncateOrbitPreview(text: string, maxLength = 180) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

export default function OrbitPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session } = useSession() as {
    data: { dbUser?: DbUser } | null;
  };
  const actions = useBookmarkActions();
  const { createCollection, createCollectionQuick } = useCreateCollection();

  const [orbitView, setOrbitView] = useState<OrbitView>("recent");
  const [viewMode, setViewMode] = useState<ViewMode>("feed");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [page, setPage] = useState(1);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedBookmarkIds, setSelectedBookmarkIds] = useState<string[]>([]);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [collectionDialogOpen, setCollectionDialogOpen] = useState(false);
  const [createCollectionOpen, setCreateCollectionOpen] = useState(false);
  const [grokDialogOpen, setGrokDialogOpen] = useState(false);
  const [grokScanResult, setGrokScanResult] =
    useState<OrbitScanResponsePayload | null>(null);
  const [grokScanning, setGrokScanning] = useState(false);
  const [grokApplying, setGrokApplying] = useState(false);
  const [grokCreateCollections, setGrokCreateCollections] = useState(true);
  const [tagTargetIds, setTagTargetIds] = useState<string[]>([]);
  const [collectionTargetIds, setCollectionTargetIds] = useState<string[]>([]);
  const [activeBookmarkId, setActiveBookmarkId] = useState<string | null>(null);

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
  const visibleBookmarkIdSet = useMemo(
    () => new Set(bookmarks.map((bookmark) => bookmark.id)),
    [bookmarks]
  );
  const visibleSelectedBookmarkIds = useMemo(
    () => selectedBookmarkIds.filter((bookmarkId) => visibleBookmarkIdSet.has(bookmarkId)),
    [selectedBookmarkIds, visibleBookmarkIdSet]
  );
  const grokTargetBookmarkIds = useMemo(
    () =>
      visibleSelectedBookmarkIds.length > 0
        ? visibleSelectedBookmarkIds
        : bookmarks.map((bookmark) => bookmark.id),
    [bookmarks, visibleSelectedBookmarkIds]
  );
  const selectedBookmarkIdSet = useMemo(
    () => new Set(visibleSelectedBookmarkIds),
    [visibleSelectedBookmarkIds]
  );
  const bookmarkById = useMemo(
    () => new Map(bookmarks.map((bookmark) => [bookmark.id, bookmark])),
    [bookmarks]
  );
  const resolvedActiveBookmarkId =
    activeBookmarkId && bookmarkById.has(activeBookmarkId)
      ? activeBookmarkId
      : bookmarks[0]?.id ?? null;
  const tagDialogBookmarks = useMemo(() => {
    const targetIds = selectedBookmarkIds.length > 0 ? visibleSelectedBookmarkIds : tagTargetIds;
    return targetIds.flatMap((id) => {
      const bookmark = bookmarkById.get(id);
      return bookmark ? [bookmark] : [];
    });
  }, [bookmarkById, selectedBookmarkIds.length, tagTargetIds, visibleSelectedBookmarkIds]);
  const collectionDialogBookmarks = useMemo(() => {
    const targetIds =
      selectedBookmarkIds.length > 0 ? visibleSelectedBookmarkIds : collectionTargetIds;
    return targetIds.flatMap((id) => {
      const bookmark = bookmarkById.get(id);
      return bookmark ? [bookmark] : [];
    });
  }, [bookmarkById, collectionTargetIds, selectedBookmarkIds.length, visibleSelectedBookmarkIds]);
  const aboveFoldMediaBookmarkId = useMemo(() => {
    const first = bookmarks.find((bookmark) => {
      const media = bookmark.media?.[0];
      return Boolean(media?.url || media?.preview_image_url);
    });
    return first?.id ?? null;
  }, [bookmarks]);
  const dbUser = session?.dbUser;
  const isSearchPending = search.trim() !== deferredSearch;
  const allQueueCountLabel = total.toLocaleString();
  const visibleCountLabel = bookmarks.length.toLocaleString();
  const grokScopeLabel =
    visibleSelectedBookmarkIds.length > 0
      ? `${visibleSelectedBookmarkIds.length} selected ${formatBookmarkNoun(visibleSelectedBookmarkIds.length)}`
      : `${bookmarks.length} ${formatBookmarkNoun(bookmarks.length)} on this page`;
  const grokActionLabel =
    visibleSelectedBookmarkIds.length > 0
      ? `Scan Selected (${visibleSelectedBookmarkIds.length})`
      : "Scan with Grok";
  const hasGrokSuggestions =
    grokScanResult !== null &&
    (grokScanResult.summary.tagAssignments > 0 ||
      grokScanResult.summary.collectionBuckets > 0);
  const hasActionableGrokSuggestions =
    grokScanResult !== null &&
    (grokScanResult.summary.tagAssignments > 0 ||
      grokScanResult.collectionRollups.some(
        (collection) => collection.reuseExisting || grokCreateCollections
      ));
  const grokPreviewRows = useMemo(
    () =>
      grokScanResult?.plan.suggestions.map((suggestion) => ({
        suggestion,
        bookmark: bookmarkById.get(suggestion.bookmarkId) ?? null,
      })) ?? [],
    [bookmarkById, grokScanResult]
  );

  useEffect(() => {
    if (orbitView !== "all") return;
    if (page <= totalPages) return;

    startTransition(() => {
      setPage(totalPages);
    });
  }, [orbitView, page, totalPages]);

  const clearSelection = useCallback(() => {
    setSelectedBookmarkIds([]);
    setSelectionMode(false);
  }, []);

  const handleGrokDialogOpenChange = useCallback(
    (open: boolean) => {
      if (!open && !grokApplying) {
        setGrokScanResult(null);
      }
      setGrokDialogOpen(open);
    },
    [grokApplying]
  );

  const toggleBookmarkSelection = useCallback((bookmarkId: string, selected: boolean) => {
    setSelectedBookmarkIds((current) => {
      if (selected) {
        return current.includes(bookmarkId) ? current : [...current, bookmarkId];
      }
      return current.filter((id) => id !== bookmarkId);
    });
  }, []);

  const selectVisibleBookmarks = useCallback(() => {
    setSelectedBookmarkIds(bookmarks.map((bookmark) => bookmark.id));
  }, [bookmarks]);

  const openBulkTagDialog = useCallback(() => {
    if (visibleSelectedBookmarkIds.length === 0) return;
    setTagTargetIds(visibleSelectedBookmarkIds);
    setTagDialogOpen(true);
  }, [visibleSelectedBookmarkIds]);

  const openBulkCollectionDialog = useCallback(() => {
    if (visibleSelectedBookmarkIds.length === 0) return;
    setCollectionTargetIds(visibleSelectedBookmarkIds);
    setCollectionDialogOpen(true);
  }, [visibleSelectedBookmarkIds]);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    startTransition(() => {
      setPage(1);
    });
  }, []);

  const handleOrbitViewChange = useCallback((value: OrbitView) => {
    if (value === orbitView) return;

    startTransition(() => {
      setOrbitView(value);
      setPage(1);
      setSelectedBookmarkIds([]);
      setSelectionMode(false);
    });
  }, [orbitView]);

  const handlePageChange = useCallback((nextPage: number) => {
    startTransition(() => {
      setPage(nextPage);
      setSelectedBookmarkIds([]);
    });
  }, []);

  const handleCreateCollectionOpen = useCallback(() => {
    setCreateCollectionOpen(true);
  }, []);

  const handleSyncComplete = useCallback(() => {
    void invalidateLibraryQueries(queryClient);
  }, [queryClient]);

  const goToTagOnDashboard = useCallback((tagId: string) => {
    router.push(`/dashboard?tag=${encodeURIComponent(tagId)}`);
  }, [router]);

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

  const handleOpenGrokDialog = useCallback(() => {
    setGrokScanResult(null);
    setGrokDialogOpen(true);
  }, []);

  const handleGrokScan = useCallback(async () => {
    if (grokTargetBookmarkIds.length === 0) return;

    setGrokScanning(true);
    try {
      const result = await sendJson<
        OrbitScanResponsePayload,
        { mode: "scan"; bookmarkIds: string[] }
      >("/api/orbit/scan", {
        method: "POST",
        body: {
          mode: "scan",
          bookmarkIds: grokTargetBookmarkIds,
        },
      });

      setGrokScanResult(result);
      toast.success("Grok finished scanning Orbit");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not scan Orbit with Grok"
      );
    } finally {
      setGrokScanning(false);
    }
  }, [grokTargetBookmarkIds]);

  const handleApplyGrokPlan = useCallback(async () => {
    if (!grokScanResult) return;

    setGrokApplying(true);
    try {
      const applyBody: JsonValue = {
        mode: "apply",
        createCollections: grokCreateCollections,
        plan: JSON.parse(JSON.stringify(grokScanResult.plan)) as JsonValue,
      };

      const response = await sendJson<{ applied: OrbitApplyResult }>("/api/orbit/scan", {
        method: "POST",
        body: applyBody,
      });

      await invalidateLibraryQueries(queryClient);
      clearSelection();
      setGrokScanResult(null);
      setGrokDialogOpen(false);

      const parts = [
        `${response.applied.tagAssignments} tag assignment${
          response.applied.tagAssignments === 1 ? "" : "s"
        }`,
      ];

      if (response.applied.collectionAssignments > 0) {
        parts.push(
          `${response.applied.collectionAssignments} collection placement${
            response.applied.collectionAssignments === 1 ? "" : "s"
          }`
        );
      }

      if (response.applied.createdCollections > 0) {
        parts.push(
          `${response.applied.createdCollections} new collection${
            response.applied.createdCollections === 1 ? "" : "s"
          }`
        );
      }

      toast.success(`Applied Grok suggestions: ${parts.join(" • ")}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not apply Grok suggestions"
      );
    } finally {
      setGrokApplying(false);
    }
  }, [clearSelection, grokCreateCollections, grokScanResult, queryClient]);

  const subtitle =
    orbitView === "recent"
      ? total > RECENT_PAGE_SIZE
        ? `Showing the ${RECENT_PAGE_SIZE} newest bookmarks still looking for a home.`
        : "Showing every bookmark that is still looking for a home."
      : "Everything that is still outside your tags, collections, and synced X folders.";

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
          <PageHeader
            sticky
            title={
              <span className="flex items-center gap-2">
                <OrbitIcon className="size-5 text-primary" />
                Orbit
              </span>
            }
            description="The bookmarks that still sit outside your tags, collections, and synced X folders."
            leading={
              <div className="md:hidden">
                <MobileSidebar
                  tags={tags}
                  collections={collections}
                  selectedTags={[]}
                  onTagToggle={goToTagOnDashboard}
                  onCreateCollection={handleCreateCollectionOpen}
                  lastSyncAt={dbUser?.lastSyncAt ? new Date(dbUser.lastSyncAt) : null}
                  onSyncComplete={handleSyncComplete}
                />
              </div>
            }
            actions={dbUser ? <UserNavDynamic user={dbUser} /> : null}
          />

          <div className="space-y-4 px-4 pb-4 pt-4 sm:px-5">
            <section className="relative overflow-hidden rounded-[28px] border border-primary/15 bg-[radial-gradient(120%_120%_at_0%_0%,rgba(59,130,246,0.22),transparent_58%),radial-gradient(110%_110%_at_100%_0%,rgba(6,182,212,0.16),transparent_54%),linear-gradient(180deg,rgba(10,15,29,0.98),rgba(15,23,42,0.92))] px-5 py-5 shadow-xl sm:px-6 sm:py-6">
              <div
                className="absolute inset-y-0 right-0 w-48 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.12),transparent_65%)]"
                aria-hidden
              />
              <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-2xl">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/6 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-white/70">
                    <Rocket className="size-3.5" />
                    Orbit Queue
                  </div>
                  <h2 className="mt-4 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                    Triage the bookmarks still circling your library.
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm text-white/72 sm:text-base">
                    Everything here is still outside your tags, collections, and
                    synced X folders. Sweep the newest saves first, then work
                    through the full unaffiliated queue in batches.
                  </p>
                </div>

                <div className="w-full max-w-xl space-y-3">
                  <div className="rounded-2xl border border-white/12 bg-white/6 p-3 shadow-sm backdrop-blur-sm">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/55">
                          Grok Scan
                        </p>
                        <p className="mt-1 text-sm text-white/75">
                          Analyze {grokScopeLabel} and preview auto-tagging plus
                          collection sorting before anything is applied.
                        </p>
                      </div>
                      <Button
                        size="lg"
                        className="h-10 gap-2 bg-white text-slate-950 shadow-sm hover:bg-white/90"
                        disabled={grokTargetBookmarkIds.length === 0}
                        onClick={handleOpenGrokDialog}
                      >
                        <Sparkles className="size-4" />
                        {grokActionLabel}
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <OrbitMetric
                      label="Unsorted Now"
                      value={allQueueCountLabel}
                      detail="Bookmarks waiting for their first home."
                    />
                    <OrbitMetric
                      label={orbitView === "recent" ? "Recent Pass" : "Visible Now"}
                      value={
                        orbitView === "recent"
                          ? Math.min(total, RECENT_PAGE_SIZE).toLocaleString()
                          : visibleCountLabel
                      }
                      detail={
                        orbitView === "recent"
                          ? "Newest saves, ready for a quick sweep."
                          : `Page ${page} of ${totalPages} in the full queue.`
                      }
                    />
                  </div>
                </div>
              </div>
            </section>

            <div
              className={cn(
                "relative mx-auto max-w-2xl overflow-hidden rounded-2xl border border-hairline-strong shadow-xl",
                appChromeFrostedClassName
              )}
            >
              <SearchBar
                glass
                value={search}
                onChange={handleSearchChange}
                placeholder="Search Orbit by author, bookmark text, or notes..."
              />
            </div>

            <section
              className={cn(
                "rounded-2xl border border-hairline-strong p-3 shadow-sm",
                appChromeFrostedClassName
              )}
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                  <div className="inline-flex w-full flex-wrap items-center gap-1 rounded-2xl border border-hairline-soft bg-surface-2 p-1 shadow-sm sm:w-auto">
                    <button
                      type="button"
                      aria-pressed={orbitView === "recent"}
                      onClick={() => handleOrbitViewChange("recent")}
                      className={`inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                        orbitView === "recent"
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Recent Pass
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[11px] ${
                          orbitView === "recent"
                            ? "bg-primary-foreground/15 text-primary-foreground/80"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {Math.min(total, RECENT_PAGE_SIZE).toLocaleString()}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-pressed={orbitView === "all"}
                      onClick={() => handleOrbitViewChange("all")}
                      className={`inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                        orbitView === "all"
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      All Unaffiliated
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[11px] ${
                          orbitView === "all"
                            ? "bg-primary-foreground/15 text-primary-foreground/80"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {allQueueCountLabel}
                      </span>
                    </button>
                  </div>

                  <p className="text-xs text-muted-foreground">{subtitle}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex flex-1 items-center gap-0.5 rounded-xl border border-hairline-soft bg-surface-2 p-1 shadow-sm sm:flex-none">
                    {VIEW_MODE_OPTIONS.map(({ value, label, icon: Icon }) => (
                      <Button
                        key={value}
                        variant={viewMode === value ? "default" : "ghost"}
                        size="sm"
                        className={`h-10 px-2.5 text-sm ${
                          viewMode === value
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                        title={`${label} view`}
                        onClick={() => setViewMode(value)}
                      >
                        <Icon className="size-4 sm:mr-1.5" />
                        <span className="hidden sm:inline">{label}</span>
                      </Button>
                    ))}
                  </div>

                  <Button
                    variant={selectionMode ? "default" : "outline"}
                    size="sm"
                    className="h-10 gap-1.5 px-3 text-sm"
                    onClick={() => {
                      if (selectionMode) {
                        clearSelection();
                      } else {
                        setSelectionMode(true);
                      }
                    }}
                  >
                    <CheckSquare className="size-4" />
                    {selectionMode ? "Done" : "Select"}
                  </Button>
                </div>
              </div>

              {(isFetching || isSearchPending) && !isLoading && (
                <p className="pt-2 text-xs text-muted-foreground">Updating Orbit…</p>
              )}
            </section>

            {selectionMode && (
              <section className="animate-slide-down-fade rounded-2xl border border-hairline-soft bg-secondary/45 px-4 py-3 shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium text-foreground">
                        {visibleSelectedBookmarkIds.length > 0
                          ? `${visibleSelectedBookmarkIds.length} selected`
                          : "Select bookmarks to triage in bulk"}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 px-3 text-sm"
                        onClick={selectVisibleBookmarks}
                      >
                        Select page
                      </Button>
                      {visibleSelectedBookmarkIds.length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-9 px-3 text-sm"
                          onClick={clearSelection}
                        >
                          Clear
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Batch triage supports tags and collections. Synced X folders
                      remain read-only.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-10 gap-1.5 px-3 text-sm"
                      disabled={visibleSelectedBookmarkIds.length === 0}
                      onClick={openBulkTagDialog}
                    >
                      <Tag className="size-4" />
                      Tag
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-10 gap-1.5 px-3 text-sm"
                      disabled={visibleSelectedBookmarkIds.length === 0}
                      onClick={openBulkCollectionDialog}
                    >
                      <FolderPlus className="size-4" />
                      Add to Collection
                    </Button>
                  </div>
                </div>
              </section>
            )}

            {isLoading ? (
              <div
                className="mx-auto max-w-2xl space-y-0"
                role="status"
                aria-live="polite"
                aria-label="Loading Orbit bookmarks"
              >
                {Array.from({ length: 6 }).map((_, index) => (
                  <div
                    key={index}
                    className={`border-b border-border px-4 py-3 sm:px-5 ${
                      getStaggerClass(index, "animate-fade-in") ?? ""
                    }`}
                  >
                    <div className="flex gap-4">
                      <div className="h-10 w-10 shrink-0 rounded-full skeleton-shimmer" />
                      <div className="flex-1 space-y-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-3.5 w-20 rounded skeleton-shimmer" />
                          <div className="h-3 w-14 rounded skeleton-shimmer" />
                        </div>
                        <div className="space-y-1.5">
                          <div className="h-3 w-full rounded skeleton-shimmer" />
                          <div className="h-3 w-4/5 rounded skeleton-shimmer" />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : isError ? (
              <div className="flex min-h-[18rem] items-center justify-center px-6">
                <div className="max-w-md space-y-3 text-center">
                  <p className="text-lg font-medium">Orbit could not be loaded</p>
                  <p className="text-sm text-muted-foreground">
                    {error instanceof Error ? error.message : "Please try again."}
                  </p>
                  <Button onClick={() => refetch()} size="sm">
                    Retry
                  </Button>
                </div>
              </div>
            ) : bookmarks.length === 0 ? (
              <div className="flex min-h-[20rem] items-center justify-center px-4 sm:px-6">
                <div className="animate-fade-in rounded-2xl border border-hairline-soft bg-surface-1 px-6 py-8 text-center shadow-sm sm:px-8">
                  <OrbitIcon className="mx-auto mb-4 h-12 w-12 text-muted-foreground/40" />
                  <p className="mb-2 text-lg font-medium heading-font">
                    {search.trim() ? "Nothing in Orbit matches this search" : "Orbit is clear"}
                  </p>
                  <p className="mx-auto max-w-md text-sm text-muted-foreground">
                    {search.trim()
                      ? "Try a different search term or clear the query to see the full queue."
                      : "Every bookmark already belongs to a tag, collection, or synced X folder."}
                  </p>
                  <div className="mt-4 flex justify-center gap-2">
                    {search.trim() ? (
                      <Button variant="outline" size="sm" onClick={() => handleSearchChange("")}>
                        Clear search
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push("/dashboard")}
                      >
                        Open bookmarks
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <>
                <section
                  className={cn(
                    "rounded-2xl border border-hairline-soft px-4 py-3 shadow-sm",
                    appChromeFrostedClassName
                  )}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {orbitView === "recent"
                          ? "Freshest bookmarks still in orbit"
                          : "Full unaffiliated queue"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {orbitView === "recent"
                          ? total > RECENT_PAGE_SIZE
                            ? `Showing the latest ${RECENT_PAGE_SIZE} of ${allQueueCountLabel}.`
                            : `All ${allQueueCountLabel} bookmarks currently in Orbit.`
                          : `${allQueueCountLabel} bookmarks still need a first tag or collection.`}
                      </p>
                    </div>

                    {orbitView === "recent" && total > RECENT_PAGE_SIZE && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 px-3 text-sm"
                        onClick={() => handleOrbitViewChange("all")}
                      >
                        Open full queue
                      </Button>
                    )}
                  </div>
                </section>

                {viewMode === "grid" ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                    {bookmarks.map((bookmark, index) => (
                      <BookmarkCard
                        key={bookmark.id}
                        bookmark={bookmark}
                        viewMode={viewMode}
                        searchQuery={search || undefined}
                        priorityMedia={bookmark.id === aboveFoldMediaBookmarkId}
                        selected={
                          selectionMode
                            ? selectedBookmarkIdSet.has(bookmark.id)
                            : resolvedActiveBookmarkId === bookmark.id
                        }
                        onSelect={setActiveBookmarkId}
                        selectionMode={selectionMode}
                        onSelectionChange={toggleBookmarkSelection}
                        onTagClick={goToTagOnDashboard}
                        onAddTag={handleBookmarkAddTag}
                        onAddToCollection={handleBookmarkAddToCollection}
                        onDelete={actions.handleDeleteBookmark}
                        className={getStaggerClass(index, "animate-fade-in-up")}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="mx-auto max-w-2xl">
                    {bookmarks.map((bookmark, index) => (
                      <BookmarkCard
                        key={bookmark.id}
                        bookmark={bookmark}
                        viewMode={viewMode}
                        searchQuery={search || undefined}
                        priorityMedia={bookmark.id === aboveFoldMediaBookmarkId}
                        selected={
                          selectionMode
                            ? selectedBookmarkIdSet.has(bookmark.id)
                            : resolvedActiveBookmarkId === bookmark.id
                        }
                        onSelect={setActiveBookmarkId}
                        selectionMode={selectionMode}
                        onSelectionChange={toggleBookmarkSelection}
                        onTagClick={goToTagOnDashboard}
                        onAddTag={handleBookmarkAddTag}
                        onAddToCollection={handleBookmarkAddToCollection}
                        onDelete={actions.handleDeleteBookmark}
                        className={getStaggerClass(index, "animate-fade-in")}
                      />
                    ))}
                  </div>
                )}
              </>
            )}

            {orbitView === "all" && totalPages > 1 && bookmarks.length > 0 && (
              <div className="flex flex-col items-center gap-3 border-t border-border py-4">
                <div
                  className="flex items-center gap-2 text-sm"
                  role="navigation"
                  aria-label="Orbit pagination"
                >
                  <button
                    type="button"
                    onClick={() => handlePageChange(page - 1)}
                    disabled={page <= 1}
                    aria-label="Previous page"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-hairline-soft bg-surface-1 text-foreground shadow-sm transition-colors hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    <ChevronLeft className="size-4" aria-hidden />
                  </button>
                  <span className="tabular-nums text-sm text-muted-foreground" aria-live="polite">
                    <span className="sr-only">Page </span>
                    {page} <span aria-hidden className="text-muted-foreground/50">of</span>{" "}
                    <span className="sr-only">of</span> {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => handlePageChange(page + 1)}
                    disabled={page >= totalPages}
                    aria-label="Next page"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-hairline-soft bg-surface-1 text-foreground shadow-sm transition-colors hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    <ChevronRight className="size-4" aria-hidden />
                  </button>
                </div>
                <div className="h-1 w-24 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary/40 transition-all duration-300"
                    style={{
                      width: `${((page - 1) / Math.max(totalPages - 1, 1)) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )}
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

      <Dialog open={grokDialogOpen} onOpenChange={handleGrokDialogOpenChange}>
        <DialogContent className="max-h-[85vh] overflow-hidden p-0 sm:max-w-4xl">
          <div className="border-b border-hairline-soft px-5 py-4">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="size-5 text-primary" />
                Orbit Scan with Grok
              </DialogTitle>
              <DialogDescription>
                Scan {grokScopeLabel.toLowerCase()} through xAI&apos;s Responses
                API, preview the plan, then choose whether to apply it.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="space-y-4 overflow-y-auto px-5 py-4">
            <section className="rounded-2xl border border-hairline-soft bg-surface-1 p-4 shadow-sm">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    Current scan scope
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {grokScopeLabel}. If bookmarks are selected, Grok scans the
                    selection. Otherwise it scans the bookmarks visible on this page.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full border border-hairline-soft bg-background px-2.5 py-1">
                    Model {grokScanResult?.model ?? "grok-4.20-reasoning"}
                  </span>
                  <span className="rounded-full border border-hairline-soft bg-background px-2.5 py-1">
                    Responses API
                  </span>
                  <span className="rounded-full border border-hairline-soft bg-background px-2.5 py-1">
                    Threaded storage off
                  </span>
                  {grokScanResult?.privacy.zeroDataRetention === true && (
                    <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-emerald-700 dark:text-emerald-300">
                      xAI ZDR enabled
                    </span>
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-hairline-soft bg-surface-1 p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={grokCreateCollections}
                  onCheckedChange={(checked) =>
                    setGrokCreateCollections(Boolean(checked))
                  }
                  aria-label="Create new collections from Grok suggestions"
                />
                <div className="space-y-1">
                  <Label className="leading-relaxed">
                    Create new collections when Grok finds a clear theme
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Existing collection matches are always reused. Turning this off
                    keeps the scan focused on tags and existing collection homes.
                  </p>
                </div>
              </div>
            </section>

            {grokScanResult ? (
              <>
                <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl border border-hairline-soft bg-surface-1 p-4 shadow-sm">
                    <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                      Bookmarks With Tags
                    </p>
                    <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                      {grokScanResult.summary.bookmarksWithTags}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-hairline-soft bg-surface-1 p-4 shadow-sm">
                    <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                      Tag Assignments
                    </p>
                    <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                      {grokScanResult.summary.tagAssignments}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-hairline-soft bg-surface-1 p-4 shadow-sm">
                    <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                      Collection Buckets
                    </p>
                    <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                      {grokScanResult.summary.collectionBuckets}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-hairline-soft bg-surface-1 p-4 shadow-sm">
                    <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                      Existing Reuse
                    </p>
                    <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                      {grokScanResult.summary.reusedExistingTags +
                        grokScanResult.summary.reusedExistingCollections}
                    </p>
                  </div>
                </section>

                <section className="rounded-2xl border border-hairline-soft bg-surface-1 p-4 shadow-sm">
                  <p className="text-sm font-medium text-foreground">
                    {grokScanResult.plan.overview.summary}
                  </p>
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <div className="rounded-2xl border border-hairline-soft bg-background p-3">
                      <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                        Tagging Strategy
                      </p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {grokScanResult.plan.overview.taggingStrategy}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-hairline-soft bg-background p-3">
                      <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                        Collection Strategy
                      </p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {grokScanResult.plan.overview.collectionStrategy}
                      </p>
                    </div>
                  </div>
                </section>

                {grokScanResult.tagRollups.length > 0 && (
                  <section className="rounded-2xl border border-hairline-soft bg-surface-1 p-4 shadow-sm">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm font-medium text-foreground">
                        Suggested tags
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {grokScanResult.summary.uniqueTags} unique tag
                        {grokScanResult.summary.uniqueTags === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {grokScanResult.tagRollups.map((tag) => (
                        <span
                          key={tag.name}
                          className="inline-flex items-center gap-2 rounded-full border border-hairline-soft bg-background px-3 py-1 text-sm"
                        >
                          <span
                            className="size-2.5 rounded-full"
                            style={{ backgroundColor: tag.color }}
                          />
                          <span className="font-medium text-foreground">
                            {tag.name}
                          </span>
                          <span className="text-muted-foreground">
                            {tag.count}
                          </span>
                          <span className="text-muted-foreground">
                            {tag.reuseExisting ? "Existing" : "New"}
                          </span>
                        </span>
                      ))}
                    </div>
                  </section>
                )}

                {grokScanResult.collectionRollups.length > 0 && (
                  <section className="rounded-2xl border border-hairline-soft bg-surface-1 p-4 shadow-sm">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm font-medium text-foreground">
                        Suggested collection homes
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {grokScanResult.collectionRollups.length} collection
                        {grokScanResult.collectionRollups.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    {!grokCreateCollections &&
                      grokScanResult.collectionRollups.some(
                        (collection) => !collection.reuseExisting
                      ) && (
                        <p className="mt-2 text-sm text-muted-foreground">
                          New collection suggestions will stay in preview only until
                          collection creation is turned back on.
                        </p>
                      )}
                    <div className="mt-3 grid gap-3 lg:grid-cols-2">
                      {grokScanResult.collectionRollups.map((collection) => (
                        <div
                          key={collection.name}
                          className="rounded-2xl border border-hairline-soft bg-background p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-foreground">
                                {collection.name}
                              </p>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {collection.description}
                              </p>
                            </div>
                            <span className="rounded-full border border-hairline-soft px-2 py-0.5 text-xs text-muted-foreground">
                              {collection.count} item
                              {collection.count === 1 ? "" : "s"}
                            </span>
                          </div>
                          <p className="mt-3 text-xs text-muted-foreground">
                            {collection.reuseExisting
                              ? "Will reuse an existing collection"
                              : "Will create a new collection if enabled"}
                          </p>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                <section className="rounded-2xl border border-hairline-soft bg-surface-1 p-4 shadow-sm">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-medium text-foreground">
                      Per-bookmark preview
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Review the exact plan before applying it.
                    </p>
                  </div>

                  <div className="mt-3 space-y-3">
                    {grokPreviewRows.map(({ suggestion, bookmark }) => (
                      <div
                        key={suggestion.bookmarkId}
                        className="rounded-2xl border border-hairline-soft bg-background p-3"
                      >
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-foreground">
                                {bookmark
                                  ? `${bookmark.authorDisplayName} @${bookmark.authorUsername}`
                                  : suggestion.bookmarkId}
                              </p>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {bookmark
                                  ? truncateOrbitPreview(bookmark.tweetText)
                                  : "Bookmark preview unavailable on this page."}
                              </p>
                            </div>
                            <span className="rounded-full border border-hairline-soft px-2 py-0.5 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                              {suggestion.confidence} confidence
                            </span>
                          </div>

                          <p className="text-sm text-muted-foreground">
                            {suggestion.reasoning}
                          </p>

                          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                            <div className="flex-1">
                              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                                Tags
                              </p>
                              {suggestion.tags.length > 0 ? (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {suggestion.tags.map((tag) => (
                                    <span
                                      key={`${suggestion.bookmarkId}-${tag.name}`}
                                      className="inline-flex items-center gap-2 rounded-full border border-hairline-soft px-2.5 py-1 text-xs"
                                    >
                                      <span
                                        className="size-2 rounded-full"
                                        style={{ backgroundColor: tag.color }}
                                      />
                                      <span className="font-medium text-foreground">
                                        {tag.name}
                                      </span>
                                      <span className="text-muted-foreground">
                                        {tag.reuseExisting ? "Existing" : "New"}
                                      </span>
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <p className="mt-2 text-sm text-muted-foreground">
                                  No tag suggestion.
                                </p>
                              )}
                            </div>

                            <div className="flex-1">
                              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                                Collection
                              </p>
                              {suggestion.collection ? (
                                <div className="mt-2 rounded-2xl border border-hairline-soft p-3">
                                  <p className="text-sm font-medium text-foreground">
                                    {suggestion.collection.name}
                                  </p>
                                  <p className="mt-1 text-sm text-muted-foreground">
                                    {suggestion.collection.description}
                                  </p>
                                  <p className="mt-2 text-xs text-muted-foreground">
                                    {suggestion.collection.reuseExisting
                                      ? "Will reuse an existing collection."
                                      : "Will create a new collection if enabled."}
                                  </p>
                                </div>
                              ) : (
                                <p className="mt-2 text-sm text-muted-foreground">
                                  No collection move suggested.
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            ) : (
              <section className="rounded-2xl border border-dashed border-hairline-soft bg-surface-1 p-6 text-center shadow-sm">
                <Sparkles className="mx-auto size-10 text-primary/70" />
                <p className="mt-4 text-lg font-medium text-foreground">
                  Preview an AI-first triage pass for Orbit
                </p>
                <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  Grok will read the bookmark content, propose reusable tags,
                  identify collection homes, and return a strict structured plan
                  before MarkMaster changes anything.
                </p>
              </section>
            )}
          </div>

          <div className="flex flex-col gap-3 border-t border-hairline-soft bg-muted/50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              {grokScanResult ? (
                hasGrokSuggestions ? (
                  <>Review the plan, then apply it when it looks right.</>
                ) : (
                  <>No confident auto-sort suggestions yet. You can still rescan.</>
                )
              ) : (
                <>Nothing is applied until you confirm the preview.</>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => handleGrokDialogOpenChange(false)}
                disabled={grokApplying}
              >
                Close
              </Button>
              <Button
                variant={grokScanResult ? "outline" : "default"}
                className="gap-2"
                onClick={handleGrokScan}
                disabled={grokScanning || grokApplying || grokTargetBookmarkIds.length === 0}
              >
                {grokScanning ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                {grokScanning ? "Scanning…" : grokScanResult ? "Scan Again" : "Scan with Grok"}
              </Button>
              {grokScanResult && (
                <Button
                  className="gap-2"
                  onClick={handleApplyGrokPlan}
                  disabled={
                    grokScanning || grokApplying || !hasActionableGrokSuggestions
                  }
                >
                  {grokApplying ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                  {grokApplying ? "Applying…" : "Apply Suggestions"}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
