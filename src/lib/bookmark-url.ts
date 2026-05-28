/** Minimal bookmark fields needed to build an X post URL. */
export type BookmarkTweetLink = {
  authorUsername: string | null | undefined;
  tweetId: string;
};

export function getBookmarkTweetUrl(
  bookmark: BookmarkTweetLink
): string | undefined {
  if (!bookmark.authorUsername) return undefined;
  return `https://x.com/${bookmark.authorUsername}/status/${bookmark.tweetId}`;
}

export function openBookmarkOnX(
  bookmark: BookmarkTweetLink,
  target: "_blank" | "_self" = "_blank"
): void {
  const url = getBookmarkTweetUrl(bookmark);
  if (!url) return;
  window.open(url, target, "noopener,noreferrer");
}
