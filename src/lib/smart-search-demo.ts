import { tokenizeBookmarkSearch } from "@/lib/bookmark-search";
import {
  buildBookmarkEmbeddingText,
  type BookmarkEmbeddingSource,
} from "@/lib/bookmark-embedding-text";
import { cosineDistance, reciprocalRankFusion } from "@/lib/reciprocal-rank-fusion";
import { SMART_SEARCH_VECTOR_LIMIT } from "@/lib/smart-bookmark-search";

export type DemoBookmark = BookmarkEmbeddingSource & {
  id: string;
  bookmarkedAt: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function tagNamesFrom(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const names: string[] = [];
  for (const entry of value) {
    if (typeof entry === "string") {
      names.push(entry);
      continue;
    }
    const record = asRecord(entry);
    if (!record) continue;
    if (typeof record.name === "string") {
      names.push(record.name);
      continue;
    }
    const tag = asRecord(record.tag);
    if (typeof tag?.name === "string") names.push(tag.name);
  }
  return names;
}

function noteFrom(record: Record<string, unknown>): string | null {
  if (typeof record.note === "string") return record.note;
  if (!Array.isArray(record.notes)) return null;
  const parts = record.notes
    .map((entry) => asString(asRecord(entry)?.content).trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join("\n") : null;
}

function bookmarkFromExport(value: unknown, index: number): DemoBookmark {
  const record = asRecord(value);
  if (!record) {
    throw new Error(`Bookmark export entry ${index + 1} is not an object`);
  }
  const author = asRecord(record.author);
  const id = asString(record.id) || asString(record.tweetId) || `export-${index + 1}`;
  return {
    id,
    tweetText: asString(record.tweetText) || asString(record.text),
    authorUsername: asString(record.authorUsername) || asString(author?.username),
    authorDisplayName: asString(record.authorDisplayName) || asString(author?.name),
    urls: record.urls ?? null,
    quotedTweet: record.quotedTweet ?? null,
    tagNames: tagNamesFrom(record.tags),
    note: noteFrom(record),
    bookmarkedAt: asString(record.bookmarkedAt) || asString(record.bookmarkedDate),
  };
}

/** Accepts a MarkMaster JSON export array, or `{ bookmarks: [...] }`. */
export function parseBookmarkExport(value: unknown): DemoBookmark[] {
  const record = asRecord(value);
  const rows = Array.isArray(value) ? value : record?.bookmarks;
  if (!Array.isArray(rows)) {
    throw new Error("Bookmark export must be a JSON array or an object with a bookmarks array");
  }
  return rows.map((row, index) => bookmarkFromExport(row, index));
}

/**
 * In-memory stand-in for today's ILIKE search: every term must appear in
 * tweet text, author username, author display name, or the note.
 * Order follows bookmarkedAt descending, then id.
 */
export function keywordHitIds(bookmarks: readonly DemoBookmark[], query: string): string[] {
  const terms = tokenizeBookmarkSearch(query).map((term) => term.toLowerCase());
  if (terms.length === 0) return [];

  return bookmarks
    .filter((bookmark) => {
      const haystack = [
        bookmark.tweetText,
        bookmark.authorUsername,
        bookmark.authorDisplayName,
        bookmark.note ?? "",
      ]
        .join("\n")
        .toLowerCase();
      return terms.every((term) => haystack.includes(term));
    })
    .slice()
    .sort((left, right) => {
      const byDate = right.bookmarkedAt.localeCompare(left.bookmarkedAt);
      if (byDate !== 0) return byDate;
      return left.id.localeCompare(right.id);
    })
    .map((bookmark) => bookmark.id);
}

export function smartHitIds(
  bookmarks: readonly DemoBookmark[],
  queryVector: readonly number[],
  documentVectors: ReadonlyMap<string, readonly number[]>,
  query: string
): string[] {
  const keywordIds = keywordHitIds(bookmarks, query);
  const vectorIds = bookmarks
    .flatMap((bookmark) => {
      const vector = documentVectors.get(bookmark.id);
      if (!vector) return [];
      return [{ id: bookmark.id, distance: cosineDistance(queryVector, vector) }];
    })
    .sort((left, right) => left.distance - right.distance || left.id.localeCompare(right.id))
    .slice(0, SMART_SEARCH_VECTOR_LIMIT)
    .map((row) => row.id);

  return reciprocalRankFusion([vectorIds, keywordIds]).map((row) => row.id);
}

export function demoDocumentText(bookmark: DemoBookmark): string {
  return buildBookmarkEmbeddingText(bookmark);
}

function snippet(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= 80) return flat;
  return `${flat.slice(0, 79)}…`;
}

export function formatDemoReport(options: {
  query: string;
  bookmarks: readonly DemoBookmark[];
  keywordIds: readonly string[];
  smartIds: readonly string[];
}): string {
  const byId = new Map(options.bookmarks.map((bookmark) => [bookmark.id, bookmark]));
  const lines = (ids: readonly string[]) =>
    ids.slice(0, 5).map((id, index) => {
      const bookmark = byId.get(id);
      const handle = bookmark?.authorUsername ? `@${bookmark.authorUsername}` : id;
      const text = bookmark ? snippet(bookmark.tweetText) : "";
      return `  ${index + 1}. ${handle}${text ? ` — ${text}` : ""}`;
    });

  const keywordLines = lines(options.keywordIds);
  const smartLines = lines(options.smartIds);
  return [
    `query: ${options.query}`,
    "keyword:",
    ...(keywordLines.length > 0 ? keywordLines : ["  (no matches)"]),
    "smart:",
    ...(smartLines.length > 0 ? smartLines : ["  (no matches)"]),
  ].join("\n");
}
