import { createHash } from "node:crypto";

import { formatEmbeddingInput } from "@/lib/embedding-provider";

export type BookmarkEmbeddingSource = {
  tweetText: string;
  authorUsername: string;
  authorDisplayName: string;
  urls: unknown;
  quotedTweet: unknown;
  tagNames: readonly string[];
  note: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  if (typeof value === "string") {
    try {
      return asArray(JSON.parse(value) as unknown);
    } catch {
      return [];
    }
  }
  return Array.isArray(value) ? value : [];
}

function linkTitles(urls: unknown): string[] {
  const titles: string[] = [];
  for (const entry of asArray(urls)) {
    const title = asRecord(entry)?.title;
    if (typeof title !== "string") continue;
    const trimmed = title.trim();
    if (trimmed) titles.push(trimmed);
  }
  return titles;
}

function quotedText(quotedTweet: unknown): string {
  const value =
    typeof quotedTweet === "string"
      ? (() => {
          try {
            return JSON.parse(quotedTweet) as unknown;
          } catch {
            return null;
          }
        })()
      : quotedTweet;
  const text = asRecord(value)?.text;
  return typeof text === "string" ? text.trim() : "";
}

function formatAuthor(displayName: string, username: string): string {
  const display = displayName.trim();
  const handle = username.trim().replace(/^@+/, "");
  if (display && handle) return `${display} (@${handle})`;
  if (display) return display;
  if (handle) return `@${handle}`;
  return "";
}

function normalizeTags(tagNames: readonly string[]): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const name of tagNames) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    const key = trimmed.toLocaleLowerCase("en");
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(trimmed);
  }
  tags.sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }) || a.localeCompare(b, "en"));
  return tags;
}

/** Canonical document body. Empty sections are omitted so the hash tracks real text. */
export function buildBookmarkEmbeddingText(source: BookmarkEmbeddingSource): string {
  const lines: string[] = [];
  const text = source.tweetText.trim();
  if (text) lines.push(`text: ${text}`);

  const author = formatAuthor(source.authorDisplayName, source.authorUsername);
  if (author) lines.push(`author: ${author}`);

  const titles = linkTitles(source.urls);
  if (titles.length > 0) lines.push(`links: ${titles.join(" | ")}`);

  const quoted = quotedText(source.quotedTweet);
  if (quoted) lines.push(`quoted: ${quoted}`);

  const tags = normalizeTags(source.tagNames);
  if (tags.length > 0) lines.push(`tags: ${tags.join(", ")}`);

  const note = source.note?.trim() ?? "";
  if (note) lines.push(`note: ${note}`);

  return lines.join("\n");
}

export function hashEmbeddingContent(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/**
 * Hash the exact document string sent to the model, including the
 * EmbeddingGemma 2 document prefix. A prefix change makes stored rows stale.
 */
export function bookmarkEmbeddingDocument(source: BookmarkEmbeddingSource): {
  text: string;
  contentHash: string;
} {
  const text = buildBookmarkEmbeddingText(source);
  return {
    text,
    contentHash: hashEmbeddingContent(formatEmbeddingInput(text, "document")),
  };
}
