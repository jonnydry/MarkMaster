"use client";

import { useMemo } from "react";
import { formatBookmarkDisplayText } from "@/lib/bookmark-display-text";
import type { BookmarkMediaJson } from "@/lib/bookmark-media";
import { createTextHighlighter } from "@/lib/text-highlighter";

export function useBookmarkHighlighting(
  bookmark: {
    tweetText: string;
    authorDisplayName: string;
    authorUsername: string;
    notes: Array<{ content: string }>;
    media?: BookmarkMediaJson[] | null;
  },
  searchQuery?: string
) {
  const highlighter = useMemo(
    () => createTextHighlighter(searchQuery),
    [searchQuery]
  );

  const displayText = useMemo(
    () => formatBookmarkDisplayText(bookmark),
    [bookmark]
  );

  const highlightedText = useMemo(
    () => highlighter.tweet(displayText),
    [displayText, highlighter]
  );

  const highlightedAuthorName = useMemo(
    () => highlighter.plain(bookmark.authorDisplayName, "author"),
    [bookmark.authorDisplayName, highlighter]
  );

  const highlightedUsername = useMemo(
    () => highlighter.plain(bookmark.authorUsername, "username"),
    [bookmark.authorUsername, highlighter]
  );

  const firstNoteContent = bookmark.notes[0]?.content;
  const highlightedNote = useMemo(() => {
    if (!firstNoteContent) return firstNoteContent;
    return highlighter.plain(firstNoteContent, "note");
  }, [firstNoteContent, highlighter]);

  return {
    displayText,
    highlightedText,
    highlightedAuthorName,
    highlightedUsername,
    highlightedNote,
  };
}
