import { describe, expect, it } from "vitest";

import {
  buildOrbitMapConnectionIndex,
  getConnectedOrbitMapNodes,
  getSharedOrbitMapHubs,
} from "@/lib/orbit-map-connections";
import type { OrbitGraphNode, OrbitGraphPayload } from "@/types";

const nodes: OrbitGraphNode[] = [
  { kind: "core", id: "orbit-index", totalBookmarks: 2, looseBookmarks: 1 },
  {
    kind: "bookmark",
    id: "bookmark-1",
    title: "Bookmark one",
    authorUsername: "one",
    authorDisplayName: "One",
    affiliated: true,
    recent: true,
  },
  {
    kind: "bookmark",
    id: "bookmark-2",
    title: "Bookmark two",
    authorUsername: "two",
    authorDisplayName: "Two",
    affiliated: false,
    recent: false,
  },
  { kind: "tag", id: "tag-1", name: "AI", color: "#1d9bf0", count: 1 },
  {
    kind: "collection",
    id: "collection-1",
    name: "Demos",
    variant: "user_collection",
    count: 1,
  },
];

const payload: OrbitGraphPayload = {
  nodes,
  edges: [
    { kind: "bookmark-tag", bookmarkId: "bookmark-1", tagId: "tag-1" },
    { kind: "bookmark-tag", bookmarkId: "bookmark-1", tagId: "tag-1" },
    {
      kind: "bookmark-collection",
      bookmarkId: "bookmark-1",
      collectionId: "collection-1",
    },
    { kind: "loose", bookmarkId: "bookmark-2" },
  ],
  stats: {
    totalBookmarks: 2,
    affiliatedBookmarks: 1,
    looseBookmarks: 1,
    renderedBookmarks: 2,
    truncatedBookmarks: 0,
    tagCount: 1,
    userCollectionCount: 1,
    xFolderCount: 0,
  },
  generatedAt: new Date(0).toISOString(),
  nodeCap: 100,
};

describe("orbit map connections", () => {
  it("builds unique bidirectional node connections", () => {
    const index = buildOrbitMapConnectionIndex(payload.edges);

    expect(index.get("tag-1")).toEqual(["bookmark-1"]);
    expect(index.get("bookmark-1")).toEqual(["tag-1", "collection-1"]);
    expect(index.get("orbit-index")).toEqual(["bookmark-2"]);
  });

  it("resolves connected nodes from the index", () => {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const index = buildOrbitMapConnectionIndex(payload.edges);

    expect(
      getConnectedOrbitMapNodes("bookmark-1", nodeById, index).map(
        (node) => node.id
      )
    ).toEqual(["tag-1", "collection-1"]);
  });
});

describe("getSharedOrbitMapHubs", () => {
  const hubNodes: OrbitGraphNode[] = [
    { kind: "tag", id: "ai", name: "ai", color: "#8b5cf6", count: 3 },
    { kind: "tag", id: "rust", name: "rust", color: "#ef4444", count: 1 },
    { kind: "collection", id: "later", name: "Read later", variant: "user_collection", count: 2 },
    ...["b1", "b2", "b3"].map(
      (id): OrbitGraphNode => ({
        kind: "bookmark",
        id,
        title: id,
        authorUsername: id,
        authorDisplayName: id,
        affiliated: true,
        recent: false,
      })
    ),
  ];
  const nodeById = new Map(hubNodes.map((node) => [node.id, node]));
  const index = buildOrbitMapConnectionIndex([
    { kind: "bookmark-tag", bookmarkId: "b1", tagId: "ai" },
    { kind: "bookmark-tag", bookmarkId: "b2", tagId: "ai" },
    { kind: "bookmark-tag", bookmarkId: "b3", tagId: "ai" },
    { kind: "bookmark-tag", bookmarkId: "b1", tagId: "rust" },
    { kind: "bookmark-collection", bookmarkId: "b1", collectionId: "later" },
    { kind: "bookmark-collection", bookmarkId: "b2", collectionId: "later" },
  ]);

  it("counts shared bookmarks per other hub, most shared first", () => {
    expect(
      getSharedOrbitMapHubs("ai", nodeById, index).map(({ node, count }) => [node.id, count])
    ).toEqual([
      ["later", 2],
      ["rust", 1],
    ]);
  });

  it("returns nothing for a hub with no overlap", () => {
    expect(getSharedOrbitMapHubs("rust", nodeById, buildOrbitMapConnectionIndex([]))).toEqual([]);
  });
});
