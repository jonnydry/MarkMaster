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

export interface CollectionWithCount {
  id: string;
  name: string;
  description: string | null;
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
  topAuthors: Array<{ author: string; count: number }>;
  mediaBreakdown: Array<{ type: string; count: number }>;
  tagDistribution: Array<{ tag: string; color: string; count: number }>;
  bookmarksByMonth: Array<{ month: string; count: number }>;
  totalBookmarks: number;
  totalTags: number;
  totalCollections: number;
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
