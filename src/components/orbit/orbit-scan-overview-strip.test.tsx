// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { OrbitScanOverviewStrip } from "./orbit-scan-overview-strip";
import type { OrbitScanResponsePayload } from "@/types";

const payload = {
  scanRunId: "run-1",
  model: "grok-4.6",
  scannedAt: "2026-06-22T00:00:00.000Z",
  privacy: { storeDisabled: true, zeroDataRetention: false },
  batch: {
    mode: "auto",
    profile: "quick",
    requestedCount: 2,
    candidatePoolCount: 2,
    sharedSignalCount: 1,
    sourceUnknownCount: 0,
    sourceUnknownRate: 0,
    selectedSourceUnknownCount: 0,
    selectedSourceUnknownRate: 0,
    usefulSignalCount: 2,
    selectionReason: "test",
  },
  plan: {
    overview: {
      summary: "A useful batch.",
      taggingStrategy: "Reuse clear tags.",
      collectionStrategy: "Reuse clear collections.",
    },
    suggestions: [],
  },
  summary: {
    bookmarkCount: 2,
    bookmarksWithTags: 2,
    bookmarksWithCollections: 1,
    tagAssignments: 2,
    uniqueTags: 1,
    collectionBuckets: 1,
    reusedExistingTags: 1,
    reusedExistingCollections: 1,
    newCollectionBuckets: 0,
  },
  tagRollups: [],
  collectionRollups: [],
} satisfies OrbitScanResponsePayload;

describe("OrbitScanOverviewStrip", () => {
  it("keeps completed-scan decisions with the overview", async () => {
    const user = userEvent.setup();
    const onReview = vi.fn();
    const onApplyStrongMatches = vi.fn();

    render(
      <OrbitScanOverviewStrip
        payload={payload}
        suggestionCount={2}
        scanning={false}
        applyingBatch={false}
        canApplyStrongMatches
        onReview={onReview}
        onApplyStrongMatches={onApplyStrongMatches}
      />
    );

    await user.click(
      screen.getByRole("button", { name: "Review 2 suggestions" })
    );
    expect(onReview).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "Apply strong matches" }));
    expect(onApplyStrongMatches).toHaveBeenCalledOnce();
  });

  it("hides the decision row after all suggestions are resolved", () => {
    render(
      <OrbitScanOverviewStrip
        payload={payload}
        suggestionCount={0}
        scanning={false}
        applyingBatch={false}
        canApplyStrongMatches={false}
        onReview={vi.fn()}
        onApplyStrongMatches={vi.fn()}
      />
    );

    expect(
      screen.queryByRole("button", { name: /review .* suggestions/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Apply strong matches" })
    ).not.toBeInTheDocument();
  });
});
