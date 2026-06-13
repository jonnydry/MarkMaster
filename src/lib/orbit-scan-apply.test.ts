import { describe, expect, it, vi } from "vitest";

import { applyPrimarySuggestion } from "./orbit-scan-apply";
import type { OrbitApplyResult, OrbitBookmarkDecision } from "@/types";

function makeDecision(
  overrides: Partial<OrbitBookmarkDecision> = {}
): OrbitBookmarkDecision {
  return {
    bookmarkId: "bookmark-1",
    primary: {
      kind: "tag",
      label: "Design",
      reuseExisting: true,
    },
    ...overrides,
  };
}

describe("applyPrimarySuggestion", () => {
  it("opens review when there is no primary suggestion", async () => {
    const onOpenReview = vi.fn();
    const onApplied = vi.fn();

    await applyPrimarySuggestion({
      bookmarkId: "bookmark-1",
      getDecision: () => makeDecision({ primary: null }),
      applySuggestion: vi.fn(),
      onApplied,
      onOpenReview,
    });

    expect(onOpenReview).toHaveBeenCalledWith("bookmark-1");
    expect(onApplied).not.toHaveBeenCalled();
  });

  it("marks applied when the primary suggestion succeeds", async () => {
    const onOpenReview = vi.fn();
    const onApplied = vi.fn();
    const applied: OrbitApplyResult = {
      bookmarkId: "bookmark-1",
      tagIds: ["tag-1"],
      collectionIds: [],
    };

    await applyPrimarySuggestion({
      bookmarkId: "bookmark-1",
      getDecision: () => makeDecision(),
      applySuggestion: vi.fn().mockResolvedValue(applied),
      onApplied,
      onOpenReview,
    });

    expect(onApplied).toHaveBeenCalledWith("bookmark-1");
    expect(onOpenReview).not.toHaveBeenCalled();
  });

  it("opens review when applying the primary suggestion fails", async () => {
    const onOpenReview = vi.fn();
    const onApplied = vi.fn();

    await applyPrimarySuggestion({
      bookmarkId: "bookmark-1",
      getDecision: () => makeDecision(),
      applySuggestion: vi.fn().mockRejectedValue(new Error("apply failed")),
      onApplied,
      onOpenReview,
    });

    expect(onOpenReview).toHaveBeenCalledWith("bookmark-1");
    expect(onApplied).not.toHaveBeenCalled();
  });
});
