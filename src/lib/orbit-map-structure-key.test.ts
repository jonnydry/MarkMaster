import { describe, expect, it } from "vitest";

import { buildOrbitMapStructureKey } from "@/lib/orbit-map-structure-key";
import type { OrbitGraphPayload } from "@/types";

const baseGraph: OrbitGraphPayload = {
  nodes: [
    {
      kind: "tag",
      id: "tag-1",
      name: "History",
      color: "#1569cb",
      count: 2,
    },
    {
      kind: "bookmark",
      id: "bookmark-1",
      title: "Example",
      authorUsername: "author",
      authorDisplayName: "Author",
      affiliated: false,
      recent: true,
    },
  ],
  edges: [
    { kind: "loose", bookmarkId: "bookmark-1" },
    { kind: "overflow", overflowId: "tag-overflow-tag-1", anchorId: "tag-1" },
  ],
  stats: {
    totalBookmarks: 1,
    affiliatedBookmarks: 0,
    looseBookmarks: 1,
    renderedBookmarks: 1,
    truncatedBookmarks: 0,
    tagCount: 1,
    userCollectionCount: 0,
    xFolderCount: 0,
  },
  generatedAt: "2026-06-11T12:00:00.000Z",
  nodeCap: 1000,
  scope: "library",
};

describe("buildOrbitMapStructureKey", () => {
  it("is stable for identical topology", () => {
    expect(buildOrbitMapStructureKey(baseGraph)).toBe(
      buildOrbitMapStructureKey({
        ...baseGraph,
        generatedAt: "2026-06-11T13:00:00.000Z",
        stats: { ...baseGraph.stats, looseBookmarks: 99 },
      })
    );
  });

  it("changes when node metadata or counts differ in topology", () => {
    const affiliated = {
      ...baseGraph,
      nodes: baseGraph.nodes.map((node) =>
        node.kind === "bookmark"
          ? { ...node, affiliated: true, title: "Updated title" }
          : node
      ),
      edges: [
        { kind: "bookmark-tag", bookmarkId: "bookmark-1", tagId: "tag-1" },
        { kind: "overflow", overflowId: "tag-overflow-tag-1", anchorId: "tag-1" },
      ],
    };

    expect(buildOrbitMapStructureKey(affiliated)).not.toBe(
      buildOrbitMapStructureKey(baseGraph)
    );
  });

  it("changes when scope differs", () => {
    expect(
      buildOrbitMapStructureKey({ ...baseGraph, scope: "orbit" })
    ).not.toBe(buildOrbitMapStructureKey(baseGraph));
  });

  it("is stable when node and edge order changes", () => {
    const shuffled: OrbitGraphPayload = {
      ...baseGraph,
      nodes: [...baseGraph.nodes].reverse(),
      edges: [...baseGraph.edges].reverse(),
    };
    expect(buildOrbitMapStructureKey(shuffled)).toBe(
      buildOrbitMapStructureKey(baseGraph)
    );
  });
});
