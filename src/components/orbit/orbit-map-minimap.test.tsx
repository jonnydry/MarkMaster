// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { OrbitMapMinimap } from "./orbit-map-minimap";
import type { OrbitGraphPayload } from "@/types";

const emptyGraph: OrbitGraphPayload = {
  nodes: [],
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

describe("OrbitMapMinimap", () => {
  it("stays focusable without advertising a keyboard-activatable button", () => {
    const onJump = vi.fn();

    render(
      <OrbitMapMinimap
        graph={emptyGraph}
        positions={{}}
        layoutVersion={1}
        camera={null}
        viewport={null}
        onJump={onJump}
      />
    );

    const minimap = screen.getByLabelText(
      "Graph minimap. Click or drag to move the view."
    );
    expect(minimap).not.toHaveAttribute("role", "button");
    expect(minimap).toHaveAttribute("tabindex", "0");
  });

  it("does not jump to world origin on Enter or Space", async () => {
    const user = userEvent.setup();
    const onJump = vi.fn();

    render(
      <OrbitMapMinimap
        graph={emptyGraph}
        positions={{}}
        layoutVersion={1}
        camera={null}
        viewport={null}
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
