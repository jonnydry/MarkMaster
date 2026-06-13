import { describe, expect, it } from "vitest";

import {
  buildOrbitMapSearchIndex,
  rankOrbitMapSearchResults,
  searchOrbitMapIndex,
} from "@/lib/orbit-map-search";
import type { OrbitGraphNode } from "@/types";

const nodes: OrbitGraphNode[] = [
  {
    kind: "bookmark",
    id: "bookmark-music-author",
    title: "A post from someone",
    authorUsername: "MusicFan",
    authorDisplayName: "Music Fan",
    affiliated: false,
    recent: true,
  },
  {
    kind: "collection",
    id: "collection-music",
    name: "Music",
    variant: "user_collection",
    count: 2,
  },
  {
    kind: "tag",
    id: "tag-music",
    name: "Music",
    color: "#1d9bf0",
    count: 3,
  },
  {
    kind: "bookmark",
    id: "bookmark-title",
    title: "Favorite music tools",
    authorUsername: "tools",
    authorDisplayName: "Tools",
    affiliated: true,
    recent: false,
  },
];

describe("rankOrbitMapSearchResults", () => {
  it("ranks tags and collections before bookmark matches", () => {
    const result = rankOrbitMapSearchResults(nodes, "music");

    expect(result.map((node) => node.id)).toEqual([
      "tag-music",
      "collection-music",
      "bookmark-music-author",
      "bookmark-title",
    ]);
  });

  it("returns no results for blank searches", () => {
    expect(rankOrbitMapSearchResults(nodes, "   ")).toEqual([]);
  });

  it("caps highlight and dropdown results via searchOrbitMapIndex", () => {
    const index = buildOrbitMapSearchIndex(nodes);
    const { results, highlightNodeIds } = searchOrbitMapIndex(index, "music", {
      resultLimit: 2,
      highlightLimit: 3,
    });

    expect(results).toHaveLength(2);
    expect(highlightNodeIds).toHaveLength(3);
    expect(results[0]?.id).toBe("tag-music");
  });
});
