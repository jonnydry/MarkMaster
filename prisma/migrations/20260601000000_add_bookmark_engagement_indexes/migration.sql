-- Support fast engagement and Highlights ordering without recomputing JSONB metrics from scratch for every request.
CREATE INDEX IF NOT EXISTS "Bookmark_userId_likeCount_idx"
ON "Bookmark" (
  "userId",
  (COALESCE(("publicMetrics"->>'like_count')::int, 0)) DESC,
  "id" DESC
);

CREATE INDEX IF NOT EXISTS "Bookmark_userId_retweetCount_idx"
ON "Bookmark" (
  "userId",
  (COALESCE(("publicMetrics"->>'retweet_count')::int, 0)) DESC,
  "id" DESC
);

CREATE INDEX IF NOT EXISTS "Bookmark_userId_replyCount_idx"
ON "Bookmark" (
  "userId",
  (COALESCE(("publicMetrics"->>'reply_count')::int, 0)) DESC,
  "id" DESC
);

CREATE INDEX IF NOT EXISTS "Bookmark_userId_performanceScore_idx"
ON "Bookmark" (
  "userId",
  (
    1.0 * LN(1 + COALESCE(("publicMetrics"->>'like_count')::int, 0)) +
    2.0 * LN(1 + COALESCE(("publicMetrics"->>'retweet_count')::int, 0)) +
    3.5 * LN(1 + COALESCE(("publicMetrics"->>'reply_count')::int, 0)) +
    2.0 * LN(1 + COALESCE(("publicMetrics"->>'quote_count')::int, 0)) +
    6.0 * LN(1 + COALESCE(("publicMetrics"->>'bookmark_count')::int, 0))
  ) DESC,
  "id" DESC
);
