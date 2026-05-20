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
import { useRouter, useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import {
  AlignJustify,
  AlertTriangle,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  Folder,
  Gauge,
  Grid3x3,
  KeyRound,
  LayoutList,
  ListChecks,
  Loader2,
  Map as MapIcon,
  RefreshCw,
  Settings2,
  TagIcon,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { GrokMark } from "@/components/brands/grok-mark";
import { OrbitLogoMark } from "@/components/brands/orbit-logo-mark";
import { SearchBar } from "@/components/search-bar";
import { Sidebar } from "@/components/sidebar-dynamic";
import { MobileSidebar } from "@/components/mobile-sidebar";
import { PageHeader } from "@/components/page-header";
import { UserNavDynamic } from "@/components/user-nav-dynamic";
import { OrbitReviewDialog } from "@/components/orbit/orbit-review-dialog";
import { OrbitScanOverviewStrip } from "@/components/orbit/orbit-scan-overview-strip";

// New clean-list + slide-in + overlays components (new Orbit model)
import { OrbitList } from "@/components/orbit/orbit-list";
import { OrbitContextualMenu } from "@/components/orbit/orbit-quick-actions";
import { OrbitSlideInPanel } from "@/components/orbit/orbit-slide-in-panel";

// Orbital primitives (used for header, labels, etc. in the new model)
import {
  orbital,
  OrbitalCard,
  MissionControlHeader,
  TelemetryStat,
} from "@/components/orbital";
import { useBookmarkActions } from "@/hooks/use-bookmark-actions";
import { useCreateCollection } from "@/hooks/use-create-collection";
import { useCollectionsQuery, useTagsQuery } from "@/hooks/use-library-data";
import { useOrbitScan, type OrbitScanFailure } from "@/hooks/use-orbit-scan";
import { addDislikedHighlightId, addLikedHighlightId, getHighlightFeedback } from "@/lib/highlight-feedback";
import { trackFlywheelEvent } from "@/lib/flywheel";
import { bookmarkFeedColumnClassName } from "@/lib/bookmark-feed-layout";
import { fetchJson } from "@/lib/fetch-json";
import {
  ORBIT_ALL_PAGE_SIZE,
  ORBIT_RECENT_PAGE_SIZE,
  parseOrbitUrlState,
  type OrbitSortDirection,
  type OrbitView,
} from "@/lib/orbit-navigation";
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

type BookmarkResponse = {
  bookmarks: BookmarkWithRelations[];
  total: number;
  totalPages: number;
};

type OrbitScanRequest = {
  targetIds: string[];
  scanningSelection: boolean;
  contextKey: string;
};

const EMPTY_BOOKMARKS: BookmarkWithRelations[] = [];

function buildOrbitScanContextKey(args: {
  orbitView: OrbitView;
  page: number;
  queryString: string;
  scanningSelection: boolean;
  scanTargetIds: string[];
}): string {
  const sortedTargets = [...args.scanTargetIds].sort().join("|");
  return [
    args.orbitView,
    String(args.page),
    args.queryString,
    args.scanningSelection ? `sel:${sortedTargets}` : "queue",
  ].join("::");
}

function sameBookmarkIds(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const bIds = new Set(b);
  return a.every((id) => bIds.has(id));
}

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
  fontFamily: "var(--font-jetbrains-mono)",
};

function OrbitHeaderLogoAccent() {
  return (
    <div
      className="pointer-events-none absolute inset-y-0 right-16 hidden w-[240px] overflow-hidden sm:block"
      aria-hidden
    >
      <div className="absolute right-3 top-1/2 size-28 -translate-y-1/2 rounded-full bg-primary/15 blur-2xl" />
      <OrbitLogoMark className="absolute right-0 top-1/2 size-28 -translate-y-1/2 opacity-[0.12]" />
      <OrbitLogoMark className="absolute right-12 top-1/2 size-16 -translate-y-1/2 opacity-80 drop-shadow-[0_0_22px_rgba(37,99,235,0.42)]" />
    </div>
  );
}

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

function buildNoOpApplyResult(bookmarkCount: number): OrbitApplyResult {
  return {
    bookmarkCount,
    createdTags: 0,
    reusedTags: 0,
    tagAssignments: 0,
    createdCollections: 0,
    reusedCollections: 0,
    collectionAssignments: 0,
    skippedNewCollectionSingletons: 0,
  };
}

export default function OrbitPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Flywheel support (Phase 1+): if coming from Highlights/Digest, pre-focus the review dialog on that item
  const highlightIdFromUrl = searchParams.get("highlightId");
  const digestIdsFromUrl = searchParams.get("digestIds"); // from HighlightsDigest "Review all in Orbit"
  const sourceFromUrl = searchParams.get("source"); // Slice 2 light attribution (e.g. "weekly-gems" when from Digest CTA)
  const queryClient = useQueryClient();
  const orbitSearch = searchParams?.toString() ?? "";
  const orbitUrlState = useMemo(
    () => parseOrbitUrlState(orbitSearch),
    [orbitSearch]
  );
  const { data: session } = useSession() as {
    data: { dbUser?: DbUser } | null;
  };
  const actions = useBookmarkActions();
  const { createCollection, createCollectionQuick } = useCreateCollection();
  const scan = useOrbitScan();

  const [orbitView, setOrbitView] = useState<OrbitView>(orbitUrlState.view);
  const [queueSortDirection, setQueueSortDirection] =
    useState<OrbitSortDirection>(orbitUrlState.sortDirection);
  const [viewMode, setViewMode] = useState<ViewMode>("feed");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [page, setPage] = useState(orbitUrlState.page);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [collectionDialogOpen, setCollectionDialogOpen] = useState(false);
  const [createCollectionOpen, setCreateCollectionOpen] = useState(false);
  const [tagTargetIds, setTagTargetIds] = useState<string[]>([]);
  const [collectionTargetIds, setCollectionTargetIds] = useState<string[]>([]);
  const [activeBookmarkId, setActiveBookmarkId] = useState<string | null>(null);
  const [menuForId, setMenuForId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);

  // Simple click-outside + Esc for the floating menu (keeps things lightweight)
  useEffect(() => {
    if (!menuForId) return;

    const handleClickOutside = (e: MouseEvent) => {
      setMenuForId(null);
      setMenuPosition(null);
    };

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuForId(null);
        setMenuPosition(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEsc);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [menuForId]);

  const [selectedBookmarkIds, setSelectedBookmarkIds] = useState<Set<string>>(
    () => new Set()
  );
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewBookmarkId, setReviewBookmarkId] = useState<string | null>(null);
  const [feedbackById, setFeedbackById] = useState<Record<string, 'good' | 'not_relevant'>>({}); // Phase 2 persisted feedback for the session
  const [reviewSessionId, setReviewSessionId] = useState(0);

  // Digest mode: Track the current set of bookmarks coming from a Highlights Digest ("Review all") (Phase 2)
  const [activeDigestBookmarkIds, setActiveDigestBookmarkIds] = useState<string[] | null>(null);

  // Refs to guard one-time URL-intent handling (prevents sync setState lint + re-entrancy)
  const hasHandledHighlightRef = useRef(false);
  const hasHandledDigestRef = useRef(false);

  const [scanContextAtLastRun, setScanContextAtLastRun] = useState<string | null>(
    null
  );
  const [lastScanRequest, setLastScanRequest] = useState<OrbitScanRequest | null>(
    null
  );
  const appliedOrbitUrlStateKeyRef = useRef(orbitUrlState.stateKey);

  const { data: tags = [] } = useTagsQuery();
  const { data: collections = [] } = useCollectionsQuery();

  const pageSize =
    orbitView === "recent" ? ORBIT_RECENT_PAGE_SIZE : ORBIT_ALL_PAGE_SIZE;
  const queryString = useMemo(() => {
    const params = new URLSearchParams({
      page: orbitView === "recent" ? "1" : page.toString(),
      limit: pageSize.toString(),
      sortField: "bookmarkedAt",
      sortDirection: queueSortDirection,
      unaffiliated: "true",
    });

    if (deferredSearch) {
      params.set("search", deferredSearch);
    }

    return params.toString();
  }, [deferredSearch, orbitView, page, pageSize, queueSortDirection]);

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
  const queueOrderLabel =
    queueSortDirection === "asc" ? "oldest" : "newest";
  const scanHelperText = queueIsLoading
    ? "Loading the current Orbit queue."
    : scanningSelection
      ? hasSelectionOverflow
        ? `Grok will suggest tags and destinations for the first ${scanTargetCount} selected bookmarks. Review before you apply.`
        : `Grok will suggest tags and destinations for ${scanTargetCount} selected bookmark${scanTargetCount === 1 ? "" : "s"}. Review before you apply.`
      : queueBatchCount > 0
        ? `Grok suggests tags and destinations for the ${queueBatchCount} ${queueOrderLabel} un-triaged bookmark${queueBatchCount === 1 ? "" : "s"}. Review each suggestion or apply the whole pass at once.`
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
      : `${scanTargetCount} ${
          scanningSelection ? "selected" : queueOrderLabel
        } bookmark${
          scanTargetCount === 1 ? "" : "s"
        }`;
  const showQueueTools =
    isLoading || isError || total > 0 || hasSearchQuery;

  const currentScanContextKey = useMemo(
    () =>
      buildOrbitScanContextKey({
        orbitView,
        page,
        queryString,
        scanningSelection,
        scanTargetIds,
      }),
    [orbitView, page, queryString, scanningSelection, scanTargetIds]
  );

  const buildScanRequest = useCallback(
    (targetIds: string[], scanSelection: boolean): OrbitScanRequest => ({
      targetIds,
      scanningSelection: scanSelection,
      contextKey: buildOrbitScanContextKey({
        orbitView,
        page,
        queryString,
        scanningSelection: scanSelection,
        scanTargetIds: targetIds,
      }),
    }),
    [orbitView, page, queryString]
  );

  const staleScanPlan = Boolean(
    scan.plan &&
      scanContextAtLastRun &&
      scanContextAtLastRun !== currentScanContextKey
  );

  const canRescanCurrentSelection = Boolean(
    scan.error &&
      selectedScanTargetIds.length > 0 &&
      !(
        lastScanRequest?.scanningSelection &&
        sameBookmarkIds(lastScanRequest.targetIds, selectedScanTargetIds)
      )
  );

  const canApplyStrongMatches = useMemo(() => {
    if (!scan.plan) return false;
    return scan.plan.plan.suggestions.some(
      (suggestion) =>
        !scan.dismissedBookmarkIds.has(suggestion.bookmarkId) &&
        suggestion.confidence === "high" &&
        (suggestion.tags.length > 0 || suggestion.collection !== null)
    );
  }, [scan.plan, scan.dismissedBookmarkIds]);

  const resolvedActiveBookmarkId =
    activeBookmarkId && bookmarkById.has(activeBookmarkId) ? activeBookmarkId : null;

  const activeBookmark = resolvedActiveBookmarkId
    ? bookmarkById.get(resolvedActiveBookmarkId) ?? null
    : null;

  // Basic keyboard navigation for the clean list (arrow keys + Enter/Esc)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!bookmarks.length) return;

      const currentIndex = bookmarks.findIndex((b) => b.id === resolvedActiveBookmarkId);

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = currentIndex < bookmarks.length - 1 ? currentIndex + 1 : 0;
        setActiveBookmarkId(bookmarks[next].id);
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = currentIndex > 0 ? currentIndex - 1 : bookmarks.length - 1;
        setActiveBookmarkId(bookmarks[prev].id);
      }

      if (e.key === "Enter" && resolvedActiveBookmarkId && !activeBookmark) {
        setActiveBookmarkId(resolvedActiveBookmarkId);
      }

      if (e.key === "Escape") {
        if (menuForId) {
          setMenuForId(null);
          setMenuPosition(null);
        } else if (activeBookmarkId) {
          setActiveBookmarkId(null);
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [bookmarks, resolvedActiveBookmarkId, activeBookmark, activeBookmarkId, menuForId]);

  const activeDecision = activeBookmark ? scan.getDecision(activeBookmark.id) : null;
  const activeConfidence = activeDecision?.confidence;

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
    if (orbitUrlState.stateKey === appliedOrbitUrlStateKeyRef.current) return;

    appliedOrbitUrlStateKeyRef.current = orbitUrlState.stateKey;
    startTransition(() => {
      setOrbitView(orbitUrlState.view);
      setQueueSortDirection(orbitUrlState.sortDirection);
      setPage(orbitUrlState.page);
      setSearch("");
      setActiveBookmarkId(null);
      setSelectionMode(false);
      setSelectedBookmarkIds(new Set());
    });
  }, [orbitUrlState]);

  useEffect(() => {
    if (orbitView !== "all") return;
    if (page <= totalPages) return;

    startTransition(() => {
      setPage(totalPages);
    });
  }, [orbitView, page, totalPages]);

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

  const handleQueueSortDirectionChange = useCallback(
    (value: OrbitSortDirection) => {
      if (value === queueSortDirection) return;

      startTransition(() => {
        setQueueSortDirection(value);
        setPage(1);
      });
    },
    [queueSortDirection]
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

  const runOrbitScan = useCallback(
    async (request: OrbitScanRequest) => {
      if (request.targetIds.length === 0) return;

      setLastScanRequest(request);

      toast.info(
        request.scanningSelection
          ? "Grok is categorizing your selection — this should be quicker."
          : "Grok is categorizing your queue — large batches can take a minute."
      );
      try {
        const result = await scan.scanNow(request.targetIds);
        if (result) {
          setScanContextAtLastRun(request.contextKey);
          const scopeLabel = request.scanningSelection ? "selected" : "Orbit";
          toast.success(
            `Grok categorized ${result.plan.suggestions.length} ${scopeLabel} bookmark${
              result.plan.suggestions.length === 1 ? "" : "s"
            }`
          );
        }
      } catch {
        // Inline failure state is rendered near the Orbit scan controls.
      }
    },
    [scan]
  );

  const handleScan = useCallback(async () => {
    await runOrbitScan(buildScanRequest(scanTargetIds, scanningSelection));
  }, [buildScanRequest, runOrbitScan, scanTargetIds, scanningSelection]);

  // Digest flywheel: auto-scan gems from Highlights, then open review when Grok plan is ready
  useEffect(() => {
    if (!digestIdsFromUrl || hasHandledDigestRef.current || scan.scanning) return;

    const ids = digestIdsFromUrl
      .split(",")
      .filter(Boolean)
      .slice(0, ORBIT_GROK_MAX_BOOKMARKS_PER_SCAN);
    if (ids.length === 0) return;

    hasHandledDigestRef.current = true;
    const sessionStartPayload: { size: number; source?: string } = { size: ids.length };
    if (sourceFromUrl) sessionStartPayload.source = sourceFromUrl;
    trackFlywheelEvent("digest.session_start", sessionStartPayload);
    setActiveDigestBookmarkIds(ids);
    setReviewBookmarkId(ids[0]);

    void (async () => {
      await runOrbitScan(buildScanRequest(ids, true));
      setReviewOpen(true);
    })();
  }, [
    digestIdsFromUrl,
    sourceFromUrl,
    scan.scanning,
    buildScanRequest,
    runOrbitScan,
  ]);

  // Single-bookmark flywheel: auto-scan then open review (same pattern as digest batch)
  useEffect(() => {
    if (!highlightIdFromUrl || hasHandledHighlightRef.current || scan.scanning) return;
    if (digestIdsFromUrl) return;

    hasHandledHighlightRef.current = true;
    setReviewBookmarkId(highlightIdFromUrl);

    void (async () => {
      await runOrbitScan(buildScanRequest([highlightIdFromUrl], true));
      setReviewOpen(true);
    })();
  }, [
    highlightIdFromUrl,
    digestIdsFromUrl,
    scan.scanning,
    buildScanRequest,
    runOrbitScan,
  ]);

  const handleRetryScan = useCallback(async () => {
    await runOrbitScan(
      lastScanRequest ?? buildScanRequest(scanTargetIds, scanningSelection)
    );
  }, [
    buildScanRequest,
    lastScanRequest,
    runOrbitScan,
    scanTargetIds,
    scanningSelection,
  ]);

  const handleRescanCurrentSelection = useCallback(async () => {
    await runOrbitScan(buildScanRequest(selectedScanTargetIds, true));
  }, [buildScanRequest, runOrbitScan, selectedScanTargetIds]);

  const handleReviewOpenChange = useCallback((open: boolean) => {
    setReviewOpen(open);
    if (!open) {
      setReviewBookmarkId(null);
      setActiveDigestBookmarkIds(null);
      setFeedbackById({});
    }
  }, []);

  const handleOpenReviewAll = useCallback(() => {
    if (!scan.plan) return;
    setReviewBookmarkId(null);
    setReviewSessionId((current) => current + 1);
    setReviewOpen(true);
  }, [scan.plan]);

  const handleClearScanPlan = useCallback(() => {
    scan.clearPlan();
    setScanContextAtLastRun(null);
    setLastScanRequest(null);
  }, [scan]);

  const handleOpenBookmarkReview = useCallback((bookmarkId: string) => {
    setActiveBookmarkId(bookmarkId);
    setReviewBookmarkId(bookmarkId);
    setReviewSessionId((current) => current + 1);
    setReviewOpen(true);
  }, []);

  const handleApplyReviewedPlan = useCallback(
    async (
      reviewedPlan: OrbitScanPlan,
      opts: { createCollections: boolean; keptBookmarkIds: string[] }
    ) => {
      try {
        const hasMutations = reviewedPlan.suggestions.length > 0;
        const applied = hasMutations
          ? await scan.applyReviewedPlan(reviewedPlan, {
              createCollections: opts.createCollections,
            })
          : null;

        if (hasMutations && !applied) return null;

        for (const bookmarkId of opts.keptBookmarkIds) {
          scan.dismiss(bookmarkId);
        }

        // B: after digest review session, auto-boost kept gems as implicit Good (if no prior feedback)
        if (activeDigestBookmarkIds && opts.keptBookmarkIds.length > 0) {
          for (const id of opts.keptBookmarkIds) {
            if (getHighlightFeedback(id) === null) {
              addLikedHighlightId(id);
            }
          }
        }

        const keptMessage =
          opts.keptBookmarkIds.length > 0
            ? `Kept ${opts.keptBookmarkIds.length} in Orbit`
            : null;
        const appliedMessage = applied
          ? `Applied review · ${formatAppliedToast(applied)}`
          : null;
        const message = [appliedMessage, keptMessage].filter(Boolean).join(" · ");

        if (message) {
          toast.success(message);
        }

        return applied ?? buildNoOpApplyResult(opts.keptBookmarkIds.length);
      } catch {
        // Inline failure state is rendered near the Orbit scan controls.
        return null;
      }
    },
    [scan, activeDigestBookmarkIds]
  );

  const handleKeepInOrbit = useCallback(
    (bookmarkId: string) => {
      scan.dismiss(bookmarkId);
      toast("Keeping this bookmark in Orbit for now.");
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
        // Inline failure state is rendered near the Orbit scan controls.
      }
    },
    [scan]
  );

  const handleApplyStrongMatches = useCallback(async () => {
    try {
      const applied = await scan.applyPlanSubset({ minConfidence: "high" });
      if (applied) {
        toast.success(`Applied strong matches · ${formatAppliedToast(applied)}`);
      } else {
        toast.message("No strong matches left to apply in this pass.");
      }
    } catch {
      // Inline failure state is rendered near the Orbit scan controls.
    }
  }, [scan]);

  const handleSlideInDecision = (id: string, kind: string) => {
    const decision = scan.getDecision(id);
    if (kind === "keep-tag" && decision?.primary) {
      scan.applySuggestion(id, "primary")
        .then((applied) => {
          if (applied) {
            toast.success(`Applied · ${formatAppliedToast(applied)}`);
          }
        })
        .catch(() => {
          handleOpenBookmarkReview(id);
        });
    } else if (kind === "discard") {
      actions.handleDeleteBookmark(id);
    } else if (kind === "dismiss" || kind === "archive") {
      handleKeepInOrbit(id);
    }
    setActiveBookmarkId(null);
  };

  const handleMenuAction = (id: string, action: string) => {
    if (action === "tag") {
      handleBookmarkAddTag(id);
    } else if (action === "collection") {
      handleBookmarkAddToCollection(id);
    } else if (action === "keep") {
      handleKeepInOrbit(id);
      toast.success("Kept in Orbit");
    } else if (action === "discard") {
      actions.handleDeleteBookmark(id);
    } else if (action === "archive") {
      handleKeepInOrbit(id);
      toast.success("Kept in Orbit");
    } else {
      setActiveBookmarkId(id);
    }
    setMenuForId(null);
    setMenuPosition(null);
  };

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
      return `${visible} of ${allQueueCountLabel} ${
        queueSortDirection === "asc" ? "oldest" : "most recent"
      }`;
    }
    return `${visible} on page ${page} · ${allQueueCountLabel} total · ${
      queueSortDirection === "asc" ? "oldest first" : "newest first"
    }`;
  })();

  return (
    <div className="app-shell-bg app-viewport flex overflow-hidden theme-orbital" data-theme="orbital">
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
        <div className="app-main-scroll scrollbar-thin">
          <div className="sticky top-0 z-10">
            <PageHeader
              className="isolate overflow-hidden"
              bodyClassName="relative overflow-hidden"
              title={
                <span className="flex items-center gap-2">
                  <OrbitLogoMark className="size-5" />
                  Orbit
                  <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[9px] text-mono-label text-primary">
                    <span className="size-1.5 rounded-full bg-orbital-glow orbital-nucleus" aria-hidden="true" />
                    LIVE
                  </span>
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
            >
              <OrbitHeaderLogoAccent />
            </PageHeader>
          </div>

          <div className="space-y-4 px-4 pb-6 pt-3 sm:px-5">
            <section className={cn(bookmarkFeedColumnClassName, "pt-1")}>
              <div className="flex flex-col gap-4 border-b border-hairline-soft pb-4">
                <div className="min-w-0">
                  <h1 className="text-base font-semibold text-foreground">
                    Categorize unsorted bookmarks
                  </h1>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                    {scanHelperText}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-hairline-soft pt-2 text-[10px] text-muted-foreground">
                    <span className="text-mono-data">{total} unsorted</span>
                    <span className="text-mono-data">Grok</span>
                  </div>
                </div>

                <div className="flex w-full flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    className="h-9 rounded-lg border-white/80 bg-foreground px-3 text-background shadow-[0_14px_30px_-22px_rgba(59,130,246,0.75)] hover:bg-foreground/90"
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
                      <GrokMark className="size-4" title="Grok" />
                    )}
                    {scanButtonLabel}
                  </Button>

                  {scan.plan ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-9 rounded-lg border-emerald-400/25 bg-emerald-400/10 px-3 text-emerald-100 hover:border-emerald-400/45 hover:bg-emerald-400/15 hover:text-foreground"
                        disabled={scan.applyingBatch || !canApplyStrongMatches}
                        onClick={handleApplyStrongMatches}
                      >
                        {scan.applyingBatch ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <BadgeCheck className="size-4" />
                        )}
                        Apply strong matches
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-9 rounded-lg border-primary/30 bg-primary/10 px-3 text-sky-100 hover:border-primary/50 hover:bg-primary/15 hover:text-foreground"
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
                    </>
                  ) : null}

                  <Link
                    href={
                      resolvedActiveBookmarkId
                        ? `/orbit/map?focus=${resolvedActiveBookmarkId}`
                        : "/orbit/map"
                    }
                    className="inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-white/15 bg-white/[0.045] px-3 text-sm font-medium text-foreground/85 transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-foreground"
                  >
                    <MapIcon className="size-4 text-sky-200" aria-hidden />
                    Open graph
                  </Link>
                </div>

                {scan.error ? (
                  <OrbitScanFailureNotice
                    error={scan.error}
                    retryTargetCount={
                      lastScanRequest?.targetIds.length ?? scanTargetCount
                    }
                    selectionTargetCount={selectedScanTargetIds.length}
                    canRescanCurrentSelection={canRescanCurrentSelection}
                    scanning={scan.scanning}
                    onRetry={handleRetryScan}
                    onRescanCurrentSelection={handleRescanCurrentSelection}
                  />
                ) : null}
              </div>
            </section>

            {scan.plan ? (
              <section className={bookmarkFeedColumnClassName}>
                <OrbitScanOverviewStrip payload={scan.plan} />
              </section>
            ) : null}

            <section className={cn(bookmarkFeedColumnClassName, "flex flex-col gap-3")}>
              {staleScanPlan ? (
                <div
                  role="status"
                  className="flex flex-col gap-3 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <p className="text-sm text-primary/95">
                    This Grok pass was run on a different search, page, or
                    selection. Review or dismiss it before trusting the
                    suggestions.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-9 shrink-0 border-primary/35 bg-primary/10 text-primary hover:bg-primary/20"
                    onClick={handleClearScanPlan}
                  >
                    Dismiss plan
                  </Button>
                </div>
              ) : null}

              <QueueHeader
                orbitView={orbitView}
                total={total}
                sortDirection={queueSortDirection}
                onChangeView={handleOrbitViewChange}
                onChangeSortDirection={handleQueueSortDirectionChange}
                viewMode={viewMode}
                onChangeViewMode={setViewMode}
                selectionMode={selectionMode}
                canSelect={total > 0}
                onToggleSelectionMode={toggleSelectionMode}
              />

              {selectionMode && selectedBookmarkIds.size > 0 && (
                <div className="sticky top-[calc(var(--header-height)+8px)] z-[8] flex flex-wrap items-center gap-2 rounded-[18px] border border-white/10 bg-[linear-gradient(180deg,rgba(10,15,29,0.95),rgba(15,23,42,0.92))] px-4 py-2.5 shadow-xl backdrop-blur-md sm:px-5 glass-orbital">
                  <span className="text-xs font-medium text-white/80 text-mono-label">
                    {selectedBookmarkIds.size} selected
                  </span>
                  <div className="ml-auto flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 border-primary/20 bg-primary/10 text-primary hover:bg-primary/15"
                      onClick={handleScan}
                      disabled={scan.scanning || scanTargetIds.length === 0}
                    >
                      {scan.scanning ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <GrokMark className="size-3.5" title="Grok" />
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
                    <span className="text-mono-data">{visibleStatusLabel}</span>
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
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className={cn(orbital.label, "mb-2 text-primary/70")}>Something went wrong</div>
                  <p className="mb-4 text-sm text-primary/60">
                    {error instanceof Error ? error.message : "Please try again."}
                  </p>
                  <button
                    onClick={() => refetch()}
                    className="rounded-sm border border-primary/30 px-3 py-1 text-xs text-primary hover:bg-primary/5"
                  >
                    Retry
                  </button>
                </div>
              ) : bookmarks.length === 0 ? (
                <QueueEmptyState
                  searching={Boolean(search.trim())}
                  onClearSearch={() => handleSearchChange("")}
                  onOpenBookmarks={() => router.push("/dashboard")}
                />
              ) : (
                <>
                  <div className="flex flex-col gap-3">
                  {/* Note: list stays full-width; slide-in panel is a fixed overlay from the right (new model) */}
                  {/* Left column — the triage queue */}
                  <div className="min-w-0 flex-1">
                    {/* Elegant queue header — restrained, matches the artboard spirit */}
                    <div className="mb-2 flex items-center justify-between border-b border-hairline-soft pb-2 px-1">
                      <div className="flex items-center gap-2">
                        <span className={cn(orbital.label, "text-primary/65")}>FRESH QUEUE</span>
                        <span className="text-[11px] text-primary/35">·</span>
                        <span className={cn(orbital.data, "text-[10.5px] text-primary/55")}>{total} bookmarks</span>
                        <span className="ml-1 rounded-full border border-primary/20 bg-primary/5 px-1.5 py-px text-[9px] text-primary/60">90d</span>
                      </div>
                      <div className={cn(orbital.label, "text-primary/45 text-[9.5px]")}>
                        {queueOrderLabel.toUpperCase()}
                      </div>
                    </div>

                    <OrbitList
                      bookmarks={bookmarks}
                      selectedId={resolvedActiveBookmarkId}
                      isLoading={isLoading}
                      onSelect={(id) => {
                        setActiveBookmarkId(id);
                        if (menuForId) {
                          setMenuForId(null);
                          setMenuPosition(null);
                        }
                      }}
                      onQuickAction={(id, action, event) => {
                        if (action === "keep") {
                          handleKeepInOrbit(id);
                          setActiveBookmarkId(null);
                          toast.success("Kept in Orbit");
                        } else if (action === "tag") {
                          handleBookmarkAddTag(id);
                        } else if (action === "review") {
                          handleOpenBookmarkReview(id);
                        } else if (action === "menu" && event) {
                          const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
                          setMenuForId(id);
                          setMenuPosition({
                            x: rect.right + 8,
                            y: rect.top,
                          });
                        } else {
                          setActiveBookmarkId(id);
                        }
                      }}
                    />

                    {orbitView === "all" &&
                      totalPages > 1 &&
                      bookmarks.length > 0 && (
                        <Pagination
                          page={page}
                          totalPages={totalPages}
                          onChange={handlePageChange}
                        />
                      )}
                  </div>
                </div>

                {/* Simple floating contextual menu (positioned from the row's ⋯ button) */}
                {menuForId && menuPosition && (
                  <div
                    className="fixed z-50"
                    style={{
                      left: `${menuPosition.x}px`,
                      top: `${menuPosition.y}px`,
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <OrbitContextualMenu
                      bookmarkId={menuForId}
                      onAction={handleMenuAction}
                      onClose={() => {
                        setMenuForId(null);
                        setMenuPosition(null);
                      }}
                    />
                  </div>
                )}

                {/* Elegant slide-in review panel — simple, fast, premium feel */}
                <OrbitSlideInPanel
                  bookmark={activeBookmark}
                  isOpen={!!activeBookmarkId && !!activeBookmark}
                  onClose={() => setActiveBookmarkId(null)}
                  decision={activeDecision}
                  onFullReview={(id) => handleOpenBookmarkReview(id)}
                  onDecision={handleSlideInDecision}
                />
                </>
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
        // Phase 2: Pass the set of bookmarks that came from a Highlights Digest
        digestBookmarkIds={activeDigestBookmarkIds}
        feedbackById={feedbackById}
      />
    </div>
  );
}

function formatRetryAfter(seconds: number | undefined) {
  if (!seconds) return null;
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.ceil(seconds / 60);
  return `${minutes}m`;
}

function getScanFailurePresentation(error: OrbitScanFailure): {
  Icon: ElementType<{ className?: string }>;
  label: string;
  badgeClassName: string;
  panelClassName: string;
  iconClassName: string;
  helper: string;
} {
  const retryAfter = formatRetryAfter(error.retryAfterSeconds);

  switch (error.kind) {
    case "auth":
      return {
        Icon: KeyRound,
        label: "Auth",
        badgeClassName: "border-amber-300/30 bg-amber-300/10 text-amber-100",
        panelClassName: "border-amber-300/25 bg-amber-300/10",
        iconClassName: "text-amber-200",
        helper: "Check the server xAI key and model access, then retry.",
      };
    case "model":
      return {
        Icon: OrbitLogoMark,
        label: "Model",
        badgeClassName: "border-sky-300/30 bg-sky-300/10 text-sky-100",
        panelClassName: "border-sky-300/25 bg-sky-300/10",
        iconClassName: "text-sky-200",
        helper: "Update XAI_ORBIT_MODEL or enable the configured model for this key.",
      };
    case "rate-limit":
      return {
        Icon: Gauge,
        label: "Rate limit",
        badgeClassName: "border-orange-300/30 bg-orange-300/10 text-orange-100",
        panelClassName: "border-orange-300/25 bg-orange-300/10",
        iconClassName: "text-orange-200",
        helper: retryAfter
          ? `xAI asked MarkMaster to wait about ${retryAfter}. A smaller selected pass may clear sooner.`
          : "xAI asked MarkMaster to slow down. A smaller selected pass may clear sooner.",
      };
    case "request":
      return {
        Icon: AlertTriangle,
        label: "Request",
        badgeClassName: "border-white/20 bg-white/[0.08] text-white/80",
        panelClassName: "border-white/14 bg-white/[0.055]",
        iconClassName: "text-white/75",
        helper: "Refresh the page scope or scan a selected subset.",
      };
    case "provider":
    case "unknown":
    default:
      return {
        Icon: AlertTriangle,
        label: "Provider",
        badgeClassName: "border-rose-300/30 bg-rose-300/10 text-rose-100",
        panelClassName: "border-rose-300/25 bg-rose-300/10",
        iconClassName: "text-rose-200",
        helper: "Retry the pass, or scan a smaller selected set while xAI recovers.",
      };
  }
}

function OrbitScanFailureNotice({
  error,
  retryTargetCount,
  selectionTargetCount,
  canRescanCurrentSelection,
  scanning,
  onRetry,
  onRescanCurrentSelection,
}: {
  error: OrbitScanFailure;
  retryTargetCount: number;
  selectionTargetCount: number;
  canRescanCurrentSelection: boolean;
  scanning: boolean;
  onRetry: () => void;
  onRescanCurrentSelection: () => void;
}) {
  const presentation = getScanFailurePresentation(error);
  const Icon = presentation.Icon;

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col gap-3 rounded-2xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
        presentation.panelClassName
      )}
    >
      <div className="flex min-w-0 gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border border-white/12 bg-black/15">
          <Icon className={cn("size-4", presentation.iconClassName)} />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                orbital.label,
                "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.2em]",
                presentation.badgeClassName
              )}
            >
              {presentation.label}
            </span>
            <p className="text-sm font-semibold text-white">{error.title}</p>
          </div>
          <p className="mt-1 text-sm leading-6 text-white/80">{error.message}</p>
          <p className="mt-1 text-xs leading-5 text-white/58">
            {presentation.helper}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-9 rounded-lg border-white/20 bg-white/[0.08] text-white hover:bg-white/[0.12]"
          disabled={scanning || retryTargetCount === 0}
          onClick={onRetry}
        >
          {scanning ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          Retry last scan
        </Button>

        {error.recoveryHref ? (
          <Link
            href={error.recoveryHref}
            className={cn(
              buttonVariants({ size: "sm", variant: "outline" }),
              "h-9 rounded-lg border-white/25 bg-white/[0.08] text-white hover:bg-white/[0.12]"
            )}
          >
            <Settings2 className="size-3.5" />
            {error.recoveryLabel ?? "Open Settings"}
          </Link>
        ) : null}

        {canRescanCurrentSelection ? (
          <Button
            type="button"
            size="sm"
            className="h-9 rounded-lg bg-white text-slate-950 hover:bg-white/90"
            disabled={scanning || selectionTargetCount === 0}
            onClick={onRescanCurrentSelection}
          >
            {scanning ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <GrokMark className="size-3.5" title="Grok" />
            )}
            Rescan selection
          </Button>
        ) : null}
      </div>
    </div>
  );
}

interface QueueHeaderProps {
  orbitView: OrbitView;
  total: number;
  sortDirection: OrbitSortDirection;
  viewMode: ViewMode;
  onChangeView: (view: OrbitView) => void;
  onChangeSortDirection: (direction: OrbitSortDirection) => void;
  onChangeViewMode: (mode: ViewMode) => void;
  selectionMode: boolean;
  canSelect: boolean;
  onToggleSelectionMode: () => void;
}

function QueueHeader({
  orbitView,
  total,
  sortDirection,
  viewMode,
  onChangeView,
  onChangeSortDirection,
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
            <p className="text-mono-label text-white/55">
              Orbit queue
            </p>
            <p className="mt-1 text-sm font-semibold text-white">
              {orbitView === "recent"
                ? sortDirection === "asc"
                  ? "Oldest bookmarks still in orbit"
                  : "Freshest bookmarks still in orbit"
                : sortDirection === "asc"
                  ? "All unsorted bookmarks, oldest first"
                  : "All unsorted bookmarks, newest first"}
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
                    {Math.min(total, ORBIT_RECENT_PAGE_SIZE).toLocaleString()}
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

              <div className="inline-flex items-center gap-1 rounded-xl border border-hairline-soft bg-surface-2/70 p-1 shadow-sm">
                <button
                  type="button"
                  aria-pressed={sortDirection === "desc"}
                  onClick={() => onChangeSortDirection("desc")}
                  className={cn(
                    "inline-flex h-8 items-center rounded-lg px-3 text-xs font-medium transition-colors",
                    sortDirection === "desc"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Newest
                </button>
                <button
                  type="button"
                  aria-pressed={sortDirection === "asc"}
                  onClick={() => onChangeSortDirection("asc")}
                  className={cn(
                    "inline-flex h-8 items-center rounded-lg px-3 text-xs font-medium transition-colors",
                    sortDirection === "asc"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Oldest
                </button>
              </div>

              <button
                type="button"
                aria-pressed={selectionMode}
                onClick={onToggleSelectionMode}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors",
                  selectionMode
                    ? "bg-sky-500/15 text-sky-200 hover:bg-sky-500/25"
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
      <OrbitLogoMark className="mx-auto mb-4 size-8" />
      <p className="text-base font-semibold text-foreground">
        {searching ? "No matches in Orbit" : "Orbit is clear"}
      </p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        {searching
          ? "Try a different term or clear the query."
          : "Library organized. Highlights will surface the next standouts for Orbit review."}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {searching ? (
          <Button
            size="sm"
            variant="outline"
            className="rounded-lg"
            onClick={onClearSearch}
          >
            Clear search
          </Button>
        ) : (
          <>
            <Link
              href="/orbit/map"
              className={cn(buttonVariants({ size: "sm" }), "rounded-lg")}
            >
              <MapIcon className="size-3.5" aria-hidden />
              Inspect graph
            </Link>
            <Button
              size="sm"
              variant="outline"
              className="rounded-lg"
              onClick={onOpenBookmarks}
            >
              Search bookmarks
            </Button>
            <Link
              href="/collections"
              className={cn(
                buttonVariants({ size: "sm", variant: "outline" }),
                "rounded-lg"
              )}
            >
              Open collections
            </Link>
          </>
        )}
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
