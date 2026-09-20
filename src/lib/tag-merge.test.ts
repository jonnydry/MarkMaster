import { describe, expect, it } from "vitest";

import {
  findCaseDuplicateTagGroups,
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
