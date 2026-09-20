import "server-only";

import {
  ORBIT_GROK_MAX_PROPOSED_COLLECTIONS,
  ORBIT_GROK_MAX_PROPOSED_TAGS,
} from "@/lib/orbit-config";
import {
  GENERIC_COLLECTION_NAMES,
  GENERIC_TAG_NAMES,
  isUrlLikeLabel,
  normalizeKey,
  normalizeSuggestedCollectionName,
  normalizeSuggestedTagName,
} from "@/lib/orbit-grok-normalize";
import { extractXaiResponsesOutputText } from "@/lib/orbit-grok-parse";
import { buildOrbitPromptPayload } from "@/lib/orbit-grok-prompt";
import {
  getOrbitXaiRuntimeStatus,
  OrbitGrokError,
  ORBIT_XAI_PROMPT_CACHE_KEY,
  ORBIT_XAI_REASONING_EFFORT,
  type OrbitAuthorPriorHint,
  type OrbitBookmarkForScan,
  type OrbitCollectionContext,
  type OrbitHybridLeftoverNote,
  type OrbitTagContext,
} from "@/lib/orbit-grok-schemas";
import type { OrbitLearningHint, OrbitNeighborHint } from "@/lib/orbit-signal-extraction";
import type { OrbitLabelPool } from "@/lib/orbit-jev-assign";

export const ORBIT_VOCAB_JSON_SCHEMA = {
  type: "object",
  properties: {
    tags: {
      type: "array",
      maxItems: ORBIT_GROK_MAX_PROPOSED_TAGS,
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          reason: { type: "string" },
        },
        required: ["name", "reason"],
        additionalProperties: false,
      },
    },
    collections: {
      type: "array",
      maxItems: ORBIT_GROK_MAX_PROPOSED_COLLECTIONS,
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          reason: { type: "string" },
        },
        required: ["name", "description", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["tags", "collections"],
  additionalProperties: false,
} as const;

const VOCAB_SYSTEM_PROMPT = [
  "Propose a small increment of NEW tag and collection names for this Orbit batch.",
  "Do not assign labels to individual bookmarks.",
  "Do not repeat names already listed in existingTags or existingCollections.",
  `Propose at most ${ORBIT_GROK_MAX_PROPOSED_TAGS} tags and ${ORBIT_GROK_MAX_PROPOSED_COLLECTIONS} collections.`,
  "Names must be specific topics a person would filter by. No generic words like bookmarks, links, or interesting.",
  "Return empty arrays when the existing vocabulary already covers the batch.",
].join(" ");

export function parseOrbitVocabIncrement(value: unknown): OrbitLabelPool {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const rawTags = Array.isArray(record.tags) ? record.tags : [];
  const rawCollections = Array.isArray(record.collections) ? record.collections : [];

  const tags = rawTags.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const name = normalizeSuggestedTagName(
      String((item as { name?: unknown }).name ?? "")
    );
    const reason = String((item as { reason?: unknown }).reason ?? "").trim();
    if (!name || GENERIC_TAG_NAMES.has(normalizeKey(name)) || isUrlLikeLabel(name)) {
      return [];
    }
    return [{ name, existing: false as const, reason: reason.slice(0, 180) || undefined }];
  });

  const collections = rawCollections.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const name = normalizeSuggestedCollectionName(
      String((item as { name?: unknown }).name ?? "")
    );
    const description = String(
      (item as { description?: unknown }).description ?? ""
    ).trim();
    const reason = String((item as { reason?: unknown }).reason ?? "").trim();
    if (
      !name ||
      GENERIC_COLLECTION_NAMES.has(normalizeKey(name)) ||
      isUrlLikeLabel(name)
    ) {
      return [];
    }
    return [
      {
        name,
        existing: false as const,
        description: description.slice(0, 240) || undefined,
        reason: reason.slice(0, 180) || undefined,
      },
    ];
  });

  return {
    tags: tags.slice(0, ORBIT_GROK_MAX_PROPOSED_TAGS),
    collections: collections.slice(0, ORBIT_GROK_MAX_PROPOSED_COLLECTIONS),
  };
}

export async function proposeOrbitVocabWithXai(args: {
  bookmarks: OrbitBookmarkForScan[];
  existingTags: OrbitTagContext[];
  existingCollections: OrbitCollectionContext[];
  authorPriorHints?: OrbitAuthorPriorHint[];
  learningHints?: OrbitLearningHint[];
  neighborHints?: Array<{ bookmarkId: string; hint: OrbitNeighborHint }>;
  gapHints?: OrbitHybridLeftoverNote[];
  apiKey: string;
}): Promise<OrbitLabelPool> {
  const runtime = getOrbitXaiRuntimeStatus();
  const payload = buildOrbitPromptPayload(args);

  let response: Response;
  try {
    response = await fetch(`${runtime.baseUrl}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${args.apiKey}`,
      },
      body: JSON.stringify({
        model: runtime.model,
        input: [
          { role: "system", content: VOCAB_SYSTEM_PROMPT },
          {
            role: "user",
            content: JSON.stringify({
              existingTags: payload.existingTags,
              existingCollections: payload.existingCollections,
              bookmarks: payload.bookmarks.map((bookmark) => ({
                id: bookmark.id,
                author: bookmark.author.username,
                text: bookmark.tweetText,
                note: bookmark.note,
                urls: bookmark.urls,
                matches: bookmark.signals.existingVocabularyMatches,
              })),
              leftoverGaps: args.gapHints ?? [],
              leftoverInstruction: args.gapHints?.length
                ? "Propose only names that cover leftoverGaps. Keep already-matched tags; do not invent a second name for the same topic."
                : undefined,
            }),
          },
        ],
        store: false,
        prompt_cache_key: `${ORBIT_XAI_PROMPT_CACHE_KEY}-vocab`,
        reasoning: { effort: ORBIT_XAI_REASONING_EFFORT },
        text: {
          format: {
            type: "json_schema",
            name: "orbit_vocab_increment",
            schema: ORBIT_VOCAB_JSON_SCHEMA,
            strict: true,
          },
        },
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new OrbitGrokError(
      "xAI could not be reached while proposing Orbit labels.",
      503,
      "xai_unavailable"
    );
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new OrbitGrokError(
        "xAI rejected the vocabulary request. Confirm your API key.",
        502,
        "xai_auth"
      );
    }
    if (response.status === 429) {
      throw new OrbitGrokError(
        "xAI rate limit reached while proposing Orbit labels.",
        429,
        "xai_rate_limited"
      );
    }
    throw new OrbitGrokError(
      "xAI could not propose Orbit labels.",
      502,
      "xai_unavailable"
    );
  }

  const body = await response.json().catch(() => null);
  const rawText = extractXaiResponsesOutputText(body);
  if (!rawText) {
    return { tags: [], collections: [] };
  }

  try {
    return parseOrbitVocabIncrement(JSON.parse(rawText));
  } catch {
    return { tags: [], collections: [] };
  }
}
