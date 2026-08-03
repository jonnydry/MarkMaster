// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MobileSidebar } from "./mobile-sidebar";

vi.mock("@/components/sidebar-dynamic", () => ({
  Sidebar: () => <nav aria-label="Test navigation">Navigation</nav>,
}));

function renderSidebar() {
  return render(
    <div data-testid="containing-block">
      <MobileSidebar
        tags={[]}
        collections={[]}
        selectedTags={[]}
        onTagToggle={vi.fn()}
        onCreateCollection={vi.fn()}
      />
    </div>
  );
}

describe("MobileSidebar", () => {
  it("portals the drawer outside toolbar containing blocks", () => {
    renderSidebar();

    const panel = document.querySelector('[role="dialog"]');

    expect(panel).not.toBeNull();
    expect(panel?.parentElement).toBe(document.body);
  });

  it("keeps the closed drawer out of the accessibility and focus trees", async () => {
    const user = userEvent.setup();
    renderSidebar();

    const trigger = screen.getByRole("button", { name: "Open menu" });
    const panel = document.querySelector('[role="dialog"]');

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(panel).toHaveAttribute("aria-hidden", "true");
    expect(panel).toHaveAttribute("inert");
    expect(screen.queryByRole("dialog", { name: "Sidebar navigation" })).toBeNull();

    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("dialog", { name: "Sidebar navigation" })
    ).toBeInTheDocument();
    expect(panel).toHaveAttribute("aria-hidden", "false");
    expect(panel).not.toHaveAttribute("inert");

    await user.click(screen.getByRole("button", { name: "Close menu" }));

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(panel).toHaveAttribute("aria-hidden", "true");
    expect(panel).toHaveAttribute("inert");
  });
});
