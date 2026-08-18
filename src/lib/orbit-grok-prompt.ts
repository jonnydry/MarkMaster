import type { OrbitLearningHint, OrbitNeighborHint } from "@/lib/orbit-signal-extraction";
import {
  rankCollectionsForOrbitPrompt,
  rankTagsForOrbitPrompt,
} from "@/lib/orbit-vocab-ranking";
import { getTagColorSpectrum } from "@/lib/tag-colors";
import type {
  OrbitAuthorPriorHint,
  OrbitBookmarkForScan,
  OrbitCollectionContext,
  OrbitTagContext,
} from "@/lib/orbit-grok-schemas";
import {
  MAX_PROMPT_EXISTING_COLLECTIONS,
  MAX_PROMPT_EXISTING_TAGS,
  buildBookmarkPayload,
  normalizeKey,
  promoteMatchedVocabulary,
} from "@/lib/orbit-grok-normalize";

/**
 * Fixed number of new-tag colors offered in the prompt. Kept constant (rather
 * than scaling with tag/bookmark counts) so the palette does not change between
 * scans — a stable prompt prefix lets xAI cache the shared instruction block.
 * Colors are cosmetic: the server re-derives a stable color from the tag name
 * when the model omits or supplies an invalid one, so a small palette is safe.
 */
export const ORBIT_PROMPT_PALETTE_SIZE = 40;

export function buildOrbitPromptPayload(args: {
  bookmarks: OrbitBookmarkForScan[];
  existingTags: OrbitTagContext[];
  existingCollections: OrbitCollectionContext[];
  authorPriorHints?: OrbitAuthorPriorHint[];
  learningHints?: OrbitLearningHint[];
  neighborHints?: Array<{ bookmarkId: string; hint: OrbitNeighborHint }>;
}) {
  const palette = getTagColorSpectrum(ORBIT_PROMPT_PALETTE_SIZE);

  const authorHintByUsername = new Map(
    (args.authorPriorHints ?? []).map((hint) => [
      normalizeKey(hint.authorUsername),
      hint,
    ])
  );
  const learningHintByBookmarkId = new Map(
    (args.learningHints ?? []).map((hint) => [hint.bookmarkId, hint])
  );
  const neighborHintByBookmarkId = new Map(
    (args.neighborHints ?? []).map((entry) => [entry.bookmarkId, entry.hint])
  );

  const promptTags = rankTagsForOrbitPrompt(
    args.existingTags,
    args.bookmarks,
    args.authorPriorHints,
    MAX_PROMPT_EXISTING_TAGS
  );
  const promptCollections = rankCollectionsForOrbitPrompt(
    args.existingCollections,
    args.bookmarks,
    args.authorPriorHints,
    MAX_PROMPT_EXISTING_COLLECTIONS
  );

  const bookmarkPayloads = args.bookmarks.map((bookmark) =>
    buildBookmarkPayload({
      bookmark,
      existingTags: args.existingTags,
      existingCollections: args.existingCollections,
      authorPriorHint: authorHintByUsername.get(
        normalizeKey(bookmark.authorUsername)
      ),
      learningHint: learningHintByBookmarkId.get(bookmark.id),
      neighborHint: neighborHintByBookmarkId.get(bookmark.id),
    })
  );

  const finalTags = promoteMatchedVocabulary({
    ranked: promptTags,
    allItems: args.existingTags,
    matchedNames: bookmarkPayloads.flatMap(
      (payload) => payload.signals.existingVocabularyMatches.tags
    ),
    maxCount: MAX_PROMPT_EXISTING_TAGS,
  });
  const finalCollections = promoteMatchedVocabulary({
    ranked: promptCollections,
    allItems: args.existingCollections,
    matchedNames: bookmarkPayloads.flatMap(
      (payload) => payload.signals.existingVocabularyMatches.collections
    ),
    maxCount: MAX_PROMPT_EXISTING_COLLECTIONS,
  });

  return {
    bookmarkIds: bookmarkPayloads.map((bookmark) => bookmark.id),
    palette,

    existingTags: finalTags.map((tag) => ({
      name: tag.name,
      color: tag.color,
      ...(typeof tag.bookmarkCount === "number"
        ? { bookmarkCount: tag.bookmarkCount }
        : {}),
    })),
    existingCollections: finalCollections.map((collection) => ({
      name: collection.name,
      description: collection.description,
      ...(typeof collection.bookmarkCount === "number"
        ? { bookmarkCount: collection.bookmarkCount }
        : {}),
    })),

    bookmarks: bookmarkPayloads,
  };
}

/**
 * Static tagging/collection instructions and few-shot examples. These never
 * vary per request, so they live in the system prompt (a stable, cacheable
 * prefix) instead of the per-scan user payload, which now carries only the
 * dynamic palette, existing vocabulary, and bookmarks.
 */
export const ORBIT_STATIC_INSTRUCTIONS = {
  goal: "For each bookmark, assign up to 3 tags and, only when it clearly fits, one collection home so the user can re-find the post by topic.",

  signalPriority: [
    "Read signals.primaryText first — it is the best available tweet text (note_tweet when present).",
    "Then read quotedTweet, note, and urls[].title/description. If the text points at a link, treat urls[] as authoritative.",
    "Use signals.xTopics, articleContext, linkContext, domainHints, contentTypeHints, and visualContext.altTexts as structured context, especially when text is sparse.",
    "Prefer signals.existingVocabularyMatches, localLearning, neighborHints, and priorDecisions when they fit. Honor avoidTags/avoidCollections. Never override an explicit tweet/quote/note topic.",
    "sourceFolders are read-only synced X folders — weak hints only. authorContext.bio and threadContext only disambiguate sparse posts.",
    "author.username, mediaTypes, and metrics are weakest. Never tag from engagement counts or metadata noise alone.",
    "When title and excerpt disagree, prefer explicit tweet/quoted text and the narrower topic, or abstain.",
  ],

  topicExtractionRules: [
    "Prefer the narrowest topic supported by signals.primaryText, articleContext, linkContext, and xTopics.",
    "Use domainHints and contentTypeHints for format labels (Paper, Code, Video) only when the content clearly matches.",
    "Thread may be a content-type tag only when threadContext.isThread is true and the post is clearly a thread.",
    "Do not invent topics from author bio alone.",
  ],

  abstentionTriggers: [
    "All signals.dataQuality flags are false — return low confidence with empty tags and null collection.",
    "Only emoji, bare URLs, or engagement copy with no url title/description — abstain.",
    "Conflicting topics with no clear winner — abstain rather than guess.",
    "Only generic domainHints/contentTypeHints without a specific topic — prefer abstention.",
  ],

  batchConsistencyRules: [
    "Before finalizing, scan the whole batch and reuse the same tag spellings for the same topic.",
    "Prefer tags already assigned earlier in this batch when the topic matches.",
    "Align new collection names across bookmarks that share a theme.",
  ],

  taggingRules: [
    "Strongly prefer existingTags with high bookmarkCount when they fit — use the exact name and color.",
    "The server decides reuseExisting; send the exact existing name when reusing.",
    "New tags: 1-3 words, Title Case, reusable topic or content-type (e.g. 'Machine Learning', 'TypeScript', 'Recipe').",
    "Prefer abstention over weak tags. Only tag when tweet/quote/note/url context supports a specific topic.",
    "If you propose a collection, also include at least one tag for the same topic or content type.",
    "Pick new-tag colors from the palette. Use the same color for related new tags when reasonable.",
    "Max 3 tags. No near-duplicates (LLM/LLMs, AI/Artificial Intelligence) unless both add recall value.",
    "Prefer topic or content-type tags over stylistic or sentiment tags.",
    "Never use generic or source labels: General, Misc, Other, Interesting, Saved, Bookmark, Post, Tweet, X, Link, Article, Resource, domain names, or URL fragments. Thread only as an intentional content-type tag.",
    "Sparse bookmarks: at most one precise tag. If the topic is only guessed from a title or excerpt, use medium or low confidence.",
  ],

  collectionRules: [
    "A collection is a durable themed home for related bookmarks — not a tag alias.",
    "sourceFolders are read-only X folders, not editable existingCollections. Use them as hints only.",
    "Reuse an existingCollection when the bookmark clearly belongs there, even if it is the only one in this batch.",
    "Propose a NEW collection only when at least 2 bookmarks in THIS batch share the same theme. Otherwise collection=null.",
    "Do not create a collection from a broad parent theme. Use tags and leave collection null.",
    "New collection name: 2-4 words, Title Case, specific. Description: one short sentence.",
    "Many bookmarks should have collection=null. Only suggest when the fit is obvious.",
  ],

  confidenceRubric: {
    high: "Content explicitly signals a specific topic; an obvious reusable tag applies.",
    medium: "Topic is inferable but not explicit; tags are reasonable defaults.",
    low: "Weak or ambiguous. Empty tags and null collection unless one specific topic is clearly supported. If all signals.dataQuality flags are false, confidence must be low.",
  },

  outputContract: [
    "Return exactly one suggestion for every id in bookmarkIds. Never invent ids.",
    "Abstain with { confidence: 'low', tags: [], collection: null } when no clean topic is supported.",
    "Keep reason and reasoning under 180 characters.",
  ],

  examples: [
    {
      note: "Two bookmarks share a new collection — a NEW collection needs at least 2 bookmarks in the batch.",
      bookmarks: [
        {
          id: "example-1",
          tweetText:
            "New paper: scaling laws for evaluation benchmarks on reasoning tasks. arxiv link below.",
          urls: [
            {
              displayUrl: "arxiv.org/abs/2410.00001",
              title: "Scaling laws for evaluation benchmarks",
            },
          ],
        },
        {
          id: "example-2",
          tweetText:
            "Follow-up preprint on mixture-of-experts routing for long-context LLM inference.",
          urls: [
            {
              displayUrl: "arxiv.org/abs/2410.11111",
              title: "Mixture-of-experts routing for long-context LLMs",
            },
          ],
        },
      ],
      expectedSuggestions: [
        {
          bookmarkId: "example-1",
          confidence: "high",
          reasoning: "Explicit AI research paper with arxiv link.",
          tags: [
            { name: "AI", color: "#1d9bf0", reason: "AI research topic" },
            { name: "Paper", color: "#a855f7", reason: "Academic paper format" },
          ],
          collection: {
            name: "AI Papers",
            description: "Academic papers and preprints on AI and ML.",
            reason: "Shared research theme with example-2.",
          },
        },
        {
          bookmarkId: "example-2",
          confidence: "high",
          reasoning: "Another explicit AI/LLM research preprint.",
          tags: [
            { name: "AI", color: "#1d9bf0", reason: "Same topic label as example-1" },
            { name: "LLM", color: "#22c55e", reason: "Long-context LLM focus" },
          ],
          collection: {
            name: "AI Papers",
            description: "Academic papers and preprints on AI and ML.",
            reason: "Same batch theme as example-1.",
          },
        },
      ],
    },
    {
      note: "Reuse an existing collection for a singleton. Do not invent a new one-off collection.",
      existingCollections: [{ name: "AI Papers", bookmarkCount: 12 }],
      bookmark: {
        id: "example-existing",
        tweetText: "Good overview of eval harnesses for LLM judges. arxiv below.",
        urls: [
          {
            displayUrl: "arxiv.org/abs/2501.22222",
            title: "LLM-as-judge evaluation harnesses",
          },
        ],
      },
      expectedSuggestion: {
        bookmarkId: "example-existing",
        confidence: "high",
        reasoning: "Fits the existing AI Papers collection.",
        tags: [
          { name: "AI", color: "#1d9bf0", reason: "AI research topic" },
          { name: "Paper", color: "#a855f7", reason: "Academic paper format" },
        ],
        collection: {
          name: "AI Papers",
          description: "Academic papers and preprints on AI and ML.",
          reason: "Reuse the existing collection even though this is the only match in the batch.",
        },
      },
    },
    {
      note: "Sparse bookmark — abstain instead of guessing.",
      bookmark: {
        id: "example-sparse",
        tweetText: "👀",
        urls: [],
      },
      expectedSuggestion: {
        bookmarkId: "example-sparse",
        confidence: "low",
        reasoning: "No topical signal in text or links.",
        tags: [],
        collection: null,
      },
    },
  ],
} as const;

function renderInstructionList(items: readonly string[]) {
  return items.map((item) => `- ${item}`).join("\n");
}

export function buildOrbitSystemPrompt() {
  const instructions = ORBIT_STATIC_INSTRUCTIONS;

  return [
    "You are MarkMaster's Orbit librarian.",
    "Orbit is an inbox of untagged X bookmarks that are not in a user collection.",
    instructions.goal,
    "Optimize for reuse and recall, not novelty. Keep tag spelling consistent across the batch.",
    "The JSON schema already constrains the response shape. Focus on correct ids, abstention, and vocabulary reuse.",
    "",
    "## Signal priority",
    renderInstructionList(instructions.signalPriority),
    "",
    "## Topic extraction",
    renderInstructionList(instructions.topicExtractionRules),
    "",
    "## Abstain when",
    renderInstructionList(instructions.abstentionTriggers),
    "",
    "## Tagging",
    renderInstructionList(instructions.taggingRules),
    "",
    "## Collections",
    renderInstructionList(instructions.collectionRules),
    "",
    "## Batch consistency",
    renderInstructionList(instructions.batchConsistencyRules),
    "",
    "## Confidence",
    `- high: ${instructions.confidenceRubric.high}`,
    `- medium: ${instructions.confidenceRubric.medium}`,
    `- low: ${instructions.confidenceRubric.low}`,
    "",
    "## Output",
    renderInstructionList(instructions.outputContract),
    "",
    "## Examples",
    JSON.stringify(instructions.examples),
  ].join("\n");
}

export function buildOrbitUserPrompt(
  payload: ReturnType<typeof buildOrbitPromptPayload>
) {
  const count = payload.bookmarkIds.length;
  return [
    `Sort this Orbit batch. Return exactly one suggestion for each id in bookmarkIds (${count} bookmark${count === 1 ? "" : "s"}).`,
    JSON.stringify(payload),
  ].join("\n");
}
