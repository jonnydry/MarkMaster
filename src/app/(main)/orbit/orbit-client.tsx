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
import { Sidebar } from "@/components/sidebar-dynamic";
import { MobileSidebar } from "@/components/mobile-sidebar";
import { PageHeader } from "@/components/page-header";
import { UserNavDynamic } from "@/components/user-nav-dynamic";
const OrbitReviewDialog = dynamic(
  () =>
    import("@/components/orbit/orbit-review-dialog").then((m) => m.OrbitReviewDialog),
  { ssr: false }
);
import { OrbitScanOverviewStrip } from "@/components/orbit/orbit-scan-overview-strip";
import { OrbitCommandBar } from "@/components/orbit/orbit-command-bar";
import { OrbitTriageHint } from "@/components/orbit/orbit-triage-hint";

// Clean-list + expanded overlay components (new Orbit model)
import { OrbitList } from "@/components/orbit/orbit-list";
import { OrbitContextualMenu } from "@/components/orbit/orbit-quick-actions";

import { orbital, OrbitalRings } from "@/components/orbital";
import { useOrbitalTheme } from "@/components/providers";
import {
  clampMenuPosition,
  orbitBannerClass,
  orbitControlRadius,
  orbitGhostButtonClass,
  orbitLabelClass,
  orbitMetaMuted,
  orbitSelectionBarClass,
  orbitShellClass,
} from "@/lib/orbit-route-chrome";
import { appContentGutterClassName } from "@/lib/app-chrome";
import { planOrbitScanBatch } from "@/lib/orbit-batch-planner";
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
import { isSafeAutoApplySuggestion } from "@/lib/orbit-decision";
import { trackFlywheelEvent } from "@/lib/flywheel";
import { bookmarkFeedColumnClassName } from "@/lib/bookmark-feed-layout";
import { getBookmarkTweetUrl, openBookmarkOnX } from "@/lib/bookmark-url";
import { fetchJson, sendJson, type JsonValue } from "@/lib/fetch-json";
import {
  ORBIT_ALL_PAGE_SIZE,
  ORBIT_RECENT_PAGE_SIZE,
  parseOrbitUrlState,
  type OrbitSortDirection,
  type OrbitView,
} from "@/lib/orbit-navigation";
import {
  ORBIT_GROK_MAX_BOOKMARKS_PER_SCAN,
  ORBIT_SCAN_BATCH_PROFILES,
  ORBIT_SCAN_CANDIDATE_POOL_SIZE,
  type OrbitScanBatchMode,
  type OrbitScanBatchProfileId,
} from "@/lib/orbit-config";
import { invalidateLibraryQueries } from "@/lib/query-invalidation";
import { cn } from "@/lib/utils";
import type { DbUser } from "@/lib/auth";
import type {
  BookmarkWithRelations,
  OrbitApplyResult,
  OrbitScanBatchMetadata,
  OrbitDecisionEventPayload,
  OrbitScanQualityPayload,
  OrbitScanPlan,
} from "@/types";

type BookmarkResponse = {
  bookmarks: BookmarkWithRelations[];
  total: number;
  totalPages: number;
};

type OrbitScanCandidatesResponse = {
  bookmarks: BookmarkWithRelations[];
};

type OrbitScanRequest = {
  targetIds: string[];
  scanningSelection: boolean;
  contextKey: string;
  batch: OrbitScanBatchMetadata;
};

type OrbitReviewSession = {
  open: boolean;
  focusBookmarkId: string | null;
  digestBookmarkIds: string[] | null;
  source: string | null;
  sessionId: number;
};

const EMPTY_BOOKMARKS: BookmarkWithRelations[] = [];

const EMPTY_REVIEW_SESSION: OrbitReviewSession = {
  open: false,
  focusBookmarkId: null,
  digestBookmarkIds: null,
  source: null,
  sessionId: 0,
};

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
    title: "Triage Active Item",
    shortcuts: [
      { id: "accept", keys: ["A"], label: "Accept Grok suggestion" },
      { id: "skip", keys: ["S"], label: "Skip / keep in Orbit" },
      { id: "edit", keys: ["E"], label: "Edit in review" },
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
  batchMode: OrbitScanBatchMode;
  batchProfile: OrbitScanBatchProfileId;
}): string {
  const sortedTargets = [...args.scanTargetIds].sort().join("|");
  return [
    args.orbitView,
    String(args.page),
    args.queryString,
    args.batchMode,
    args.batchProfile,
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

function profileForCount(count: number): OrbitScanBatchProfileId {
  if (count <= ORBIT_SCAN_BATCH_PROFILES.quick.size) return "quick";
  if (count <= ORBIT_SCAN_BATCH_PROFILES.balanced.size) return "balanced";
  return "deep";
}

function buildFallbackBatchMetadata(args: {
  targetIds: string[];
  mode: OrbitScanBatchMode;
  profile: OrbitScanBatchProfileId;
}): OrbitScanBatchMetadata {
  return {
    mode: args.mode,
    profile: args.profile,
    requestedCount: args.targetIds.length,
    candidatePoolCount: args.targetIds.length,
    sharedSignalCount: 0,
    sourceUnknownCount: 0,
    sourceUnknownRate: 0,
    selectedSourceUnknownCount: 0,
    selectedSourceUnknownRate: 0,
    usefulSignalCount: 0,
    selectionReason: "Scanned the provided bookmark IDs.",
  };
}

function batchMetadataFromPlan(args: {
  plan: ReturnType<typeof planOrbitScanBatch>;
  mode: OrbitScanBatchMode;
  profile: OrbitScanBatchProfileId;
}): OrbitScanBatchMetadata {
  return {
    mode: args.mode,
    profile: args.profile,
    requestedCount: args.plan.bookmarkIds.length,
    candidatePoolCount: args.plan.candidateCount,
    sharedSignalCount: args.plan.sharedSignalCount,
    sourceUnknownCount: args.plan.sourceUnknownCount,
    sourceUnknownRate: args.plan.sourceUnknownRate,
    selectedSourceUnknownCount: args.plan.selectedSourceUnknownCount,
    selectedSourceUnknownRate: args.plan.selectedSourceUnknownRate,
    usefulSignalCount: args.plan.usefulSignalCount,
    selectionReason: args.plan.selectionReason,
  };
}

function chooseAutoProfile(args: {
  quality: OrbitScanQualityPayload | undefined;
  sourceUnknownRate: number;
}): OrbitScanBatchProfileId {
  if (!args.quality || args.quality.successfulScanCount < 3) return "quick";
  if (args.sourceUnknownRate > 0.35) return "quick";
  return args.quality.recommendedProfile;
}

function countDecisionActions(events: OrbitDecisionEventPayload[]) {
  return events.reduce(
    (counts, event) => {
      counts[event.action] += 1;
      return counts;
    },
    { accepted: 0, edited: 0, kept: 0, rejected: 0 }
  );
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
  const [scanBatchMode, setScanBatchMode] =
    useState<OrbitScanBatchMode>("auto");

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
  const [reviewSession, setReviewSession] =
    useState<OrbitReviewSession>(EMPTY_REVIEW_SESSION);
  const [feedbackById, setFeedbackById] = useState<Record<string, 'good' | 'not_relevant'>>({}); // Phase 2 persisted feedback for the session

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
  const scanCandidatesQueryString = useMemo(() => {
    const params = new URLSearchParams({
      page: orbitView === "recent" ? "1" : page.toString(),
      pageSize: pageSize.toString(),
      limit: ORBIT_SCAN_CANDIDATE_POOL_SIZE.toString(),
      sortDirection: queueSortDirection,
    });

    if (deferredSearch) {
      params.set("search", deferredSearch);
    }

    return params.toString();
  }, [deferredSearch, orbitView, page, pageSize, queueSortDirection]);
  const { data: scanCandidatesData } = useQuery<OrbitScanCandidatesResponse>({
    queryKey: ["orbit", "scan-candidates", scanCandidatesQueryString],
    queryFn: () =>
      fetchJson(`/api/orbit/scan-candidates?${scanCandidatesQueryString}`),
    placeholderData: keepPreviousData,
  });
  const { data: scanQuality } = useQuery<OrbitScanQualityPayload>({
    queryKey: ["orbit", "scan-quality"],
    queryFn: () => fetchJson("/api/orbit/scan-quality"),
    staleTime: 60_000,
  });
  const scanCandidateBookmarks = scanCandidatesData
    ? scanCandidatesData.bookmarks
    : bookmarks;
  const reviewBookmarks = useMemo(() => {
    const byId = new Map(
      scanCandidateBookmarks.map((bookmark) => [bookmark.id, bookmark])
    );
    for (const bookmark of bookmarks) {
      byId.set(bookmark.id, bookmark);
    }
    return Array.from(byId.values());
  }, [bookmarks, scanCandidateBookmarks]);
  const bookmarkById = useMemo(
    () => new Map(bookmarks.map((bookmark) => [bookmark.id, bookmark])),
    [bookmarks]
  );
  const candidatePoolPlan = useMemo(
    () =>
      planOrbitScanBatch(
        scanCandidateBookmarks,
        Math.min(
          ORBIT_SCAN_BATCH_PROFILES.deep.size,
          Math.max(1, scanCandidateBookmarks.length)
        )
      ),
    [scanCandidateBookmarks]
  );
  const autoScanBatchProfile = chooseAutoProfile({
    quality: scanQuality,
    sourceUnknownRate: candidatePoolPlan.sourceUnknownRate,
  });
  const deepLockedBySourceQuality = candidatePoolPlan.sourceUnknownRate > 0.35;
  const deepUnlocked = Boolean(scanQuality?.deep.unlocked) && !deepLockedBySourceQuality;
  const deepLockedReason = deepLockedBySourceQuality
    ? "Current candidates have too much missing source context for Deep."
    : (scanQuality?.deep.reason ?? "Needs scan history before Deep unlocks.");
  const resolvedScanBatchMode: OrbitScanBatchMode =
    scanBatchMode === "deep" && !deepUnlocked ? "auto" : scanBatchMode;
  const scanBatchProfile: OrbitScanBatchProfileId =
    resolvedScanBatchMode === "auto"
      ? autoScanBatchProfile
      : resolvedScanBatchMode;
  const scanBatchLimit = ORBIT_SCAN_BATCH_PROFILES[scanBatchProfile].size;
  const defaultScanPlan = useMemo(
    () => planOrbitScanBatch(scanCandidateBookmarks, scanBatchLimit),
    [scanCandidateBookmarks, scanBatchLimit]
  );
  const defaultScanTargetIds = defaultScanPlan.bookmarkIds;
  const selectedScanTargetIds = useMemo(() => {
    const selectedBookmarks = Array.from(selectedBookmarkIds).flatMap((bookmarkId) => {
      const bookmark = bookmarkById.get(bookmarkId);
      return bookmark ? [bookmark] : [];
    });
    return planOrbitScanBatch(
      selectedBookmarks,
      scanBatchLimit
    ).bookmarkIds;
  }, [bookmarkById, scanBatchLimit, selectedBookmarkIds]);
  const selectedScanPlan = useMemo(() => {
    const selectedBookmarks = Array.from(selectedBookmarkIds).flatMap((bookmarkId) => {
      const bookmark = bookmarkById.get(bookmarkId);
      return bookmark ? [bookmark] : [];
    });
    return planOrbitScanBatch(selectedBookmarks, scanBatchLimit);
  }, [bookmarkById, scanBatchLimit, selectedBookmarkIds]);
  const scanningSelection = selectionMode && selectedScanTargetIds.length > 0;
  const scanTargetIds = scanningSelection
    ? selectedScanTargetIds
    : defaultScanTargetIds;
  const scanBatchMetadata = scanningSelection
    ? batchMetadataFromPlan({
        plan: selectedScanPlan,
        mode: resolvedScanBatchMode,
        profile: scanBatchProfile,
      })
    : batchMetadataFromPlan({
        plan: defaultScanPlan,
        mode: resolvedScanBatchMode,
        profile: scanBatchProfile,
      });
  const scanTargetCount = scanTargetIds.length;
  const queueBatchCount = defaultScanTargetIds.length;
  const planSuggestionIds = useMemo(
    () => scan.plan?.plan.suggestions.map((suggestion) => suggestion.bookmarkId) ?? [],
    [scan.plan]
  );
  const passTotal = planSuggestionIds.length;
  const triagedCount = useMemo(
    () =>
      planSuggestionIds.filter(
        (id) => appliedBookmarkIds.has(id) || scan.dismissedBookmarkIds.has(id)
      ).length,
    [planSuggestionIds, appliedBookmarkIds, scan.dismissedBookmarkIds]
  );
  const queueIsLoading = isLoading && !orbitData;
  const hasSearchQuery = search.trim().length > 0;
  const hasSelectionOverflow =
    selectedBookmarkIds.size > scanBatchLimit;
  const scanProfileLabel = ORBIT_SCAN_BATCH_PROFILES[scanBatchProfile].label;
  const queueOrderLabel =
    queueSortDirection === "asc" ? "oldest" : "newest";
  const scanHelperText = queueIsLoading
    ? "Loading the current Orbit queue."
    : scanningSelection
      ? hasSelectionOverflow
        ? `Grok will suggest tags and destinations for the first ${scanTargetCount} selected bookmarks. Review before you apply.`
        : `Grok will suggest tags and destinations for ${scanTargetCount} selected bookmark${scanTargetCount === 1 ? "" : "s"}. Review before you apply.`
      : queueBatchCount > 0
        ? `${scanProfileLabel} scan selected ${queueBatchCount} ${queueOrderLabel} un-triaged bookmark${queueBatchCount === 1 ? "" : "s"} from ${defaultScanPlan.candidateCount.toLocaleString()} candidates. Review each suggestion before applying.`
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
  const currentScanContextKey = useMemo(
    () =>
      buildOrbitScanContextKey({
        orbitView,
        page,
        queryString,
        scanningSelection,
        scanTargetIds,
        batchMode: resolvedScanBatchMode,
        batchProfile: scanBatchProfile,
      }),
    [
      orbitView,
      page,
      queryString,
      scanningSelection,
      scanTargetIds,
      resolvedScanBatchMode,
      scanBatchProfile,
    ]
  );

  const buildScanRequest = useCallback(
    (
      targetIds: string[],
      scanSelection: boolean,
      batchMetadata?: OrbitScanBatchMetadata
    ): OrbitScanRequest => {
      const batch =
        batchMetadata ??
        buildFallbackBatchMetadata({
          targetIds,
          mode: resolvedScanBatchMode,
          profile: profileForCount(targetIds.length),
        });
      return {
        targetIds,
        scanningSelection: scanSelection,
        batch,
        contextKey: buildOrbitScanContextKey({
          orbitView,
          page,
          queryString,
          scanningSelection: scanSelection,
          scanTargetIds: targetIds,
          batchMode: batch.mode,
          batchProfile: batch.profile,
        }),
      };
    },
    [orbitView, page, queryString, resolvedScanBatchMode]
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
        isSafeAutoApplySuggestion(suggestion)
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
    !reviewSession.open;

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
      if (request.targetIds.length === 0) return null;

      setLastScanRequest(request);

      toast.info(
        request.scanningSelection
          ? "Grok is categorizing your selection — this should be quicker."
          : "Grok is categorizing your queue — large batches can take a minute."
      );
      try {
        const result = await scan.scanNow(request.targetIds, request.batch);
        if (result) {
          setScanContextAtLastRun(request.contextKey);
          const scopeLabel = request.scanningSelection ? "selected" : "Orbit";
          toast.success(
            `Grok categorized ${result.plan.suggestions.length} ${scopeLabel} bookmark${
              result.plan.suggestions.length === 1 ? "" : "s"
            }`
          );
        }
        return result;
      } catch {
        // Inline failure state is rendered near the Orbit scan controls.
        return null;
      }
    },
    [scan]
  );

  const handleScan = useCallback(async () => {
    await runOrbitScan(
      buildScanRequest(scanTargetIds, scanningSelection, scanBatchMetadata)
    );
  }, [
    buildScanRequest,
    runOrbitScan,
    scanTargetIds,
    scanningSelection,
    scanBatchMetadata,
  ]);

  const clearConsumedReviewUrlParams = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    const hadReviewIntent =
      params.has("highlightId") || params.has("digestIds") || params.has("source");

    if (!hadReviewIntent) return;

    params.delete("highlightId");
    params.delete("digestIds");
    params.delete("source");

    const nextQuery = params.toString();
    router.replace(nextQuery ? `/orbit?${nextQuery}` : "/orbit", {
      scroll: false,
    });
  }, [router, searchParams]);

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
      void (async () => {
        const result = await runOrbitScan(buildScanRequest(ids, true));
        if (!result) return;
        setReviewSession((current) => ({
          open: true,
          focusBookmarkId: ids[0] ?? null,
          digestBookmarkIds: ids,
          source: sourceFromUrl,
          sessionId: current.sessionId + 1,
        }));
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
      void (async () => {
        const result = await runOrbitScan(buildScanRequest([highlightIdFromUrl], true));
        if (!result) return;
        setReviewSession((current) => ({
          open: true,
          focusBookmarkId: highlightIdFromUrl,
          digestBookmarkIds: null,
          source: sourceFromUrl,
          sessionId: current.sessionId + 1,
        }));
      })();
    });
  }, [
    highlightIdFromUrl,
    digestIdsFromUrl,
    sourceFromUrl,
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
    await runOrbitScan(
      buildScanRequest(
        selectedScanTargetIds,
        true,
        batchMetadataFromPlan({
          plan: selectedScanPlan,
          mode: resolvedScanBatchMode,
          profile: scanBatchProfile,
        })
      )
    );
  }, [
    buildScanRequest,
    runOrbitScan,
    selectedScanTargetIds,
    selectedScanPlan,
    resolvedScanBatchMode,
    scanBatchProfile,
  ]);

  const handleReviewOpenChange = useCallback(
    (open: boolean) => {
      setReviewSession((current) => ({
        open,
        focusBookmarkId: open ? current.focusBookmarkId : null,
        digestBookmarkIds: open ? current.digestBookmarkIds : null,
        source: open ? current.source : null,
        sessionId: current.sessionId,
      }));

      if (!open) {
        setFeedbackById({});
        clearConsumedReviewUrlParams();
      }
    },
    [clearConsumedReviewUrlParams]
  );

  const handleOpenReviewAll = useCallback(() => {
    if (!scan.plan) return;
    setReviewSession((current) => ({
      open: true,
      focusBookmarkId: null,
      digestBookmarkIds: null,
      source: null,
      sessionId: current.sessionId + 1,
    }));
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
      setReviewSession((current) => ({
        open: true,
        focusBookmarkId: bookmarkId,
        digestBookmarkIds: null,
        source: null,
        sessionId: current.sessionId + 1,
      }));
    },
    [scan.plan]
  );

  const handleApplyReviewedPlan = useCallback(
    async (
      reviewedPlan: OrbitScanPlan,
      opts: {
        createCollections: boolean;
        keptBookmarkIds: string[];
        decisionEvents: OrbitDecisionEventPayload[];
      }
    ) => {
      try {
        const hasMutations = reviewedPlan.suggestions.length > 0;
        const applied = hasMutations
          ? await scan.applyReviewedPlan(reviewedPlan, {
              createCollections: opts.createCollections,
            })
          : null;

        if (hasMutations && !applied) return null;

        if (opts.decisionEvents.length > 0) {
          const decisionCounts = countDecisionActions(opts.decisionEvents);
          trackFlywheelEvent("orbit.review.applied", {
            scanRunId: scan.plan?.scanRunId ?? null,
            total: opts.decisionEvents.length,
            ...decisionCounts,
          });

          try {
            await sendJson("/api/orbit/decision-events", {
              method: "POST",
              body: JSON.parse(
                JSON.stringify({ events: opts.decisionEvents })
              ) as JsonValue,
            });
          } catch (err) {
            console.warn("[orbit] decision event write failed:", err);
          }
        }

        for (const bookmarkId of opts.keptBookmarkIds) {
          scan.dismiss(bookmarkId);
        }

        // B: after digest review session, auto-boost kept gems as implicit Good (if no prior feedback)
        if (reviewSession.digestBookmarkIds && opts.keptBookmarkIds.length > 0) {
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
    [scan, reviewSession.digestBookmarkIds]
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
      const applied = await scan.applyPlanSubset({
        minConfidence: "high",
        safeExistingOnly: true,
      });
      if (applied) {
        toast.success(`Applied strong matches · ${formatAppliedToast(applied)}`);
      } else {
        toast.message("No reusable strong matches left to apply in this pass.");
      }
    } catch {
      // Inline failure state is rendered near the Orbit scan controls.
    }
  }, [scan]);

  const handleAcceptSuggestion = useCallback(
    async (id: string) => {
      const decision = scan.getDecision(id);
      if (!decision?.primary) {
        handleOpenBookmarkReview(id);
        return;
      }
      try {
        const applied = await scan.applySuggestion(id, "primary");
        if (applied) {
          setAppliedBookmarkIds((current) => {
            const next = new Set(current);
            next.add(id);
            return next;
          });
          toast.success(`Applied · ${formatAppliedToast(applied)}`);
        }
      } catch {
        // Fall back to the review surface so the user can resolve it manually.
        handleOpenBookmarkReview(id);
      }
    },
    [scan, handleOpenBookmarkReview]
  );

  const handleOrbitOverlayDecision = (id: string, kind: string) => {
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
      accept: () => {
        if (activeBookmark) void handleAcceptSuggestion(activeBookmark.id);
      },
      skip: () => {
        if (activeBookmark) handleKeepInOrbit(activeBookmark.id);
      },
      edit: () => {
        if (activeBookmark && scan.plan) handleOpenBookmarkReview(activeBookmark.id);
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
                {dbUser ? <UserNavDynamic user={dbUser} /> : null}
              </>
            }
          >
            <OrbitHeaderLogoAccent />
          </PageHeader>

          <div className={cn(appContentGutterClassName, "space-y-4 pb-6 pt-4")}>
            <section className={cn(bookmarkFeedColumnClassName, "space-y-3 pt-1")}>
              <OrbitCommandBar
                ref={searchInputRef}
                orbitView={orbitView}
                total={total}
                sortDirection={queueSortDirection}
                onChangeView={handleOrbitViewChange}
                onChangeSortDirection={handleQueueSortDirectionChange}
                canSelect={total > 0}
                selectionMode={selectionMode}
                onToggleSelectionMode={toggleSelectionMode}
                triagedCount={triagedCount}
                passTotal={passTotal}
                scanButtonLabel={scanButtonLabel}
                queueIsLoading={queueIsLoading}
                scanning={scan.scanning}
                scanTargetCount={scanTargetIds.length}
                hasScanPlan={!!scan.plan}
                scanPlanSuggestionCount={scan.plan?.plan.suggestions.length ?? 0}
                batchMode={resolvedScanBatchMode}
                resolvedBatchProfile={scanBatchProfile}
                deepUnlocked={deepUnlocked}
                deepLockedReason={deepLockedReason}
                applyingBatch={scan.applyingBatch}
                canApplyStrongMatches={canApplyStrongMatches}
                mapHref={orbitMapHref}
                onBatchModeChange={setScanBatchMode}
                onScan={handleScan}
                onApplyStrongMatches={handleApplyStrongMatches}
                onReviewPass={handleOpenReviewAll}
                search={search}
                onSearchChange={handleSearchChange}
                visibleStatusLabel={visibleStatusLabel}
                isUpdating={(isFetching || isSearchPending) && !isLoading}
                keyboardShortcutsOpen={keyboardShortcutsOpen}
                onKeyboardShortcutsOpenChange={setKeyboardShortcutsOpen}
                shortcutGroups={ORBIT_SHORTCUT_GROUPS}
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

              <OrbitTriageHint />

              {scan.plan ? (
                <OrbitScanOverviewStrip payload={scan.plan} />
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
                        {scanBatchLimit} selected.
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
                  leading={
                    search.trim() ? (
                      <OrbitLogoMark className="mx-auto mb-4 size-8" />
                    ) : (
                      <div className="relative mx-auto mb-3 flex h-24 w-40 items-center justify-center">
                        <OrbitalRings
                          className="absolute inset-0 m-auto opacity-70"
                          size="sm"
                          tone="cyan"
                        />
                        <OrbitLogoMark className="relative size-8 text-primary drop-shadow-[0_0_18px_rgba(37,99,235,0.35)]" />
                      </div>
                    )
                  }
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
                    {/* Left column - the triage queue */}
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
                          if (menuForId) {
                            setMenuForId(null);
                            setMenuPosition(null);
                          }
                          // One review surface: rows with a Grok suggestion open
                          // the focused review; the rest open the read-only peek.
                          if (scan.getDecision(id)?.primary) {
                            handleOpenBookmarkReview(id);
                          } else {
                            setActiveBookmarkId(id);
                          }
                        }}
                        onQuickAction={(id, action, event) => {
                          if (action === "accept") {
                            void handleAcceptSuggestion(id);
                          } else if (action === "edit") {
                            handleOpenBookmarkReview(id);
                          } else if (action === "keep") {
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
                    onDecision={handleOrbitOverlayDecision}
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

      {reviewSession.open ? (
        <OrbitReviewDialog
          open
          onOpenChange={handleReviewOpenChange}
          plan={scan.plan}
          bookmarks={reviewBookmarks}
          dismissedBookmarkIds={scan.dismissedBookmarkIds}
          existingTags={tags}
          existingCollections={collections}
          applying={scan.applyingBatch}
          focusBookmarkId={reviewSession.focusBookmarkId}
          reviewSessionId={reviewSession.sessionId}
          onApply={handleApplyReviewedPlan}
          // Phase 2: Pass the set of bookmarks that came from a Highlights Digest
          digestBookmarkIds={reviewSession.digestBookmarkIds}
          source={reviewSession.source}
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
