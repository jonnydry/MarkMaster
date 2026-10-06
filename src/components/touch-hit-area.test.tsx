// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TagEditRow } from "@/app/(main)/settings/tag-edit-row";
import { TagRow } from "@/app/(main)/settings/tag-row";
import { HighlightCard } from "@/components/highlight-card";
import { OrbitTriageHint } from "@/components/orbit/orbit-triage-hint";
import { ViewModeControls } from "@/components/view-mode-controls";
import type { BookmarkWithRelations, TagWithCount } from "@/types";

const bookmark = {
  id: "bm-1",
  tweetId: "1",
  authorId: "a1",
  authorUsername: "ada",
  authorDisplayName: "Ada",
  authorProfileImage: null,
  authorVerified: false,
  tweetText: "Notes on touch targets",
  publicMetrics: { like_count: 12, retweet_count: 0, reply_count: 0, quote_count: 0, bookmark_count: 0 },
  media: null,
  urls: null,
  quotedTweet: null,
  xMetadata: null,
  tweetCreatedAt: "2026-09-01T00:00:00.000Z",
  bookmarkedAt: "2026-09-02T00:00:00.000Z",
  syncedAt: "2026-09-02T00:00:00.000Z",
  tags: [],
  collectionItems: [],
  notes: [],
} as unknown as BookmarkWithRelations;

const design: TagWithCount = {
  id: "tag-design",
  name: "design",
  color: "#1d9bf0",
  _count: { bookmarks: 2 },
};

const reading: TagWithCount = {
  id: "tag-reading",
  name: "reading",
  color: "#a855f7",
  _count: { bookmarks: 1 },
};

function expectExpansion(element: HTMLElement, className: string) {
  expect(element.className.split(/\s+/)).toEqual(expect.arrayContaining(className.split(/\s+/)));
}

describe("touch hit areas", () => {
  it("expands compact view toggles without crossing the 2px gap", () => {
    render(<ViewModeControls viewMode="feed" onViewModeChange={() => {}} compact />);

    for (const name of ["Grid view", "Feed view", "Compact view"]) {
      expectExpansion(
        screen.getByRole("button", { name }),
        "relative after:absolute after:-inset-x-0.5 after:-inset-y-1"
      );
    }
  });

  it("expands the highlight Good button toward 44px and short of Not relevant", () => {
    render(<HighlightCard bookmark={bookmark} index={0} layout="carousel" />);

    expectExpansion(
      screen.getByRole("button", { name: "Good" }),
      "relative after:absolute after:-inset-x-[7px] after:-inset-y-[14px]"
    );
  });

  it("leaves the stacked highlight Good button off the review control", () => {
    render(<HighlightCard bookmark={bookmark} index={0} onOrbitReview={() => {}} />);

    expect(screen.getByRole("button", { name: "Good" }).className.includes("after:")).toBe(
      false
    );
  });

  it("expands tag color swatches by half of the 6px gap", () => {
    render(
      <TagEditRow
        tag={design}
        index={0}
        initialName="design"
        initialColor="#1d9bf0"
        onSave={() => {}}
        onCancel={() => {}}
      />
    );

    const swatch = screen.getByRole("button", { name: "Select color Cyan" });
    expectExpansion(swatch, "relative after:absolute after:-inset-[3px]");
  });

  it("expands the triage dismiss control to 44px", () => {
    window.localStorage.removeItem("markmaster-orbit-triage-hint-dismissed");
    render(<OrbitTriageHint />);

    expectExpansion(
      screen.getByRole("button", { name: "Dismiss triage tips" }),
      "relative after:absolute after:-inset-[13px]"
    );
  });

  it("expands the merge control away from the Edit button", () => {
    render(
      <TagRow
        tag={design}
        index={0}
        mergeTargets={[reading]}
        onStartEdit={() => {}}
        onDelete={() => {}}
        onMerge={() => {}}
      />
    );

    expectExpansion(
      screen.getByRole("button", { name: "Merge tag design into another tag" }),
      "relative after:absolute after:-inset-y-1.5 after:-left-[15px] after:-right-px"
    );
  });
});
