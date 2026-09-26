/**
 * Media keys to hydrate from `includes.media`.
 * Article covers are not listed under `attachments.media_keys`, so a post
 * whose only picture is the article cover would otherwise store no media.
 */
export function tweetMediaKeys(tweet: {
  attachments?: { media_keys?: string[] } | null;
  article?: unknown;
}): string[] {
  const keys: string[] = [];
  const cover = articleCoverMediaKey(tweet.article);
  if (cover) keys.push(cover);

  for (const key of tweet.attachments?.media_keys ?? []) {
    if (key && !keys.includes(key)) keys.push(key);
  }

  return keys;
}

function articleCoverMediaKey(article: unknown): string | undefined {
  if (!article || typeof article !== "object") return undefined;
  const cover = (article as { cover_media?: unknown }).cover_media;
  return typeof cover === "string" && cover.length > 0 ? cover : undefined;
}
