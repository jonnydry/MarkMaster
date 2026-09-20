import { hasVideoLikeMedia, type BookmarkMediaJson } from "@/lib/bookmark-media";

const TCO_URL = /https?:\/\/t\.co\/[A-Za-z0-9]+/gi;

export type BookmarkDisplayTextSource = {
  tweetText: string;
  authorUsername?: string | null;
  media?: BookmarkMediaJson[] | null;
};

/** True when the body is empty or only t.co short links (common media-only saves). */
export function isTcoOnlyTweetText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  const remainder = trimmed.replace(TCO_URL, "").replace(/\s+/g, "");
  return remainder.length === 0;
}

/**
 * Card/list title for a bookmark. Leaves mixed captions alone; replaces
 * empty or t.co-only bodies with "Photo/Video/Post by @author".
 */
export function formatBookmarkDisplayText(
  bookmark: BookmarkDisplayTextSource
): string {
  const text = bookmark.tweetText.trim();
  if (!isTcoOnlyTweetText(text)) return text;

  const handle = bookmark.authorUsername?.replace(/^@/, "").trim();
  const kind = hasVideoLikeMedia(bookmark.media)
    ? "Video"
    : bookmark.media?.length
      ? "Photo"
      : "Post";

  return handle ? `${kind} by @${handle}` : kind;
}
