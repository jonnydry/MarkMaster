interface TagRule {
  name: string;
  color: string;
  test: (text: string, media: unknown[] | null, urls: unknown[] | null) => boolean;
}

const TAG_RULES: TagRule[] = [
  {
    name: "Code",
    color: "#22c55e",
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
    color: "#a855f7",
    test: (text) => /🧵|\bthread\b/i.test(text) || /\b1\/\d+\b/.test(text),
  },
  {
    name: "Media",
    color: "#ec4899",
    test: (_text, media) => Array.isArray(media) && media.length > 0,
  },
  {
    name: "Question",
    color: "#f97316",
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
