import { describe, expect, it } from "vitest";

import {
  getOrbitCollectionActionState,
  resolveOrbitMapArmedBookmark,
} from "@/lib/orbit-map-actions";
import type { OrbitGraphNode } from "@/types";

const userCollectionNode: Extract<OrbitGraphNode, { kind: "collection" }> = {
  kind: "collection",
  id: "collection-1",
  name: "Research",
  variant: "user_collection",
  count: 12,
};

const xFolderNode: Extract<OrbitGraphNode, { kind: "collection" }> = {
  kind: "collection",
  id: "x-folder-1",
  name: "Launch Reads",
  variant: "x_folder",
  count: 3,
};

describe("getOrbitCollectionActionState", () => {
  it("offers copy as collection for synced X folder nodes", () => {
    expect(getOrbitCollectionActionState(xFolderNode, null)).toEqual({
      canAssign: false,
      canCollect: false,
      canCopyAsCollection: true,
      readOnlyReason:
        "Synced X folders are read-only. Copy this folder to make an editable collection.",
    });
  });

  it("keeps user collection assignment tied to a selected bookmark", () => {
    expect(getOrbitCollectionActionState(userCollectionNode, null)).toEqual({
      canAssign: false,
      canCollect: false,
      canCopyAsCollection: false,
      readOnlyReason: null,
    });

    expect(getOrbitCollectionActionState(userCollectionNode, "bookmark-1")).toEqual(
      {
        canAssign: true,
        canCollect: true,
        canCopyAsCollection: false,
        readOnlyReason: null,
      }
    );
  });
});

describe("resolveOrbitMapArmedBookmark", () => {
  const tagNode: Extract<OrbitGraphNode, { kind: "tag" }> = {
    kind: "tag",
    id: "tag-1",
    name: "ai",
    color: "#3b82f6",
    count: 4,
  };
  const bookmarkNode: Extract<OrbitGraphNode, { kind: "bookmark" }> = {
    kind: "bookmark",
    id: "bm-1",
    title: "A thread on agents",
    authorUsername: "jane",
    authorDisplayName: "Jane",
    affiliated: true,
    recent: false,
  };
  const nodesById = new Map<string, OrbitGraphNode>([
    [tagNode.id, tagNode],
    [bookmarkNode.id, bookmarkNode],
  ]);

  it("names the graph bookmark and reports an existing link", () => {
    expect(
      resolveOrbitMapArmedBookmark({
        hub: tagNode,
        bookmarkId: "bm-1",
        nodesById,
        connectionIndex: new Map([["bm-1", ["tag-1"]]]),
        fetchedBookmark: null,
      })
    ).toEqual({
      id: "bm-1",
      authorUsername: "jane",
      text: "A thread on agents",
      assigned: true,
    });
  });

  it("is unassigned when the graph has no link to the hub", () => {
    expect(
      resolveOrbitMapArmedBookmark({
        hub: userCollectionNode,
        bookmarkId: "bm-1",
        nodesById,
        connectionIndex: new Map([["bm-1", ["tag-1"]]]),
        fetchedBookmark: null,
      })?.assigned
    ).toBe(false);
  });

  it("falls back to the fetched bookmark when the map cap hid it", () => {
    expect(
      resolveOrbitMapArmedBookmark({
        hub: tagNode,
        bookmarkId: "bm-2",
        nodesById,
        connectionIndex: new Map(),
        fetchedBookmark: {
          id: "bm-2",
          authorUsername: "sam",
          tweetText: "  multi\n line   post ",
          tags: [{ tag: { id: "tag-1", name: "ai", color: "#3b82f6" } }],
          collectionItems: [],
        },
      })
    ).toEqual({
      id: "bm-2",
      authorUsername: "sam",
      text: "multi line post",
      assigned: true,
    });
  });

  it("only arms hub selections", () => {
    expect(
      resolveOrbitMapArmedBookmark({
        hub: bookmarkNode,
        bookmarkId: "bm-1",
        nodesById,
        connectionIndex: null,
        fetchedBookmark: null,
      })
    ).toBeNull();
  });
});
