export interface ShareThreadTweet {
  text: string;
}

export interface ShareContent {
  thread: ShareThreadTweet[];
  summaryTweet: string;
  shareUrl: string;
  xIntentUrl: string;
  collectionName: string;
  itemCount: number;
}

const X_TWEET_MAX_LENGTH = 280;

interface BookmarkForShare {
  tweetId: string;
  authorUsername: string;
  authorDisplayName: string;
  tweetText: string;
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + "…";
}

function buildBookmarkTweet(
  bookmark: BookmarkForShare,
  index: number,
  total: number
): string {
  const tweetUrl = `https://x.com/${bookmark.authorUsername}/status/${bookmark.tweetId}`;
  const tweetText = truncate(bookmark.tweetText, 200);

  let tweet = `📌 ${index + 1}/${total}\n\n`;

  if (bookmark.authorDisplayName) {
    tweet += `${bookmark.authorDisplayName} @${bookmark.authorUsername}\n\n`;
  } else {
    tweet += `@${bookmark.authorUsername}\n\n`;
  }

  tweet += `${tweetText}\n\n`;
  tweet += `🔗 ${tweetUrl}`;

  return truncate(tweet, X_TWEET_MAX_LENGTH);
}

export function generateShareContent(
  collectionName: string,
  collectionDescription: string | null,
  bookmarks: BookmarkForShare[],
  shareSlug: string,
  origin: string
): ShareContent {
  const shareUrl = `${origin}/share/${shareSlug}`;
  const total = bookmarks.length;
  const THREAD_THRESHOLD = 10;

  const headerTweet = collectionDescription
    ? `📚 ${collectionName}\n\n${truncate(collectionDescription, 180)}\n\n${total} curated bookmark${total !== 1 ? "s" : ""} ↓`
    : `📚 ${collectionName}\n\n${total} curated bookmark${total !== 1 ? "s" : ""} ↓`;

  const thread: ShareThreadTweet[] = [];

  if (total <= THREAD_THRESHOLD) {
    thread.push({ text: truncate(headerTweet, X_TWEET_MAX_LENGTH) });
    for (let i = 0; i < total; i++) {
      thread.push({ text: buildBookmarkTweet(bookmarks[i], i, total) });
    }
  } else {
    const topBookmarks = bookmarks.slice(0, 3);
    let highlights = topBookmarks
      .map((b) => `• @${b.authorUsername}`)
      .join("\n");

    const remaining = total - 3;
    if (remaining > 0) {
      highlights += `\n... and ${remaining} more`;
    }

    let summaryText = `📚 ${collectionName}\n\n`;
    if (collectionDescription) {
      summaryText += `${truncate(collectionDescription, 120)}\n\n`;
    }
    summaryText += `${total} curated bookmarks\n\n`;
    summaryText += `Highlights:\n${highlights}\n\n`;
    summaryText += `📋 View all → ${shareUrl}`;

    thread.push({ text: truncate(summaryText, X_TWEET_MAX_LENGTH) });
  }

  const summaryTweet =
    total <= THREAD_THRESHOLD
      ? truncate(headerTweet, X_TWEET_MAX_LENGTH)
      : (() => {
          let s = `📚 ${collectionName}`;
          if (collectionDescription) {
            s += ` — ${truncate(collectionDescription, 80)}`;
          }
          s += `\n\n${total} curated bookmarks\n\n📋 ${shareUrl}`;
          return truncate(s, X_TWEET_MAX_LENGTH);
        })();

  const xIntentUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(summaryTweet)}`;

  return {
    thread,
    summaryTweet,
    shareUrl,
    xIntentUrl,
    collectionName,
    itemCount: total,
  };
}

export function generateClipboardThread(thread: ShareThreadTweet[]): string {
  return thread.map((tweet, i) => `--- Tweet ${i + 1} ---\n${tweet.text}`).join("\n\n");
}