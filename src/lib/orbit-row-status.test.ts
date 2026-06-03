import { describe, expect, it } from "vitest";
import {
  formatOrbitRowStatusChip,
  getOrbitRowQueueStatus,
  getOrbitRowSuggestion,
} from "@/lib/orbit-row-status";
import type { OrbitBookmarkDecision } from "@/types";

const decision: OrbitBookmarkDecision = {
  bookmarkId: "bookmark-1",
  confidence: "high",
  reasoning: "Clear match.",
  primary: {
    kind: "tag",
    label: "AI",
    color: "#1d9bf0",
    reuseExisting: true,
    confidence: "high",
  },
  alternative: null,
  suggestedTags: [{ name: "AI", color: "#1d9bf0" }],
};

describe("getOrbitRowQueueStatus", () => {
  it("marks rows with primary suggestions as actionable", () => {
    expect(
      getOrbitRowQueueStatus({
        bookmarkId: "bookmark-1",
        dismissedBookmarkIds: new Set(),
        appliedBookmarkIds: new Set(),
        decision,
      })
    ).toBe("hasSuggestion");
  });

  it("treats applied state as stronger than dismissed state", () => {
    expect(
      getOrbitRowQueueStatus({
        bookmarkId: "bookmark-1",
        dismissedBookmarkIds: new Set(["bookmark-1"]),
        appliedBookmarkIds: new Set(["bookmark-1"]),
        decision,
      })
    ).toBe("applied");
  });

  it("returns dismissed only when the row was skipped without an apply", () => {
    expect(
      getOrbitRowQueueStatus({
        bookmarkId: "bookmark-1",
        dismissedBookmarkIds: new Set(["bookmark-1"]),
        appliedBookmarkIds: new Set(),
        decision,
      })
    ).toBe("dismissed");
  });

  it("returns default when no suggestion exists", () => {
    expect(
      getOrbitRowQueueStatus({
        bookmarkId: "bookmark-1",
        dismissedBookmarkIds: new Set(),
        appliedBookmarkIds: new Set(),
        decision: null,
      })
    ).toBe("default");
  });
});

describe("getOrbitRowSuggestion", () => {
  it("returns the primary suggestion row summary", () => {
    expect(getOrbitRowSuggestion(decision)).toEqual({
      kind: "tag",
      label: "AI",
      color: "#1d9bf0",
      confidence: "high",
      reuseExisting: true,
    });
  });
});

describe("formatOrbitRowStatusChip", () => {
  it("formats primary suggestion metadata", () => {
    expect(formatOrbitRowStatusChip(decision)).toBe("Tag · high");
  });
});
