import type { BookmarkMediaJson } from "@/lib/bookmark-media";
import type {
  OrbitScanBatchMode,
  OrbitScanBatchProfileId,
} from "@/lib/orbit-config";

export type { OrbitScanBatchMode, OrbitScanBatchProfileId };

export type SortField =
  | "bookmarkedAt"
  | "tweetCreatedAt"
  | "likes"
  | "retweets"
  | "replies"
  | "performance"
  | "authorUsername";

export type SortDirection = "asc" | "desc";

export type MediaFilter = "all" | "images" | "video" | "links" | "text-only";

export type ViewMode = "feed" | "compact" | "grid";

export interface BookmarkFilters {
  search: string;
  sortField: SortField;
  sortDirection: SortDirection;
  mediaFilter: MediaFilter;
  authorFilter: string;
  tagFilter: string[];
  dateFrom?: string;
  dateTo?: string;
}

export interface BookmarkWithRelations {
  id: string;
  tweetId: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
  authorProfileImage: string | null;
  authorVerified: boolean;
  tweetText: string;
  publicMetrics: {
    retweet_count: number;
    reply_count: number;
    like_count: number;
    quote_count: number;
    bookmark_count: number;
    impression_count?: number;
  } | null;
  media: BookmarkMediaJson[] | null;
  /** Stored X url entities, including compact lists, so t.co-only cards can show a title. */
  urls?: Array<{
    url: string;
    expanded_url: string;
    display_url: string;
    title?: string;
    description?: string;
    images?: Array<{ url: string; width: number; height: number }>;
  }> | null;
  /**
   * Public page linked from the post when the row has no picture yet.
   * The feed loads a same-origin thumbnail from it.
   */
  cardUrl?: string | null;
  /** Null from compact endpoints (scan-candidates) — only detail routes hydrate it. */
  quotedTweet: {
    id: string;
    text: string;
    author?: {
      name: string;
      username: string;
      profile_image_url?: string;
    } | null;
  } | null;
  /** Null from compact endpoints (scan-candidates) — only detail routes hydrate it. */
  xMetadata: {
    schemaVersion?: number;
    tweet?: Record<string, unknown>;
    author?: Record<string, unknown>;
    media?: Array<Record<string, unknown>>;
  } | null;
  tweetCreatedAt: string;
  bookmarkedAt: string;
  tags: Array<{ tag: { id: string; name: string; color: string } }>;
  notes: Array<{ id: string; content: string }>;
  collectionItems: Array<{
    collection: { id: string; name: string };
  }>;
}

export type CollectionType = "x_folder" | "user_collection";

export interface CollectionWithCount {
  id: string;
  name: string;
  description: string | null;
  type: CollectionType;
  isPublic: boolean;
  shareSlug: string | null;
  /** ISO timestamp the share link expires at; null means it never expires. */
  shareExpiresAt: string | null;
  externalSource: string | null;
  externalSourceId: string | null;
  createdAt: string;
  _count: { items: number };
}

export interface TagWithCount {
  id: string;
  name: string;
  color: string;
  _count: { bookmarks: number };
}

export interface AnalyticsData {
  topAuthors: Array<{
    author: string;
    displayName: string | null;
    profileImage: string | null;
    verified: boolean;
    count: number;
  }>;
  mediaBreakdown: Array<{ type: string; count: number }>;
  tagDistribution: Array<{ id: string; tag: string; color: string; count: number }>;
  bookmarksByMonth: Array<{ month: string; count: number }>;
  bookmarksByDay: Array<{ day: string; count: number }>;
  totalBookmarks: number;
  untaggedCount: number;
  untaggedOldestAt: string | null;
  orbitQueueCount: number;
  /** Untagged bookmarks with no tags and no collection membership (raw Highlights pool). */
  rawHighlightsCount: number;
  notedCount: number;
  last30dCount: number;
  previous30dCount: number;

  // Phase 3 Item 12 Slice 2: time-aware flywheel signals (respect analytics range filter) + high-value conversion ratios + light attribution payloads
  flywheelCtaReviewInOrbit: number;
  flywheelDigestReviewTogether: number;
  flywheelFeedbackGood: number;
  flywheelFeedbackNotRelevant: number;
  flywheelQuickModeToggles: number;
  flywheelDeepModeToggles: number;
  flywheelDigestSessions: number;
  flywheelDigestCtaToSessionRate: number;
  flywheelQuickPassShare: number;

  // Phase 3 Item 12 Slice 3: per-source effectiveness (top entry sources for Orbit CTAs/sessions) + Quick Pass keep outcome rate
  // (lightweight; only meaningful data surfaces, always secondary and calm)
  flywheelTopEntrySources: Array<{ source: string; count: number; pct: number }>;
  flywheelQuickKeepCount: number;
  flywheelQuickPassKeepRate: number;

  // Orbit AI review outcomes, captured from reviewer actions and used to monitor sorting/tagging quality.
  orbitDecisionAccepted: number;
  orbitDecisionEdited: number;
  orbitDecisionKept: number;
  orbitDecisionRejected: number;
  orbitDecisionTotal: number;
  orbitDecisionAcceptRate: number;
  orbitDecisionEditRate: number;
  orbitHighConfidenceAcceptRate: number;
}

export interface TopAuthorsResponse {
  topAuthors: AnalyticsData["topAuthors"];
}

export type SyncRunStatus =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "RATE_LIMITED"
  | "FAILED";

export interface SyncRunSummary {
  id: string;
  status: SyncRunStatus;
  newBookmarks: number;
  updatedBookmarks: number;
  totalFetched: number;
  hitExisting: boolean;
  rateLimited: boolean;
  rateLimitResetsAt: string | null;
  errorMessage: string | null;
  pagesFetched: number;
  resumeToken: string | null;
  startedAt: string;
  completedAt: string | null;
}

export interface SyncStatusResponse {
  currentRun: SyncRunSummary | null;
  recentRuns: SyncRunSummary[];
  /** When valid X tokens were last obtained (sign-in, reconnect, or refresh). */
  reauthorizedAt: string | null;
}

export type OrbitScanConfidence = "high" | "medium" | "low";

export type OrbitScanFailureCode =
  | "scan_request"
  | "bookmark_not_found"
  | "xai_auth"
  | "xai_model"
  | "xai_rate_limited"
  | "xai_unavailable"
  | "xai_response"
  | "typesafe_auth"
  | "typesafe_unavailable"
  | "unknown";

export interface OrbitScanErrorPayload {
  error: string;
  code: OrbitScanFailureCode;
  retryAfterSeconds?: number;
}

export type OrbitXaiStatusState = "ready" | "misconfigured";

export type OrbitXaiStatusIssueCode =
  | "missing_api_key"
  | "xai_auth"
  | "xai_model"
  | "typesafe_auth";

export interface OrbitXaiStatusIssue {
  code: OrbitXaiStatusIssueCode;
  title: string;
  message: string;
}

export interface OrbitXaiStatusPayload {
  state: OrbitXaiStatusState;
  checkedAt: string;
  apiKeyConfigured: boolean;
  model: string;
  modelSource: "default" | "environment";
  baseUrl: string;
  baseUrlSource: "default" | "environment";
  privacy: {
    storeDisabled: boolean;
    zeroDataRetention: boolean | null;
  };
  typesafe: {
    apiKeyConfigured: boolean;
    model: string;
    modelSource: "default" | "environment";
  };
  issues: OrbitXaiStatusIssue[];
}

export interface OrbitTagSuggestion {
  name: string;
  color: string;
  reason: string;
  reuseExisting: boolean;
}

export interface OrbitCollectionSuggestion {
  name: string;
  description: string;
  reason: string;
  reuseExisting: boolean;
}

export interface OrbitBookmarkSuggestion {
  bookmarkId: string;
  confidence: OrbitScanConfidence;
  reasoning: string;
  tags: OrbitTagSuggestion[];
  collection: OrbitCollectionSuggestion | null;
}

export type OrbitDecisionEventAction =
  | "accepted"
  | "edited"
  | "kept"
  | "rejected";

export interface OrbitDecisionEventPayload {
  bookmarkId: string;
  action: OrbitDecisionEventAction;
  source?: string | null;
  mode?: "quick" | "deep" | string | null;
  originalSuggestion?: OrbitBookmarkSuggestion | null;
  reviewedSuggestion?: OrbitBookmarkSuggestion | null;
}

export interface OrbitScanOverview {
  summary: string;
  taggingStrategy: string;
  collectionStrategy: string;
}

export interface OrbitScanBatchMetadata {
  mode: OrbitScanBatchMode;
  profile: OrbitScanBatchProfileId;
  requestedCount: number;
  candidatePoolCount: number;
  sharedSignalCount: number;
  sourceUnknownCount: number;
  sourceUnknownRate: number;
  selectedSourceUnknownCount: number;
  selectedSourceUnknownRate: number;
  usefulSignalCount: number;
  selectionReason: string;
  enrichment?: {
    attempted: number;
    refreshed: number;
    skipped: number;
    failed?: number;
    reason?: "rate_limited" | "auth_error" | "none_needed" | "error";
  };
  signalQuality?: {
    richCount: number;
    sparseCount: number;
  };
  hybrid?: OrbitHybridScanMetrics;
}

export interface OrbitHybridScanMetrics {
  firstPassLeftovers: number;
  refinedLeftovers: number;
  recoveredOnRefine: number;
  escalatedToGrok: number;
}

export interface OrbitScanPlan {
  overview: OrbitScanOverview;
  suggestions: OrbitBookmarkSuggestion[];
}

export interface OrbitScanSummary {
  bookmarkCount: number;
  bookmarksWithTags: number;
  bookmarksWithCollections: number;
  tagAssignments: number;
  uniqueTags: number;
  collectionBuckets: number;
  reusedExistingTags: number;
  reusedExistingCollections: number;
  newCollectionBuckets: number;
}

export interface OrbitTagRollup {
  name: string;
  color: string;
  count: number;
  reuseExisting: boolean;
}

export interface OrbitCollectionRollup {
  name: string;
  description: string;
  count: number;
  reuseExisting: boolean;
  bookmarkIds: string[];
}

export interface OrbitScanResponsePayload {
  scanRunId: string;
  model: string;
  scannedAt: string;
  privacy: {
    storeDisabled: boolean;
    zeroDataRetention: boolean | null;
  };
  batch: OrbitScanBatchMetadata;
  plan: OrbitScanPlan;
  summary: OrbitScanSummary;
  tagRollups: OrbitTagRollup[];
  collectionRollups: OrbitCollectionRollup[];
  /** Full bookmark rows for the scanned ids (used by the review overlay). */
  scannedBookmarks?: BookmarkWithRelations[];
}

/**
 * Scan stages, in order: read posts and hints, match existing tags (Jev),
 * re-check leftovers against this batch's tags, name what's left (Grok).
 */
export type OrbitScanPhase = "prepare" | "match" | "refine" | "name";

/** Progress a streamed scan reports before its result. */
export type OrbitScanProgressEvent =
  | {
      type: "phase";
      phase: OrbitScanPhase;
      /** The bookmarks this phase works on; omitted when it is the whole batch. */
      bookmarkIds?: string[];
    }
  | {
      /** One bookmark's answer from a Jev pass. */
      type: "row";
      bookmarkId: string;
      state: "matched" | "leftover";
      /** First tag or collection matched, as a preview. */
      label: string | null;
    }
  | {
      /** A Grok naming chunk finished (or failed and kept its Jev answer). */
      type: "named";
      bookmarkIds: string[];
    };

/** One NDJSON line of a streamed `/api/orbit/scan` response. */
export type OrbitScanStreamLine =
  | OrbitScanProgressEvent
  | { type: "result"; payload: OrbitScanResponsePayload }
  | { type: "error"; status: number; error: OrbitScanErrorPayload };

export interface OrbitScanQualityPayload {
  recommendedProfile: OrbitScanBatchProfileId;
  profileReason: string;
  successfulScanCount: number;
  recentScanCount: number;
  largeSuccessfulScanCount: number;
  usefulSuggestionRate: number;
  modelAbstainRate: number;
  failureRate: number;
  medianDurationMs: number;
  reviewedSuggestionCount: number;
  reviewUsefulRate: number | null;
  qualityBySignalTier?: {
    rich: { scans: number; usefulSuggestionRate: number };
    sparse: { scans: number; usefulSuggestionRate: number };
  };
  hybrid?: {
    leftoverRate: number;
    refineRecoveryRate: number;
    grokEscalateRate: number;
  };
  deep: {
    unlocked: boolean;
    reason: string;
  };
}

export type OrbitDecisionKind = "collection" | "tag";

export interface OrbitDecision {
  kind: OrbitDecisionKind;
  label: string;
  color?: string;
  reuseExisting: boolean;
  confidence: OrbitScanConfidence;
}

export interface OrbitBookmarkDecision {
  bookmarkId: string;
  confidence: OrbitScanConfidence;
  reasoning: string;
  primary: OrbitDecision | null;
  alternative: OrbitDecision | null;
  /** All tag names from the Grok suggestion (same order as the scan plan). */
  suggestedTags: Array<{ name: string; color: string }>;
}

export interface OrbitApplyResult {
  bookmarkCount: number;
  createdTags: number;
  reusedTags: number;
  tagAssignments: number;
  createdCollections: number;
  reusedCollections: number;
  collectionAssignments: number;
  skippedNewCollectionSingletons: number;
}

export type OrbitLibraryRunStatus =
  | "running"
  | "completed"
  | "cancelled"
  | "failed";

/** Whole-queue auto-tag pass as the Orbit page sees it. */
export interface OrbitLibraryRunView {
  id: string;
  status: OrbitLibraryRunStatus;
  /** Untagged bookmarks when the run started. */
  total: number;
  /** Bookmarks checked so far (tagged, no match, or failed). */
  processed: number;
  /** Bookmarks that received at least one tag. */
  applied: number;
  /** Bookmarks whose Jev call failed after retries. */
  failed: number;
  /** Tag list in use; null until the worker has resolved it. */
  vocabulary: Array<{ name: string; color: string }> | null;
  errorMessage: string | null;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  /** Running, but the worker stopped writing progress. Starting again resumes it. */
  stalled: boolean;
}

export interface OrbitLibraryStatusPayload {
  /** Null while a run is active (the run carries the counts). */
  untaggedCount: number | null;
  run: OrbitLibraryRunView | null;
}

export type OrbitGraphCollectionVariant = "user_collection" | "x_folder";

export type OrbitGraphNode =
  | { kind: "core"; id: "orbit-index"; totalBookmarks: number; looseBookmarks: number }
  | {
      kind: "tag";
      id: string;
      name: string;
      color: string;
      count: number;
    }
  | {
      kind: "collection";
      id: string;
      name: string;
      variant: OrbitGraphCollectionVariant;
      count: number;
    }
  | {
      kind: "bookmark";
      id: string;
      title: string;
      authorUsername: string;
      authorDisplayName: string;
      affiliated: boolean;
      recent: boolean;
    }
  | {
      kind: "overflow";
      id: string;
      anchorId: string;
      anchorKind: "tag" | "collection" | "core";
      remaining: number;
    };

export type OrbitGraphEdge =
  | { kind: "bookmark-tag"; bookmarkId: string; tagId: string }
  | { kind: "bookmark-collection"; bookmarkId: string; collectionId: string }
  | { kind: "loose"; bookmarkId: string }
  | { kind: "overflow"; overflowId: string; anchorId: string };

export interface OrbitGraphStats {
  totalBookmarks: number;
  affiliatedBookmarks: number;
  looseBookmarks: number;
  renderedBookmarks: number;
  truncatedBookmarks: number;
  tagCount: number;
  userCollectionCount: number;
  xFolderCount: number;
}

export type OrbitGraphScope = "library" | "orbit";

export interface OrbitGraphPayload {
  nodes: OrbitGraphNode[];
  edges: OrbitGraphEdge[];
  stats: OrbitGraphStats;
  generatedAt: string;
  nodeCap: number;
  scope?: OrbitGraphScope;
}
