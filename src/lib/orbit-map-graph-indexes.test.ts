import { describe, expect, it } from "vitest";

import {
  buildOrbitMapFocus,
  buildOrbitMapGraphIndexes,
  resolveOrbitMapOverflowSelection,
  resolveOrbitMapSelectionNode,
} from "@/lib/orbit-map-graph-indexes";
import type { OrbitGraphNode, OrbitGraphPayload } from "@/types";

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

describe("resolveOrbitMapOverflowSelection", () => {
  it("selects and expands a tag overflow hub", () => {
    const node: OrbitGraphNode = {
      kind: "overflow",
      id: "tag-overflow-tag-1",
      anchorId: "tag-1",
      anchorKind: "tag",
      remaining: 12,
    };
    expect(resolveOrbitMapOverflowSelection(node)).toEqual({
      selection: { kind: "tag", id: "tag-1" },
      expand: true,
    });
  });

  it("selects and expands a collection overflow hub", () => {
    const node: OrbitGraphNode = {
      kind: "overflow",
      id: "collection-overflow-collection-1",
      anchorId: "collection-1",
      anchorKind: "collection",
      remaining: 8,
    };
    expect(resolveOrbitMapOverflowSelection(node)).toEqual({
      selection: { kind: "collection", id: "collection-1" },
      expand: true,
    });
  });

  it("selects the core hub without expanding", () => {
    const node: OrbitGraphNode = {
      kind: "overflow",
      id: "core-overflow",
      anchorId: "orbit-index",
      anchorKind: "core",
      remaining: 40,
    };
    expect(resolveOrbitMapOverflowSelection(node)).toEqual({
      selection: { kind: "core", id: "orbit-index" },
      expand: false,
    });
  });

  it("returns null for non-overflow nodes", () => {
    expect(
      resolveOrbitMapOverflowSelection({
        kind: "core",
        id: "orbit-index",
        totalBookmarks: 1,
        looseBookmarks: 1,
      })
    ).toBeNull();
    expect(resolveOrbitMapOverflowSelection(null)).toBeNull();
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
