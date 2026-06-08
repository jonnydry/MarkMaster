type JsonObject = Record<string, unknown>;

export interface OrbitPrimaryTextBookmark {
  tweetText: string;
  xMetadata?: unknown;
}

export interface OrbitBookmarkTextFields extends OrbitPrimaryTextBookmark {
  quotedTweet?: unknown;
  notes?: Array<{ content: string }>;
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getNestedObject(value: unknown, key: string): JsonObject | null {
  if (!isObject(value)) return null;
  const nested = value[key];
  return isObject(nested) ? nested : null;
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/** Whether text carries enough topical signal for Orbit (shared with batch planner). */
export function textHasUsefulSignal(value: string | null | undefined) {
  if (!value) return false;
  const stripped = value
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[^\p{L}\p{N}#+.-]+/gu, " ")
    .trim();
  if (stripped.length < 8) return false;
  return /[\p{L}\p{N}]/u.test(stripped);
}

/** Raw note_tweet text from xMetadata, when present. */
export function getOrbitNoteTweetText(xMetadata: unknown): string | null {
  const tweet = getNestedObject(xMetadata, "tweet");
  const noteTweet = getNestedObject(tweet, "note_tweet");
  return getString(noteTweet?.text);
}

/** Article title from xMetadata, when present. */
export function getOrbitArticleTitle(xMetadata: unknown): string | null {
  const article = getNestedObject(getNestedObject(xMetadata, "tweet"), "article");
  return getString(article?.title);
}

/** Article preview text from xMetadata, when present. */
export function getOrbitArticlePreviewText(xMetadata: unknown): string | null {
  const article = getNestedObject(getNestedObject(xMetadata, "tweet"), "article");
  if (!article) return null;
  return (
    getString(article.preview_text) ??
    getString(article.previewText) ??
    getString(article.description)
  );
}

/** Author bio from xMetadata, when present. */
export function getOrbitAuthorBio(xMetadata: unknown): string | null {
  const author = getNestedObject(xMetadata, "author");
  return getString(author?.description);
}

/** Quoted tweet text from stored quotedTweet payload. */
export function getOrbitQuotedText(quotedTweet: unknown): string | null {
  if (!isObject(quotedTweet)) return null;
  return getString(quotedTweet.text);
}

/** Best available tweet body: note_tweet text, then stored tweetText. */
export function getOrbitBookmarkPrimaryText(
  bookmark: OrbitPrimaryTextBookmark
): string {
  return getOrbitNoteTweetText(bookmark.xMetadata) ?? bookmark.tweetText;
}

/** Supplemental text fields aligned with signal extraction haystack inputs. */
export function collectOrbitBookmarkHaystackTexts(
  bookmark: OrbitBookmarkTextFields
): string[] {
  return [
    getOrbitBookmarkPrimaryText(bookmark),
    bookmark.notes?.[0]?.content,
    getOrbitQuotedText(bookmark.quotedTweet),
    getOrbitArticleTitle(bookmark.xMetadata),
    getOrbitArticlePreviewText(bookmark.xMetadata),
    getOrbitAuthorBio(bookmark.xMetadata),
  ].filter((value): value is string => Boolean(value));
}