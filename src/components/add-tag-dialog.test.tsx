// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AddTagDialog } from "./add-tag-dialog";
import type { TagWithCount } from "@/types";

const TAGS = [
  { id: "t1", name: "design", color: "#ff0000" },
  { id: "t2", name: "dev", color: "#00ff00" },
  { id: "t3", name: "music", color: "#0000ff" },
] as TagWithCount[];

function renderDialog(overrides: Partial<Parameters<typeof AddTagDialog>[0]> = {}) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    bookmarkIds: ["b1"],
    existingTags: TAGS,
    onAddTag: vi.fn().mockResolvedValue(undefined),
    onRemoveTag: vi.fn().mockResolvedValue(undefined),
    bookmarkTags: [] as string[],
    ...overrides,
  };
  render(<AddTagDialog {...props} />);
  return props;
}

describe("AddTagDialog", () => {
  it("filters existing tags as the user types", async () => {
    const user = userEvent.setup();
    renderDialog();

    expect(screen.getByRole("button", { name: /design/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /music/ })).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/filter tags/i), "de");

    expect(screen.getByRole("button", { name: /design/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /dev/ })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /music/ })
    ).not.toBeInTheDocument();
  });

  it("toggles an exact match on Enter instead of creating a duplicate", async () => {
    const user = userEvent.setup();
    const props = renderDialog();

    await user.type(screen.getByPlaceholderText(/filter tags/i), "design{Enter}");

    expect(props.onAddTag).toHaveBeenCalledWith(["b1"], "design", "#ff0000");
  });

  it("creates a new tag when no exact match exists", async () => {
    const user = userEvent.setup();
    const props = renderDialog();

    await user.type(screen.getByPlaceholderText(/filter tags/i), "newtopic");
    await user.click(screen.getByRole("button", { name: /create .newtopic./i }));

    expect(props.onAddTag).toHaveBeenCalledTimes(1);
    const [ids, name, color] = props.onAddTag.mock.calls[0];
    expect(ids).toEqual(["b1"]);
    expect(name).toBe("newtopic");
    expect(typeof color).toBe("string");
  });

  it("removes an applied tag on click and marks it pressed", async () => {
    const user = userEvent.setup();
    const props = renderDialog({ bookmarkTags: ["t2"] });

    const applied = screen.getByRole("button", { name: /dev/ });
    expect(applied).toHaveAttribute("aria-pressed", "true");

    await user.click(applied);
    expect(props.onRemoveTag).toHaveBeenCalledWith(["b1"], "t2");
  });

  it("keeps sibling chips enabled while one tag is pending", async () => {
    const user = userEvent.setup();
    let resolveAdd: () => void = () => {};
    renderDialog({
      onAddTag: vi.fn().mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveAdd = resolve;
          })
      ),
    });

    await user.click(screen.getByRole("button", { name: /design/ }));

    expect(screen.getByRole("button", { name: /design/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /dev/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /music/ })).toBeEnabled();

    resolveAdd();
  });
});
