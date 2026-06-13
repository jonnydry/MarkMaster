import { z } from "zod";

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

const collectionTypeSchema = z.enum(["x_folder", "user_collection"]);

/** Minimal bookmark row shape — passthrough keeps nullable/detail fields without brittle nesting. */
export const bookmarkWithRelationsSchema = z
  .object({
    id: z.string(),
    tweetId: z.string(),
    authorUsername: z.string(),
    tweetText: z.string(),
    tweetCreatedAt: z.string(),
    bookmarkedAt: z.string(),
    tags: z.array(
      z.object({
        tag: z.object({
          id: z.string(),
          name: z.string(),
          color: z.string(),
        }),
      })
    ),
    notes: z.array(z.object({ id: z.string(), content: z.string() })),
    collectionItems: z.array(
      z.object({
        collection: z.object({ id: z.string(), name: z.string() }),
      })
    ),
  })
  .passthrough();

export const bookmarkListResponseSchema = z.object({
  bookmarks: z.array(bookmarkWithRelationsSchema),
  total: z.number(),
  totalPages: z.number(),
  nextCursor: z.string().optional(),
  page: z.number().optional(),
  personalBoostAuthors: z.array(z.string()).optional(),
  personalBoostTags: z.array(z.string()).optional(),
}) as unknown as z.ZodType<BookmarkResponse>;

export const performanceHighlightsResponseSchema = bookmarkListResponseSchema;

export const tagWithCountSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  _count: z.object({ bookmarks: z.number() }),
});

export const tagsResponseSchema = z.array(
  tagWithCountSchema
) as unknown as z.ZodType<TagWithCount[]>;

export const collectionWithCountSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  type: collectionTypeSchema,
  isPublic: z.boolean(),
  shareSlug: z.string().nullable(),
  externalSource: z.string().nullable(),
  externalSourceId: z.string().nullable(),
  createdAt: z.string(),
  _count: z.object({ items: z.number() }),
});

export const collectionsResponseSchema = z.array(
  collectionWithCountSchema
) as unknown as z.ZodType<CollectionWithCount[]>;

export const libraryStatsResponseSchema = z.object({
  libraryBookmarkCount: z.number(),
  organizedBookmarkCount: z.number(),
});

const syncRunSummarySchema = z.object({
  id: z.string(),
  status: z.enum(["PENDING", "RUNNING", "COMPLETED", "RATE_LIMITED", "FAILED"]),
  newBookmarks: z.number(),
  updatedBookmarks: z.number(),
  totalFetched: z.number(),
  hitExisting: z.boolean(),
  rateLimited: z.boolean(),
  rateLimitResetsAt: z.string().nullable(),
  errorMessage: z.string().nullable(),
  pagesFetched: z.number(),
  resumeToken: z.string().nullable(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
});

export const syncStatusResponseSchema = z.object({
  currentRun: syncRunSummarySchema.nullable(),
  recentRuns: z.array(syncRunSummarySchema),
}) as unknown as z.ZodType<SyncStatusResponse>;

export const analyticsDataSchema: z.ZodType<AnalyticsData> = z
  .object({
    topAuthors: z.array(
      z.object({
        author: z.string(),
        displayName: z.string().nullable(),
        profileImage: z.string().nullable(),
        verified: z.boolean(),
        count: z.number(),
      })
    ),
    mediaBreakdown: z.array(
      z.object({ type: z.string(), count: z.number() })
    ),
    tagDistribution: z.array(
      z.object({
        id: z.string(),
        tag: z.string(),
        color: z.string(),
        count: z.number(),
      })
    ),
    bookmarksByMonth: z.array(
      z.object({ month: z.string(), count: z.number() })
    ),
    bookmarksByDay: z.array(z.object({ day: z.string(), count: z.number() })),
    totalBookmarks: z.number(),
    untaggedCount: z.number(),
    untaggedOldestAt: z.string().nullable(),
    orbitQueueCount: z.number(),
    rawHighlightsCount: z.number(),
    notedCount: z.number(),
    last30dCount: z.number(),
    previous30dCount: z.number(),
  })
  .passthrough() as unknown as z.ZodType<AnalyticsData>;

export const orbitGraphPayloadSchema: z.ZodType<OrbitGraphPayload> = z.object({
  nodes: z.array(z.object({ kind: z.string() }).passthrough()),
  edges: z.array(z.object({ kind: z.string() }).passthrough()),
  stats: z
    .object({
      tagCount: z.number(),
      userCollectionCount: z.number(),
      xFolderCount: z.number(),
    })
    .passthrough(),
  generatedAt: z.string(),
  nodeCap: z.number(),
  scope: z.enum(["library", "orbit"]).optional(),
}) as unknown as z.ZodType<OrbitGraphPayload>;

export const orbitScanCandidatesResponseSchema = z.object({
  bookmarks: z.array(bookmarkWithRelationsSchema),
}) as unknown as z.ZodType<OrbitScanCandidatesResponse>;

export const orbitScanQualityPayloadSchema: z.ZodType<OrbitScanQualityPayload> = z
  .object({
    recommendedProfile: z.string(),
    profileReason: z.string(),
    successfulScanCount: z.number(),
    recentScanCount: z.number(),
    largeSuccessfulScanCount: z.number(),
    usefulSuggestionRate: z.number(),
    modelAbstainRate: z.number(),
    failureRate: z.number(),
    medianDurationMs: z.number(),
    reviewedSuggestionCount: z.number(),
    reviewUsefulRate: z.number().nullable(),
    deep: z.object({
      unlocked: z.boolean(),
      reason: z.string(),
    }),
  })
  .passthrough() as unknown as z.ZodType<OrbitScanQualityPayload>;

export const orbitXaiStatusPayloadSchema: z.ZodType<OrbitXaiStatusPayload> =
  z.object({
    state: z.enum(["ready", "misconfigured"]),
    checkedAt: z.string(),
    apiKeyConfigured: z.boolean(),
    model: z.string(),
    modelSource: z.enum(["default", "environment"]),
    baseUrl: z.string(),
    baseUrlSource: z.enum(["default", "environment"]),
    privacy: z.object({
      storeDisabled: z.boolean(),
      zeroDataRetention: z.boolean().nullable(),
    }),
    issues: z.array(
      z.object({
        code: z.enum(["missing_api_key", "xai_auth", "xai_model"]),
        title: z.string(),
        message: z.string(),
      })
    ),
  }) as unknown as z.ZodType<OrbitXaiStatusPayload>;

export const collectionDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  type: z.string(),
  isPublic: z.boolean(),
  shareSlug: z.string().nullable(),
  externalSource: z.string().nullable(),
  externalSourceId: z.string().nullable(),
  items: z.array(
    z.object({
      id: z.string(),
      sortOrder: z.number(),
      bookmark: bookmarkWithRelationsSchema,
    })
  ),
  total: z.number(),
  page: z.number(),
  totalPages: z.number(),
  nextCursor: z.string().optional(),
});

export const shareContentSchema = z.object({
  thread: z.array(z.object({ text: z.string() })),
  summaryTweet: z.string(),
  shareUrl: z.string(),
  xIntentUrl: z.string(),
  collectionName: z.string(),
  itemCount: z.number(),
}) as unknown as z.ZodType<ShareContent>;

export const bookmarkFocusResponseSchema = z.object({
  bookmarks: z.array(bookmarkWithRelationsSchema),
}) as unknown as z.ZodType<{ bookmarks: BookmarkWithRelations[] }>;
