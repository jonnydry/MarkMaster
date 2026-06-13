import { PRESET_COLORS } from "@/lib/constants";
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
  MAX_PROMPT_TAG_COLORS,
  buildBookmarkPayload,
  normalizeKey,
  promoteMatchedVocabulary,
} from "@/lib/orbit-grok-normalize";

export function buildOrbitPromptPayload(args: {
  bookmarks: OrbitBookmarkForScan[];
  existingTags: OrbitTagContext[];
  existingCollections: OrbitCollectionContext[];
  authorPriorHints?: OrbitAuthorPriorHint[];
  learningHints?: OrbitLearningHint[];
  neighborHints?: Array<{ bookmarkId: string; hint: OrbitNeighborHint }>;
}) {
  const palette = getTagColorSpectrum(
    Math.min(
      MAX_PROMPT_TAG_COLORS,
      Math.max(
        PRESET_COLORS.length,
        args.existingTags.length + args.bookmarks.length * 3
      )
    )
  );

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
    goal:
      "For each bookmark, (1) assign up to 3 tags and (2) if and only if it clearly fits, assign one collection home. Optimize so the user can later re-find these posts by topic.",

    signalPriority: [
      "Start with bookmarks[].signals: read signals.primaryText first — it is the best available tweet text (note_tweet when present).",
      "Use signals.xTopics, signals.articleContext, signals.linkContext, signals.domainHints, and signals.contentTypeHints as strong structured context.",
      "Use signals.existingVocabularyMatches, signals.neighborHints, signals.localLearning, and signals.sourceFolders as deterministic preference hints.",
      "Use signals.authorContext.bio and signals.threadContext when tweet text is sparse.",
      "Read quotedTweet.text, note, and urls[].title/description after signals.primaryText.",
      "When a bookmark includes priorDecisions, treat frequentTags/frequentCollections as strong hints for that author — but never override explicit tweet/quote/note topic.",
      "When signals.localLearning appears, treat matchingTags/matchingCollections as strong local preference signals and avoidTags/avoidCollections as negative examples.",
      "When signals.neighborHints appears, treat its tags/collections as soft recall hints from similar tagged bookmarks (same author or domain).",
      "Use signals.existingVocabularyMatches as preferred candidates when they fit the content; do not copy them if the bookmark topic does not support them.",
      "Use signals.xTopics and signals.visualContext.altTexts as strong context when tweet text is sparse.",
      "Use sourceFolders as weak-but-useful context because they are synced X folder names for that bookmark.",
      "If tweetText references a link (e.g. 'paper in replies', 'link below'), treat the urls[] entries as authoritative context.",
      "Sparse titles, bare URLs, previews, engagement copy, and boilerplate excerpts are weak signals. Do not tag from metadata noise alone.",
      "When title and excerpt disagree, prefer the explicit tweet/quoted text and choose the narrower topic, or return low confidence if no topic is clear.",
      "Use author.username and mediaTypes only as weak secondary signals.",
      "Use metrics only as the weakest signal — never tag from engagement counts alone.",
    ],

    topicExtractionRules: [
      "Prefer the narrowest specific topic supported by signals.primaryText, articleContext, linkContext, and xTopics.",
      "Use domainHints and contentTypeHints to choose format labels (Paper, Code, Video) only when the content clearly matches.",
      "When threadContext.isThread is true, Thread may be used as a content-type tag if the post is clearly a thread — not as a default.",
      "Do not invent topics from author bio alone; use authorContext only to disambiguate sparse posts.",
    ],

    abstentionTriggers: [
      "All signals.dataQuality flags are false — return low confidence with empty tags and null collection.",
      "Only emoji, bare URLs, or engagement copy with no url title/description — abstain.",
      "Conflicting topics with no clear winner — abstain rather than guess.",
      "Only generic domainHints/contentTypeHints without a specific topic — prefer abstention.",
    ],

    batchConsistencyRules: [
      "Before finalizing, scan all bookmarks in this batch and reuse the same tag spellings for the same topic.",
      "Prefer tags you already assigned to earlier bookmarks in this batch when the topic matches.",
      "Align new collection names across bookmarks that share a theme.",
    ],

    taggingRules: [
      "Strongly prefer existingTags with high bookmarkCount when they fit — use the exact name and color.",
      "For existing tags/collections, use the exact name; the server determines whether it is reused.",
      "Otherwise create a new tag: a short, reusable topic or content-type label, 1-3 words, Title Case (e.g. 'Machine Learning', 'TypeScript', 'Recipe').",
      "Prefer abstention over weak tags: only tag when tweet/quote/note/url context supports a specific topic.",
      "If you propose any collection, also include at least one tag that captures the same topic or content type.",
      "For new tags pick a color from the palette. Use the SAME color for semantically related new tags when reasonable.",
      "Max 3 tags per bookmark. No near-duplicates or parent/child duplicates (e.g. don't pair 'LLM' and 'LLMs', 'AI' and 'Artificial Intelligence', or 'TypeScript' and 'Programming' unless both add clear recall value).",
      "Prefer topic or content-type tags over stylistic or sentiment tags.",
      "Never use generic or source labels: General, Misc, Other, Interesting, Saved, Bookmark, Post, Tweet, X, Link, Article, Resource, Thread (unless Thread is a content type used on purpose), domain names, or URL fragments.",
      "For sparse bookmarks, return at most one precise tag; if the topic is only guessed from an excerpt or title, use confidence medium or low.",
    ],

    collectionRules: [
      "A collection is a durable, themed home for multiple related bookmarks — not a tag alias.",
      "sourceFolders are read-only X folders, not editable existingCollections. Use them as hints only.",
      "Reuse an existingCollection for any bookmark that clearly belongs there, even if it is the only one in this batch.",
      "Only propose a NEW collection when at least 2 bookmarks in THIS batch clearly share the same theme. Otherwise set collection to null.",
      "Do not create a collection from overlapping but different topics. If bookmarks only share a broad parent theme, use tags and leave collection null.",
      "Collection name: 2-4 words, Title Case, specific (not 'Interesting Posts', 'Saved Stuff').",
      "Collection description: one short sentence describing what belongs here.",
      "It is expected and correct that many bookmarks have collection=null. Only suggest when the fit is obvious.",
    ],

    confidenceRubric: {
      high: "Content explicitly signals a specific topic; an obvious reusable tag applies.",
      medium: "Topic is inferable but not explicit; tags are reasonable defaults.",
      low: "Content is weakly inferable or ambiguous. Return empty tags and null collection unless one specific topic is clearly supported. When all signals.dataQuality flags are false, confidence must be low.",
    },

    outputContract: [
      "For every bookmark id in `bookmarks`, return exactly one suggestion with the same id.",
      "Never invent bookmark ids that were not provided.",
      "Return { confidence: 'low', tags: [], collection: null } when tweetText, quotedTweet, note, and url context do not support any clean topic — do not guess.",
      "Keep `reason` and `reasoning` strings short and practical (under 180 characters).",
    ],

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

    examples: [
      {
        note: "Two bookmarks in one batch share a new collection — required for reuseExisting=false collections.",
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

    bookmarks: bookmarkPayloads,
  };
}

export function buildOrbitSystemPrompt() {
  return [
    "You are MarkMaster's Orbit librarian.",
    "Orbit is an inbox of bookmarked X posts that have no tags and are not in any user collection.",
    "Your job: for each bookmark, propose up to 3 concise tags and, only when it clearly fits, a single collection home — so the user can retrieve these posts later by topic.",
    "Optimize for reuse and recall, not novelty: always prefer high-usage existing tags and collections when they fit.",
    "Keep tag vocabulary consistent across the entire batch.",
    "Never invent bookmark ids. Return exactly one suggestion per provided id.",
    "When content is ambiguous, prefer confidence 'low' with empty tags and null collection over guessing.",
    "Use only hex colors from the provided palette for new tags. Return strict JSON matching the provided schema.",
  ].join(" ");
}
