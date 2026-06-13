import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  ORBIT_GROK_MAX_BOOKMARKS_PER_SCAN,
  ORBIT_SCAN_BATCH_PROFILES,
} from "@/lib/orbit-config";
import type { OrbitLearningHint, OrbitNeighborHint } from "@/lib/orbit-signal-extraction";
import {
  GENERIC_COLLECTION_NAMES,
  normalizeColor,
  normalizeKey,
  normalizeWhitespace,
  truncateText,
} from "@/lib/orbit-grok-normalize";
import {
  buildOrbitPromptPayload,
  buildOrbitSystemPrompt,
} from "@/lib/orbit-grok-prompt";
import {
  buildOrbitCollectionRollups,
  buildOrbitScanSummary,
  buildOrbitTagRollups,
  extractXaiResponsesOutputText,
  normalizeOrbitScanPlan,
  parseXaiOrbitScanPlanJson,
} from "@/lib/orbit-grok-parse";
import {
  getOrbitXaiRuntimeStatus,
  ORBIT_SCAN_PLAN_JSON_SCHEMA,
  OrbitGrokError,
  type OrbitAuthorPriorHint,
  type OrbitBookmarkForScan,
  type OrbitCollectionContext,
  type OrbitScanPlan,
  type OrbitTagContext,
} from "@/lib/orbit-grok-schemas";
import type {
  OrbitApplyResult,
  OrbitScanBatchMetadata,
  OrbitScanResponsePayload,
} from "@/types";

export {
  OrbitGrokError,
  getOrbitXaiRuntimeStatus,
  orbitConfidenceSchema,
  orbitTagSuggestionSchema,
  orbitCollectionSuggestionSchema,
  orbitBookmarkSuggestionSchema,
  orbitScanOverviewSchema,
  orbitScanPlanSchema,
  orbitScanBatchMetadataSchema,
  orbitScanRequestSchema,
  type OrbitScanPlan,
} from "@/lib/orbit-grok-schemas";

export type {
  OrbitBookmarkForScan,
  OrbitTagContext,
  OrbitCollectionContext,
  OrbitAuthorPriorHint,
} from "@/lib/orbit-grok-schemas";

export {
  trimTagsForOrbitPrompt,
  trimCollectionsForOrbitPrompt,
} from "@/lib/orbit-grok-normalize";

export { buildOrbitPromptPayload } from "@/lib/orbit-grok-prompt";

export {
  parseXaiOrbitScanPlanJson,
  extractXaiResponsesOutputText,
  normalizeOrbitScanPlan,
  buildOrbitTagRollups,
  buildOrbitCollectionRollups,
  buildOrbitScanSummary,
} from "@/lib/orbit-grok-parse";

function parseRetryAfterSeconds(value: string | null): number | undefined {
  if (!value) return undefined;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.ceil(seconds);
  }

  const resetTime = Date.parse(value);
  if (!Number.isNaN(resetTime)) {
    const resetSeconds = Math.ceil((resetTime - Date.now()) / 1000);
    return resetSeconds > 0 ? resetSeconds : undefined;
  }

  return undefined;
}

function extractXaiErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object" || !("error" in body)) {
    return fallback;
  }

  const error = (body as { error: unknown }).error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }

  return fallback;
}

export async function scanOrbitBookmarksWithXai(args: {
  bookmarks: OrbitBookmarkForScan[];
  existingTags: OrbitTagContext[];
  existingCollections: OrbitCollectionContext[];
  authorPriorHints?: OrbitAuthorPriorHint[];
  learningHints?: OrbitLearningHint[];
  neighborHints?: Array<{ bookmarkId: string; hint: OrbitNeighborHint }>;
  batch?: OrbitScanBatchMetadata;
}): Promise<OrbitScanResponsePayload> {
  if (args.bookmarks.length === 0) {
    throw new OrbitGrokError(
      "Select at least one bookmark to scan.",
      400,
      "scan_request"
    );
  }

  if (args.bookmarks.length > ORBIT_GROK_MAX_BOOKMARKS_PER_SCAN) {
    throw new OrbitGrokError(
      `Scan up to ${ORBIT_GROK_MAX_BOOKMARKS_PER_SCAN} bookmarks at a time.`,
      400,
      "scan_request"
    );
  }

  const apiKey = process.env.XAI_API_KEY?.trim();
  if (!apiKey) {
    throw new OrbitGrokError(
      "Set XAI_API_KEY before scanning Orbit with Grok.",
      503,
      "xai_auth"
    );
  }

  const runtimeStatus = getOrbitXaiRuntimeStatus();
  const baseUrl = runtimeStatus.baseUrl;
  const model = runtimeStatus.model;
  const promptPayload = buildOrbitPromptPayload(args);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        input: [
          {
            role: "system",
            content: buildOrbitSystemPrompt(),
          },
          {
            role: "user",
            content: JSON.stringify(promptPayload),
          },
        ],
        store: false,
        text: {
          format: {
            type: "json_schema",
            name: "orbit_scan_plan",
            schema: ORBIT_SCAN_PLAN_JSON_SCHEMA,
            strict: true,
          },
        },
      }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    throw new OrbitGrokError(
      "xAI could not be reached. Try the scan again in a moment.",
      503,
      "xai_unavailable"
    );
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = extractXaiErrorMessage(
      body,
      `xAI request failed with status ${response.status}`
    );

    if (response.status === 401 || response.status === 403) {
      throw new OrbitGrokError(
        "xAI rejected the request. Confirm your API key and model access.",
        502,
        "xai_auth"
      );
    }

    if (response.status === 404) {
      throw new OrbitGrokError(
        "xAI could not find the configured Grok model.",
        502,
        "xai_model"
      );
    }

    if (response.status === 429) {
      throw new OrbitGrokError(
        "xAI rate limit reached. Try the scan again in a moment.",
        429,
        "xai_rate_limited",
        {
          retryAfterSeconds: parseRetryAfterSeconds(
            response.headers.get("retry-after")
          ),
        }
      );
    }

    throw new OrbitGrokError(message, 502, "xai_unavailable");
  }

  const payload = await response.json().catch(() => null);
  const rawText = extractXaiResponsesOutputText(payload);

  if (!rawText) {
    throw new OrbitGrokError(
      "xAI returned an empty Orbit scan.",
      502,
      "xai_response"
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText);
  } catch {
    throw new OrbitGrokError(
      "xAI returned invalid JSON for the Orbit scan.",
      502,
      "xai_response"
    );
  }

  const rawPlan = parseXaiOrbitScanPlanJson(parsedJson);
  const plan = normalizeOrbitScanPlan(rawPlan, {
    bookmarkIds: args.bookmarks.map((bookmark) => bookmark.id),
    existingTags: args.existingTags,
    existingCollections: args.existingCollections,
  });
  const requestedCount = args.bookmarks.length;
  const batch: OrbitScanBatchMetadata =
    args.batch ??
    {
      mode: "balanced",
      profile:
        requestedCount <= ORBIT_SCAN_BATCH_PROFILES.quick.size
          ? "quick"
          : requestedCount <= ORBIT_SCAN_BATCH_PROFILES.balanced.size
            ? "balanced"
            : "deep",
      requestedCount,
      candidatePoolCount: requestedCount,
      sharedSignalCount: 0,
      sourceUnknownCount: 0,
      sourceUnknownRate: 0,
      selectedSourceUnknownCount: 0,
      selectedSourceUnknownRate: 0,
      usefulSignalCount: 0,
      selectionReason: "Scanned the provided bookmark IDs.",
    };

  return {
    scanRunId: randomUUID(),
    model,
    scannedAt: new Date().toISOString(),
    privacy: {
      storeDisabled: true,
      zeroDataRetention:
        response.headers.get("x-zero-data-retention") === "true"
          ? true
          : response.headers.get("x-zero-data-retention") === "false"
            ? false
            : null,
    },
    batch,
    plan,
    summary: buildOrbitScanSummary(plan),
    tagRollups: buildOrbitTagRollups(plan),
    collectionRollups: buildOrbitCollectionRollups(plan),
  };
}

export async function applyOrbitScanPlan(args: {
  userId: string;
  plan: OrbitScanPlan;
  createCollections: boolean;
}): Promise<OrbitApplyResult> {
  const bookmarkIds = Array.from(
    new Set(args.plan.suggestions.map((suggestion) => suggestion.bookmarkId))
  );

  if (bookmarkIds.length === 0) {
    throw new OrbitGrokError(
      "The scan plan does not contain any bookmarks.",
      400,
      "scan_request"
    );
  }

  const bookmarks = await prisma.bookmark.findMany({
    where: {
      userId: args.userId,
      id: { in: bookmarkIds },
    },
    select: { id: true },
  });

  if (bookmarks.length !== bookmarkIds.length) {
    throw new OrbitGrokError(
      "One or more bookmarks in the scan plan no longer exist.",
      404,
      "bookmark_not_found"
    );
  }

  const [existingTags, existingCollections] = await Promise.all([
    prisma.tag.findMany({
      where: { userId: args.userId },
      orderBy: { name: "asc" },
    }),
    prisma.collection.findMany({
      where: {
        userId: args.userId,
        type: "user_collection",
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const tagMap = new Map(existingTags.map((tag) => [normalizeKey(tag.name), tag]));
  const collectionMap = new Map(
    existingCollections.map((collection) => [normalizeKey(collection.name), collection])
  );

  const tagDefinitions = new Map<string, { name: string; color: string }>();
  const tagAssignments: Array<{ bookmarkId: string; tagKey: string }> = [];
  const collectionBuckets = new Map<
    string,
    {
      name: string;
      description: string;
      reuseExisting: boolean;
      bookmarkIds: Set<string>;
    }
  >();

  for (const suggestion of args.plan.suggestions) {
    for (const tag of suggestion.tags) {
      const tagKey = normalizeKey(tag.name);
      if (!tagKey) continue;

      if (!tagDefinitions.has(tagKey)) {
        tagDefinitions.set(tagKey, {
          name: tagMap.get(tagKey)?.name ?? normalizeWhitespace(tag.name).slice(0, 50),
          color: tagMap.get(tagKey)?.color ?? normalizeColor(tag.name, tag.color),
        });
      }

      tagAssignments.push({ bookmarkId: suggestion.bookmarkId, tagKey });
    }

    if (!suggestion.collection) continue;

    const collectionKey = normalizeKey(suggestion.collection.name);
    if (!collectionKey || GENERIC_COLLECTION_NAMES.has(collectionKey)) continue;

    const bucket = collectionBuckets.get(collectionKey);
    if (bucket) {
      bucket.bookmarkIds.add(suggestion.bookmarkId);
      bucket.reuseExisting = bucket.reuseExisting || suggestion.collection.reuseExisting;
      continue;
    }

    collectionBuckets.set(collectionKey, {
      name:
        collectionMap.get(collectionKey)?.name ??
        normalizeWhitespace(suggestion.collection.name).slice(0, 100),
      description:
        truncateText(
          collectionMap.get(collectionKey)?.description ??
            suggestion.collection.description,
          240
        ) || "Auto-sorted from Orbit by Grok.",
      reuseExisting: suggestion.collection.reuseExisting,
      bookmarkIds: new Set([suggestion.bookmarkId]),
    });
  }

  const result: OrbitApplyResult = {
    bookmarkCount: bookmarkIds.length,
    createdTags: 0,
    reusedTags: 0,
    tagAssignments: 0,
    createdCollections: 0,
    reusedCollections: 0,
    collectionAssignments: 0,
    skippedNewCollectionSingletons: 0,
  };

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtext(${`orbit-apply:${args.userId}`}))
    `);

    const [lockedTags, lockedCollections] = await Promise.all([
      tx.tag.findMany({
        where: { userId: args.userId },
        orderBy: { name: "asc" },
      }),
      tx.collection.findMany({
        where: {
          userId: args.userId,
          type: "user_collection",
        },
        orderBy: { updatedAt: "desc" },
      }),
    ]);

    tagMap.clear();
    for (const tag of lockedTags) {
      tagMap.set(normalizeKey(tag.name), tag);
    }

    collectionMap.clear();
    for (const collection of lockedCollections) {
      collectionMap.set(normalizeKey(collection.name), collection);
    }

    for (const [tagKey, tagDefinition] of tagDefinitions) {
      const existingTag = tagMap.get(tagKey);
      if (existingTag) {
        result.reusedTags += 1;
        continue;
      }

      try {
        const createdTag = await tx.tag.create({
          data: {
            userId: args.userId,
            name: tagDefinition.name,
            color: tagDefinition.color,
          },
        });

        tagMap.set(tagKey, createdTag);
        result.createdTags += 1;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          const recoveredTag = await tx.tag.findUnique({
            where: {
              userId_name: {
                userId: args.userId,
                name: tagDefinition.name,
              },
            },
          });
          if (recoveredTag) {
            tagMap.set(tagKey, recoveredTag);
            result.reusedTags += 1;
            continue;
          }
        }

        throw error;
      }
    }

    if (tagAssignments.length > 0) {
      const seenAssignments = new Set<string>();
      const assignmentRows: Array<{ bookmarkId: string; tagId: string }> = [];

      for (const assignment of tagAssignments) {
        const tag = tagMap.get(assignment.tagKey);
        if (!tag) continue;

        const assignmentKey = `${assignment.bookmarkId}\0${tag.id}`;
        if (seenAssignments.has(assignmentKey)) continue;

        seenAssignments.add(assignmentKey);
        assignmentRows.push({
          bookmarkId: assignment.bookmarkId,
          tagId: tag.id,
        });
      }

      if (assignmentRows.length > 0) {
        const createManyResult = await tx.bookmarkTag.createMany({
          data: assignmentRows,
          skipDuplicates: true,
        });
        result.tagAssignments = createManyResult.count;
      }
    }

    for (const [collectionKey, bucket] of collectionBuckets) {
      let collection = collectionMap.get(collectionKey) ?? null;

      if (!collection) {
        if (!args.createCollections) {
          continue;
        }

        if (bucket.bookmarkIds.size < 2) {
          result.skippedNewCollectionSingletons += 1;
          continue;
        }

        collection = await tx.collection.create({
          data: {
            userId: args.userId,
            name: bucket.name,
            description: bucket.description,
            type: "user_collection",
            isPublic: false,
          },
        });

        collectionMap.set(collectionKey, collection);
        result.createdCollections += 1;
      } else {
        result.reusedCollections += 1;
      }

      const maxOrder = await tx.collectionItem.findFirst({
        where: { collectionId: collection.id },
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });

      const baseOrder = (maxOrder?.sortOrder ?? -1) + 1;
      const bookmarkIdList = Array.from(bucket.bookmarkIds);

      if (bookmarkIdList.length === 0) continue;

      const createManyResult = await tx.collectionItem.createMany({
        data: bookmarkIdList.map((bookmarkId, index) => ({
          collectionId: collection.id,
          bookmarkId,
          sortOrder: baseOrder + index,
        })),
        skipDuplicates: true,
      });

      result.collectionAssignments += createManyResult.count;
    }
  });

  return result;
}
