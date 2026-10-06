/** Stable names the verify seed and the browser driver both assert. */

export const VERIFY_XID = "verify-markmaster-local";
export const VERIFY_USERNAME = "verify_reader";
export const VERIFY_DISPLAY_NAME = "Verify Reader";

export const TAG_DESIGN = "Design";
export const TAG_RESEARCH = "Research";
export const COLLECTION_NAME = "Reading list";
export const NOTE_TEXT = "Verify note: keep this with the design tag";

export const HIGHLIGHTS = [
  {
    tweetId: "900000000000000001",
    authorId: "verify-author-ada",
    authorUsername: "ada_marker",
    authorDisplayName: "Ada Marker",
    tweetText:
      "Verify highlight: untouched high engagement save about local archives",
    metrics: {
      like_count: 420,
      retweet_count: 80,
      reply_count: 36,
      quote_count: 4,
      bookmark_count: 90,
    },
  },
  {
    tweetId: "900000000000000002",
    authorId: "verify-author-nia",
    authorUsername: "nia_queue",
    authorDisplayName: "Nia Queue",
    tweetText: "Verify highlight: second untouched save with replies and likes",
    metrics: {
      like_count: 210,
      retweet_count: 40,
      reply_count: 18,
      quote_count: 2,
      bookmark_count: 44,
    },
  },
  {
    tweetId: "900000000000000003",
    authorId: "verify-author-omar",
    authorUsername: "omar_shelf",
    authorDisplayName: "Omar Shelf",
    tweetText: "Verify highlight: third untouched save waiting in discovery",
    metrics: {
      like_count: 160,
      retweet_count: 22,
      reply_count: 11,
      quote_count: 1,
      bookmark_count: 30,
    },
  },
  {
    tweetId: "900000000000000004",
    authorId: "verify-author-priya",
    authorUsername: "priya_raw",
    authorDisplayName: "Priya Raw",
    tweetText: "Verify highlight: fourth untouched save so the raw pool is healthy",
    metrics: {
      like_count: 140,
      retweet_count: 19,
      reply_count: 9,
      quote_count: 1,
      bookmark_count: 25,
    },
  },
];

export const FEED_BOOKMARK = {
  tweetId: "900000000000000010",
  authorId: "verify-author-bea",
  authorUsername: "bea_curator",
  authorDisplayName: "Bea Curator",
  tweetText: "Verify feed: tagged design note for card actions",
  tag: TAG_DESIGN,
  metrics: {
    like_count: 12,
    retweet_count: 1,
    reply_count: 0,
    quote_count: 0,
    bookmark_count: 2,
  },
};

export const COLLECTION_BOOKMARK = {
  tweetId: "900000000000000020",
  authorId: "verify-author-cole",
  authorUsername: "cole_reader",
  authorDisplayName: "Cole Reader",
  tweetText: "Verify collection: reading list item about square geometry",
  tag: TAG_RESEARCH,
  metrics: {
    like_count: 15,
    retweet_count: 2,
    reply_count: 1,
    quote_count: 0,
    bookmark_count: 3,
  },
};
