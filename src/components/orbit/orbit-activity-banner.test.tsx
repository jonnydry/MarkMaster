// @vitest-environment jsdom

import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OrbitActivityBanner } from "./orbit-activity-banner";

afterEach(() => {
  vi.useRealTimers();
});

describe("OrbitActivityBanner", () => {
  it("exposes real progress to assistive tech", () => {
    render(<OrbitActivityBanner title="Auto-tagging the queue" progress={0.425} />);

    const bar = screen.getByRole("progressbar", { name: "Auto-tagging the queue" });
    expect(bar).toHaveAttribute("aria-valuenow", "43");
    expect(screen.getByText("43%")).toBeInTheDocument();
  });

  it("counts elapsed time for work without a count", () => {
    vi.useFakeTimers();
    render(<OrbitActivityBanner title="Matching 24 bookmarks" elapsed />);

    expect(screen.getByText("0:00")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(65_000);
    });
    expect(screen.getByText("1:05")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("keeps the clock running once a percentage appears", () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <OrbitActivityBanner title="Matching 24 bookmarks" elapsed progress={null} />
    );
    act(() => {
      vi.advanceTimersByTime(12_000);
    });
    rerender(
      <OrbitActivityBanner title="Matching 24 bookmarks" elapsed progress={0.5} />
    );
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(screen.getByText("0:13").parentElement).toHaveTextContent("50% · 0:13");
  });

  it("stops signalling activity when paused", () => {
    render(
      <OrbitActivityBanner
        title="Auto-tag paused"
        progress={0.5}
        paused
        action={<button type="button">Resume</button>}
      />
    );

    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "false");
    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
  });
});
