import { describe, expect, it } from "vitest";

import {
  findCaseDuplicateTagGroups,
  findPunctuationDuplicateTagGroups,
  pickCanonicalTag,
} from "@/lib/tag-merge-groups";

describe("findCaseDuplicateTagGroups", () => {
  it("groups tags that differ only by case", () => {
    const groups = findCaseDuplicateTagGroups([
      { id: "1", name: "Memes", _count: { bookmarks: 4 } },
      { id: "2", name: "MEMES", _count: { bookmarks: 2 } },
      { id: "3", name: "AI", _count: { bookmarks: 51 } },
      { id: "4", name: "Ai Art", _count: { bookmarks: 1 } },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.map((tag) => tag.name).sort()).toEqual(["MEMES", "Memes"]);
  });
});

describe("findPunctuationDuplicateTagGroups", () => {
  it("groups punctuation twins and leaves case twins and distinct names alone", () => {
    const groups = findPunctuationDuplicateTagGroups([
      { id: "1", name: "AI" },
      { id: "2", name: "A.I." },
      { id: "3", name: "Ai Art" },
      { id: "4", name: "Memes" },
      { id: "5", name: "MEMES" },
      { id: "6", name: "Go" },
      { id: "7", name: "Golang" },
    ]);

    expect(groups).toEqual([[{ id: "1", name: "AI" }, { id: "2", name: "A.I." }]]);
  });
});

describe("pickCanonicalTag", () => {
  it("keeps the tag with more bookmarks", () => {
    expect(
      pickCanonicalTag([
        { id: "1", name: "MEMES", _count: { bookmarks: 2 } },
        { id: "2", name: "Memes", _count: { bookmarks: 8 } },
      ]).name
    ).toBe("Memes");
  });

  it("prefers mixed case when counts tie", () => {
    expect(
      pickCanonicalTag([
        { id: "1", name: "MEMES", _count: { bookmarks: 3 } },
        { id: "2", name: "Memes", _count: { bookmarks: 3 } },
      ]).name
    ).toBe("Memes");
  });
});
