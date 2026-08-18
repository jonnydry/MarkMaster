import { z } from "zod";
import { ORBIT_GROK_MAX_BOOKMARKS_PER_SCAN } from "@/lib/orbit-config";
import type { OrbitScanFailureCode, OrbitXaiStatusPayload } from "@/types";

const DEFAULT_XAI_BASE_URL = "https://api.x.ai/v1";
export const DEFAULT_XAI_MODEL = "grok-4.6";
export const ORBIT_XAI_PROMPT_CACHE_KEY = "markmaster-orbit-scan";
export const ORBIT_XAI_REASONING_EFFORT = "low";


export class OrbitGrokError extends Error {
  status: number;
  code: OrbitScanFailureCode;
  retryAfterSeconds?: number;

  constructor(
    message: string,
    status = 500,
    code: OrbitScanFailureCode = "unknown",
    opts?: { retryAfterSeconds?: number }
  ) {
    super(message);
    this.name = "OrbitGrokError";
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = opts?.retryAfterSeconds;
  }
}

export function getOrbitXaiRuntimeStatus(args?: {
  lastFailureCode?: OrbitScanFailureCode | null;
}): OrbitXaiStatusPayload {
  const configuredApiKey = process.env.XAI_API_KEY?.trim();
  const configuredBaseUrl = process.env.XAI_API_BASE_URL?.trim();
  const configuredModel = process.env.XAI_ORBIT_MODEL?.trim();
  const issues: OrbitXaiStatusPayload["issues"] = [];

  if (!configuredApiKey) {
    issues.push({
      code: "missing_api_key",
      title: "xAI API key is missing",
      message: "Set XAI_API_KEY on the server, then restart MarkMaster.",
    });
  } else if (args?.lastFailureCode === "xai_auth") {
    issues.push({
      code: "xai_auth",
      title: "xAI rejected the last Orbit scan",
      message:
        "Confirm the server key is valid and has access to the configured Grok model.",
    });
  }

  if (args?.lastFailureCode === "xai_model") {
    issues.push({
      code: "xai_model",
      title: "Configured Grok model was not found",
      message:
        "Update XAI_ORBIT_MODEL or enable this model for the current xAI key.",
    });
  }

  return {
    state: issues.length > 0 ? "misconfigured" : "ready",
    checkedAt: new Date().toISOString(),
    apiKeyConfigured: Boolean(configuredApiKey),
    model: configuredModel || DEFAULT_XAI_MODEL,
    modelSource: configuredModel ? "environment" : "default",
    baseUrl: (configuredBaseUrl || DEFAULT_XAI_BASE_URL).replace(/\/$/, ""),
    baseUrlSource: configuredBaseUrl ? "environment" : "default",
    privacy: {
      storeDisabled: true,
      zeroDataRetention: null,
    },
    issues,
  };
}

export interface OrbitBookmarkForScan {
  id: string;
  tweetId: string;
  authorUsername: string;
  authorDisplayName: string;
  authorVerified: boolean;
  tweetText: string;
  tweetCreatedAt: Date | string;
  bookmarkedAt: Date | string;
  publicMetrics: unknown;
  media: unknown;
  urls: unknown;
  quotedTweet: unknown;
  xMetadata?: unknown;
  notes: Array<{ id: string; content: string }>;
  xFolderHints?: Array<{ id?: string; name: string }>;
}

export interface OrbitTagContext {
  id?: string;
  name: string;
  color: string;
  bookmarkCount?: number;
}

export interface OrbitCollectionContext {
  id?: string;
  name: string;
  description: string | null;
  bookmarkCount?: number;
}

export interface OrbitAuthorPriorHint {
  authorUsername: string;
  priorCount: number;
  tags: string[];
  collections: string[];
}

export const orbitConfidenceSchema = z.enum(["high", "medium", "low"]);

/** Normalized tag suggestion — `reuseExisting` is computed locally, not from xAI. */
export const orbitTagSuggestionSchema = z.object({
  name: z.string().trim().min(1).max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  reason: z.string().trim().min(1).max(180),
  reuseExisting: z.boolean(),
});

/** Normalized collection suggestion — `reuseExisting` is computed locally, not from xAI. */
export const orbitCollectionSuggestionSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(240),
  reason: z.string().trim().min(1).max(180),
  reuseExisting: z.boolean(),
});

/** xAI response contract — matches `ORBIT_SCAN_PLAN_JSON_SCHEMA` (no `reuseExisting`). */
export const orbitTagSuggestionFromXaiSchema = z.object({
  name: z.string(),
  color: z.string(),
  reason: z.string(),
});

export const orbitCollectionSuggestionFromXaiSchema = z.object({
  name: z.string(),
  description: z.string(),
  reason: z.string(),
});

export const orbitBookmarkSuggestionFromXaiSchema = z.object({
  bookmarkId: z.string(),
  confidence: orbitConfidenceSchema,
  reasoning: z.string(),
  tags: z.array(orbitTagSuggestionFromXaiSchema),
  collection: z.union([orbitCollectionSuggestionFromXaiSchema, z.null()]),
});

export const orbitScanPlanFromXaiSchema = z.object({
  overview: z.object({
    summary: z.string(),
    taggingStrategy: z.string(),
    collectionStrategy: z.string(),
  }),
  suggestions: z.array(orbitBookmarkSuggestionFromXaiSchema),
});

export type OrbitScanPlanFromXai = z.infer<typeof orbitScanPlanFromXaiSchema>;

export const orbitBookmarkSuggestionSchema = z.object({
  bookmarkId: z.string().trim().min(1),
  confidence: orbitConfidenceSchema,
  reasoning: z.string().trim().min(1).max(240),
  tags: z.array(orbitTagSuggestionSchema),
  collection: z.union([orbitCollectionSuggestionSchema, z.null()]),
});

export const orbitScanOverviewSchema = z.object({
  summary: z.string().trim().min(1).max(240),
  taggingStrategy: z.string().trim().min(1).max(240),
  collectionStrategy: z.string().trim().min(1).max(240),
});

export const orbitScanPlanSchema = z.object({
  overview: orbitScanOverviewSchema,
  suggestions: z
    .array(orbitBookmarkSuggestionSchema)
    .max(
      ORBIT_GROK_MAX_BOOKMARKS_PER_SCAN,
      `Apply up to ${ORBIT_GROK_MAX_BOOKMARKS_PER_SCAN} Orbit suggestions at a time`
    ),
});

const orbitScanBatchProfileSchema = z.enum(["quick", "balanced", "deep"]);

export const orbitScanBatchMetadataSchema = z.object({
  mode: z.enum(["auto", "quick", "balanced", "deep"]),
  profile: orbitScanBatchProfileSchema,
  requestedCount: z.number().int().min(1).max(ORBIT_GROK_MAX_BOOKMARKS_PER_SCAN),
  candidatePoolCount: z.number().int().min(1).max(100),
  sharedSignalCount: z.number().min(0),
  sourceUnknownCount: z.number().int().min(0).max(100),
  sourceUnknownRate: z.number().min(0).max(1),
  selectedSourceUnknownCount: z
    .number()
    .int()
    .min(0)
    .max(ORBIT_GROK_MAX_BOOKMARKS_PER_SCAN),
  selectedSourceUnknownRate: z.number().min(0).max(1),
  usefulSignalCount: z.number().int().min(0),
  selectionReason: z.string().trim().min(1).max(240),
  enrichment: z
    .object({
      attempted: z.number().int().min(0),
      refreshed: z.number().int().min(0),
      skipped: z.number().int().min(0),
      failed: z.number().int().min(0).optional(),
      reason: z
        .enum(["rate_limited", "auth_error", "none_needed", "error"])
        .optional(),
    })
    .optional(),
  signalQuality: z
    .object({
      richCount: z.number().int().min(0),
      sparseCount: z.number().int().min(0),
    })
    .optional(),
});

export const orbitScanRequestSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("scan"),
    bookmarkIds: z
      .array(z.string().trim().min(1, "Bookmark ID is required"))
      .min(1, "Select at least one bookmark to scan")
      .max(
        ORBIT_GROK_MAX_BOOKMARKS_PER_SCAN,
        `Scan up to ${ORBIT_GROK_MAX_BOOKMARKS_PER_SCAN} bookmarks at a time`
      ),
    batch: orbitScanBatchMetadataSchema.optional(),
  }),
  z.object({
    mode: z.literal("apply"),
    createCollections: z.boolean().default(true),
    plan: orbitScanPlanSchema,
  }),
]);

export type OrbitScanPlan = z.infer<typeof orbitScanPlanSchema>;

export const ORBIT_SCAN_PLAN_JSON_SCHEMA = {
  type: "object",
  properties: {
    overview: {
      type: "object",
      properties: {
        summary: { type: "string", description: "A concise summary of the queue." },
        taggingStrategy: {
          type: "string",
          description: "A short description of the tag pattern you used.",
        },
        collectionStrategy: {
          type: "string",
          description: "A short description of the collection grouping you used.",
        },
      },
      required: ["summary", "taggingStrategy", "collectionStrategy"],
      additionalProperties: false,
    },
    suggestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          bookmarkId: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          reasoning: {
            type: "string",
            description: "A short rationale for the suggestion.",
          },
          tags: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                color: { type: "string" },
                reason: { type: "string" },
              },
              required: ["name", "color", "reason"],
              additionalProperties: false,
            },
          },
          collection: {
            anyOf: [
              {
                type: "object",
                properties: {
                  name: { type: "string" },
                  description: { type: "string" },
                  reason: { type: "string" },
                },
                required: ["name", "description", "reason"],
                additionalProperties: false,
              },
              { type: "null" },
            ],
          },
        },
        required: ["bookmarkId", "confidence", "reasoning", "tags", "collection"],
        additionalProperties: false,
      },
    },
  },
  required: ["overview", "suggestions"],
  additionalProperties: false,
} as const;
