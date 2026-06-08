import { describe, expect, it } from "vitest";

import {
  buildOrbitMapFocus,
  buildOrbitMapGraphIndexes,
  resolveOrbitMapSelectionNode,
} from "@/lib/orbit-map-graph-indexes";
import type { OrbitGraphPayload } from "@/types";

const graph: OrbitGraphPayload = {
  nodes: [
    {
      kind: "bookmark",
      id: "bookmark-1",
      title: "Example",
      authorUsername: "user",
      authorDisplayName: "User",
      affiliated: false,
      recent: true,
    },
    {
      kind: "tag",
      id: "tag-1",
      name: "Music",
      color: "#1d9bf0",
      count: 1,
    },
    {
      kind: "collection",
      id: "collection-1",
      name: "Reading",
      variant: "user_collection",
      count: 2,
    },
  ],
  edges: [],
  stats: {
    totalBookmarks: 1,
    looseBookmarks: 0,
    tagCount: 1,
    userCollectionCount: 1,
    xFolderCount: 0,
    truncatedBookmarks: 0,
  },
};

describe("buildOrbitMapGraphIndexes", () => {
  it("returns null for missing graph", () => {
    expect(buildOrbitMapGraphIndexes(null)).toBeNull();
  });

  it("indexes nodes and bookmarks", () => {
    const indexes = buildOrbitMapGraphIndexes(graph);
    expect(indexes?.bookmarkCount).toBe(1);
    expect(indexes?.bookmarksById.get("bookmark-1")?.title).toBe("Example");
    expect(indexes?.nodesById.get("tag-1")?.kind).toBe("tag");
  });
});

describe("resolveOrbitMapSelectionNode", () => {
  it("returns matching node kinds only", () => {
    const indexes = buildOrbitMapGraphIndexes(graph)!;
    expect(
      resolveOrbitMapSelectionNode({ kind: "tag", id: "tag-1" }, indexes)?.kind
    ).toBe("tag");
    expect(
      resolveOrbitMapSelectionNode({ kind: "bookmark", id: "tag-1" }, indexes)
    ).toBeNull();
  });
});

describe("buildOrbitMapFocus", () => {
  it("builds focus when bookmark and anchor exist", () => {
    const indexes = buildOrbitMapGraphIndexes(graph)!;
    expect(
      buildOrbitMapFocus("bookmark-1", "tag-1", indexes)
    ).toEqual({
      bookmarkId: "bookmark-1",
      predictedAnchorId: "tag-1",
    });
  });

  it("returns null for invalid anchor kinds", () => {
    const indexes = buildOrbitMapGraphIndexes(graph)!;
    expect(
      buildOrbitMapFocus("bookmark-1", "bookmark-1", indexes)
    ).toBeNull();
  });
});
