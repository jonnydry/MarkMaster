// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AddToCollectionDialog } from "./add-to-collection-dialog";
import type { CollectionWithCount } from "@/types";

const COLLECTIONS = [
  { id: "c1", name: "Reading list", type: "user", _count: { items: 4 } },
  { id: "c2", name: "Research", type: "user", _count: { items: 9 } },
  { id: "c3", name: "X Synced", type: "x_folder", _count: { items: 2 } },
] as CollectionWithCount[];

function renderDialog(
  overrides: Partial<Parameters<typeof AddToCollectionDialog>[0]> = {}
) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    bookmarkIds: ["b1"],
    collections: COLLECTIONS,
    bookmarkCollections: [] as string[],
    onAddToCollection: vi.fn().mockResolvedValue(undefined),
    onCreateCollection: vi.fn().mockResolvedValue("c-new"),
    ...overrides,
  };
  render(<AddToCollectionDialog {...props} />);
  return props;
}

describe("AddToCollectionDialog", () => {
  it("filters collection rows as the user types", async () => {
    const user = userEvent.setup();
    renderDialog();

    expect(screen.getByRole("button", { name: /reading list/i })).toBeInTheDocument();

    await user.type(
      screen.getByPlaceholderText(/filter collections/i),
      "rese"
    );

    expect(screen.getByRole("button", { name: /research/i })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /reading list/i })
    ).not.toBeInTheDocument();
  });

  it("adds the bookmark when an eligible collection is clicked", async () => {
    const user = userEvent.setup();
    const props = renderDialog();

    await user.click(screen.getByRole("button", { name: /research/i }));

    expect(props.onAddToCollection).toHaveBeenCalledWith(["b1"], "c2");
  });

  it("disables collections the bookmark is already in and synced X folders", () => {
    renderDialog({ bookmarkCollections: ["c1"] });

    expect(screen.getByRole("button", { name: /reading list/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /x synced/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /research/i })).toBeEnabled();
  });

  it("creates a collection and adds the bookmark to it", async () => {
    const user = userEvent.setup();
    const props = renderDialog();

    await user.type(
      screen.getByPlaceholderText(/filter collections/i),
      "Inspiration"
    );
    await user.click(screen.getByRole("button", { name: /create/i }));

    expect(props.onCreateCollection).toHaveBeenCalledWith("Inspiration");
    expect(props.onAddToCollection).toHaveBeenCalledWith(["b1"], "c-new");
  });
});
