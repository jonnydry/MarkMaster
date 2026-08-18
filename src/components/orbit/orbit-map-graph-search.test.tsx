// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { OrbitMapGraphSearch } from "./orbit-map-graph-search";
import type { OrbitGraphNode } from "@/types";

const results: OrbitGraphNode[] = [
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
    authorUsername: "ada",
    authorDisplayName: "Ada",
    affiliated: false,
    recent: true,
  },
];

describe("OrbitMapGraphSearch", () => {
  it("selects the highlighted result with arrow keys and Enter", async () => {
    const user = userEvent.setup();
    const onResultSelect = vi.fn();
    const onSearchChange = vi.fn();

    render(
      <OrbitMapGraphSearch
        isFetching={false}
        hasGraph
        search="hi"
        searchQuery="hi"
        searchResults={results}
        searchInputRef={{ current: null }}
        onSearchChange={onSearchChange}
        onResultSelect={onResultSelect}
      />
    );

    const input = screen.getByLabelText(/search graph/i);
    await user.click(input);
    await user.keyboard("{ArrowDown}{Enter}");

    expect(onResultSelect).toHaveBeenCalledWith({
      kind: "bookmark",
      id: "bookmark-1",
    });
    expect(onSearchChange).toHaveBeenCalledWith("");
  });
});
