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

  it("shows hybrid leftover recovery counts on an Orbit pass", async () => {
    const user = userEvent.setup();
    render(
      <OrbitScanOverviewStrip
        payload={{
          ...payload,
          model: "jev-latest+grok-4.6",
          batch: {
            ...payload.batch,
            hybrid: {
              firstPassLeftovers: 8,
              refinedLeftovers: 3,
              recoveredOnRefine: 5,
              escalatedToGrok: 3,
            },
          },
        }}
        suggestionCount={2}
        scanning={false}
        applyingBatch={false}
        canApplyStrongMatches
        onReview={vi.fn()}
        onApplyStrongMatches={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /Orbit pass/i }));
    const outcomeLine = screen.getByText(
      /Couldn't match: 8 · Fixed on retry: 5 · Sent to Grok for new names: 3/
    );
    expect(outcomeLine).toBeInTheDocument();
    // Raw engine metrics stay available for power users via the tooltip.
    expect(outcomeLine).toHaveAttribute(
      "title",
      expect.stringContaining("Jev leftovers 8")
    );
  });

  it("hides the hybrid breakdown when every bookmark matched first pass", async () => {
    const user = userEvent.setup();
    render(
      <OrbitScanOverviewStrip
        payload={{
          ...payload,
          batch: {
            ...payload.batch,
            hybrid: {
              firstPassLeftovers: 0,
              refinedLeftovers: 0,
              recoveredOnRefine: 0,
              escalatedToGrok: 0,
            },
          },
        }}
        suggestionCount={2}
        scanning={false}
        applyingBatch={false}
        canApplyStrongMatches
        onReview={vi.fn()}
        onApplyStrongMatches={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /Orbit pass/i }));
    expect(screen.queryByText(/Couldn't match/)).not.toBeInTheDocument();
  });
});
