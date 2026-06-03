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

function textHasUsefulSignal(value: string | null | undefined) {
  if (!value) return false;
  const stripped = value
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[^\p{L}\p{N}#+.-]+/gu, " ")
    .trim();
  if (stripped.length < 8) return false;
  return /[\p{L}\p{N}]/u.test(stripped);
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
  if (textHasUsefulSignal(bookmark.tweetText)) usefulSignalCount += 1;
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
  addTextTokens(tokens, bookmark.tweetText);

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

function overlapScore(a: Set<string>, b: Set<string>) {
  let score = 0;
  for (const token of a) {
    if (!b.has(token)) continue;
    if (token.startsWith("folder:")) score += 5;
    else if (token.startsWith("topic:")) score += 4;
    else if (token.startsWith("domain:")) score += 3;
    else if (token.startsWith("author:")) score += 2;
    else score += 1;
  }
  return score;
}

export function planOrbitScanBatch(
  bookmarks: BookmarkWithRelations[],
  limit: number
): OrbitBatchPlan {
  const candidateCount = bookmarks.length;
  const qualityById = new Map(
    bookmarks.map((bookmark) => [bookmark.id, getOrbitBookmarkSourceQuality(bookmark)])
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

  const tokenById = new Map(
    bookmarks.map((bookmark) => [bookmark.id, getBookmarkTokens(bookmark)])
  );
  const originalIndex = new Map(bookmarks.map((bookmark, index) => [bookmark.id, index]));

  const seed = [...bookmarks].sort((a, b) => {
    const aTokens = tokenById.get(a.id) ?? new Set<string>();
    const bTokens = tokenById.get(b.id) ?? new Set<string>();
    const aScore = bookmarks.reduce(
      (total, candidate) =>
        total + overlapScore(aTokens, tokenById.get(candidate.id) ?? new Set()),
      0
    ) + (qualityById.get(a.id)?.score ?? 0);
    const bScore = bookmarks.reduce(
      (total, candidate) =>
        total + overlapScore(bTokens, tokenById.get(candidate.id) ?? new Set()),
      0
    ) + (qualityById.get(b.id)?.score ?? 0);
    return bScore - aScore || (originalIndex.get(a.id) ?? 0) - (originalIndex.get(b.id) ?? 0);
  })[0];

  if (!seed) return buildPlan([], 0, "No scan candidates available.");

  const selected = [seed.id];
  const selectedTokens = new Set(tokenById.get(seed.id) ?? []);
  const remaining = bookmarks.filter((bookmark) => bookmark.id !== seed.id);
  let sharedSignalCount = 0;

  while (selected.length < limit && remaining.length > 0) {
    remaining.sort((a, b) => {
      const aScore = overlapScore(selectedTokens, tokenById.get(a.id) ?? new Set());
      const bScore = overlapScore(selectedTokens, tokenById.get(b.id) ?? new Set());
      return (
        bScore - aScore ||
        (qualityById.get(b.id)?.score ?? 0) -
          (qualityById.get(a.id)?.score ?? 0) ||
        (originalIndex.get(a.id) ?? 0) - (originalIndex.get(b.id) ?? 0)
      );
    });

    const next = remaining.shift();
    if (!next) break;
    const nextTokens = tokenById.get(next.id) ?? new Set<string>();
    const score = overlapScore(selectedTokens, nextTokens);
    sharedSignalCount += score;
    selected.push(next.id);
    for (const token of nextTokens) selectedTokens.add(token);
  }

  return buildPlan(
    selected,
    sharedSignalCount,
    sharedSignalCount > 0
      ? "Selected a coherent batch with shared topics, folders, authors, or domains."
      : "Selected the strongest source-quality candidates in queue order."
  );
}
