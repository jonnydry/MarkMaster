import { describe, expect, it } from "vitest";

import { parseOrbitVocabIncrement } from "@/lib/orbit-grok-vocab";

describe("parseOrbitVocabIncrement", () => {
  it("keeps specific proposed names and drops generic ones", () => {
    const parsed = parseOrbitVocabIncrement({
      tags: [
        { name: "LLM Evals", reason: "Covers leftover papers" },
        { name: "Interesting", reason: "generic" },
        { name: "https://arxiv.org", reason: "url" },
      ],
      collections: [
        {
          name: "Eval Bench",
          description: "Home for evaluation papers.",
          reason: "two leftovers share this",
        },
        {
          name: "Bookmarks",
          description: "nope",
          reason: "generic",
        },
      ],
    });

    expect(parsed.tags.map((tag) => tag.name)).toEqual(["LLM Evals"]);
    expect(parsed.collections.map((collection) => collection.name)).toEqual([
      "Eval Bench",
    ]);
    expect(parsed.tags[0]?.existing).toBe(false);
  });
});
