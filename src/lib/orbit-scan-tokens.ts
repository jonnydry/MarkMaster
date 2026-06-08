import "server-only";

import type { OrbitBookmarkForScan } from "@/lib/orbit-grok";
import { collectOrbitBookmarkHaystackTexts } from "@/lib/orbit-primary-text";

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

function topicTokensFromMetadata(bookmark: OrbitBookmarkForScan) {
  const metadata = bookmark.xMetadata;
  if (!metadata || typeof metadata !== "object") return [];
  const tweet = (metadata as { tweet?: unknown }).tweet;
  if (!tweet || typeof tweet !== "object") return [];
  const annotations = (tweet as { context_annotations?: unknown }).context_annotations;
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

export function getOrbitScanBookmarkTokens(bookmark: OrbitBookmarkForScan): Set<string> {
  const tokens = new Set<string>();
  addToken(tokens, bookmark.authorUsername, "author");
  for (const text of collectOrbitBookmarkHaystackTexts(bookmark)) {
    addTextTokens(tokens, text);
  }

  for (const folder of bookmark.xFolderHints ?? []) {
    addTextTokens(tokens, folder.name);
    addToken(tokens, folder.name, "folder");
  }

  if (Array.isArray(bookmark.urls)) {
    for (const item of bookmark.urls) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      addToken(
        tokens,
        domainFromUrl(
          typeof record.expanded_url === "string"
            ? record.expanded_url
            : typeof record.url === "string"
              ? record.url
              : typeof record.display_url === "string"
                ? record.display_url
                : null
        ),
        "domain"
      );
      addTextTokens(tokens, typeof record.title === "string" ? record.title : null);
      addTextTokens(
        tokens,
        typeof record.description === "string" ? record.description : null
      );
    }
  }

  for (const topic of topicTokensFromMetadata(bookmark)) {
    addTextTokens(tokens, topic);
    addToken(tokens, topic, "topic");
  }

  return tokens;
}

export function tokenOverlapScore(
  labelTokens: Set<string>,
  bookmarkTokens: Set<string>
): number {
  let score = 0;
  for (const token of labelTokens) {
    if (!bookmarkTokens.has(token)) continue;
    if (token.startsWith("folder:")) score += 5;
    else if (token.startsWith("topic:")) score += 4;
    else if (token.startsWith("domain:")) score += 3;
    else if (token.startsWith("author:")) score += 2;
    else score += 1;
  }
  return score;
}

export function labelToTokens(label: string): Set<string> {
  const tokens = new Set<string>();
  addTextTokens(tokens, label);
  addToken(tokens, label, "kw");
  return tokens;
}