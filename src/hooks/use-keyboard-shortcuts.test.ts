// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { scrollDataElementIntoView } from "@/hooks/use-keyboard-shortcuts";

afterEach(() => {
  document.body.replaceChildren();
});

function row(id: string, gallery: boolean) {
  const el = document.createElement("article");
  el.setAttribute("data-dashboard-bookmark-id", id);
  if (gallery) el.setAttribute("data-gallery-bookmark-card", id);
  el.scrollIntoView = vi.fn();
  document.body.append(el);
  return el;
}

describe("scrollDataElementIntoView", () => {
  it("keeps a gallery poster in view without centering it", () => {
    const el = row("bm-1", true);

    scrollDataElementIntoView("data-dashboard-bookmark-id", "bm-1");

    expect(el.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  });

  it("centers other list rows", () => {
    const el = row("bm-2", false);

    scrollDataElementIntoView("data-dashboard-bookmark-id", "bm-2");

    expect(el.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
      inline: "nearest",
    });
  });
});
