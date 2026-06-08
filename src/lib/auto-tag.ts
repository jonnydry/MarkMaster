interface TagRule {
  name: string;
  color: string;
  test: (text: string, media: unknown[] | null, urls: unknown[] | null) => boolean;
}

const TAG_RULES: TagRule[] = [
  {
    name: "Code",
    color: "#38bdf8",
    test: (text) =>
      /```[\s\S]*```/.test(text) ||
      /\b(function|const |let |var |import |export |class |def |async |await )\b/.test(text),
  },
  {
    name: "Article",
    color: "#3b82f6",
    test: (_text, _media, urls) =>
      Array.isArray(urls) && urls.length > 0,
  },
  {
    name: "Thread",
    color: "#60a5fa",
    test: (text) => /🧵|\bthread\b/i.test(text) || /\b1\/\d+\b/.test(text),
  },
  {
    name: "Media",
    color: "#2563eb",
    test: (_text, media) => Array.isArray(media) && media.length > 0,
  },
  {
    name: "Question",
    color: "#93c5fd",
    test: (text) => text.includes("?") && text.length < 280,
  },
];

export function suggestTags(
  tweetText: string,
  media: unknown[] | null,
  urls: unknown[] | null
): Array<{ name: string; color: string }> {
  return TAG_RULES.filter((rule) => rule.test(tweetText, media, urls)).map(
    ({ name, color }) => ({ name, color })
  );
}

/** Content-type labels derived from tweet text, media, and URLs (for Orbit signals). */
export function getContentTypeHints(
  tweetText: string,
  media: unknown[] | null,
  urls: unknown[] | null
): string[] {
  return suggestTags(tweetText, media, urls).map((tag) => tag.name);
}
