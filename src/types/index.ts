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
  media: Array<{
    type: string;
    url?: string;
    preview_image_url?: string;
    width?: number;
    height?: number;
  }> | null;
  urls: Array<{
    url: string;
    expanded_url: string;
    display_url: string;
    title?: string;
    description?: string;
    images?: Array<{ url: string; width: number; height: number }>;
  }> | null;
  quotedTweet: {
    id: string;
    text: string;
    author?: {
      name: string;
      username: string;
      profile_image_url?: string;
    } | null;
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
  totalTags: number;
  totalCollections: number;
  untaggedCount: number;
  untaggedOldestAt: string | null;
  orbitQueueCount: number;
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
}

export type SyncRunStatus = "RUNNING" | "COMPLETED" | "RATE_LIMITED" | "FAILED";

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
  | "xai_model";

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

export interface OrbitScanOverview {
  summary: string;
  taggingStrategy: string;
  collectionStrategy: string;
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
  model: string;
  scannedAt: string;
  privacy: {
    storeDisabled: boolean;
    zeroDataRetention: boolean | null;
  };
  plan: OrbitScanPlan;
  summary: OrbitScanSummary;
  tagRollups: OrbitTagRollup[];
  collectionRollups: OrbitCollectionRollup[];
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

export interface OrbitGraphPayload {
  nodes: OrbitGraphNode[];
  edges: OrbitGraphEdge[];
  stats: OrbitGraphStats;
  generatedAt: string;
  nodeCap: number;
}
