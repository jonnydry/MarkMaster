import {
  getOrbitArticlePreviewText,
  getOrbitBookmarkPrimaryText,
  textHasUsefulSignal,
} from "@/lib/orbit-primary-text";
import type { BookmarkWithRelations } from "@/types";

const COMMON_WORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "from",
  "have",
  "into",
  "just",
  "more",
  "post",
  "read",
  "save",
  "than",
  "that",
  "the",
  "this",
  "thread",
  "with",
  "your",
]);

export interface OrbitBatchPlan {
  bookmarkIds: string[];
  sharedSignalCount: number;
  candidateCount: number;
  selectedCount: number;
  sourceUnknownCount: number;
  sourceUnknownRate: number;
  selectedSourceUnknownCount: number;
  selectedSourceUnknownRate: number;
  usefulSignalCount: number;
  selectionReason: string;
}

interface BookmarkSourceQuality {
  sourceUnknown: boolean;
  usefulSignalCount: number;
  score: number;
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function addToken(tokens: Set<string>, value: string | null | undefined, prefix = "kw") {
  if (!value) return;
  const normalized = normalize(value);
  if (!normalized || COMMON_WORDS.has(normalized)) return;
  if (normalized.length < 3 && normalized !== "ai") return;
  tokens.add(`${prefix}:${normalized}`);
}

function addTextTokens(tokens: Set<string>, value: string | null | undefined) {
  if (!value) return;
  for (const word of value.match(/[a-z0-9.+#-]{2,}/gi) ?? []) {
    addToken(tokens, word);
  }
}

function domainFromUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function topicTokensFromMetadata(bookmark: BookmarkWithRelations) {
  const annotations = bookmark.xMetadata?.tweet?.context_annotations;
  if (!Array.isArray(annotations)) return [];

  return annotations.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as {
      domain?: { name?: unknown };
      entity?: { name?: unknown };
    };
    return [
      typeof record.domain?.name === "string" ? record.domain.name : null,
      typeof record.entity?.name === "string" ? record.entity.name : null,
    ].filter(Boolean) as string[];
  });
}

function xMediaAltTexts(bookmark: BookmarkWithRelations) {
  const media = bookmark.xMetadata?.media;
  const storedAltTexts =
    bookmark.media?.flatMap((item) =>
      typeof item.alt_text === "string" ? [item.alt_text] : []
    ) ?? [];
  if (!Array.isArray(media)) return storedAltTexts;

  return storedAltTexts.concat(
    media.flatMap((item) => {
      const altText = item?.alt_text;
      return typeof altText === "string" ? [altText] : [];
    })
  );
}

export function getOrbitBookmarkSourceQuality(
  bookmark: BookmarkWithRelations
): BookmarkSourceQuality {
  let usefulSignalCount = 0;
  if (textHasUsefulSignal(getOrbitBookmarkPrimaryText(bookmark))) usefulSignalCount += 1;
  if (textHasUsefulSignal(getOrbitArticlePreviewText(bookmark.xMetadata))) {
    usefulSignalCount += 1;
  }
  if (textHasUsefulSignal(bookmark.quotedTweet?.text)) usefulSignalCount += 1;

  for (const note of bookmark.notes) {
    if (textHasUsefulSignal(note.content)) usefulSignalCount += 1;
  }

  for (const url of bookmark.urls ?? []) {
    if (textHasUsefulSignal(url.title)) usefulSignalCount += 1;
    if (textHasUsefulSignal(url.description)) usefulSignalCount += 1;
  }

  for (const topic of topicTokensFromMetadata(bookmark)) {
    if (textHasUsefulSignal(topic)) usefulSignalCount += 1;
  }

  for (const altText of xMediaAltTexts(bookmark)) {
    if (textHasUsefulSignal(altText)) usefulSignalCount += 1;
  }

  const hasKnownAuthor =
    normalize(bookmark.authorUsername) !== "" &&
    normalize(bookmark.authorUsername) !== "unknown";
  const sourceUnknown = !hasKnownAuthor || usefulSignalCount === 0;

  return {
    sourceUnknown,
    usefulSignalCount,
    score: (hasKnownAuthor ? 2 : 0) + Math.min(usefulSignalCount, 6),
  };
}

function getBookmarkTokens(bookmark: BookmarkWithRelations) {
  const tokens = new Set<string>();
  addToken(tokens, bookmark.authorUsername, "author");
  addTextTokens(tokens, getOrbitBookmarkPrimaryText(bookmark));

  for (const item of bookmark.collectionItems) {
    addTextTokens(tokens, item.collection.name);
    addToken(tokens, item.collection.name, "folder");
  }

  for (const url of bookmark.urls ?? []) {
    addToken(
      tokens,
      domainFromUrl(url.expanded_url ?? url.url ?? url.display_url),
      "domain"
    );
    addTextTokens(tokens, url.title);
    addTextTokens(tokens, url.description);
  }

  for (const topic of topicTokensFromMetadata(bookmark)) {
    addTextTokens(tokens, topic);
    addToken(tokens, topic, "topic");
  }

  return tokens;
}

function tokenWeight(token: string) {
  if (token.startsWith("folder:")) return 5;
  if (token.startsWith("topic:")) return 4;
  if (token.startsWith("domain:")) return 3;
  if (token.startsWith("author:")) return 2;
  return 1;
}

/*
 * Tokens and source quality depend only on the bookmark row, and query data
 * is immutable (edits produce new objects), so both are memoized per row.
 * The Orbit page re-plans the same 160 candidates on every selection change.
 */
const tokenCache = new WeakMap<BookmarkWithRelations, Set<string>>();
const qualityCache = new WeakMap<BookmarkWithRelations, BookmarkSourceQuality>();

function bookmarkTokens(bookmark: BookmarkWithRelations) {
  let tokens = tokenCache.get(bookmark);
  if (!tokens) {
    tokens = getBookmarkTokens(bookmark);
    tokenCache.set(bookmark, tokens);
  }
  return tokens;
}

function bookmarkQuality(bookmark: BookmarkWithRelations) {
  let quality = qualityCache.get(bookmark);
  if (!quality) {
    quality = getOrbitBookmarkSourceQuality(bookmark);
    qualityCache.set(bookmark, quality);
  }
  return quality;
}

/**
 * Picks a coherent batch: seed with the bookmark sharing the most weighted
 * tokens with the whole pool (plus its source quality), then repeatedly add
 * the bookmark sharing the most weighted tokens with everything picked so far
 * (ties: higher quality, then queue order).
 *
 * Linear-ish by construction: a bookmark's overlap with the whole pool is the
 * sum of its token weights times each token's pool frequency, and each pick
 * only raises the gain of bookmarks holding a token new to the batch. The
 * old version re-scored inside sort comparators — ~1.5 s for 160 candidates.
 */
export function planOrbitScanBatch(
  bookmarks: BookmarkWithRelations[],
  limit: number
): OrbitBatchPlan {
  const candidateCount = bookmarks.length;
  const qualityById = new Map(
    bookmarks.map((bookmark) => [bookmark.id, bookmarkQuality(bookmark)])
  );
  const sourceUnknownCount = bookmarks.filter(
    (bookmark) => qualityById.get(bookmark.id)?.sourceUnknown
  ).length;
  const usefulSignalCount = bookmarks.reduce(
    (total, bookmark) =>
      total + (qualityById.get(bookmark.id)?.usefulSignalCount ?? 0),
    0
  );

  const buildPlan = (
    bookmarkIds: string[],
    sharedSignalCount: number,
    selectionReason: string
  ): OrbitBatchPlan => {
    const selectedSourceUnknownCount = bookmarkIds.filter(
      (id) => qualityById.get(id)?.sourceUnknown
    ).length;
    return {
      bookmarkIds,
      sharedSignalCount,
      candidateCount,
      selectedCount: bookmarkIds.length,
      sourceUnknownCount,
      sourceUnknownRate:
        candidateCount > 0 ? sourceUnknownCount / candidateCount : 0,
      selectedSourceUnknownCount,
      selectedSourceUnknownRate:
        bookmarkIds.length > 0
          ? selectedSourceUnknownCount / bookmarkIds.length
          : 0,
      usefulSignalCount,
      selectionReason,
    };
  };

  if (bookmarks.length <= limit) {
    return buildPlan(
      bookmarks.map((bookmark) => bookmark.id),
      0,
      "All visible candidates fit this batch."
    );
  }

  const tokens = bookmarks.map(bookmarkTokens);
  const quality = bookmarks.map(
    (bookmark) => qualityById.get(bookmark.id)?.score ?? 0
  );

  // Which candidates hold each token (the pool frequency is its length).
  const holders = new Map<string, number[]>();
  tokens.forEach((set, index) => {
    for (const token of set) {
      const list = holders.get(token);
      if (list) list.push(index);
      else holders.set(token, [index]);
    }
  });

  let seed = -1;
  let seedScore = -Infinity;
  tokens.forEach((set, index) => {
    let score = quality[index] ?? 0;
    for (const token of set) {
      score += tokenWeight(token) * (holders.get(token)?.length ?? 0);
    }
    // Strictly greater keeps the earliest bookmark on ties (queue order).
    if (score > seedScore) {
      seed = index;
      seedScore = score;
    }
  });

  const seedBookmark = bookmarks[seed];
  if (!seedBookmark) return buildPlan([], 0, "No scan candidates available.");

  const picked = new Array<boolean>(bookmarks.length).fill(false);
  // Weighted tokens each candidate shares with the batch picked so far.
  const gain = new Array<number>(bookmarks.length).fill(0);
  const batchTokens = new Set<string>();
  const selected: string[] = [];
  let sharedSignalCount = 0;

  const pick = (index: number) => {
    picked[index] = true;
    sharedSignalCount += gain[index] ?? 0;
    selected.push(bookmarks[index]!.id);
    for (const token of tokens[index] ?? []) {
      if (batchTokens.has(token)) continue;
      batchTokens.add(token);
      const weight = tokenWeight(token);
      for (const holder of holders.get(token) ?? []) {
        gain[holder] = (gain[holder] ?? 0) + weight;
      }
    }
  };

  pick(seed);
  while (selected.length < limit) {
    let best = -1;
    for (let index = 0; index < bookmarks.length; index += 1) {
      if (picked[index]) continue;
      if (
        best === -1 ||
        (gain[index] ?? 0) > (gain[best] ?? 0) ||
        ((gain[index] ?? 0) === (gain[best] ?? 0) &&
          (quality[index] ?? 0) > (quality[best] ?? 0))
      ) {
        best = index;
      }
    }
    if (best === -1) break;
    pick(best);
  }

  return buildPlan(
    selected,
    sharedSignalCount,
    sharedSignalCount > 0
      ? "Selected a coherent batch with shared topics, folders, authors, or domains."
      : "Selected the strongest source-quality candidates in queue order."
  );
}
