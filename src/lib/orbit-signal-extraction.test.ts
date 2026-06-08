import { describe, expect, it } from "vitest";

import { extractOrbitBookmarkSignals } from "./orbit-signal-extraction";

describe("extractOrbitBookmarkSignals", () => {
  it("prefers note_tweet text for primaryText and merges note_tweet URLs", () => {
    const signals = extractOrbitBookmarkSignals({
      bookmark: {
        tweetText: "Short tweet",
        authorUsername: "researcher",
        authorDisplayName: "Researcher",
        media: null,
        urls: [
          {
            expanded_url: "https://example.com/a",
            display_url: "example.com/a",
            title: "Example A",
          },
        ],
        quotedTweet: null,
        notes: [],
        xMetadata: {
          tweet: {
            note_tweet: {
              text: "Full note tweet about AI benchmark systems with extra context.",
              entities: {
                urls: [
                  {
                    expanded_url: "https://arxiv.org/abs/2501.00001",
                    display_url: "arxiv.org/abs/2501.00001",
                    title: "AI benchmark paper",
                  },
                ],
              },
            },
            article: {
              title: "Benchmark article",
              preview_text: "Preview body for the article.",
            },
            conversation_id: "conv-1",
            referenced_tweets: [{ type: "replied_to", id: "parent-1" }],
            context_annotations: [
              {
                domain: { name: "Technology" },
                entity: { name: "Artificial Intelligence", description: "AI" },
              },
            ],
          },
          author: {
            description: "Researcher working on AI evaluation benchmarks.",
          },
        },
      },
      existingTags: [{ name: "AI", bookmarkCount: 5 }],
      existingCollections: [{ name: "AI Papers", bookmarkCount: 3 }],
      tweetId: "tweet-99",
    });

    expect(signals.primaryText).toContain("Full note tweet about AI benchmark");
    expect(signals.linkContext).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ domain: "arxiv.org", title: "AI benchmark paper" }),
        expect.objectContaining({ domain: "example.com", title: "Example A" }),
      ])
    );
    expect(signals.articleContext).toMatchObject({
      title: "Benchmark article",
      previewText: "Preview body for the article.",
    });
    expect(signals.threadContext).toMatchObject({
      isThread: true,
      isReply: true,
      conversationId: "conv-1",
    });
    expect(signals.authorContext).toMatchObject({
      bio: "Researcher working on AI evaluation benchmarks.",
    });
    expect(signals.contentTypeHints).toContain("Article");
    expect(signals.domainHints).toContain("Paper");
    expect(signals.dataQuality).toMatchObject({
      hasFullText: true,
      hasNoteText: false,
      hasQuotedText: false,
      hasArticle: true,
      hasThreadContext: true,
      hasAuthorBio: true,
    });
  });

  it("attaches neighbor and learning hints when provided", () => {
    const signals = extractOrbitBookmarkSignals({
      bookmark: {
        tweetText: "Saved AI paper",
        authorUsername: "researcher",
        authorDisplayName: "Researcher",
        media: null,
        urls: null,
        quotedTweet: null,
        notes: [],
      },
      existingTags: [],
      existingCollections: [],
      learningHint: {
        bookmarkId: "b1",
        matchingTags: ["AI"],
        matchingCollections: [],
        avoidTags: [],
        avoidCollections: [],
        reasons: ["same author"],
      },
      neighborHint: {
        tags: ["Paper"],
        collections: ["AI Papers"],
        reasons: ["same link domain: arxiv.org"],
      },
    });

    expect(signals.localLearning).toMatchObject({ matchingTags: ["AI"] });
    expect(signals.neighborHints).toMatchObject({
      tags: ["Paper"],
      collections: ["AI Papers"],
    });
  });

  it("marks all-false dataQuality on sparse emoji-only bookmarks", () => {
    const signals = extractOrbitBookmarkSignals({
      bookmark: {
        tweetText: "👀",
        authorUsername: "researcher",
        authorDisplayName: "Researcher",
        media: null,
        urls: null,
        quotedTweet: null,
        notes: [],
      },
      existingTags: [],
      existingCollections: [],
    });

    expect(signals.dataQuality).toEqual({
      hasFullText: false,
      hasNoteText: false,
      hasQuotedText: false,
      hasUrlMetadata: false,
      hasXTopics: false,
      hasMediaAltText: false,
      hasArticle: false,
      hasThreadContext: false,
      hasAuthorBio: false,
    });
  });

  it("marks substantive tweetText as hasFullText without note_tweet", () => {
    const signals = extractOrbitBookmarkSignals({
      bookmark: {
        tweetText: "Clear AI benchmark paper with enough topical signal.",
        authorUsername: "researcher",
        authorDisplayName: "Researcher",
        media: null,
        urls: null,
        quotedTweet: null,
        notes: [],
      },
      existingTags: [],
      existingCollections: [],
    });

    expect(signals.dataQuality.hasFullText).toBe(true);
  });

  it("includes quoted tweet text and user notes in vocabulary haystack", () => {
    const signals = extractOrbitBookmarkSignals({
      bookmark: {
        tweetText: "Worth saving",
        authorUsername: "researcher",
        authorDisplayName: "Researcher",
        media: null,
        urls: null,
        quotedTweet: { text: "Deep dive on Rust async runtimes" },
        notes: [{ content: "Follow up on Tokio patterns" }],
      },
      existingTags: [{ name: "Rust", bookmarkCount: 3 }],
      existingCollections: [],
    });

    expect(signals.quotedText).toContain("Rust async");
    expect(signals.noteText).toContain("Tokio");
    expect(signals.existingVocabularyMatches.tags).toContain("Rust");
  });
});