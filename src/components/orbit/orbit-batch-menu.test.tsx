// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  OrbitBatchMenu,
  type OrbitLibraryTagOption,
} from "./orbit-batch-menu";

function renderMenu(library: Partial<OrbitLibraryTagOption> = {}) {
  const onStart = vi.fn();
  render(
    <OrbitBatchMenu
      batchMode="auto"
      resolvedBatchProfile="balanced"
      deepUnlocked
      deepLockedReason=""
      sweepUnlocked
      sweepLockedReason=""
      onBatchModeChange={vi.fn()}
      library={{
        untaggedCount: 3412,
        available: true,
        unavailableReason: "Auto-tag needs TYPESAFE_API_KEY.",
        state: "idle",
        starting: false,
        onStart,
        ...library,
      }}
    />
  );
  return { onStart, user: userEvent.setup() };
}

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /scan batch size/i }));
}

describe("OrbitBatchMenu", () => {
  it("offers review batches and whole-queue auto-tag side by side", async () => {
    const { user } = renderMenu();
    await openMenu(user);

    expect(screen.getByText("Review a batch")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sweep/ })).toBeInTheDocument();
    expect(screen.getByText("Tag everything")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Auto-tag all 3,412/ })
    ).toBeEnabled();
  });

  it("confirms before applying tags without review", async () => {
    const { user, onStart } = renderMenu();
    await openMenu(user);

    await user.click(screen.getByRole("button", { name: /Auto-tag all 3,412/ }));
    expect(onStart).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Auto-tag 3,412 untagged bookmarks\?/)
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onStart).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /Auto-tag all 3,412/ }));
    await user.click(screen.getByRole("button", { name: /Start auto-tag/ }));
    expect(onStart).toHaveBeenCalledOnce();
  });

  it("locks auto-tag while a run is going", async () => {
    const { user } = renderMenu({ state: "running" });
    await openMenu(user);
    expect(
      screen.getByRole("button", { name: /Auto-tag is running/ })
    ).toBeDisabled();
  });

  it("points a paused run at the banner's Resume", async () => {
    const { user } = renderMenu({ state: "paused" });
    await openMenu(user);
    expect(
      screen.getByRole("button", { name: /Auto-tag is paused/ })
    ).toBeDisabled();
    expect(screen.getByText(/Resume or dismiss it above the queue/)).toBeInTheDocument();
  });

  it("explains why auto-tag is unavailable", async () => {
    const { user } = renderMenu({ available: false });
    await openMenu(user);
    const item = screen.getByRole("button", { name: /Auto-tag needs TYPESAFE_API_KEY/ });
    expect(item).toBeDisabled();
  });
});
