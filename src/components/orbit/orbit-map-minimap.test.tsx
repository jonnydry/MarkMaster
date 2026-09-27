// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { OrbitMapMinimap } from "./orbit-map-minimap";
import type { OrbitGraphPayload } from "@/types";

const graph: OrbitGraphPayload = {
  nodes: [
    { kind: "tag", id: "tag-a", name: "a", color: "#8b5cf6", count: 1 },
    { kind: "tag", id: "tag-b", name: "b", color: "#ec4899", count: 1 },
  ],
  edges: [],
  stats: {
    totalBookmarks: 0,
    affiliatedBookmarks: 0,
    looseBookmarks: 0,
    renderedBookmarks: 0,
    truncatedBookmarks: 0,
    tagCount: 0,
    userCollectionCount: 0,
    xFolderCount: 0,
  },
  generatedAt: "2026-08-18T00:00:00.000Z",
  nodeCap: 1000,
};

const positions = { "tag-a": { x: 0, y: 0 }, "tag-b": { x: 1000, y: 600 } };
const viewport = { width: 400, height: 300 };
// Zoomed in far enough that the graph runs past the viewport.
const zoomedIn = { x: 0, y: 0, zoom: 1 };

describe("OrbitMapMinimap", () => {
  it("stays focusable without advertising a keyboard-activatable button", () => {
    const onJump = vi.fn();

    render(
      <OrbitMapMinimap
        graph={graph}
        positions={positions}
        layoutVersion={1}
        camera={zoomedIn}
        viewport={viewport}
        onJump={onJump}
      />
    );

    const minimap = screen.getByLabelText(
      "Graph minimap. Click or drag to move the view."
    );
    expect(minimap).not.toHaveAttribute("role", "button");
    expect(minimap).toHaveAttribute("tabindex", "0");
  });

  it("stays hidden while the whole graph fits on screen", () => {
    render(
      <OrbitMapMinimap
        graph={graph}
        positions={positions}
        layoutVersion={1}
        camera={{ x: 0, y: 0, zoom: 0.25 }}
        viewport={viewport}
        onJump={vi.fn()}
      />
    );

    expect(
      screen.queryByLabelText("Graph minimap. Click or drag to move the view.")
    ).toBeNull();
  });

  it("does not jump to world origin on Enter or Space", async () => {
    const user = userEvent.setup();
    const onJump = vi.fn();

    render(
      <OrbitMapMinimap
        graph={graph}
        positions={positions}
        layoutVersion={1}
        camera={zoomedIn}
        viewport={viewport}
        onJump={onJump}
      />
    );

    const minimap = screen.getByLabelText(
      "Graph minimap. Click or drag to move the view."
    );
    minimap.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");

    expect(onJump).not.toHaveBeenCalled();
  });
});
