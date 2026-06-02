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
  AlertTriangle,
  Folder,
  Gauge,
  KeyRound,
  Loader2,
  Map as MapIcon,
  RefreshCw,
  Settings2,
  TagIcon,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { RetryButton } from "@/components/ui/retry-button";
import { PaginationControls } from "@/components/pagination-controls";
import { GrokMark } from "@/components/brands/grok-mark";
import { OrbitLogoMark } from "@/components/brands/orbit-logo-mark";
import { SearchBar } from "@/components/search-bar";
import { Sidebar } from "@/components/sidebar-dynamic";
import { MobileSidebar } from "@/components/mobile-sidebar";
import { PageHeader } from "@/components/page-header";
import { UserNavDynamic } from "@/components/user-nav-dynamic";
import { KeyboardShortcutsHelpButton } from "@/components/keyboard-shortcuts-help-button";
const OrbitReviewDialog = dynamic(
  () =>
    import("@/components/orbit/orbit-review-dialog").then((m) => m.OrbitReviewDialog),
  { ssr: false }
);
import { OrbitScanOverviewStrip } from "@/components/orbit/orbit-scan-overview-strip";
import { OrbitQueueToolbar } from "@/components/orbit/orbit-queue-toolbar";
import { OrbitScanHero } from "@/components/orbit/orbit-scan-hero";
import { OrbitTriageHint } from "@/components/orbit/orbit-triage-hint";

// New clean-list + slide-in + overlays components (new Orbit model)
import { OrbitList } from "@/components/orbit/orbit-list";
import { OrbitContextualMenu } from "@/components/orbit/orbit-quick-actions";

import { orbital } from "@/components/orbital";
import { useOrbitalTheme } from "@/components/providers";
import {
  clampMenuPosition,
  orbitBannerClass,
  orbitControlRadius,
  orbitDataClass,
  orbitGhostButtonClass,
  orbitHairlineBorder,
  orbitLabelClass,
  orbitMetaMuted,
  orbitSelectionBarClass,
  orbitShellClass,
} from "@/lib/orbit-route-chrome";
import { appContentGutterClassName } from "@/lib/app-chrome";
import { useBookmarkActions } from "@/hooks/use-bookmark-actions";
import { useCreateCollection } from "@/hooks/use-create-collection";
import { useCollectionsQuery, useTagsQuery } from "@/hooks/use-library-data";
import {
  scrollDataElementIntoView,
  useSurfaceKeyboardShortcuts,
  type KeyboardShortcutGroup,
} from "@/hooks/use-keyboard-shortcuts";
import { useOrbitScan, type OrbitScanFailure } from "@/hooks/use-orbit-scan";
import { addLikedHighlightId, getHighlightFeedback } from "@/lib/highlight-feedback";
import { trackFlywheelEvent } from "@/lib/flywheel";
import { bookmarkFeedColumnClassName } from "@/lib/bookmark-feed-layout";
import { getBookmarkTweetUrl, openBookmarkOnX } from "@/lib/bookmark-url";
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
import { cn } from "@/lib/utils";
import type { DbUser } from "@/lib/auth";
import type {
  BookmarkWithRelations,
  OrbitApplyResult,
  OrbitScanPlan,
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

const ORBIT_SHORTCUT_GROUPS: KeyboardShortcutGroup[] = [
  {
    title: "Queue Navigation",
    shortcuts: [
      { id: "next", keys: ["J", "ArrowDown"], label: "Next queue item" },
      { id: "previous", keys: ["K", "ArrowUp"], label: "Previous queue item" },
      { id: "search", keys: ["/"], label: "Search Orbit" },
      { id: "shortcuts", keys: ["?"], label: "Keyboard shortcuts" },
    ],
  },
  {
    title: "Orbit Actions",
    shortcuts: [
      { id: "scan", keys: ["G"], label: "Run Grok scan" },
      { id: "review", keys: ["V"], label: "Open Review pass" },
      { id: "tag", keys: ["T"], label: "Add tag to selected item" },
      { id: "collection", keys: ["C"], label: "Add selected item to collection" },
    ],
  },
];

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

function OrbitHeaderLogoAccent() {
  return (
    <div
      className="pointer-events-none absolute right-16 top-3 z-0 hidden w-[240px] sm:block"
      aria-hidden
    >
      {/* Fixed-height anchor so dismissible content below (triage hint) does not shift vertical center. */}
      <div className="relative h-[4.75rem] w-full overflow-hidden">
        <div className="absolute right-3 top-1/2 size-28 -translate-y-1/2 rounded-full bg-primary/15 blur-2xl" />
        <OrbitLogoMark className="absolute right-0 top-1/2 size-28 -translate-y-1/2 opacity-[0.12]" />
        <OrbitLogoMark className="absolute right-12 top-1/2 size-16 -translate-y-1/2 opacity-80 drop-shadow-[0_0_22px_rgba(37,99,235,0.42)]" />
      </div>
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

const OrbitBookmarkOverlay = dynamic(
  () =>
    import("@/components/orbit/orbit-bookmark-overlay").then(
      (m) => m.OrbitBookmarkOverlay
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
  const { isOrbital } = useOrbitalTheme();

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
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [page, setPage] = useState(orbitUrlState.page);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [collectionDialogOpen, setCollectionDialogOpen] = useState(false);
  const [createCollectionOpen, setCreateCollectionOpen] = useState(false);
  const [keyboardShortcutsOpen, setKeyboardShortcutsOpen] = useState(false);
  const [tagTargetIds, setTagTargetIds] = useState<string[]>([]);
  const [collectionTargetIds, setCollectionTargetIds] = useState<string[]>([]);
  const [activeBookmarkId, setActiveBookmarkId] = useState<string | null>(null);
  const [menuForId, setMenuForId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [appliedBookmarkIds, setAppliedBookmarkIds] = useState<Set<string>>(
    () => new Set()
  );
  const [selectionMode, setSelectionMode] = useState(false);

  // Simple click-outside + Esc for the floating menu (keeps things lightweight)
  useEffect(() => {
    if (!menuForId) return;

    const handleClickOutside = () => {
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
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  const isEditableTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      target.isContentEditable ||
      target.closest("[contenteditable='true']") !== null
    );
  };

  // Escape closes transient queue UI. J/K and arrow navigation use the shared shortcut hook.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;

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
  }, [activeBookmarkId, menuForId]);

  useEffect(() => {
    if (!resolvedActiveBookmarkId) return;
    const row = document.querySelector(
      `[data-orbit-row-id="${resolvedActiveBookmarkId}"]`
    );
    row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [resolvedActiveBookmarkId]);

  const activeDecision = activeBookmark ? scan.getDecision(activeBookmark.id) : null;
  const orbitOverlayOpen =
    !!activeBookmarkId &&
    !!activeBookmark &&
    !selectionMode &&
    !tagDialogOpen &&
    !collectionDialogOpen &&
    !reviewOpen;

  const selectOrbitBookmarkByOffset = useCallback(
    (offset: -1 | 1) => {
      if (bookmarks.length === 0) return;
      const currentIndex = bookmarks.findIndex(
        (bookmark) => bookmark.id === resolvedActiveBookmarkId
      );
      const nextIndex =
        currentIndex === -1
          ? 0
          : Math.max(0, Math.min(bookmarks.length - 1, currentIndex + offset));
      const nextId = bookmarks[nextIndex]?.id;
      if (!nextId) return;
      setActiveBookmarkId(nextId);
      requestAnimationFrame(() =>
        scrollDataElementIntoView("data-orbit-row-id", nextId)
      );
    },
    [bookmarks, resolvedActiveBookmarkId]
  );

  const orbitMapHref = useMemo(() => {
    if (!resolvedActiveBookmarkId) return "/orbit/map?scope=orbit";
    const params = new URLSearchParams({
      focus: resolvedActiveBookmarkId,
      scope: "orbit",
    });
    const decision = scan.getDecision(resolvedActiveBookmarkId);
    const primary = decision?.primary;
    if (primary?.kind === "tag") {
      const tag = tags.find((t) => t.name === primary.label);
      if (tag) params.set("anchor", tag.id);
    } else if (primary?.kind === "collection") {
      const collection = collections.find((c) => c.name === primary.label);
      if (collection) params.set("anchor", collection.id);
    }
    return `/orbit/map?${params.toString()}`;
  }, [collections, resolvedActiveBookmarkId, scan, tags]);

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
    void invalidateLibraryQueries(queryClient, { refetchType: "all" });
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

    queueMicrotask(() => {
      trackFlywheelEvent("digest.session_start", sessionStartPayload);
      setActiveDigestBookmarkIds(ids);
      setReviewBookmarkId(ids[0]);
      void (async () => {
        await runOrbitScan(buildScanRequest(ids, true));
        setReviewOpen(true);
      })();
    });
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

    queueMicrotask(() => {
      setReviewBookmarkId(highlightIdFromUrl);
      void (async () => {
        await runOrbitScan(buildScanRequest([highlightIdFromUrl], true));
        setReviewOpen(true);
      })();
    });
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

  const handleOpenBookmarkReview = useCallback(
    (bookmarkId: string) => {
      if (!scan.plan) {
        toast.message("Run a scan first to open Review pass.");
        return;
      }
      setActiveBookmarkId(bookmarkId);
      setReviewBookmarkId(bookmarkId);
      setReviewSessionId((current) => current + 1);
      setReviewOpen(true);
    },
    [scan.plan]
  );

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
      const wasDismissed = scan.dismissedBookmarkIds.has(bookmarkId);
      scan.toggleDismiss(bookmarkId);
      if (wasDismissed) {
        toast.success("Grok suggestion restored for this bookmark.");
        return true;
      }
      toast("Kept in Orbit for this pass.");
      return false;
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
            setAppliedBookmarkIds((current) => {
              const next = new Set(current);
              next.add(id);
              return next;
            });
            toast.success(`Applied · ${formatAppliedToast(applied)}`);
          }
        })
        .catch(() => {
          handleOpenBookmarkReview(id);
        });
    } else if (kind === "discard") {
      actions.handleDeleteBookmark(id);
    } else if (kind === "dismiss" || kind === "archive") {
      const restored = handleKeepInOrbit(id);
      if (!restored) setActiveBookmarkId(null);
      return;
    }
    setActiveBookmarkId(null);
  };

  const handleMenuAction = (id: string, action: string) => {
    const bookmark = bookmarks.find((b) => b.id === id);
    const tweetUrl = bookmark ? getBookmarkTweetUrl(bookmark) : undefined;

    if (action === "open-x" && bookmark) {
      openBookmarkOnX(bookmark);
    } else if (action === "copy-link" && tweetUrl) {
      void navigator.clipboard.writeText(tweetUrl).then(
        () => toast.success("Link copied"),
        () => toast.error("Could not copy link")
      );
    } else if (action === "tag") {
      handleBookmarkAddTag(id);
    } else if (action === "collection") {
      handleBookmarkAddToCollection(id);
    } else if (action === "keep") {
      handleKeepInOrbit(id);
    } else if (action === "discard") {
      actions.handleDeleteBookmark(id);
    } else if (action === "archive") {
      handleKeepInOrbit(id);
    } else {
      setActiveBookmarkId(id);
    }
    setMenuForId(null);
    setMenuPosition(null);
  };

  const handleSelectAllOnPage = useCallback(() => {
    setSelectedBookmarkIds(new Set(bookmarks.map((b) => b.id)));
  }, [bookmarks]);

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

  useSurfaceKeyboardShortcuts({
    shortcutGroups: ORBIT_SHORTCUT_GROUPS,
    actions: {
      next: () => selectOrbitBookmarkByOffset(1),
      previous: () => selectOrbitBookmarkByOffset(-1),
      search: () => searchInputRef.current?.focus(),
      shortcuts: () => setKeyboardShortcutsOpen(true),
      scan: () => {
        if (!scan.scanning && scanTargetIds.length > 0) {
          void handleScan();
        }
      },
      review: () => {
        if (scan.plan) handleOpenReviewAll();
      },
      tag: () => {
        if (activeBookmark) handleBookmarkAddTag(activeBookmark.id);
      },
      collection: () => {
        if (activeBookmark) handleBookmarkAddToCollection(activeBookmark.id);
      },
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
        <div className="app-main-scroll scrollbar-thin">
          <PageHeader
            sticky
            className="isolate overflow-hidden"
            bodyClassName="relative overflow-hidden"
            title={
              <span className="flex items-center gap-2">
                <OrbitLogoMark className="size-5" />
                Orbit
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[9px] text-mono-label text-primary"
                  aria-live="polite"
                >
                  {total > 0 ? `${total.toLocaleString()} waiting` : "Queue clear"}
                </span>
              </span>
            }
            description={scanHelperText}
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
              <>
                <KeyboardShortcutsHelpButton
                  open={keyboardShortcutsOpen}
                  onOpenChange={setKeyboardShortcutsOpen}
                  groups={ORBIT_SHORTCUT_GROUPS}
                  description="Orbit queue navigation and review actions."
                />
                {dbUser ? <UserNavDynamic user={dbUser} /> : null}
              </>
            }
          >
            <OrbitHeaderLogoAccent />
            <div
              className={cn(
                "mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-2 text-[10px]",
                orbitHairlineBorder(isOrbital),
                orbitMetaMuted(isOrbital)
              )}
            >
              <span className={orbitDataClass(isOrbital)}>{total} unsorted</span>
              <span className={orbitDataClass(isOrbital)}>Grok</span>
            </div>
            <OrbitTriageHint className="mt-2" />
          </PageHeader>

          <div className={cn(appContentGutterClassName, "space-y-4 pb-6 pt-4")}>
            <section className={cn(bookmarkFeedColumnClassName, "pt-1")}>
              <OrbitScanHero
                scanButtonLabel={scanButtonLabel}
                queueIsLoading={queueIsLoading}
                scanning={scan.scanning}
                scanTargetCount={scanTargetIds.length}
                hasScanPlan={!!scan.plan}
                applyingBatch={scan.applyingBatch}
                canApplyStrongMatches={canApplyStrongMatches}
                mapHref={orbitMapHref}
                onScan={handleScan}
                onApplyStrongMatches={handleApplyStrongMatches}
                onReviewPass={handleOpenReviewAll}
                queueToolbar={
                  <OrbitQueueToolbar
                    orbitView={orbitView}
                    total={total}
                    sortDirection={queueSortDirection}
                    queueOrderLabel={queueOrderLabel}
                    onChangeView={handleOrbitViewChange}
                    onChangeSortDirection={handleQueueSortDirectionChange}
                    selectionMode={selectionMode}
                    canSelect={total > 0}
                    onToggleSelectionMode={toggleSelectionMode}
                  />
                }
                scanError={
                  scan.error ? (
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
                ) : null
                }
              />

              {scan.plan ? (
                <OrbitScanOverviewStrip payload={scan.plan} className="mt-4" />
              ) : null}
            </section>

            <section className={cn(bookmarkFeedColumnClassName, "flex flex-col gap-3")}>
              {staleScanPlan ? (
                <div
                  role="status"
                  className={cn(
                    "flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
                    orbitBannerClass(isOrbital)
                  )}
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

              {selectionMode && selectedBookmarkIds.size > 0 && (
                <div
                  className={cn(
                    "sticky top-[calc(var(--header-height)+8px)] z-[var(--z-sticky-subbar)] flex flex-wrap items-center gap-2 px-4 py-2.5 sm:px-5",
                    orbitSelectionBarClass(isOrbital)
                  )}
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span
                      className={cn(
                        orbitLabelClass(isOrbital),
                        isOrbital
                          ? "text-primary/80"
                          : "text-foreground/80 dark:text-white/80"
                      )}
                    >
                      {selectedBookmarkIds.size} selected
                    </span>
                    {hasSelectionOverflow ? (
                      <span
                        className={cn(
                          "text-[10px]",
                          isOrbital
                            ? "text-amber-300/90"
                            : "text-amber-700 dark:text-amber-200/90"
                        )}
                      >
                        Grok will process the first{" "}
                        {ORBIT_GROK_MAX_BOOKMARKS_PER_SCAN} selected.
                      </span>
                    ) : null}
                  </div>
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className={cn(
                        "h-8 text-xs",
                        isOrbital
                          ? "text-primary/70 hover:text-primary"
                          : "text-muted-foreground hover:text-foreground dark:text-white/60 dark:hover:text-white"
                      )}
                      onClick={handleSelectAllOnPage}
                      disabled={bookmarks.length === 0}
                    >
                      Select all on page
                    </Button>
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
                      className={cn("h-8 gap-1.5", orbitGhostButtonClass(isOrbital))}
                      onClick={handleBulkAddTag}
                    >
                      <TagIcon className="size-3.5" />
                      Tag
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className={cn("h-8 gap-1.5", orbitGhostButtonClass(isOrbital))}
                      onClick={handleBulkAddToCollection}
                    >
                      <Folder className="size-3.5" />
                      Collect
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 gap-1.5 text-muted-foreground hover:text-destructive"
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
                  <div
                    className={cn(
                      "overflow-hidden rounded-sm border",
                      orbitHairlineBorder(isOrbital),
                      isOrbital ? "glass-orbital" : "bg-surface-1/70 dark:bg-white/[0.035]"
                    )}
                  >
                    <div className="relative w-full overflow-hidden border-b border-hairline-soft">
                      <SearchBar
                        ref={searchInputRef}
                        glass
                        value={search}
                        onChange={handleSearchChange}
                        placeholder="Search Orbit by author, text, or notes…"
                        inputClassName="h-10 rounded-none"
                      />
                    </div>

                    <div
                      className={cn(
                        "flex items-center justify-between gap-3 px-3 py-2 text-[11px]",
                        orbitMetaMuted(isOrbital)
                      )}
                    >
                      <span className="text-mono-data">{visibleStatusLabel}</span>
                      {(isFetching || isSearchPending) && !isLoading && (
                        <span className="flex shrink-0 items-center gap-1">
                          <Loader2 className="size-3 animate-spin" /> Updating…
                        </span>
                      )}
                    </div>
                  </div>
                </>
              )}

              {isError ? (
                <ErrorState
                  layout="panel"
                  title="Orbit could not be loaded"
                  description={
                    error instanceof Error ? error.message : "Please try again."
                  }
                  action={<RetryButton onClick={() => void refetch()} />}
                />
              ) : isLoading ? (
                <OrbitList
                  bookmarks={[]}
                  isLoading
                  selectionMode={selectionMode}
                  selectedIds={selectedBookmarkIds}
                  getDecision={scan.getDecision}
                  dismissedBookmarkIds={scan.dismissedBookmarkIds}
                  appliedBookmarkIds={appliedBookmarkIds}
                />
              ) : bookmarks.length === 0 ? (
                <EmptyState
                  layout="inline"
                  leading={<OrbitLogoMark className="mx-auto mb-4 size-8" />}
                  title={search.trim() ? "No matches in Orbit" : "Orbit is clear"}
                  description={
                    search.trim()
                      ? "Try a different term or clear the query."
                      : "Library organized. Highlights will surface the next standouts for Orbit review."
                  }
                  action={
                    search.trim() ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className={orbitControlRadius(isOrbital)}
                        onClick={() => handleSearchChange("")}
                      >
                        Clear search
                      </Button>
                    ) : (
                      <div className="flex flex-wrap justify-center gap-2">
                        <Link
                          href="/orbit/map"
                          className={cn(
                            buttonVariants({ size: "sm" }),
                            orbitControlRadius(isOrbital)
                          )}
                        >
                          <MapIcon className="size-3.5" aria-hidden />
                          Inspect graph
                        </Link>
                        <Button
                          size="sm"
                          variant="outline"
                          className={orbitControlRadius(isOrbital)}
                          onClick={() => router.push("/dashboard")}
                        >
                          Search bookmarks
                        </Button>
                        <Link
                          href="/collections"
                          className={cn(
                            buttonVariants({ size: "sm", variant: "outline" }),
                            orbitControlRadius(isOrbital)
                          )}
                        >
                          Open collections
                        </Link>
                      </div>
                    )
                  }
                />
              ) : (
                <>
                  <div className="flex flex-col gap-3">
                  {/* Note: list stays full-width; slide-in panel is a fixed overlay from the right (new model) */}
                  {/* Left column — the triage queue */}
                  <div className="min-w-0 flex-1">
                    <OrbitList
                      bookmarks={bookmarks}
                      selectedId={resolvedActiveBookmarkId}
                      isLoading={isLoading}
                      selectionMode={selectionMode}
                      selectedIds={selectedBookmarkIds}
                      getDecision={scan.getDecision}
                      dismissedBookmarkIds={scan.dismissedBookmarkIds}
                      appliedBookmarkIds={appliedBookmarkIds}
                      onToggleSelect={(id) =>
                        handleSelectionChange(id, !selectedBookmarkIds.has(id))
                      }
                      onSelect={(id) => {
                        setActiveBookmarkId(id);
                        if (menuForId) {
                          setMenuForId(null);
                          setMenuPosition(null);
                        }
                      }}
                      onQuickAction={(id, action, event) => {
                        if (action === "keep") {
                          const wasDismissed = scan.dismissedBookmarkIds.has(id);
                          handleKeepInOrbit(id);
                          if (!wasDismissed) setActiveBookmarkId(null);
                        } else if (action === "tag") {
                          handleBookmarkAddTag(id);
                        } else if (action === "menu" && event) {
                          const rect = (
                            event.currentTarget as HTMLElement
                          ).getBoundingClientRect();
                          const raw = { x: rect.right + 8, y: rect.top };
                          setMenuForId(id);
                          setMenuPosition(clampMenuPosition(raw.x, raw.y));
                        } else {
                          setActiveBookmarkId(id);
                        }
                      }}
                    />

                    {orbitView === "all" &&
                      totalPages > 1 &&
                      bookmarks.length > 0 && (
                        <PaginationControls
                          variant="orbit"
                          page={page}
                          totalPages={totalPages}
                          onPageChange={handlePageChange}
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

                {/* Expanded Orbit review overlay */}
                {orbitOverlayOpen ? (
                  <OrbitBookmarkOverlay
                    bookmark={activeBookmark}
                    open
                    onOpenChange={(open) => {
                      if (!open) setActiveBookmarkId(null);
                    }}
                    decision={activeDecision}
                    suggestionDismissed={scan.dismissedBookmarkIds.has(activeBookmark.id)}
                    onFullReview={(id) => handleOpenBookmarkReview(id)}
                    onDecision={handleSlideInDecision}
                    onAddTag={handleBookmarkAddTag}
                    onAddToCollection={handleBookmarkAddToCollection}
                    showFullReview={!!scan.plan}
                  />
                ) : null}
                </>
              )}
            </section>
          </div>
        </div>
      </div>

      {tagDialogOpen ? (
        <AddTagDialog
          open
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
      ) : null}

      {collectionDialogOpen ? (
        <AddToCollectionDialog
          open
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
      ) : null}

      {createCollectionOpen ? (
        <CreateCollectionDialog
          open
          onOpenChange={setCreateCollectionOpen}
          onCreateCollection={createCollection}
        />
      ) : null}

      {reviewOpen ? (
        <OrbitReviewDialog
          open
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
      ) : null}
    </div>
  );
}

function formatRetryAfter(seconds: number | undefined) {
  if (!seconds) return null;
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.ceil(seconds / 60);
  return `${minutes}m`;
}

function getScanFailurePresentation(error: OrbitScanFailure, isOrbital: boolean): {
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
        badgeClassName: isOrbital
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-sky-300/30 bg-sky-300/10 text-sky-100",
        panelClassName: isOrbital
          ? "border-primary/25 bg-primary/10"
          : "border-sky-300/25 bg-sky-300/10",
        iconClassName: isOrbital ? "text-primary" : "text-sky-200",
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
        badgeClassName: isOrbital
          ? "border-hairline-soft bg-surface-2/80 text-foreground/80"
          : "border-hairline-soft bg-surface-2/80 text-foreground/80 dark:border-white/20 dark:bg-white/[0.08] dark:text-white/80",
        panelClassName: isOrbital
          ? "border-hairline-soft bg-surface-2/60"
          : "border-hairline-soft bg-surface-2/60 dark:border-white/14 dark:bg-white/[0.055]",
        iconClassName: isOrbital
          ? "text-muted-foreground"
          : "text-muted-foreground dark:text-white/75",
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
  const { isOrbital } = useOrbitalTheme();
  const presentation = getScanFailurePresentation(error, isOrbital);
  const Icon = presentation.Icon;

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col gap-3 rounded-sm border px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
        presentation.panelClassName
      )}
    >
      <div className="flex min-w-0 gap-3">
        <div
          className={cn(
            "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border",
            isOrbital
              ? "border-hairline-soft bg-surface-2/80"
              : "border-hairline-soft bg-surface-2/80 dark:border-white/12 dark:bg-black/15"
          )}
        >
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
            <p
              className={cn(
                "text-sm font-semibold",
                isOrbital ? "text-foreground" : "text-foreground dark:text-white"
              )}
            >
              {error.title}
            </p>
          </div>
          <p
            className={cn(
              "mt-1 text-sm leading-6",
              isOrbital
                ? "text-muted-foreground"
                : "text-muted-foreground dark:text-white/80"
            )}
          >
            {error.message}
          </p>
          <p
            className={cn(
              "mt-1 text-xs leading-5",
              orbitMetaMuted(isOrbital)
            )}
          >
            {presentation.helper}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={
            isOrbital
              ? "h-9 rounded-sm border-hairline-soft bg-surface-2/80 text-foreground hover:bg-accent-soft"
              : "h-9 rounded-lg border-hairline-soft bg-surface-2/80 text-foreground hover:bg-accent-soft dark:border-white/20 dark:bg-white/[0.08] dark:text-white dark:hover:bg-white/[0.12]"
          }
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
              "h-9 rounded-lg border-hairline-soft bg-surface-2/80 text-foreground hover:bg-accent-soft dark:border-white/25 dark:bg-white/[0.08] dark:text-white dark:hover:bg-white/[0.12]"
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
            className="h-9 rounded-lg bg-foreground text-background hover:bg-foreground/90"
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
