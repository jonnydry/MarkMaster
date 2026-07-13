import { z } from "zod";
import { logWarn } from "@/lib/logger";
import { PRESET_COLORS } from "@/lib/constants";
import { getTagColorSpectrum } from "@/lib/tag-colors";
import {
  OrbitGrokError,
  orbitConfidenceSchema,
  orbitScanPlanFromXaiSchema,
  type OrbitScanPlan,
  type OrbitScanPlanFromXai,
  type OrbitCollectionContext,
  type OrbitTagContext,
} from "@/lib/orbit-grok-schemas";
import {
  GENERIC_COLLECTION_NAMES,
  GENERIC_TAG_NAMES,
  buildDefaultSuggestion,
  isUrlLikeLabel,
  normalizeColor,
  normalizeKey,
  normalizeSuggestedCollectionName,
  normalizeSuggestedTagName,
  normalizeTagKey,
  tagLookupKeys,
  truncateText,
} from "@/lib/orbit-grok-normalize";
import type {
  OrbitCollectionRollup,
  OrbitScanSummary,
  OrbitTagRollup,
} from "@/types";

const looseStringSchema = z.preprocess((value) => {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}, z.string());

const looseConfidenceSchema = z.preprocess((value) => {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return normalized === "high" || normalized === "medium" || normalized === "low"
    ? normalized
    : "low";
}, orbitConfidenceSchema);

const looseOrbitTagSuggestionFromXaiSchema = z.object({
  name: looseStringSchema,
  color: looseStringSchema,
  reason: looseStringSchema,
});

const looseOrbitCollectionSuggestionFromXaiSchema = z.object({
  name: looseStringSchema,
  description: looseStringSchema,
  reason: looseStringSchema,
});

const looseOrbitScanOverviewSchema = z.preprocess(
  (value) => (value && typeof value === "object" ? value : {}),
  z.object({
    summary: looseStringSchema,
    taggingStrategy: looseStringSchema,
    collectionStrategy: looseStringSchema,
  })
);

const looseOrbitBookmarkSuggestionFromXaiSchema = z.object({
  bookmarkId: looseStringSchema,
  confidence: looseConfidenceSchema,
  reasoning: looseStringSchema,
  tags: z.preprocess(
    (value) => (Array.isArray(value) ? value : []),
    z.array(looseOrbitTagSuggestionFromXaiSchema)
  ),
  collection: z.preprocess(
    (value) => (value && typeof value === "object" ? value : null),
    z.union([looseOrbitCollectionSuggestionFromXaiSchema, z.null()])
  ),
});

const looseOrbitScanPlanFromXaiSchema = z.object({
  overview: looseOrbitScanOverviewSchema,
  suggestions: z.array(looseOrbitBookmarkSuggestionFromXaiSchema),
});

function unwrapOrbitScanPlanJson(value: unknown) {
  if (!value || typeof value !== "object") return value;

  const record = value as Record<string, unknown>;
  for (const key of ["plan", "scanPlan", "orbitScanPlan", "orbit_scan_plan"]) {
    const candidate = record[key];
    if (candidate && typeof candidate === "object") {
      const nested = candidate as Record<string, unknown>;
      if ("suggestions" in nested || "overview" in nested) {
        return candidate;
      }
    }
  }

  return value;
}

function formatZodIssues(error: z.ZodError) {
  return error.issues
    .slice(0, 8)
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

export function parseXaiOrbitScanPlanJson(parsedJson: unknown): OrbitScanPlanFromXai {
  const candidate = unwrapOrbitScanPlanJson(parsedJson);
  const parsedPlan = orbitScanPlanFromXaiSchema.safeParse(candidate);
  if (parsedPlan.success) {
    return parsedPlan.data;
  }

  const parsedLoosePlan = looseOrbitScanPlanFromXaiSchema.safeParse(candidate);
  if (parsedLoosePlan.success) {
    return parsedLoosePlan.data;
  }

  logWarn(
    "orbit",
    "xAI scan plan failed schema validation",
    {
      strict: formatZodIssues(parsedPlan.error),
      loose: formatZodIssues(parsedLoosePlan.error),
    }
  );

  throw new OrbitGrokError(
    "xAI returned a scan plan in an unexpected format.",
    502,
    "xai_response"
  );
}

/** Parses xAI Responses API JSON bodies (message / output_text shape). Exported for tests. */
export function extractXaiResponsesOutputText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;

  const output = (payload as { output?: unknown[] }).output;
  if (!Array.isArray(output)) return null;

  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    if ((item as { type?: string }).type !== "message") continue;

    const content = (item as { content?: unknown[] }).content;
    if (!Array.isArray(content)) continue;

    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      if ((part as { type?: string }).type === "output_text") {
        const text = (part as { text?: unknown }).text;
        if (typeof text === "string" && text.trim()) {
          return text;
        }
      }
    }
  }

  return null;
}

export function normalizeOrbitScanPlan(
  rawPlan: OrbitScanPlanFromXai,
  context: {
    bookmarkIds: string[];
    existingTags: OrbitTagContext[];
    existingCollections: OrbitCollectionContext[];
  }
): OrbitScanPlan {
  const bookmarkIdSet = new Set(context.bookmarkIds);
  const existingTagMap = new Map(
    context.existingTags.map((tag) => [normalizeKey(tag.name), tag])
  );
  const existingTagAliasMap = new Map<string, OrbitTagContext>();
  for (const tag of context.existingTags) {
    const exactKey = normalizeKey(tag.name);
    const aliasKey = normalizeTagKey(tag.name);
    if (aliasKey === exactKey || existingTagMap.has(aliasKey)) continue;
    if (!existingTagAliasMap.has(aliasKey)) {
      existingTagAliasMap.set(aliasKey, tag);
    }
  }
  const existingCollectionMap = new Map(
    context.existingCollections.map((collection) => [
      normalizeKey(collection.name),
      collection,
    ])
  );
  const palette = getTagColorSpectrum(
    Math.max(
      PRESET_COLORS.length,
      context.existingTags.length + rawPlan.suggestions.length * 3
    )
  );
  const resolveExistingTag = (normalizedName: string) => {
    for (const lookupKey of tagLookupKeys(normalizedName)) {
      const fromMap = existingTagMap.get(lookupKey);
      if (fromMap) return fromMap;
      const fromAlias = existingTagAliasMap.get(lookupKey);
      if (fromAlias) return fromAlias;
    }
    return existingTagMap.get(normalizeKey(normalizedName));
  };
  const collectionSuggestionBookmarkIds = new Map<string, Set<string>>();
  for (const suggestion of rawPlan.suggestions) {
    if (!bookmarkIdSet.has(suggestion.bookmarkId) || !suggestion.collection) continue;

    const normalizedName = normalizeSuggestedCollectionName(suggestion.collection.name);
    const key = normalizeKey(normalizedName);
    if (!normalizedName || GENERIC_COLLECTION_NAMES.has(key)) continue;

    if (existingCollectionMap.has(key)) continue;
    const bookmarkIds =
      collectionSuggestionBookmarkIds.get(key) ?? new Set<string>();
    bookmarkIds.add(suggestion.bookmarkId);
    collectionSuggestionBookmarkIds.set(key, bookmarkIds);
  }

  const suggestionMap = new Map<string, OrbitScanPlan["suggestions"][number]>();

  for (const suggestion of rawPlan.suggestions) {
    if (!bookmarkIdSet.has(suggestion.bookmarkId)) continue;
    if (suggestionMap.has(suggestion.bookmarkId)) continue;

    const seenTagKeys = new Set<string>();
    const normalizedTags = suggestion.tags
      .map((tag) => {
        const normalizedName = normalizeSuggestedTagName(tag.name);
        if (!normalizedName) return null;

        const key = normalizeTagKey(normalizedName);
        if (GENERIC_TAG_NAMES.has(key) || isUrlLikeLabel(normalizedName)) return null;
        if (seenTagKeys.has(key)) return null;
        seenTagKeys.add(key);

        const existingTag = resolveExistingTag(normalizedName);
        return {
          name: existingTag?.name ?? normalizedName.slice(0, 50),
          color:
            existingTag?.color ??
            normalizeColor(normalizedName, tag.color, palette),
          reason: truncateText(tag.reason, 180) || "Suggested from bookmark content.",
          reuseExisting: Boolean(existingTag),
        };
      })
      .filter(Boolean)
      .slice(0, 3) as OrbitScanPlan["suggestions"][number]["tags"];

    let normalizedCollection: OrbitScanPlan["suggestions"][number]["collection"] = null;
    if (suggestion.collection) {
      const normalizedName = normalizeSuggestedCollectionName(
        suggestion.collection.name
      );
      const key = normalizeKey(normalizedName);
      const existingCollection = existingCollectionMap.get(key);
      const hasSpecificCollectionName = Boolean(
        normalizedName &&
          !GENERIC_COLLECTION_NAMES.has(key) &&
          normalizedName.length <= 100
      );

      if (
        hasSpecificCollectionName &&
        (existingCollection ||
          (collectionSuggestionBookmarkIds.get(key)?.size ?? 0) >= 2) &&
        normalizedName.length <= 100
      ) {
        normalizedCollection = {
          name: existingCollection?.name ?? normalizedName,
          description:
            truncateText(
              existingCollection?.description ??
                suggestion.collection.description,
              240
            ) || "Auto-sorted from Orbit by Grok.",
          reason:
            truncateText(suggestion.collection.reason, 180) ||
            "Suggested from bookmark content.",
          reuseExisting: Boolean(existingCollection),
        };
      } else if (
        hasSpecificCollectionName &&
        normalizedTags.length === 0 &&
        suggestion.confidence !== "low" &&
        normalizedName.length <= 50 &&
        !isUrlLikeLabel(normalizedName)
      ) {
        const tagKey = normalizeTagKey(normalizedName);
        if (!GENERIC_TAG_NAMES.has(tagKey) && !seenTagKeys.has(tagKey)) {
          seenTagKeys.add(tagKey);
          const existingTag = resolveExistingTag(normalizedName);
          normalizedTags.push({
            name: existingTag?.name ?? normalizedName,
            color:
              existingTag?.color ??
              normalizeColor(normalizedName, undefined, palette),
            reason:
              truncateText(suggestion.collection.reason, 180) ||
              "Preserved from a one-off collection suggestion.",
            reuseExisting: Boolean(existingTag),
          });
        }
      }
    }

    const hasApplyable =
      normalizedTags.length > 0 || normalizedCollection !== null;
    let reasoning: string;
    if (!hasApplyable) {
      reasoning =
        suggestion.confidence !== "low"
          ? "No applyable suggestion remained after cleanup."
          : truncateText(suggestion.reasoning, 240) ||
            "No confident auto-sort suggestion yet.";
    } else {
      reasoning =
        truncateText(suggestion.reasoning, 240) ||
        "Suggested from bookmark content.";
    }

    suggestionMap.set(suggestion.bookmarkId, {
      bookmarkId: suggestion.bookmarkId,
      confidence: hasApplyable ? suggestion.confidence : "low",
      reasoning,
      tags: normalizedTags,
      collection: normalizedCollection,
    });
  }

  return {
    overview: {
      summary:
        truncateText(rawPlan.overview.summary, 240) ||
        "Grok scanned your Orbit queue and suggested a first organizational pass.",
      taggingStrategy:
        truncateText(rawPlan.overview.taggingStrategy, 240) ||
        "Tags focus on reusable themes and content types.",
      collectionStrategy:
        truncateText(rawPlan.overview.collectionStrategy, 240) ||
        "Collections are only suggested when there is a clear home for the bookmark.",
    },
    suggestions: context.bookmarkIds.map(
      (bookmarkId) => suggestionMap.get(bookmarkId) ?? buildDefaultSuggestion(bookmarkId)
    ),
  };
}

export function buildOrbitTagRollups(plan: OrbitScanPlan): OrbitTagRollup[] {
  const tagMap = new Map<
    string,
    { name: string; color: string; count: number; reuseExisting: boolean }
  >();

  for (const suggestion of plan.suggestions) {
    for (const tag of suggestion.tags) {
      const key = normalizeKey(tag.name);
      const current = tagMap.get(key);
      if (current) {
        current.count += 1;
        current.reuseExisting = current.reuseExisting || tag.reuseExisting;
      } else {
        tagMap.set(key, {
          name: tag.name,
          color: tag.color,
          count: 1,
          reuseExisting: tag.reuseExisting,
        });
      }
    }
  }

  return Array.from(tagMap.values()).sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name)
  );
}

export function buildOrbitCollectionRollups(
  plan: OrbitScanPlan
): OrbitCollectionRollup[] {
  const collectionMap = new Map<
    string,
    {
      name: string;
      description: string;
      count: number;
      reuseExisting: boolean;
      bookmarkIds: string[];
    }
  >();

  for (const suggestion of plan.suggestions) {
    if (!suggestion.collection) continue;

    const key = normalizeKey(suggestion.collection.name);
    const current = collectionMap.get(key);
    if (current) {
      current.count += 1;
      current.reuseExisting = current.reuseExisting || suggestion.collection.reuseExisting;
      current.bookmarkIds.push(suggestion.bookmarkId);
      continue;
    }

    collectionMap.set(key, {
      name: suggestion.collection.name,
      description: suggestion.collection.description,
      count: 1,
      reuseExisting: suggestion.collection.reuseExisting,
      bookmarkIds: [suggestion.bookmarkId],
    });
  }

  return Array.from(collectionMap.values()).sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name)
  );
}

export function buildOrbitScanSummary(plan: OrbitScanPlan): OrbitScanSummary {
  const tagRollups = buildOrbitTagRollups(plan);
  const collectionRollups = buildOrbitCollectionRollups(plan);

  return {
    bookmarkCount: plan.suggestions.length,
    bookmarksWithTags: plan.suggestions.filter((suggestion) => suggestion.tags.length > 0)
      .length,
    bookmarksWithCollections: plan.suggestions.filter(
      (suggestion) => suggestion.collection !== null
    ).length,
    tagAssignments: plan.suggestions.reduce(
      (total, suggestion) => total + suggestion.tags.length,
      0
    ),
    uniqueTags: tagRollups.length,
    collectionBuckets: collectionRollups.length,
    reusedExistingTags: tagRollups.filter((tag) => tag.reuseExisting).length,
    reusedExistingCollections: collectionRollups.filter((collection) => collection.reuseExisting)
      .length,
    newCollectionBuckets: collectionRollups.filter((collection) => !collection.reuseExisting)
      .length,
  };
}
