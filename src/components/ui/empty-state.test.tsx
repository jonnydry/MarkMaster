// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Inbox } from "lucide-react";

import { EmptyState, type EmptyStateLayout } from "./empty-state";

describe("EmptyState", () => {
  const layouts: EmptyStateLayout[] = ["page", "panel", "inline", "stage"];

  it.each(layouts)("renders title, description, and action (%s layout)", (layout) => {
    render(
      <EmptyState
        layout={layout}
        icon={Inbox}
        title="Nothing here"
        description="Sync to get started."
        action={<button type="button">Sync now</button>}
      />
    );

    expect(
      screen.getByRole("heading", { name: "Nothing here" })
    ).toBeInTheDocument();
    expect(screen.getByText("Sync to get started.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sync now" })).toBeInTheDocument();
  });
});
