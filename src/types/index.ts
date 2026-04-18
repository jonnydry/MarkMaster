export type SortField =
  | "bookmarkedAt"
  | "tweetCreatedAt"
  | "likes"
  | "retweets"
  | "replies"
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
  notedCount: number;
  last30dCount: number;
  previous30dCount: number;
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
