import { describe, expect, it } from "vitest";

import {
  getOrbitMapLabelText,
  getOrbitMapNodeRadius,
  getOrbitMapNodeVisualStyle,
  mixOrbitMapColors,
  saturateOrbitMapColor,
  shouldShowOrbitMapLabel,
  ORBIT_MAP_BOOKMARK_LABEL_ZOOM,
  ORBIT_MAP_TOP_HUB_LABEL_COUNT,
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
      isHub: false,
    });
    expect(getOrbitMapNodeVisualStyle(looseBookmark).color).toBe(0x1671ff);
    expect(getOrbitMapNodeVisualStyle(assignedBookmark)).toMatchObject({
      color: 0x737373,
      isHub: false,
    });
  });

  it("brightens recent bookmarks with a cyan-hot edge", () => {
    const stale: OrbitGraphNode = {
      kind: "bookmark",
      id: "stale",
      title: "Stale",
      authorUsername: "author",
      authorDisplayName: "Author",
      affiliated: true,
      recent: false,
    };
    const fresh: OrbitGraphNode = { ...stale, id: "fresh", recent: true };

    const staleStyle = getOrbitMapNodeVisualStyle(stale);
    const freshStyle = getOrbitMapNodeVisualStyle(fresh);
    expect(freshStyle.color).toBe(
      mixOrbitMapColors(staleStyle.color, 0x67e8f9, 0.14)
    );
    expect(freshStyle.strokeWidth).toBeGreaterThan(staleStyle.strokeWidth);
  });

  it("boosts tag and collection hub colors for a neon read", () => {
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
      color: 0x006ffa,
      isHub: true,
    });
    expect(getOrbitMapNodeVisualStyle(tag).strokeColor).not.toBe(0x1569cb);
    expect(getOrbitMapNodeVisualStyle(collection)).toMatchObject({
      isHub: true,
    });
    expect(getOrbitMapNodeVisualStyle(collection).color).toBe(16724131);
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

  it("shows bookmark labels when zoomed in or focused, hides them when far out", () => {
    expect(
      shouldShowOrbitMapLabel("bookmark", 0.4, 0.6, { isActive: true })
    ).toBe(true);
    expect(
      shouldShowOrbitMapLabel("bookmark", ORBIT_MAP_BOOKMARK_LABEL_ZOOM, 0.6)
    ).toBe(true);
    expect(shouldShowOrbitMapLabel("bookmark", 0.4, 0.6)).toBe(false);
    // Selected-neighbor bookmarks need moderate zoom to avoid label storms
    expect(
      shouldShowOrbitMapLabel("bookmark", 0.4, 0.6, {
        isSelectedNeighbor: true,
      })
    ).toBe(false);
    expect(
      shouldShowOrbitMapLabel(
        "bookmark",
        ORBIT_MAP_BOOKMARK_LABEL_ZOOM / 2,
        0.6,
        { isSelectedNeighbor: true }
      )
    ).toBe(true);
  });

  it("always labels top-ranked hubs and zoom-gates the rest", () => {
    expect(
      shouldShowOrbitMapLabel("tag", 0.2, 0.6, { importanceRank: 0 })
    ).toBe(true);
    expect(
      shouldShowOrbitMapLabel("tag", 0.2, 0.6, {
        importanceRank: ORBIT_MAP_TOP_HUB_LABEL_COUNT,
      })
    ).toBe(false);
    expect(shouldShowOrbitMapLabel("tag", 0.35, 0.6)).toBe(false);
    expect(shouldShowOrbitMapLabel("tag", 0.65, 0.6)).toBe(true);
    expect(
      shouldShowOrbitMapLabel("tag", 0.35, 0.6, { isActive: true })
    ).toBe(true);
    expect(
      shouldShowOrbitMapLabel("collection", 0.35, 0.6, {
        isSelectedNeighbor: true,
      })
    ).toBe(true);
  });

  it("labels overflow nodes with their remaining count and the core as Orbit", () => {
    const overflow: OrbitGraphNode = {
      kind: "overflow",
      id: "tag-overflow-1",
      anchorId: "tag-1",
      anchorKind: "tag",
      remaining: 42,
    };
    const core: OrbitGraphNode = {
      kind: "core",
      id: "orbit-index",
      totalBookmarks: 100,
      looseBookmarks: 10,
    };

    expect(getOrbitMapLabelText(overflow)).toBe("+42");
    expect(getOrbitMapLabelText(core)).toBe("Orbit");
  });
});

describe("mixOrbitMapColors", () => {
  it("blends channel-wise and clamps t", () => {
    expect(mixOrbitMapColors(0x000000, 0xffffff, 0)).toBe(0x000000);
    expect(mixOrbitMapColors(0x000000, 0xffffff, 1)).toBe(0xffffff);
    expect(mixOrbitMapColors(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    expect(mixOrbitMapColors(0x000000, 0xffffff, 2)).toBe(0xffffff);
    expect(mixOrbitMapColors(0xff0000, 0x0000ff, 0.5)).toBe(0x800080);
  });
});

describe("saturateOrbitMapColor", () => {
  it("increases chroma away from gray", () => {
    const gray = 0x808080;
    const blue = 0x2563eb;
    expect(saturateOrbitMapColor(gray, 1.4)).toBe(0x808080);
    expect(saturateOrbitMapColor(blue, 1.4)).not.toBe(blue);
  });
});
