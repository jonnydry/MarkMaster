// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ViewModeControls } from "@/components/view-mode-controls";
import { BOOKMARK_VIEW_MODES } from "@/types";

describe("ViewModeControls", () => {
  it("offers every bookmark view mode, including gallery", () => {
    render(<ViewModeControls viewMode="feed" onViewModeChange={() => {}} compact />);

    for (const mode of BOOKMARK_VIEW_MODES) {
      const label = mode.charAt(0).toUpperCase() + mode.slice(1);
      expect(screen.getByRole("button", { name: `${label} view` })).toBeInTheDocument();
    }
  });

  it("marks gallery pressed and reports that choice", async () => {
    const onViewModeChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ViewModeControls viewMode="gallery" onViewModeChange={onViewModeChange} compact />
    );

    const gallery = screen.getByRole("button", { name: "Gallery view" });
    expect(gallery).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Feed view" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );

    await user.click(screen.getByRole("button", { name: "Compact view" }));
    expect(onViewModeChange).toHaveBeenCalledWith("compact");
  });
});
