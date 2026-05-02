import type { ReactNode } from "react";

const MENTION_OR_URL_RE = /((?:@|#)\w+|https?:\/\/\S+)/g;
const HIGHLIGHT_CLASS_NAME =
  "rounded-[0.25rem] bg-primary/15 px-0.5 text-foreground ring-1 ring-primary/10";

function hasRichTextToken(text: string) {
  return text.includes("@") || text.includes("#") || text.includes("http");
}

export function highlightPlainText(
  text: string,
  query: string | undefined,
  keyPrefix = "h"
): ReactNode {
  const needle = query?.trim().toLowerCase();
  if (!text || !needle) return text;

  const haystack = text.toLowerCase();
  let matchIndex = haystack.indexOf(needle);
  if (matchIndex === -1) return text;

  const nodes: ReactNode[] = [];
  let cursor = 0;
  let markIndex = 0;

  while (matchIndex !== -1) {
    if (matchIndex > cursor) {
      nodes.push(text.slice(cursor, matchIndex));
    }

    const matchEnd = matchIndex + needle.length;
    nodes.push(
      <mark
        key={`${keyPrefix}-${markIndex}`}
        className={HIGHLIGHT_CLASS_NAME}
      >
        {text.slice(matchIndex, matchEnd)}
      </mark>
    );

    cursor = matchEnd;
    markIndex += 1;
    matchIndex = haystack.indexOf(needle, cursor);
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }

  return nodes.length === 1 ? nodes[0] : nodes;
}

export function highlightTweetText(text: string, query?: string): ReactNode {
  if (!text) return text;
  if (!hasRichTextToken(text)) {
    return highlightPlainText(text, query, "tweet");
  }

  const nodes: ReactNode[] = [];
  let cursor = 0;
  let tokenIndex = 0;

  MENTION_OR_URL_RE.lastIndex = 0;
  for (const match of text.matchAll(MENTION_OR_URL_RE)) {
    const token = match[0];
    const matchIndex = match.index ?? 0;

    if (matchIndex > cursor) {
      const segment = text.slice(cursor, matchIndex);
      nodes.push(highlightPlainText(segment, query, `tweet-${tokenIndex}`));
    }

    if (token.startsWith("http")) {
      nodes.push(
        <a
          key={`url-${tokenIndex}`}
          href={token}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          {token}
        </a>
      );
    } else {
      nodes.push(
        <span
          key={`token-${tokenIndex}`}
          className="font-medium text-primary"
        >
          {highlightPlainText(token, query, `token-${tokenIndex}`)}
        </span>
      );
    }

    cursor = matchIndex + token.length;
    tokenIndex += 1;
  }

  if (cursor < text.length) {
    nodes.push(highlightPlainText(text.slice(cursor), query, `tweet-${tokenIndex}`));
  }

  return nodes.length === 1 ? nodes[0] : nodes;
}

export function createTextHighlighter(query?: string) {
  const normalizedQuery = query?.trim() || undefined;

  return {
    plain: (text: string, keyPrefix?: string) =>
      highlightPlainText(text, normalizedQuery, keyPrefix),
    tweet: (text: string) => highlightTweetText(text, normalizedQuery),
  };
}
