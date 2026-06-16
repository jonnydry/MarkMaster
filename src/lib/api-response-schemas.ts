import * as v from "valibot";

import type { ShareContent } from "@/lib/share-content";
import type { BookmarkResponse, OrbitScanCandidatesResponse } from "@/lib/orbit-page-types";
import type {
  AnalyticsData,
  BookmarkWithRelations,
  CollectionWithCount,
  OrbitGraphPayload,
  OrbitScanQualityPayload,
  OrbitXaiStatusPayload,
  SyncStatusResponse,
  TagWithCount,
} from "@/types";

const collectionTypeSchema = v.picklist(["x_folder", "user_collection"]);

/** Minimal bookmark row shape — loose object keeps nullable/detail fields without brittle nesting. */
export const bookmarkWithRelationsSchema = v.looseObject({
  id: v.string(),
  tweetId: v.string(),
  authorUsername: v.string(),
  tweetText: v.string(),
  tweetCreatedAt: v.string(),
  bookmarkedAt: v.string(),
  tags: v.array(
    v.object({
      tag: v.object({
        id: v.string(),
        name: v.string(),
        color: v.string(),
      }),
    })
  ),
  notes: v.array(v.object({ id: v.string(), content: v.string() })),
  collectionItems: v.array(
    v.object({
      collection: v.object({ id: v.string(), name: v.string() }),
    })
  ),
});

export const bookmarkListResponseSchema = v.looseObject({
  bookmarks: v.array(bookmarkWithRelationsSchema),
  total: v.number(),
  totalPages: v.number(),
  nextCursor: v.optional(v.string()),
  page: v.optional(v.number()),
  personalBoostAuthors: v.optional(v.array(v.string())),
  personalBoostTags: v.optional(v.array(v.string())),
}) as unknown as v.GenericSchema<unknown, BookmarkResponse>;

export const performanceHighlightsResponseSchema = bookmarkListResponseSchema;

export const tagWithCountSchema = v.object({
  id: v.string(),
  name: v.string(),
  color: v.string(),
  _count: v.object({ bookmarks: v.number() }),
});

export const tagsResponseSchema = v.array(
  tagWithCountSchema
) as unknown as v.GenericSchema<unknown, TagWithCount[]>;

export const collectionWithCountSchema = v.object({
  id: v.string(),
  name: v.string(),
  description: v.nullable(v.string()),
  type: collectionTypeSchema,
  isPublic: v.boolean(),
  shareSlug: v.nullable(v.string()),
  externalSource: v.nullable(v.string()),
  externalSourceId: v.nullable(v.string()),
  createdAt: v.string(),
  _count: v.object({ items: v.number() }),
});

export const collectionsResponseSchema = v.array(
  collectionWithCountSchema
) as unknown as v.GenericSchema<unknown, CollectionWithCount[]>;

export const libraryStatsResponseSchema = v.object({
  libraryBookmarkCount: v.number(),
  organizedBookmarkCount: v.number(),
});

const syncRunSummarySchema = v.object({
  id: v.string(),
  status: v.picklist(["PENDING", "RUNNING", "COMPLETED", "RATE_LIMITED", "FAILED"]),
  newBookmarks: v.number(),
  updatedBookmarks: v.number(),
  totalFetched: v.number(),
  hitExisting: v.boolean(),
  rateLimited: v.boolean(),
  rateLimitResetsAt: v.nullable(v.string()),
  errorMessage: v.nullable(v.string()),
  pagesFetched: v.number(),
  resumeToken: v.nullable(v.string()),
  startedAt: v.string(),
  completedAt: v.nullable(v.string()),
});

export const syncStatusResponseSchema = v.object({
  currentRun: v.nullable(syncRunSummarySchema),
  recentRuns: v.array(syncRunSummarySchema),
}) as unknown as v.GenericSchema<unknown, SyncStatusResponse>;

export const analyticsDataSchema = v.looseObject({
  topAuthors: v.array(
    v.object({
      author: v.string(),
      displayName: v.nullable(v.string()),
      profileImage: v.nullable(v.string()),
      verified: v.boolean(),
      count: v.number(),
    })
  ),
  mediaBreakdown: v.array(
    v.object({ type: v.string(), count: v.number() })
  ),
  tagDistribution: v.array(
    v.object({
      id: v.string(),
      tag: v.string(),
      color: v.string(),
      count: v.number(),
    })
  ),
  bookmarksByMonth: v.array(
    v.object({ month: v.string(), count: v.number() })
  ),
  bookmarksByDay: v.array(v.object({ day: v.string(), count: v.number() })),
  totalBookmarks: v.number(),
  untaggedCount: v.number(),
  untaggedOldestAt: v.nullable(v.string()),
  orbitQueueCount: v.number(),
  rawHighlightsCount: v.number(),
  notedCount: v.number(),
  last30dCount: v.number(),
  previous30dCount: v.number(),
}) as unknown as v.GenericSchema<unknown, AnalyticsData>;

export const orbitGraphPayloadSchema = v.looseObject({
  nodes: v.array(v.looseObject({ kind: v.string() })),
  edges: v.array(v.looseObject({ kind: v.string() })),
  stats: v.looseObject({
    tagCount: v.number(),
    userCollectionCount: v.number(),
    xFolderCount: v.number(),
  }),
  generatedAt: v.string(),
  nodeCap: v.number(),
  scope: v.optional(v.picklist(["library", "orbit"])),
}) as unknown as v.GenericSchema<unknown, OrbitGraphPayload>;

export const orbitScanCandidatesResponseSchema = v.object({
  bookmarks: v.array(bookmarkWithRelationsSchema),
}) as unknown as v.GenericSchema<unknown, OrbitScanCandidatesResponse>;

export const orbitScanQualityPayloadSchema = v.looseObject({
  recommendedProfile: v.string(),
  profileReason: v.string(),
  successfulScanCount: v.number(),
  recentScanCount: v.number(),
  largeSuccessfulScanCount: v.number(),
  usefulSuggestionRate: v.number(),
  modelAbstainRate: v.number(),
  failureRate: v.number(),
  medianDurationMs: v.number(),
  reviewedSuggestionCount: v.number(),
  reviewUsefulRate: v.nullable(v.number()),
  deep: v.object({
    unlocked: v.boolean(),
    reason: v.string(),
  }),
}) as unknown as v.GenericSchema<unknown, OrbitScanQualityPayload>;

export const orbitXaiStatusPayloadSchema = v.object({
  state: v.picklist(["ready", "misconfigured"]),
  checkedAt: v.string(),
  apiKeyConfigured: v.boolean(),
  model: v.string(),
  modelSource: v.picklist(["default", "environment"]),
  baseUrl: v.string(),
  baseUrlSource: v.picklist(["default", "environment"]),
  privacy: v.object({
    storeDisabled: v.boolean(),
    zeroDataRetention: v.nullable(v.boolean()),
  }),
  issues: v.array(
    v.object({
      code: v.picklist(["missing_api_key", "xai_auth", "xai_model"]),
      title: v.string(),
      message: v.string(),
    })
  ),
}) as unknown as v.GenericSchema<unknown, OrbitXaiStatusPayload>;

export const collectionDetailSchema = v.object({
  id: v.string(),
  name: v.string(),
  description: v.nullable(v.string()),
  type: v.string(),
  isPublic: v.boolean(),
  shareSlug: v.nullable(v.string()),
  externalSource: v.nullable(v.string()),
  externalSourceId: v.nullable(v.string()),
  items: v.array(
    v.object({
      id: v.string(),
      sortOrder: v.number(),
      bookmark: bookmarkWithRelationsSchema,
    })
  ),
  total: v.number(),
  page: v.number(),
  totalPages: v.number(),
  nextCursor: v.optional(v.string()),
});

export const shareContentSchema = v.object({
  thread: v.array(v.object({ text: v.string() })),
  summaryTweet: v.string(),
  shareUrl: v.string(),
  xIntentUrl: v.string(),
  collectionName: v.string(),
  itemCount: v.number(),
}) as unknown as v.GenericSchema<unknown, ShareContent>;

export const bookmarkFocusResponseSchema = v.object({
  bookmarks: v.array(bookmarkWithRelationsSchema),
}) as unknown as v.GenericSchema<unknown, { bookmarks: BookmarkWithRelations[] }>;
