import { describe, expect, it } from "vitest";

import { applyOrbitGraphAssignment } from "./orbit-graph-assign";
import type { OrbitGraphPayload } from "@/types";

function graph(overrides: Partial<OrbitGraphPayload> = {}): OrbitGraphPayload {
  return {
    nodes: [
      {
        kind: "core",
        id: "orbit-index",
        totalBookmarks: 1,
        looseBookmarks: 1,
      },
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
        count: 0,
      },
      {
        kind: "collection",
        id: "collection-1",
        name: "Reading",
        variant: "user_collection",
        count: 0,
      },
    ],
    edges: [{ kind: "loose", bookmarkId: "bookmark-1" }],
    stats: {
      totalBookmarks: 1,
      affiliatedBookmarks: 0,
      looseBookmarks: 1,
      renderedBookmarks: 1,
      truncatedBookmarks: 0,
      tagCount: 1,
      userCollectionCount: 1,
      xFolderCount: 0,
    },
    generatedAt: "2026-01-01T00:00:00.000Z",
    nodeCap: 1000,
    scope: "library",
    ...overrides,
  };
}

describe("applyOrbitGraphAssignment", () => {
  it("promotes a loose bookmark onto a tag hub", () => {
    const next = applyOrbitGraphAssignment(graph(), {
      action: "add",
      bookmarkId: "bookmark-1",
      anchorKind: "tag",
      anchorId: "tag-1",
    });

    expect(next).not.toBeNull();
    expect(next?.edges).toEqual([
      { kind: "bookmark-tag", bookmarkId: "bookmark-1", tagId: "tag-1" },
    ]);
    expect(next?.stats).toMatchObject({
      affiliatedBookmarks: 1,
      looseBookmarks: 0,
    });
    expect(
      next?.nodes.find((node) => node.kind === "bookmark" && node.id === "bookmark-1")
    ).toMatchObject({ affiliated: true });
    expect(
      next?.nodes.find((node) => node.kind === "tag" && node.id === "tag-1")
    ).toMatchObject({ count: 1 });
    expect(
      next?.nodes.find((node) => node.kind === "core")
    ).toMatchObject({ looseBookmarks: 0 });
  });

  it("returns a bookmark to loose when its last hub is removed", () => {
    const assigned = applyOrbitGraphAssignment(graph(), {
      action: "add",
      bookmarkId: "bookmark-1",
      anchorKind: "collection",
      anchorId: "collection-1",
    });
    expect(assigned).not.toBeNull();

    const next = applyOrbitGraphAssignment(assigned!, {
      action: "remove",
      bookmarkId: "bookmark-1",
      anchorKind: "collection",
      anchorId: "collection-1",
    });

    expect(next?.edges).toEqual([{ kind: "loose", bookmarkId: "bookmark-1" }]);
    expect(next?.stats).toMatchObject({
      affiliatedBookmarks: 0,
      looseBookmarks: 1,
    });
    expect(
      next?.nodes.find((node) => node.kind === "collection")
    ).toMatchObject({ count: 0 });
  });

  it("keeps affiliation when a second hub remains", () => {
    const tagged = applyOrbitGraphAssignment(graph(), {
      action: "add",
      bookmarkId: "bookmark-1",
      anchorKind: "tag",
      anchorId: "tag-1",
    });
    const both = applyOrbitGraphAssignment(tagged!, {
      action: "add",
      bookmarkId: "bookmark-1",
      anchorKind: "collection",
      anchorId: "collection-1",
    });

    const next = applyOrbitGraphAssignment(both!, {
      action: "remove",
      bookmarkId: "bookmark-1",
      anchorKind: "tag",
      anchorId: "tag-1",
    });

    expect(next?.edges).toEqual([
      {
        kind: "bookmark-collection",
        bookmarkId: "bookmark-1",
        collectionId: "collection-1",
      },
    ]);
    expect(next?.stats.looseBookmarks).toBe(0);
    expect(
      next?.nodes.find((node) => node.kind === "bookmark")
    ).toMatchObject({ affiliated: true });
  });

  it("asks the caller to refetch when the bookmark is not on this sky", () => {
    expect(
      applyOrbitGraphAssignment(graph(), {
        action: "add",
        bookmarkId: "bookmark-missing",
        anchorKind: "tag",
        anchorId: "tag-1",
      })
    ).toBeNull();
  });
});
