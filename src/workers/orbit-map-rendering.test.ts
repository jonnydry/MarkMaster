import { describe, expect, it } from "vitest";

import {
  getOrbitMapLabelText,
  getOrbitMapNodeRadius,
  getOrbitMapNodeVisualStyle,
  shouldShowOrbitMapLabel,
} from "./orbit-map-rendering";
import type { OrbitGraphNode } from "@/types";

describe("getOrbitMapNodeVisualStyle", () => {
  it("uses distinct colors for loose and assigned bookmarks", () => {
    const looseBookmark: OrbitGraphNode = {
      kind: "bookmark",
      id: "loose-bookmark",
      title: "Loose",
      authorUsername: "author",
      authorDisplayName: "Author",
      affiliated: false,
      recent: false,
    };
    const assignedBookmark: OrbitGraphNode = {
      ...looseBookmark,
      id: "assigned-bookmark",
      affiliated: true,
    };

    expect(getOrbitMapNodeVisualStyle(looseBookmark)).toMatchObject({
      color: 0x2f6fed,
      isHub: false,
    });
    expect(getOrbitMapNodeVisualStyle(assignedBookmark)).toMatchObject({
      color: 0x737373,
      isHub: false,
    });
  });

  it("marks tags and collections as hub nodes", () => {
    const tag: OrbitGraphNode = {
      kind: "tag",
      id: "tag",
      name: "Music",
      color: "#1569cb",
      count: 4,
    };
    const collection: OrbitGraphNode = {
      kind: "collection",
      id: "collection",
      name: "Music",
      variant: "user_collection",
      count: 4,
    };

    expect(getOrbitMapNodeVisualStyle(tag)).toMatchObject({
      color: 0x1569cb,
      isHub: true,
    });
    expect(getOrbitMapNodeVisualStyle(collection)).toMatchObject({
      color: 0xf472b6,
      isHub: true,
    });
  });

  it("scales hubs by count while keeping bookmarks compact", () => {
    const smallTag: OrbitGraphNode = {
      kind: "tag",
      id: "small-tag",
      name: "Tiny",
      color: "#1569cb",
      count: 1,
    };
    const largeTag: OrbitGraphNode = {
      ...smallTag,
      id: "large-tag",
      count: 100,
    };
    const bookmark: OrbitGraphNode = {
      kind: "bookmark",
      id: "bookmark",
      title: "Bookmark",
      authorUsername: "author",
      authorDisplayName: "Author",
      affiliated: true,
      recent: false,
    };

    expect(getOrbitMapNodeRadius(largeTag)).toBeGreaterThan(
      getOrbitMapNodeRadius(smallTag)
    );
    expect(getOrbitMapNodeRadius(bookmark)).toBeLessThan(
      getOrbitMapNodeRadius(smallTag)
    );
  });

  it("uses short author handles for bookmark labels", () => {
    const bookmark: OrbitGraphNode = {
      kind: "bookmark",
      id: "bookmark",
      title: "This is a long bookmark title that should stay in the inspector",
      authorUsername: "author",
      authorDisplayName: "Author",
      affiliated: false,
      recent: false,
    };

    expect(getOrbitMapLabelText(bookmark)).toBe("@author");
  });

  it("does not show bookmark labels on the canvas, even when focused", () => {
    expect(
      shouldShowOrbitMapLabel("bookmark", 2, 0.95, { isActive: true })
    ).toBe(false);
    expect(
      shouldShowOrbitMapLabel("bookmark", 2, 0.95, {
        isSelectedNeighbor: true,
      })
    ).toBe(false);
  });

  it("keeps focused hub labels while hiding ambient and selected-neighbor hub labels below threshold", () => {
    expect(shouldShowOrbitMapLabel("tag", 0.35, 0.95)).toBe(false);
    expect(
      shouldShowOrbitMapLabel("tag", 0.35, 0.95, { isActive: true })
    ).toBe(true);
    expect(
      shouldShowOrbitMapLabel("collection", 0.35, 0.95, {
        isSelectedNeighbor: true,
      })
    ).toBe(false);
  });
});
